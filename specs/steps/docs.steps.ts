/**
 * Step definitions for the specs that replace the design document: lifecycle
 * on a given date, configuration, graph build time, and the quality attribute
 * scenarios that look at this repository itself. Shares its world with every
 * other module (world.ts); module-local state lives in `world.scratch`.
 */
import { Effect, Result } from "effect"
import { strict as assert } from "node:assert"
import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { newId } from "../../src/cli/templates.ts"
import type { Project } from "../../src/graph/Build.ts"
import { exportGraph, type GraphFormat } from "../../src/graph/Export.ts"
import { lifecycle, renderLifecycle } from "../../src/lifecycle/Lifecycle.ts"
import { defineSteps } from "../../src/run/Steps.ts"
import { layerMemoryWorkspace, loadMemoryProject, memoryRoot } from "../../src/workspace/MemoryFileSystem.ts"
import { findFiles } from "../../src/workspace/Workspace.ts"
import { ids, load, newWorld, reload, setFile, type World } from "./world.ts"

const outputLine = (output: string, text: string) => {
  const line = output.split("\n").find((l) => l.includes(text))
  assert.ok(line !== undefined, `no output line contains ${JSON.stringify(text)}:\n${output}`)
  return line
}

export default defineSteps(newWorld, ({ Given, Then, When }) => {
  // --- lifecycle ------------------------------------------------------------

  When("the lifecycle is computed on {string}", ({ args: [today], world }) =>
    Effect.map(load(world), (project) => {
      world.lifecycle = lifecycle(project, today)
      world.output = renderLifecycle(world.lifecycle)
    }))

  Then("the current iteration is {string}", ({ args: [expected], world }) => {
    assert.ok(world.lifecycle, "compute the lifecycle first")
    assert.equal(world.lifecycle.current?.id ?? "none", expected)
  })

  Then("the output line with {string} contains {string}", ({ args: [anchor, text], world }) => {
    const line = outputLine(world.output, anchor)
    assert.ok(line.includes(text), `${JSON.stringify(line)} does not contain ${JSON.stringify(text)}`)
  })

  Then("the output line with {string} does not contain {string}", ({ args: [anchor, text], world }) => {
    const line = outputLine(world.output, anchor)
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

  Then("the results are stored in {string}", ({ args: [path], world }) => {
    const stored = world.files.get(path)
    assert.ok(stored !== undefined, `no file ${path}; files are: ${[...world.files.keys()].join(", ")}`)
    assert.ok(JSON.parse(stored).scenarios, `${path} holds no scenario results`)
  })

  Then("a new {word} titled {string} gets the id {string}", ({ args: [kind, title, expected], world }) =>
    Effect.map(load(world), (project) =>
      assert.equal(newId(kind, title, project.config, [...project.graph.nodes.keys()]), expected)))

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

  // Scenario and code ids are derived (`<spec id>#<slug>`, `code:<path>#<symbol>`), so only
  // declared ids are searched for.
  When("it searches each file for the ids of the nodes declared there", ({ world }) =>
    Effect.promise(async () => {
      const project = repository(world)
      const files = new Map<string, string>()
      const misses: Array<string> = []
      for (const node of project.graph.nodes.values()) {
        if (!node.source || node.kind === "scenario" || node.kind === "code") continue
        const file = node.source.file
        if (!files.has(file)) files.set(file, await readFile(join(project.root, file), "utf8"))
        if (!files.get(file)!.includes(node.id)) misses.push(`${node.id} (${file})`)
      }
      world.scratch.misses = misses
    }))

  Then("every id is found in the file that declares it", ({ world }) => {
    const misses = world.scratch.misses as ReadonlyArray<string> | undefined
    assert.ok(misses, "search the files first")
    assert.equal(misses.length, 0, `not found: ${misses.join(", ")}`)
  })

  When("it exports the graph as {word}", ({ args: [format], world }) => {
    world.output = exportGraph(repository(world).graph, format as GraphFormat)
  })

  Then("every line of the export ends with a file and line", ({ world }) => {
    const lines = world.output.trimEnd().split("\n")
    const offenders = lines.filter((line) => !/\t[^\t]+:\d+$/.test(line))
    assert.equal(offenders.length, 0, `${offenders.length} of ${lines.length} lines:\n${offenders.slice(0, 10).join("\n")}`)
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
