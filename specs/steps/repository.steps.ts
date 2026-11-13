/**
 * What is specific to this repository: the guards over its own source — the words only the
 * vocabulary profile may name, the cycles between its elements, the lines its graph points at —
 * the immutable graph, and the time its pipeline takes.
 */
import { Effect, Result } from "effect"
import { strict as assert } from "node:assert"
import { readdir, readFile } from "node:fs/promises"
import { join, relative } from "node:path"
import { parseSync } from "oxc-parser"
import { projectOrderings, query, queryProject } from "../../src/graph/Query.ts"
import { formatSource, Graph, type GraphEdge, type GraphNode, type SourceRef } from "../../src/model/Graph.ts"
import { defineSteps } from "sdp/steps"
import { defaultVocabulary, hasKind, made, vocabularyWords } from "../../src/model/Vocabulary.ts"
import type { Project } from "../../src/graph/Build.ts"
import { existsSync } from "node:fs"
import { rules } from "../../src/model/Diagnostic.ts"
import { newWorld, reload, type World } from "./world.ts"

type Node = { readonly type: string; readonly start: number; readonly [key: string]: unknown }

const isNode = (value: unknown): value is Node => typeof value === "object" && value !== null && typeof (value as Node).type === "string"

/** Expressions that read graph data: anything that touches a `.kind`, a `.rel` or `.attrs`. */
const graphProperties = new Set(["kind", "rel", "attrs"])

const readsGraph = (node: unknown): boolean => {
  if (Array.isArray(node)) return node.some(readsGraph)
  if (!isNode(node)) return false
  if (node.type.startsWith("TS") && node.type !== "TSAsExpression" && node.type !== "TSNonNullExpression") return false
  if (node.type === "MemberExpression" && !node.computed && graphProperties.has((node.property as Node & { name: string }).name)) return true
  return Object.entries(node).some(([key, value]) => key !== "type" && typeof value === "object" && readsGraph(value))
}

/** The string literals of an array or `new Set([...])` expression, through `as const` and the like. */
const literalsOf = (node: unknown): ReadonlyArray<Node & { value: string }> => {
  if (!isNode(node)) return []
  if (node.type === "TSAsExpression" || node.type === "TSSatisfiesExpression") return literalsOf(node.expression)
  if (node.type === "NewExpression") return literalsOf((node.arguments as ReadonlyArray<unknown>)[0])
  if (node.type !== "ArrayExpression") return []
  return (node.elements as ReadonlyArray<unknown>).filter((e): e is Node & { value: string } =>
    isNode(e) && e.type === "Literal" && typeof e.value === "string"
  )
}

/**
 * Where a TypeScript file interprets a word of the vocabulary as a literal: compares graph data
 * (a `.kind`, a `.rel`, anything under `.attrs`) with it, switches on graph data with it as a case,
 * looks graph data up in a list or set of such words, asks `ofKind` for it, or reads it as an
 * attribute name (`attrs.activity`). Each finding is `line word`.
 */
