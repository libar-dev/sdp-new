/**
 * Core step definitions for sdp's own specifications: building workspaces,
 * graph assertions, queries, checks, context, exports, lifecycle, MCP and quality
 * measurements. Running scenarios lives in execution.steps.ts. Shares its world
 * with every other module (world.ts).
 */
import { Effect, Predicate, Result } from "effect"
import { McpProtocol, McpTest } from "effect/ai"
import { strict as assert } from "node:assert"
import { readFile } from "node:fs/promises"
import { dirname, join, normalize } from "node:path"
import { parseSync } from "oxc-parser"
import * as Api from "../../src/index.ts"
import * as Reading from "../../src/app/Reading.ts"
import * as Text from "../../src/app/Text.ts"
import { contextBundle } from "../../src/graph/Context.ts"
import { graphRecords, jsonLines } from "../../src/graph/Export.ts"
import { projectOrderings, query, queryProject } from "../../src/graph/Query.ts"
import { check } from "../../src/check/Check.ts"
import { instructions, registrations } from "../../src/mcp/Server.ts"
import { formatSource, Graph, type GraphEdge, type GraphNode } from "../../src/model/Graph.ts"
import { defineSteps } from "sdp/steps"
import { defaultVocabulary, hasKind } from "../../src/model/Vocabulary.ts"
import { layerMemoryWorkspace, memoryRoot } from "../../src/workspace/MemoryFileSystem.ts"
import type { Project } from "../../src/graph/Build.ts"
import { assertRows, ids, load, newWorld, node, output, produce, reload, reportRow, setFile, type World } from "./world.ts"

/**
 * `A -rel-> B` for every value import from a module anchored to element A to a module anchored to
 * element B: the dependencies between elements as the code has them. A module is anchored by an
 * anchor annotation; an import or re-export of types alone calls nothing, so it does not count.
 */
const importsBetweenElements = async (project: Project, rel: string): Promise<ReadonlyArray<string>> => {
  const anchor = project.config.vocabulary.relations.anchor
  const elementsOf = new Map<string, Set<string>>()
  for (const annotation of project.annotations.filter((a) => a.rel === anchor)) {
    elementsOf.set(annotation.file, new Set([...(elementsOf.get(annotation.file) ?? []), ...annotation.targets]))
  }
  const links = new Set<string>()
  for (const [file, elements] of elementsOf) {
    const content = await readFile(join(project.root, file), "utf8")
    const { module } = parseSync(file, content)
    const imported = [
      ...module.staticImports.filter((i) => i.entries.length === 0 || i.entries.some((entry) => !entry.isType)).map((i) => i.moduleRequest.value),
      ...module.staticExports.flatMap((e) => e.entries.flatMap((entry) => entry.moduleRequest && !entry.isType ? [entry.moduleRequest.value] : [])),
      ...module.dynamicImports.map((i) => content.slice(i.moduleRequest.start + 1, i.moduleRequest.end - 1))
    ]
    for (const specifier of imported.filter((specifier) => specifier.startsWith("."))) {
      for (const used of elementsOf.get(normalize(join(dirname(file), specifier))) ?? []) {
        for (const element of elements) if (element !== used) links.add(`${element} -${rel}-> ${used}`)
      }
    }
  }
  return [...links].sort()
}

const reported = (world: World) => {
  assert.ok(world.reported, "nothing was parsed, loaded, checked or scanned yet")
  return world.reported
}

