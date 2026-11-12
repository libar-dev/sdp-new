/**
 * Core step definitions for sdp's own specifications: building workspaces,
 * graph assertions, queries, checks, runs, context, exports, lifecycle, MCP and
 * quality measurements. Shares its world with every other module (world.ts).
 */
import { Effect, Layer, Path, Result } from "effect"
import { McpProtocol, McpTest } from "effect/ai"
import { strict as assert } from "node:assert"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { architectureView, rankCandidates } from "../../src/arch/Architecture.ts"
import { contextBundle } from "../../src/graph/Context.ts"
import type { Project } from "../../src/graph/Build.ts"
import { exportGraph, type GraphFormat } from "../../src/graph/Export.ts"
import { projectOrderings, query, type QueryResult } from "../../src/graph/Query.ts"
import { lifecycle, type LifecycleReport } from "../../src/lifecycle/Lifecycle.ts"
import { check } from "../../src/check/Check.ts"
import { registrations } from "../../src/mcp/Server.ts"
import { Graph, type GraphEdge, type GraphNode } from "../../src/model/Graph.ts"
import type { Diagnostic } from "../../src/model/Diagnostic.ts"
import type { RunResults } from "../../src/run/Results.ts"
import { builtinSteps } from "../../src/run/Builtin.ts"
import { runScenarios } from "../../src/run/Runner.ts"
import { defineSteps, pending, type StepModule } from "../../src/run/Steps.ts"
import { layerMemory, memoryRoot } from "../../src/workspace/MemoryFileSystem.ts"
import { ids, load, newWorld, node, reload, setFile } from "./world.ts"

