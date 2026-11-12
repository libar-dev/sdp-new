/**
 * The real `sdp` command line as a process, the way people and agents use it. The files a scenario
 * is given are written to a fresh temporary directory before the first command (process.ts).
 */
import { Effect, Result } from "effect"
import { strict as assert } from "node:assert"
import { mkdir } from "node:fs/promises"
import { join } from "node:path"
import * as Text from "../../src/app/Text.ts"
import { defineSteps, Pending } from "sdp/steps"
import * as NodeServices from "@effect/platform-node/NodeServices"
import { execFile } from "node:child_process"
import { describe } from "../../src/app/Errors.ts"
import { run } from "../../src/app/Running.ts"
import { promisify } from "node:util"
import { exitCode, newWorld, output, produce } from "./world.ts"
import { cli, env, exec, record, workspace } from "./process.ts"

export default defineSteps(newWorld, ({ Given, Then, When }) => {
  When("I run {string}", async ({ args: [command], world }) => {
    record(world, command, await exec(command, await workspace(world)))
  })

  When("I run {string} in {string}", async ({ args: [command, subdirectory], world }) => {
    const directory = await workspace(world)
    await mkdir(join(directory, subdirectory), { recursive: true })
    record(world, command, await exec(command, join(directory, subdirectory)))
  })

  When("I run {string} in the repository", async ({ args: [command], project, world }) => {
    record(world, command, await exec(command, project.root))
  })

  // A shell pipeline, for what sdp's output is piped into; `sdp` is this repository's command line.
  When("I run the pipeline:", async ({ doc, world }) => {
    const script = `sdp() { "${process.execPath}" "${cli}" "$@"; }\n${doc ?? ""}`
    const cwd = await workspace(world)
    const result = await new Promise<{ code: number; stdout: string; stderr: string }>((done, reject) => {
      execFile("sh", ["-c", script], { cwd, env }, (error, stdout, stderr) => {
        if (error && typeof error.code !== "number") reject(error)
        else done({ code: error ? Number(error.code) : 0, stdout, stderr })
      })
    })
    // What the pipeline shows cannot be judged on a machine that lacks one of its tools.
    if (result.code === 127) throw new Pending({ reason: `a command of the pipeline is not installed: ${result.stderr.trim()}` })
    record(world, (doc ?? "").trim(), result)
  })

  Then("the exit code is {int}", ({ args: [code], world }) => {
    const actual = exitCode(world)
    assert.equal(actual, code, `exit code ${actual}, output:\n${output(world)}`)
  })

  // Every module the import loads, one URL per line, as a load hook sees them.
  When("a fresh Node process imports {string}", async ({ args: [specifier], project, world }) => {
    const script = [
      `import { registerHooks } from "node:module"`,
      `registerHooks({ load: (url, context, nextLoad) => (console.log(url), nextLoad(url, context)) })`,
      `await import(${JSON.stringify(specifier)})`
    ].join("\n")
    const { stdout: loaded } = await promisify(execFile)(process.execPath, ["--input-type=module", "-e", script], { cwd: project.root })
    produce(world, loaded)
  })

  // A program that runs a workspace more than once, as this process: it keeps the modules it imported.
  When("this process runs the workspace through the API", ({ world }) =>
    Effect.gen(function*() {
      const directory = yield* Effect.promise(() => workspace(world))
      const outcome = yield* Effect.result(run(directory))
      produce(world, Result.isSuccess(outcome) ? Text.runSummary(outcome.success.data) : describe(outcome.failure))
    }).pipe(Effect.provide(NodeServices.layer)))
})