const interpretedWords = (file: string, content: string): ReadonlyArray<string> => {
  const words = vocabularyWords(defaultVocabulary)
  const values = new Set([...words.kinds, ...words.relations, ...words.disciplines])
  const attributes = new Set(words.attributes)
  const { program } = parseSync(file, content, { lang: "ts", sourceType: "module" })
  const lineOf = (offset: number) => content.slice(0, offset).split("\n").length
  const found: Array<string> = []
  const report = (node: Node & { value: string }) => values.has(node.value) && found.push(`${lineOf(node.start)} ${node.value}`)
  // Lists and sets bound to a name, so `structural.has(node.kind)` is seen through its declaration.
  const bound = new Map<string, unknown>()
  const declarations = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(declarations)
    if (!isNode(node)) return
    if (node.type === "VariableDeclarator" && isNode(node.id) && node.id.type === "Identifier") bound.set(node.id.name as string, node.init)
    for (const [key, value] of Object.entries(node)) if (key !== "type" && typeof value === "object") declarations(value)
  }
  declarations(program)
  const literal = (node: unknown): node is Node & { value: string } => isNode(node) && node.type === "Literal" && typeof node.value === "string"
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(visit)
    if (!isNode(node)) return
    if (node.type.startsWith("TS") && node.type !== "TSAsExpression" && node.type !== "TSSatisfiesExpression" && node.type !== "TSNonNullExpression") return
    if (node.type === "BinaryExpression" && ["===", "!==", "==", "!="].includes(node.operator as string)) {
      if (literal(node.left) && readsGraph(node.right)) report(node.left)
      if (literal(node.right) && readsGraph(node.left)) report(node.right)
    }
    if (node.type === "SwitchStatement" && readsGraph(node.discriminant)) {
      for (const c of node.cases as ReadonlyArray<Node>) if (literal(c.test)) report(c.test)
    }
    if (node.type === "CallExpression" && isNode(node.callee) && node.callee.type === "MemberExpression") {
      const method = (node.callee.property as Node & { name?: string }).name
      const args = node.arguments as ReadonlyArray<unknown>
      if ((method === "includes" || method === "has" || method === "indexOf") && readsGraph(args)) {
        const receiver = node.callee.object as Node & { name?: string }
        literalsOf(receiver.type === "Identifier" ? bound.get(receiver.name!) : receiver).forEach(report)
      }
      if (method === "ofKind") for (const arg of args) [...(literal(arg) ? [arg] : []), ...literalsOf(arg)].forEach(report)
    }
    if (node.type === "MemberExpression" && /(^|\.)attrs$/.test(content.slice((node.object as Node).start, (node.object as Node & { end: number }).end))) {
      const property = node.property as Node & { name?: string; value?: unknown }
      const name = node.computed ? (typeof property.value === "string" ? property.value : undefined) : property.name
      if (name !== undefined && attributes.has(name)) found.push(`${lineOf(node.start)} ${name}`)
    }
    for (const [key, value] of Object.entries(node)) if (key !== "type" && typeof value === "object") visit(value)
  }
  visit(program)
  return found
}

const typeScriptFiles = async (root: string, directory: string): Promise<ReadonlyArray<string>> => {
  const entries = await readdir(join(root, directory), { recursive: true, withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) => relative(root, join(entry.parentPath, entry.name)))
    .sort()
}

const search = (world: World, files: ReadonlyArray<readonly [string, string]>) => {
  world.scratch.interpreted = files.flatMap(([file, content]) => interpretedWords(file, content).map((finding) => `${file}:${finding}`))
}

/** A graph of two nodes and one edge whose inputs the scenario keeps, to change them afterwards. */
const builtGraph = (world: World) => {
  const graph = world.scratch.builtGraph as Graph | undefined
  assert.ok(graph, "build a graph first")
  return graph
}

/**
 * Every node and link of the graph, followed back to its file and line: those whose line does not
 * exist, and the links whose line does not name their target. A scenario's link to its spec is
 * made by sdp, at the scenario's line, and an element's import at the line that names the module:
 * no author wrote an id there.
 */
const followed = async (project: Project) => {
  const { config, graph, root } = project
  // A scenario's edges and a rule's edge to its spec are at their keyword line, which names neither end.
  const structural = [config.vocabulary.relations.scenario, made.relations.rule, made.relations.imports]
  const lines = new Map<string, ReadonlyArray<string>>()
  const lineAt = async (source: SourceRef | undefined) => {
    if (!source) return undefined
    if (!lines.has(source.file)) lines.set(source.file, (await readFile(join(root, source.file), "utf8")).split("\n"))
    return lines.get(source.file)![source.line - 1]
  }
  const untraceable: Array<string> = []
  const unnamed: Array<string> = []
  for (const node of graph.nodes()) {
    if (await lineAt(node.source) === undefined) untraceable.push(node.id)
  }
  for (const edge of graph.edges()) {
    const label = `${edge.from} -${edge.rel}-> ${edge.to}`
    for (const source of edge.sources ?? [edge.source]) {
      const line = await lineAt(source)
      if (line === undefined) untraceable.push(label)
      else if (!structural.includes(edge.rel) && !line.includes(edge.to)) unnamed.push(`${label} ${formatSource(source)}`)
    }
  }
  return { untraceable, unnamed }
}

