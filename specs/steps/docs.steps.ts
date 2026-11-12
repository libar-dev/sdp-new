/**
 * Step definitions for the specs that replace the design document: lifecycle
 * on a given date, configuration, graph build time, the quality attribute
 * scenarios that look at this repository itself, and shell pipelines. Shares
 * its world with every other module (world.ts); module-local state lives in
 * `world.scratch`.
 */
import { Effect, Result } from "effect"
import { strict as assert } from "node:assert"
import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { newId } from "../../src/app/Templates.ts"
import type { Project } from "../../src/graph/Build.ts"
import { lifecycle, renderLifecycle } from "../../src/lifecycle/Lifecycle.ts"
import { formatSource, type SourceRef } from "../../src/model/Graph.ts"
import { defineSteps } from "sdp/steps"
import { layerMemoryWorkspace, loadMemoryProject, memoryRoot } from "../../src/workspace/MemoryFileSystem.ts"
import { findFiles } from "../../src/workspace/Workspace.ts"
import { assertRows, ids, load, newWorld, output, produce, reload, type Row, setFile, type World } from "./world.ts"

const outputLine = (output: string, text: string) => {
  const line = output.split("\n").find((l) => l.includes(text))
  assert.ok(line !== undefined, `no output line contains ${JSON.stringify(text)}:\n${output}`)
  return line
}

const computed = (world: World) => {
  assert.ok(world.lifecycle, "compute the lifecycle first")
  return world.lifecycle
}