export default defineSteps(newWorld, ({ Given, Then, When }) => {
  // --- workspace ------------------------------------------------------------

  Given("a file {string} containing:", ({ args: [path], doc, world }) => setFile(world, path, doc ?? ""))

  When("the workspace is loaded", ({ world }) =>
    Effect.map(reload(world), (project) => {
      world.reported = project.diagnostics.map(reportRow)
    }))

  // Any attribute, or one of what every node has: kind, title, source (`file:line`).
  Then("node {string} has attribute {word} = {string}", ({ args: [id, key, value], world }) =>
    Effect.map(load(world), (project) => {
      const n = node(project, id)
      const actual = key === "title" ? n.title : key === "kind" ? n.kind : key === "source" ? formatSource(n.source) : n.attrs[key]
      assert.equal(String(actual), value, `${id}.${key}`)
    }))

  // --- query ----------------------------------------------------------------

  When("I query {string}", ({ args: [q], world }) =>
    Effect.map(load(world), (project) => {
      const result = queryProject(project, q)
      world.result = Result.isSuccess(result) ? result.success : undefined
      world.queryError = Result.isFailure(result) ? result.failure.message : undefined
    }))

  Then("the result is {string}", ({ args: [expected], world }) => {
    assert.ok(world.result, `query failed: ${world.queryError}`)
    assert.deepEqual(world.result.nodes.map((n) => n.id).sort(), ids(expected))
  })

  Then("the query is rejected with {string}", ({ args: [message], world }) => {
    assert.ok(world.queryError, "expected the query to be rejected")
    assert.match(world.queryError, new RegExp(message.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"))
  })

  // --- what sdp reports -----------------------------------------------------
  // The diagnostics of the last step that parsed a file, loaded or checked the workspace, or
  // scanned code. A table names the columns it checks: rule, severity, node, at (file:line), line,
  // message and hint, the last two matched by what they contain.

  When("the workspace is checked", ({ world }) =>
    Effect.map(reload(world), (project) => {
      world.reported = check(project).map(reportRow)
    }))

  Then("sdp reports nothing", ({ world }) => assertRows("diagnostics", reported(world), [["rule", "at", "message"]], "exactly"))

  // The rules of the diagnostics, each as often as it is reported; "nothing" for none.
  Then("sdp reports {string}", ({ args: [rules], world }) => assert.deepEqual(reported(world).map((row) => row.rule).sort(), ids(rules)))

  Then("sdp reports:", ({ table, world }) => assertRows("diagnostics", reported(world), table, "exactly"))

  Then("sdp reports at least:", ({ table, world }) => assertRows("diagnostics", reported(world), table, "including"))

  Then("sdp does not report {string}", ({ args: [rule], world }) =>
    assertRows("diagnostics", reported(world).filter((row) => row.rule === rule), [["rule", "at", "message"]], "exactly"))

  // --- architecture ---------------------------------------------------------

  When("I ask for the architecture view", ({ world }) =>
    Effect.map(Reading.architecture(memoryRoot), (answer) => {
      produce(world, Text.architecture(answer.data))
    }).pipe(Effect.provide(layerMemoryWorkspace(world.files))))

  // --- context, exports, lifecycle, MCP ------------------------------------

  // The bundle as it is before any step file is read: what a run recorded is all it knows of the steps.
  When("I ask for the context of {string}", ({ args: [id], world }) =>
    Effect.map(load(world), (project) => {
      produce(world, contextBundle(project, node(project, id)))
    }))

  When("the graph is exported", ({ world }) =>
    Effect.map(load(world), (project) => {
      produce(world, jsonLines(graphRecords(project.graph)))
    }))

  // The programmatic API as a program calls it: `query` from the package's entry point, on these files.
  When("a program asks the API for {string}", ({ args: [expression], world }) =>
    Effect.map(Api.query(memoryRoot, { expression }), (answer) => {
      produce(world, JSON.stringify(answer, null, 2))
    }).pipe(Effect.provide(layerMemoryWorkspace(world.files))))

  // `\t` and `\n` in the expected text stand for a tab and a line break.
  Then("the output contains {string}", ({ args: [text], world }) => {
    const expected = text.replace(/\\t/g, "\t").replace(/\\n/g, "\n")
    assert.ok(output(world).includes(expected), `output does not contain ${JSON.stringify(expected)}:\n${output(world)}`)
  })

  // The lines of the doc string, one after the other; how far each is indented does not count.
  Then("the output contains:", ({ doc, world }) => {
    const flush = (text: string) => text.split("\n").map((line) => line.trimStart()).join("\n")
    assert.ok(flush(output(world)).includes(flush(doc ?? "")), `output does not contain the text:\n${output(world)}`)
  })

  Then("the output contains {string} {int} time(s)", ({ args: [text, count], world }) => {
    assert.equal(output(world).split(text).length - 1, count, `occurrences of ${JSON.stringify(text)} in:\n${output(world)}`)
  })

  Then("the line after the output line with {string} contains {string}", ({ args: [anchor, text], world }) => {
    const lines = output(world).split("\n")
    const index = lines.findIndex((line) => line.includes(anchor))
    assert.ok(index >= 0, `no output line contains ${JSON.stringify(anchor)}:\n${output(world)}`)
    assert.ok(lines[index + 1]?.includes(text), `the line after ${JSON.stringify(lines[index])} is ${JSON.stringify(lines[index + 1])}`)
  })

  Then("the output does not contain {string}", ({ args: [text], world }) => {
    assert.ok(!output(world).includes(text), `output unexpectedly contains ${JSON.stringify(text)}`)
  })

  Then("the output has one line per node and edge", ({ world }) =>
    Effect.map(load(world), (project) => {
      const lines = output(world).trimEnd().split("\n")
      assert.equal(lines.length, project.graph.nodes().length + project.graph.edges().length)
    }))

  // A tool error and a rejected call (invalid arguments) both count as the tool reporting an error.
  When("an agent calls the MCP tool {string} with:", ({ args: [tool], doc, world }) =>
    Effect.gen(function*() {
      const client = yield* McpTest.makeClient(registrations(memoryRoot), { protocols: [McpProtocol.v2025_11_25] })
      const result = yield* client.callTool({ name: tool, arguments: JSON.parse(doc ?? "{}") })
      produce(world, result.content.map((c) => (c.type === "text" ? c.text : "")).join("\n"))
      world.scratch.mcpError = result.isError === true
    }).pipe(
      Effect.catch((error) =>
        Effect.sync(() => {
          produce(world, Predicate.hasProperty(error, "message") ? String(error.message) : String(error))
          world.scratch.mcpError = true
        })
      ),
      Effect.scoped,
      Effect.provide(layerMemoryWorkspace(world.files))
    ))

  When("an agent reads the MCP server's instructions", ({ world }) => {
    produce(world, instructions)
  })

  // --- this repository's architecture ---------------------------------------

  Then("the {string} links between elements are the value imports between the modules anchored to them", ({ args: [rel], project }) =>
    Effect.promise(async () => {
      const architectural = (id: string) => hasKind(project.config.vocabulary, "architectural", project.graph.node(id)?.kind ?? "")
      const declared = project.graph.edges()
        .filter((edge) => edge.rel === rel && architectural(edge.from) && architectural(edge.to))
        .map((edge) => `${edge.from} -${rel}-> ${edge.to}`)
      const imported = await importsBetweenElements(project, rel)
      const undeclared = imported.filter((link) => !declared.includes(link))
      const unfounded = declared.filter((link) => !imported.includes(link))
      assert.deepEqual(
        { "imported but not declared": undeclared, "declared but not imported": unfounded },
        { "imported but not declared": [], "declared but not imported": [] }
      )
    }))

  Then("no element reaches itself over {string} links", ({ args: [rel], project }) => {
    const elements = project.graph.nodes().filter((n) => hasKind(project.config.vocabulary, "architectural", n.kind))
    const cyclic = elements.filter((element) => {
      const back = queryProject(project, `#${element.id} -${rel}+-> #${element.id}`)
      return Result.isSuccess(back) && back.success.nodes.length > 0
    })
    assert.deepEqual(cyclic.map((element) => element.id), [])
  })

  // --- quality attributes ---------------------------------------------------

  Given("a generated graph of {int} nodes and {int} edges", ({ args: [nodeCount, edgeCount], world }) => {
    const kinds = ["requirement", "element", "decision", "scenario", "code"]
    const nodes: Array<GraphNode> = Array.from({ length: nodeCount }, (_, i) => ({
      id: `N${i}`,
      kind: kinds[i % kinds.length]!,
      title: `node ${i}`,
      attrs: { maturity: ["idea", "draft", "specified", "ready"][i % 4] }
    }))
    let seed = 42
    const random = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31
    const rels = ["realized-by", "decided-by", "verifies", "depends-on"]
    const edges: Array<GraphEdge> = Array.from({ length: edgeCount }, (_, i) => ({
      from: `N${Math.floor(random() * nodeCount)}`,
      rel: rels[i % rels.length]!,
      to: `N${Math.floor(random() * nodeCount)}`
    }))
    world.graph = new Graph(nodes, edges)
  })

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
