/**
 * Loading the scenario's workspace: what loading it reports, and a workspace that cannot be loaded.
 */
import { Effect, Result } from "effect"
import { strict as assert } from "node:assert"
import { defineSteps } from "sdp/steps"
import { loadMemoryProject } from "../../src/workspace/MemoryFileSystem.ts"
import { newWorld, reload, reportRow } from "./world.ts"

export default defineSteps(newWorld, ({ Then, When }) => {
  When("the workspace is loaded", ({ world }) =>
    Effect.map(reload(world), (project) => {
      world.reported = project.diagnostics.map(reportRow)
    }))

  Then("loading the workspace fails with {string}", ({ args: [text], world }) =>
    Effect.gen(function*() {
      const outcome = yield* Effect.result(loadMemoryProject(world.files))
      assert.ok(Result.isFailure(outcome), "the workspace loaded")
      const error = outcome.failure as { readonly file?: string; readonly message?: string }
      const message = `${error.file ?? ""}: ${error.message ?? String(outcome.failure)}`
      assert.ok(message.includes(text), `error was ${JSON.stringify(message)}`)
    }))
})