export default defineSteps(newWorld, ({ Given, Then, When }) => {
  When("the TypeScript files under {string} are searched for interpreted words", ({ args: [directory], world }) =>
    search(world, [...world.files].filter(([file]) => file.startsWith(`${directory}/`) && file.endsWith(".ts"))))

  When("the TypeScript files under {string} in the repository are searched for interpreted words", async ({ args: [directory], project, world }) => {
    const files = await typeScriptFiles(project.root, directory)
    search(world, await Promise.all(files.map(async (file) => [file, await readFile(join(project.root, file), "utf8")] as const)))
  })

  Then("only {string} interprets words of the vocabulary", ({ args: [allowed], world }) => {
    const found = world.scratch.interpreted as ReadonlyArray<string> | undefined
    assert.ok(found, "search the files first")
    const elsewhere = found.filter((finding) => !finding.startsWith(`${allowed}:`))
    assert.deepEqual(elsewhere, [], `ask ${allowed} instead of naming these words:\n${elsewhere.join("\n")}`)
  })

  Then("the search finds {string}", ({ args: [expected], world }) => {
    const found = world.scratch.interpreted as ReadonlyArray<string> | undefined
    assert.ok(found, "search the files first")
    assert.deepEqual([...found].sort(), expected.split(",").map((s) => s.trim()).filter((s) => s !== "nothing").sort())
  })

  Then("no element reaches itself over {string} links", ({ args: [rel], project }) => {
    const elements = project.graph.nodes().filter((n) => hasKind(project.config.vocabulary, "architectural", n.kind))
    const cyclic = elements.filter((element) => {
      const back = queryProject(project, `#${element.id} -${rel}+-> #${element.id}`)
      return Result.isSuccess(back) && back.success.nodes.length > 0
    })
    assert.deepEqual(cyclic.map((element) => element.id), [])
  })

  Then("every node and link of this repository is at a file and line that exist", ({ project }) =>
    Effect.promise(async () => {
      const { untraceable } = await followed(project)
      assert.equal(untraceable.length, 0, `no file and line for: ${untraceable.slice(0, 10).join(", ")}`)
    }))

  Then("the line of every link of this repository contains the id it links to", ({ project }) =>
    Effect.promise(async () => {
      const { unnamed } = await followed(project)
      assert.equal(unnamed.length, 0, `grep for the target would miss:\n${unnamed.slice(0, 10).join("\n")}`)
    }))

  Given("this repository has no build output", ({ project }) => {
    const found = ["dist", "build", "out"].filter((dir) => existsSync(join(project.root, dir)))
    assert.equal(found.length, 0, `build output found: ${found.join(", ")}`)
  })

  Then("every rule sdp reports has an example in this spec", ({ project, scenario }) => {
    const spec = project.specById.get(scenario.specId)
    const cells = new Set((spec?.scenarios ?? []).flatMap((s) => s.pickles.flatMap((p) => p.steps.flatMap((step) => step.dataTable?.flat() ?? []))))
    const missing = Object.keys(rules).filter((rule) => !cells.has(rule))
    assert.equal(missing.length, 0, `rules without an example in ${scenario.specId}: ${missing.join(", ")}`)
  })

  Given("a graph built from a node {string} linked to {string} by {string}", ({ args: [from, to, rel], world }) => {
    const nodes: Array<GraphNode> = [
      { id: from, kind: "element", title: from, attrs: { owner: { team: "core" }, tags: ["a"] } },
      { id: to, kind: "element", title: to, attrs: {} }
    ]
    // Declared twice: the graph keeps one edge with both declarations.
    const edges: Array<GraphEdge> = [
      { from, rel, to, source: { file: "a.feature", line: 1 } },
      { from, rel, to, source: { file: "a.feature", line: 2 } }
    ]
    world.scratch.builtGraph = new Graph(nodes, edges)
    world.scratch.inputs = { nodes, edges }
  })

  When("the nodes and edges it was built from are changed", ({ world }) => {
    const { edges, nodes } = world.scratch.inputs as { nodes: Array<Record<string, any>>; edges: Array<Record<string, any>> }
    nodes[0]!.attrs.owner.team = "changed"
    nodes[0]!.attrs.tags.push("b")
    nodes[0]!.kind = "changed"
    edges[0]!.from = edges[0]!.to
    edges[0]!.source.line = 9
    nodes.push({ id: "extra", kind: "element", title: "extra", attrs: {} })
  })

  Then("the graph still has {string} -{word}-> {string}, declared twice", ({ args: [from, rel, to], world }) => {
    const graph = builtGraph(world)
    const edge = graph.out(from).find((e) => e.rel === rel && e.to === to)
    assert.ok(edge, `no edge ${from} -${rel}-> ${to}: ${JSON.stringify(graph.edges())}`)
    assert.deepEqual(edge.sources?.map(formatSource), ["a.feature:1", "a.feature:2"])
    assert.deepEqual(graph.out(to), [])
    assert.equal(graph.node(from)?.kind, "element")
    assert.deepEqual(graph.node(from)?.attrs, { owner: { team: "core" }, tags: ["a"] })
    assert.equal(graph.nodes().length, 2)
  })

  Then("nothing read from the graph can be changed", ({ world }) => {
    const graph = builtGraph(world)
    const node = graph.nodes()[0] as any
    const edge = graph.edges()[0] as any
    const attempts: Record<string, () => void> = {
      "a node": () => (node.kind = "x"),
      "a nested attribute": () => (node.attrs.owner.team = "x"),
      "a list attribute": () => node.attrs.tags.push("x"),
      "an edge": () => (edge.to = "x"),
      "an edge's declaration": () => (edge.sources[0].line = 0),
      "an edge's declarations": () => edge.sources.push(edge.source),
      "the node list": () => (graph.nodes() as Array<GraphNode>).push(node),
      "the edge list": () => (graph.edges() as Array<GraphEdge>).pop(),
      "an adjacency list": () => (graph.out(edge.from) as Array<GraphEdge>).pop()
    }
    const changed = Object.entries(attempts).flatMap(([what, attempt]) => {
      try {
        attempt()
        return [what]
      } catch {
        return []
      }
    })
    assert.deepEqual(changed, [], `these could be changed: ${changed.join(", ")}`)
  })

  Then("no graph can be built from a node whose attribute is a {word}", ({ args: [what] }) => {
    const values: Record<string, unknown> = { Date: new Date(0), Map: new Map(), function: () => 1 }
    assert.ok(Object.hasOwn(values, what), `no example of a ${what}; there are: ${Object.keys(values).join(", ")}`)
    const node: GraphNode = { id: "a", kind: "element", title: "a", attrs: { nested: { value: values[what] } } }
    assert.throws(() => new Graph([node], []), new RegExp(`an attribute is JSON data, not a ${what}`))
  })

  When("the graph is built from it", ({ world }) =>
    Effect.gen(function*() {
      const samples: Array<number> = []
      for (let i = 0; i < 3; i++) {
        const started = performance.now()
        yield* reload(world)
        samples.push(performance.now() - started)
      }
      world.durationMs = samples.sort((a, b) => a - b)[1]!
    }))

  When("the query {string} runs on it", ({ args: [q], world }) => {
    const graph = world.graph!
    const samples: Array<number> = []
    for (let i = 0; i < 7; i++) {
      const started = performance.now()
      const result = query(graph, q, { orderings: projectOrderings(defaultVocabulary) })
      samples.push(performance.now() - started)
      assert.ok(Result.isSuccess(result))
    }
    world.durationMs = samples.sort((a, b) => a - b)[3]!
  })

  Then("the median run completes within {int} ms", ({ args: [budget], world }) => {
    assert.ok(world.durationMs <= budget, `median ${world.durationMs.toFixed(1)} ms exceeds ${budget} ms`)
  })
})
