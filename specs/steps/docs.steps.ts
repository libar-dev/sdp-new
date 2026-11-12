/**
 * Step definitions for the specs that replace the design document: lifecycle
 * on a given date, configuration, query paths and graph build time. Shares its
 * world with every other module (world.ts); module-local state lives in
 * `world.scratch`.
 */
import { Effect, Layer, Path, Result } from "effect"
import { strict as assert } from "node:assert"
import { builtinSteps } from "../../src/run/Builtin.ts"
import { newId } from "../../src/cli/templates.ts"
import { formatPath } from "../../src/graph/Query.ts"
import { lifecycle, renderLifecycle } from "../../src/lifecycle/Lifecycle.ts"
import { runScenarios } from "../../src/run/Runner.ts"
import { defineSteps, pending, type StepModule } from "../../src/run/Steps.ts"
import { layerMemory, loadMemoryProject, memoryRoot } from "../../src/workspace/MemoryFileSystem.ts"
import { findFiles, writeResults } from "../../src/workspace/Workspace.ts"
import { ids, load, newWorld, reload, setFile } from "./world.ts"

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

  // --- query ----------------------------------------------------------------

  Then("one of the paths is {string}", ({ args: [expected], world }) => {
    assert.ok(world.result, `query failed: ${world.queryError}`)
    const paths = world.result.paths.map(formatPath)
    assert.ok(paths.includes(expected), `paths are:\n${paths.join("\n")}`)
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
        Effect.provide(Layer.merge(layerMemory(world.files), Path.layer))
      )
      assert.deepEqual(files, ids(expected))
    }))

  When("the scenarios are run and their results saved", ({ world }) =>
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
      yield* writeResults(memoryRoot, project.config, world.run).pipe(
        Effect.provide(Layer.merge(layerMemory(world.files), Path.layer))
      )
      yield* reload(world)
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
})