export default defineSteps(newWorld, ({ Given, Then, When }) => {
  // --- lifecycle ------------------------------------------------------------

  When("the lifecycle is computed", ({ world }) =>
    Effect.map(load(world), (project) => {
      world.lifecycle = lifecycle(project)
      produce(world, renderLifecycle(world.lifecycle))
    }))

  When("the lifecycle is computed on {string}", ({ args: [today], world }) =>
    Effect.map(load(world), (project) => {
      world.lifecycle = lifecycle(project, today)
      produce(world, renderLifecycle(world.lifecycle))
    }))

  // The milestones in the order of the timeline: id, closes, phase, iterations, planned, met,
  // gate (passed/all) and next (yes for the one the project is at).
  Then("the milestones are:", ({ table, world }) => {
    const report = computed(world)
    const rows = report.milestones.map((milestone): Row => ({
      id: milestone.node.id,
      closes: milestone.closes?.id ?? "",
      phase: milestone.phase?.id ?? "",
      iterations: milestone.iterations.map((iteration) => iteration.id).join(", "),
      planned: milestone.planned ?? "",
      met: milestone.met ?? "",
      gate: `${milestone.gate.filter((scenario) => scenario.status === "passed").length}/${milestone.gate.length}`,
      next: milestone === report.next ? "yes" : ""
    }))
    assertRows("milestones", rows, table, "in order")
  })

  // The iterations in the order of the timeline: id, phase, plans (the nodes planned into it),
  // stages (of those nodes, as `draft:1 verified:2`) and today (yes for the one the calendar is in).
  Then("the iterations are:", ({ table, world }) => {
    const report = computed(world)
    const rows = report.work.map((iteration): Row => ({
      id: iteration.node.id,
      phase: report.phases.find((phase) => phase.iterations.some((i) => i.node.id === iteration.node.id))?.node.id ?? "",
      plans: iteration.items.map((item) => item.id).sort().join(", "),
      stages: Object.entries(iteration.stages).sort(([a], [b]) => a.localeCompare(b)).map(([stage, n]) => `${stage}:${n}`).join(" "),
      today: report.current?.id === iteration.node.id ? "yes" : ""
    }))
    assertRows("iterations", rows, table, "in order")
  })

  // The chart as numbers: a row per discipline, a column per iteration.
  Then("the planned activity is:", ({ table, world }) => {
    const report = computed(world)
    const rows = report.disciplines.map((row): Row => ({
      discipline: row.discipline,
      ...Object.fromEntries(report.iterations.map((iteration, column) => [iteration.id, String(row.activity[column])]))
    }))
    assertRows("planned activity", rows, table, "including")
  })

  Then("the output line with {string} contains {string}", ({ args: [anchor, text], world }) => {
    const line = outputLine(output(world), anchor)
    assert.ok(line.includes(text), `${JSON.stringify(line)} does not contain ${JSON.stringify(text)}`)
  })

  Then("the output line with {string} does not contain {string}", ({ args: [anchor, text], world }) => {
    const line = outputLine(output(world), anchor)
    assert.ok(!line.includes(text), `${JSON.stringify(line)} contains ${JSON.stringify(text)}`)
  })

  // --- configuration --------------------------------------------------------

  Then("loading the workspace fails with {string}", ({ args: [text], world }) =>
    Effect.gen(function*() {
      const outcome = yield* Effect.result(loadMemoryProject(world.files))
      assert.ok(Result.isFailure(outcome), "the workspace loaded")
      const error = outcome.failure as { readonly file?: string; readonly message?: string }
      const message = `${error.file ?? ""}: ${error.message ?? String(outcome.failure)}`
      assert.ok(message.includes(text), `error was ${JSON.stringify(message)}`)
    }))

  Then("sdp run loads the step modules {string}", ({ args: [expected], world }) =>
    Effect.gen(function*() {
      const { config } = yield* load(world)
      const files = yield* findFiles(memoryRoot, config.steps, config.exclude).pipe(
        Effect.provide(layerMemoryWorkspace(world.files))
      )
      assert.deepEqual(files, ids(expected))
    }))

  Then("a new {word} titled {string} gets the id {string}", ({ args: [kind, title, expected], world }) =>
    Effect.map(load(world), (project) =>
      assert.equal(newId(kind, title, project.config, project.graph.nodes().map((n) => n.id)), expected)))

  // --- quality attributes ---------------------------------------------------

  Given("a generated workspace of {int} specs", ({ args: [count], world }) => {
    for (let i = 0; i < count; i++) {
      setFile(
        world,
        `specs/REQ-${i}.md`,
        `---\nid: REQ-${i}\nmaturity: specified\nlinks:\n  depends-on: REQ-${(i * 7) % count}\n---\n# Requirement ${i}\n\n` +
          `Refines [[REQ-${(i * 3) % count}]].\n\n\`\`\`gherkin\nScenario: Works\n  Given a thing ${i}\n  When it is used\n  Then it works\n\`\`\`\n`
      )
    }
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

  // --- this repository ------------------------------------------------------

  Given("an agent that explores this repository with grep", ({ project, world }) => {
    world.scratch.repository = project
  })

  // A scenario's link to its spec is made by sdp, at the scenario's line: no author wrote an id there.
  When("it follows every node and link of the graph back to its file and line", ({ world }) =>
    Effect.promise(async () => {
      const { config, graph, root } = repository(world)
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
          else if (edge.rel !== config.vocabulary.relations.scenario && !line.includes(edge.to)) unnamed.push(`${label} ${formatSource(source)}`)
        }
      }
      world.scratch.untraceable = untraceable
      world.scratch.unnamed = unnamed
    }))

  Then("every one of them has a file and a line that exist", ({ world }) => {
    const untraceable = world.scratch.untraceable as ReadonlyArray<string> | undefined
    assert.ok(untraceable, "follow the graph back to its files first")
    assert.equal(untraceable.length, 0, `no file and line for: ${untraceable.slice(0, 10).join(", ")}`)
  })

  Then("the line of every link contains the id it links to", ({ world }) => {
    const unnamed = world.scratch.unnamed as ReadonlyArray<string> | undefined
    assert.ok(unnamed, "follow the graph back to its files first")
    assert.equal(unnamed.length, 0, `grep for the target would miss:\n${unnamed.slice(0, 10).join("\n")}`)
  })

  Given("this repository has no build output", ({ project }) => {
    const found = ["dist", "build", "out"].filter((dir) => existsSync(join(project.root, dir)))
    assert.equal(found.length, 0, `build output found: ${found.join(", ")}`)
  })
})

const repository = (world: World): Project => {
  const project = world.scratch.repository as Project | undefined
  assert.ok(project, "start with: Given an agent that explores this repository with grep")
  return project
}
