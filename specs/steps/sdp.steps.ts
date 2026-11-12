/**
 * Core step definitions for sdp's own specifications: building workspaces,
 * graph assertions, queries, checks, context, exports, lifecycle, MCP and quality
 * measurements. Running scenarios lives in execution.steps.ts. Shares its world
 * with every other module (world.ts).
 */
import { Effect, Predicate, Result } from "effect"
import { McpProtocol, McpTest } from "effect/ai"
import { strict as assert } from "node:assert"
import { renderArchitecture } from "../../src/arch/Architecture.ts"
import { contextBundle } from "../../src/graph/Context.ts"
import { exportGraph, type GraphFormat } from "../../src/graph/Export.ts"
import { projectOrderings, query, queryProject } from "../../src/graph/Query.ts"
import { lifecycle } from "../../src/lifecycle/Lifecycle.ts"
import { check } from "../../src/check/Check.ts"
import { instructions, registrations } from "../../src/mcp/Server.ts"
import { Graph, type GraphEdge, type GraphNode } from "../../src/model/Graph.ts"
import { defineSteps } from "sdp/steps"
import { defaultVocabulary } from "../../src/model/Vocabulary.ts"
import { layerMemoryWorkspace, memoryRoot } from "../../src/workspace/MemoryFileSystem.ts"
import { ids, load, newWorld, node, reload, setFile } from "./world.ts"

