/**
 * Step definitions for the model the rest of sdp stands on: the vocabulary
 * profile and the guard that keeps the words sdp interprets in it
 * (DEC-0002, ARCH-vocabulary), the immutable graph (ARCH-graph), and how
 * reports count stages (REQ-maturity-criteria).
 */
import { Effect } from "effect"
import { strict as assert } from "node:assert"
import { readdir, readFile } from "node:fs/promises"
import { join, relative } from "node:path"
import { parseSync } from "oxc-parser"
import { lifecycle } from "../../src/lifecycle/Lifecycle.ts"
import { statusSummary } from "../../src/graph/Status.ts"
import { Graph, type GraphEdge, type GraphNode } from "../../src/model/Graph.ts"
import { defaultVocabulary, made, vocabularyWords } from "../../src/model/Vocabulary.ts"
import { defineSteps } from "sdp/steps"
import { load, newWorld, type World } from "./world.ts"

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
  const values = new Set([...words.kinds, ...words.relations, ...words.values, ...words.disciplines])
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

export default defineSteps(newWorld, ({ Given, Then, When }) => {
  // --- the vocabulary guard (DEC-0002) --------------------------------------

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

  Then("this glossary lists every attribute sdp derives", ({ project, scenario }) => {
    const body = project.specById.get(scenario.specId)?.body ?? ""
    const missing = [...made.attributes, ...made.scenarioAttributes].filter((key) => !body.includes(`\`${key}\``))
    assert.deepEqual(missing, [], `derived attributes the glossary does not list: ${missing.join(", ")}`)
  })

  // --- the immutable graph (ARCH-graph) -------------------------------------

  Given("a graph built from a node {string} linked to {string} by {string}", ({ args: [from, to, rel], world }) => {
    const nodes: Array<GraphNode> = [
      { id: from, kind: "element", title: from, attrs: { owner: { team: "core" }, tags: ["a"] } },
      { id: to, kind: "element", title: to, attrs: {} }
    ]
    const edges: Array<GraphEdge> = [{ from, rel, to, attrs: { via: "http" } }]
    world.scratch.builtGraph = new Graph(nodes, edges)
    world.scratch.inputs = { nodes, edges }
  })

  When("the nodes and edges it was built from are changed", ({ world }) => {
    const { edges, nodes } = world.scratch.inputs as { nodes: Array<Record<string, any>>; edges: Array<Record<string, any>> }
    nodes[0]!.attrs.owner.team = "changed"
    nodes[0]!.attrs.tags.push("b")
    nodes[0]!.kind = "changed"
    edges[0]!.from = edges[0]!.to
    edges[0]!.attrs.via = "changed"
    nodes.push({ id: "extra", kind: "element", title: "extra", attrs: {} })
  })

  Then("the graph still has {string} -{word}-> {string} via {string}", ({ args: [from, rel, to, via], world }) => {
    const graph = builtGraph(world)
    const edge = graph.out(from).find((e) => e.rel === rel && e.to === to)
    assert.ok(edge, `no edge ${from} -${rel}-> ${to}: ${JSON.stringify(graph.edges())}`)
    assert.equal(edge.attrs?.via, via)
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
      "an edge attribute": () => (edge.attrs.via = "x"),
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

  // --- stages (REQ-maturity-criteria) ------------------------------------------

  Then("sdp status counts the stages {string}", ({ args: [expected], world }) =>
    Effect.map(load(world), (project) => {
      const stages = statusSummary(project).stages
      assert.equal(counted(stages), expected)
    }))

  Then("the lifecycle evidence of {string} counts the stages {string}", ({ args: [iteration, expected], world }) =>
    Effect.map(load(world), (project) => {
      const work = lifecycle(project).work.find((it) => it.node.id === iteration)
      assert.ok(work, `no iteration ${iteration}`)
      assert.equal(counted(work.stages), expected)
    }))
})

/** `draft:1 verified:2`, by stage name. */
const counted = (record: Readonly<Record<string, number>>) =>
  Object.entries(record).sort(([a], [b]) => a.localeCompare(b)).map(([stage, n]) => `${stage}:${n}`).join(" ") || "nothing"