export default defineSteps(newWorld, ({ Given, Then, When }) => {
  // --- workspace ------------------------------------------------------------

  Given("a file {string} containing:", ({ args: [path], doc, world }) => setFile(world, path, doc ?? ""))

  Given("an empty workspace", () => {})

  Given("{int} exported abstractions in {string}", ({ args: [count, path], world }) => {
    world.files.set(path, Array.from({ length: count }, (_, i) => `export class Abstraction${i} {}`).join("\n"))
  })

  Given("{int} significant element(s), each justified by a decision", ({ args: [count], world }) => {
    const nodes = Array.from({ length: count }, (_, i) =>
      `  - { id: ARCH-s${i}, kind: element, significant: true, rationale: "reason ${i}", links: { decided-by: DEC-s${i} } }\n` +
      `  - { id: DEC-s${i}, kind: decision, status: accepted }`)
    world.files.set("docs/significant.md", `---\nid: SIGNIFICANT\nkind: view\nnodes:\n${nodes.join("\n")}\n---\n# Significant\n`)
    world.project = undefined
  })

  When("the workspace is loaded", ({ world }) => Effect.asVoid(reload(world)))

  Then("the workspace graph has node {string} of kind {string}", ({ args: [id, kind], world }) =>
    Effect.map(load(world), (project) => assert.equal(node(project, id).kind, kind)))

  Then("the workspace graph has no node {string}", ({ args: [id], world }) =>
    Effect.map(load(world), (project) => assert.equal(project.graph.node(id), undefined, `${id} should not be a node`)))

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

  Then("scenario {string} is at line {int}", ({ args: [id, line], world }) =>
    Effect.map(load(world), (project) => assert.equal(node(project, id).source?.line, line)))

  // --- query ----------------------------------------------------------------

  When("I query {string}", ({ args: [q], world }) =>
    Effect.map(load(world), (project) => {
      const result = query(project.graph, q, { orderings: projectOrderings(project.config.maturity) })
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

  Then("the check reports no errors", ({ world }) => {
    const errors = world.diagnostics?.filter((d) => d.severity === "error") ?? []
    assert.equal(errors.length, 0, errors.map((d) => `[${d.rule}] ${d.message}`).join("\n"))
  })

  Then("the {string} diagnostic has severity {string}", ({ args: [rule, severity], world }) => {
    const found = world.diagnostics?.find((d) => d.rule === rule)
    assert.ok(found, `no ${rule} diagnostic`)
    assert.equal(found.severity, severity)
  })

  // --- execution ------------------------------------------------------------

  Given("a step definition {string} that {word}", ({ args: [expression, behaviour], world }) => {
    world.definitions.push({ expression, behaviour })
  })

  When("the scenarios are run", ({ world }) =>
    Effect.gen(function*() {
      const project = yield* reload(world)
      const module: StepModule<{}> = defineSteps(() => ({}), ({ Step }) => {
        for (const { behaviour, expression } of world.definitions) {
          Step(expression, () => {
            if (behaviour === "fails") throw new Error(`deliberate failure in "${expression}"`)
            if (behaviour === "pends") return pending("not yet")
          })
        }
      })
      world.run = yield* runScenarios({ project, modules: [builtinSteps, module] })
      world.files.set(".sdp/results.json", JSON.stringify(world.run))
      yield* reload(world)
    }))

  Then("scenario {string} has status {string}", ({ args: [id, status], world }) => {
    assert.ok(world.run, "run the scenarios first")
    assert.equal(world.run.scenarios[id]?.status, status, `status of ${id}`)
  })

  Then("the step {string} suggests the definition {string}", ({ args: [text, suggestion], world }) => {
    const step = Object.values(world.run?.scenarios ?? {}).flatMap((s) => s.pickles.flatMap((p) => p.steps)).find((s) => s.text === text)
    assert.ok(step, `no step "${text}"`)
    assert.ok(step.snippet?.includes(suggestion), `snippet was ${step.snippet}`)
  })

  Then("the check reports nothing", ({ world }) => {
    const found = world.diagnostics ?? []
    assert.equal(found.length, 0, found.map((d) => `[${d.rule}] ${d.message}`).join("\n"))
  })

  // --- architecture ---------------------------------------------------------

  When("I ask for the architecture view", ({ world }) =>
    Effect.map(load(world), (project) => {
      const view = architectureView(project)
      world.output = [
        ...view.nodes.map((n) => `${n.id} — ${n.title} (${n.kind})${n.attrs.rationale ? `\n  rationale: ${String(n.attrs.rationale)}` : ""}`),
        ...view.edges.map((e) => `${e.from} -${e.rel}-> ${e.to}`)
      ].join("\n")
    }))

  When("I ask for architecture candidates", ({ world }) =>
    Effect.map(load(world), (project) => {
      world.output = rankCandidates(project).map((c) => `${c.node.id} ${c.score} ${c.reasons.join("; ")}`).join("\n")
    }))

  // --- context, exports, lifecycle, MCP ------------------------------------

  When("I ask for the context of {string}", ({ args: [id], world }) =>
    Effect.map(load(world), (project) => {
      world.output = contextBundle(project, id) ?? ""
    }))

  When("the graph is exported as {word}", ({ args: [format], world }) =>
    Effect.map(load(world), (project) => {
      world.output = exportGraph(project.graph, format as GraphFormat)
    }))

  Then("the output contains {string}", ({ args: [text], world }) => {
    assert.ok(world.output.includes(text.replace(/\\t/g, "\t")), `output does not contain ${JSON.stringify(text)}:\n${world.output}`)
  })

  Then("the output does not contain {string}", ({ args: [text], world }) => {
    assert.ok(!world.output.includes(text), `output unexpectedly contains ${JSON.stringify(text)}`)
  })

  Then("the output has one line per node and edge", ({ world }) =>
    Effect.map(load(world), (project) => {
      const lines = world.output.trimEnd().split("\n")
      assert.equal(lines.length, project.graph.nodes.size + project.graph.edges.length)
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

  When("an agent calls the MCP tool {string} with:", ({ args: [tool], doc, world }) =>
    Effect.gen(function*() {
      const client = yield* McpTest.makeClient(registrations(memoryRoot), { protocols: [McpProtocol.v2025_11_25] })
      const result = yield* client.callTool({ name: tool, arguments: JSON.parse(doc ?? "{}") })
      world.output = result.content.map((c) => (c.type === "text" ? c.text : "")).join("\n")
    }).pipe(Effect.scoped, Effect.provide(Layer.merge(layerMemory(world.files), Path.layer))))

  // --- quality attributes ---------------------------------------------------

  Given("a generated graph of {int} nodes and {int} edges", ({ args: [nodeCount, edgeCount], world }) => {
    const kinds = ["requirement", "element", "decision", "scenario", "code"]
    const nodes: Array<GraphNode> = Array.from({ length: nodeCount }, (_, i) => ({
      id: `N${i}`,
      kind: kinds[i % kinds.length]!,
      title: `node ${i}`,
      attrs: { maturity: ["idea", "draft", "specified", "ready"][i % 4], significant: i % 50 === 0 }
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
      const result = query(graph, q, { orderings: projectOrderings(["idea", "draft", "specified", "ready"]) })
      samples.push(performance.now() - started)
      assert.ok(Result.isSuccess(result))
    }
    world.durationMs = samples.sort((a, b) => a - b)[3]!
  })

  Then("the median run completes within {int} ms", ({ args: [budget], world }) => {
    assert.ok(world.durationMs <= budget, `median ${world.durationMs.toFixed(1)} ms exceeds ${budget} ms`)
  })

  When("I run {string} in the repository", ({ args: [command], project, world }) =>
    Effect.tryPromise(async () => {
      const [bin, ...argv] = command.split(" ")
      const { stdout } = await promisify(execFile)(bin === "sdp" ? process.execPath : bin!, bin === "sdp" ? ["src/cli/main.ts", ...argv] : argv, {
        cwd: project.root
      })
      world.output = stdout
    }))

  // These assert against this repository's own graph (ctx.project), not an in-memory one.
  Then("every node of this repository has a source location", ({ project }) => {
    const missing = [...project.graph.nodes.values()].filter((n) => n.kind !== "missing" && !n.source)
    assert.equal(missing.length, 0, missing.map((n) => n.id).join(", "))
  })

  Then("every edge of this repository has a source location", ({ project }) => {
    const missing = project.graph.edges.filter((e) => !e.source)
    assert.equal(missing.length, 0, missing.map((e) => `${e.from} -${e.rel}-> ${e.to}`).join(", "))
  })

  Then("every node id of this repository appears literally in its source file", ({ project }) =>
    Effect.tryPromise(async () => {
      const { readFile } = await import("node:fs/promises")
      const cache = new Map<string, string>()
      const offenders: Array<string> = []
      for (const n of project.graph.nodes.values()) {
        if (!n.source || n.kind === "code" || n.kind === "scenario") continue
        const file = `${project.root}/${n.source.file}`
        if (!cache.has(file)) cache.set(file, await readFile(file, "utf8"))
        if (!cache.get(file)!.includes(n.id)) offenders.push(`${n.id} (${n.source.file})`)
      }
      assert.equal(offenders.length, 0, offenders.join(", "))
    }))
})