export default defineSteps(newWorld, ({ Given, Then, When }) => {
  // --- workspace ------------------------------------------------------------

  Given("a file {string} containing:", ({ args: [path], doc, world }) => setFile(world, path, doc ?? ""))

  Given("an empty workspace", () => {})

  When("the workspace is loaded", ({ world }) => Effect.asVoid(reload(world)))

  Then("the workspace graph has node {string} of kind {string}", ({ args: [id, kind], world }) =>
    Effect.map(load(world), (project) => assert.equal(node(project, id).kind, kind)))

  Then("node {string} has attribute {word} = {string}", ({ args: [id, key, value], world }) =>
    Effect.map(load(world), (project) => {
      const n = node(project, id)
      const actual = key === "title" ? n.title : key === "kind" ? n.kind : n.attrs[key]
      assert.equal(String(actual), value, `${id}.${key}`)
    }))

  Then("there is an edge {string} -{word}-> {string}", ({ args: [from, rel, to], world }) =>
    Effect.map(load(world), (project) => {
      const edges = project.graph.out(from)
      assert.ok(
        edges.some((e) => e.rel === rel && e.to === to),
        `no edge ${from} -${rel}-> ${to}; ${from} has: ${edges.map((e) => `-${e.rel}-> ${e.to}`).join(", ") || "no edges"}`
      )
    }))

  Then("node {string} has {int} scenario(s)", ({ args: [id, count], world }) =>
    Effect.map(load(world), (project) => assert.equal(project.specById.get(id)?.scenarios.length ?? 0, count)))

  Then("scenario {string} has {int} example(s)", ({ args: [id, count], world }) =>
    Effect.map(load(world), (project) => {
      const scenario = project.specs.flatMap((s) => s.scenarios).find((s) => s.id === id)
      assert.ok(scenario, `no scenario ${id}`)
      assert.equal(scenario.pickles.length, count)
    }))

  Then("scenario/node {string} is at line {int}", ({ args: [id, line], world }) =>
    Effect.map(load(world), (project) => assert.equal(node(project, id).source?.line, line)))

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

  // --- check ----------------------------------------------------------------

  When("the workspace is checked", ({ world }) =>
    Effect.map(reload(world), (project) => {
      world.diagnostics = check(project)
    }))

  Then("the check reports {string} for {string}", ({ args: [rule, id], world }) => {
    assert.ok(world.diagnostics, "run `When the workspace is checked` first")
    assert.ok(
      world.diagnostics.some((d) => d.rule === rule && (d.node === id || d.message.includes(id))),
      `no ${rule} for ${id}; got: ${world.diagnostics.map((d) => `${d.rule}(${d.node ?? ""})`).join(", ") || "nothing"}`
    )
  })

  Then("the check reports {string}", ({ args: [rule], world }) => {
    assert.ok(world.diagnostics?.some((d) => d.rule === rule), `no ${rule} diagnostic`)
  })

  Then("the check does not report {string}", ({ args: [rule], world }) => {
    const found = world.diagnostics?.filter((d) => d.rule === rule) ?? []
    assert.equal(found.length, 0, found.map((d) => d.message).join("\n"))
  })

  Then("the {string} diagnostic has severity {string}", ({ args: [rule, severity], world }) => {
    const found = world.diagnostics?.find((d) => d.rule === rule)
    assert.ok(found, `no ${rule} diagnostic`)
    assert.equal(found.severity, severity)
  })

  Then("the check reports nothing", ({ world }) => {
    const found = world.diagnostics ?? []
    assert.equal(found.length, 0, found.map((d) => `[${d.rule}] ${d.message}`).join("\n"))
  })

  Then("the check reports nothing but {string}", ({ args: [rule], world }) => {
    const found = (world.diagnostics ?? []).filter((d) => d.rule !== rule)
    assert.equal(found.length, 0, found.map((d) => `[${d.rule}] ${d.message}`).join("\n"))
  })

  // --- architecture ---------------------------------------------------------

  When("I ask for the architecture view", ({ world }) =>
    Effect.map(load(world), (project) => {
      world.output = renderArchitecture(project)
    }))

  // --- context, exports, lifecycle, MCP ------------------------------------

  When("I ask for the context of {string}", ({ args: [id], world }) =>
    Effect.map(load(world), (project) => {
      world.output = contextBundle(project, id) ?? ""
    }))

  When("the graph is exported as {word}", ({ args: [format], world }) =>
    Effect.map(load(world), (project) => {
      world.output = exportGraph(project.graph, format as GraphFormat, project.config.vocabulary)
    }))

  // `\t` and `\n` in the expected text stand for a tab and a line break.
  Then("the output contains {string}", ({ args: [text], world }) => {
    const expected = text.replace(/\\t/g, "\t").replace(/\\n/g, "\n")
    assert.ok(world.output.includes(expected), `output does not contain ${JSON.stringify(expected)}:\n${world.output}`)
  })

  Then("the output contains {string} {int} time(s)", ({ args: [text, count], world }) => {
    assert.equal(world.output.split(text).length - 1, count, `occurrences of ${JSON.stringify(text)} in:\n${world.output}`)
  })

  Then("the line after the output line with {string} contains {string}", ({ args: [anchor, text], world }) => {
    const lines = world.output.split("\n")
    const index = lines.findIndex((line) => line.includes(anchor))
    assert.ok(index >= 0, `no output line contains ${JSON.stringify(anchor)}:\n${world.output}`)
    assert.ok(lines[index + 1]?.includes(text), `the line after ${JSON.stringify(lines[index])} is ${JSON.stringify(lines[index + 1])}`)
  })

  Then("the output does not contain {string}", ({ args: [text], world }) => {
    assert.ok(!world.output.includes(text), `output unexpectedly contains ${JSON.stringify(text)}`)
  })

  Then("the output has one line per node and edge", ({ world }) =>
    Effect.map(load(world), (project) => {
      const lines = world.output.trimEnd().split("\n")
      assert.equal(lines.length, project.graph.nodes().length + project.graph.edges().length)
    }))

  When("the lifecycle is computed", ({ world }) =>
    Effect.map(load(world), (project) => {
      world.lifecycle = lifecycle(project)
    }))

  Then("phase {string} has iterations {string}", ({ args: [phase, list], world }) => {
    const p = world.lifecycle?.phases.find((x) => x.node.id === phase)
    assert.ok(p, `no phase ${phase}`)
    assert.deepEqual(p.iterations.map((i) => i.node.id), list.split(",").map((s) => s.trim()))
  })

  Then("phase {string} has milestone {string}", ({ args: [phase, milestone], world }) => {
    const p = world.lifecycle?.phases.find((x) => x.node.id === phase)
    assert.ok(p?.milestones.some((m) => m.id === milestone), `${phase} has no milestone ${milestone}`)
  })

  Then("{string} activity in iteration {string} is {int}", ({ args: [discipline, iteration, expected], world }) => {
    const report = world.lifecycle!
    const column = report.iterations.findIndex((i) => i.id === iteration)
    const row = report.disciplines.find((d) => d.discipline === discipline)
    assert.ok(column >= 0 && row, `no ${discipline} × ${iteration}`)
    assert.equal(row.activity[column], expected)
  })

  // A tool error and a rejected call (invalid arguments) both count as the tool reporting an error.
  When("an agent calls the MCP tool {string} with:", ({ args: [tool], doc, world }) =>
    Effect.gen(function*() {
      const client = yield* McpTest.makeClient(registrations(memoryRoot), { protocols: [McpProtocol.v2025_11_25] })
      const result = yield* client.callTool({ name: tool, arguments: JSON.parse(doc ?? "{}") })
      world.output = result.content.map((c) => (c.type === "text" ? c.text : "")).join("\n")
      world.scratch.mcpError = result.isError === true
    }).pipe(
      Effect.catch((error) =>
        Effect.sync(() => {
          world.output = Predicate.hasProperty(error, "message") ? String(error.message) : String(error)
          world.scratch.mcpError = true
        })
      ),
      Effect.scoped,
      Effect.provide(layerMemoryWorkspace(world.files))
    ))

  When("an agent reads the MCP server's instructions", ({ world }) => {
    world.output = instructions
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
