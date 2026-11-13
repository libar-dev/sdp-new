/**
 * The real `sdp` command line as a process, the way people and agents use it. The files a scenario
 * is given are written to a fresh temporary directory before the first command (process.ts).
 */
import { strict as assert } from "node:assert"
import { existsSync } from "node:fs"
import { mkdir } from "node:fs/promises"
import { join } from "node:path"
import { defineSteps, Pending } from "sdp/steps"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { exitCode, newWorld, output, produce } from "./world.ts"
import { cli, env, exec, gitEnv, record, workspace } from "./process.ts"

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

  // The files as given so far, committed on a branch of that name: the first starts the repository,
  // and each other starts where HEAD is.
  Given("the files are committed on the branch {string}", async ({ args: [branch], world }) => {
    const directory = await workspace(world)
    const start = existsSync(join(directory, ".git")) ? ["checkout", "-q", "-B", branch] : ["init", "-q", "-b", branch]
    for (const args of [start, ["add", "-A"], ["commit", "-q", "--allow-empty", "-m", branch]]) {
      await promisify(execFile)("git", args, { cwd: directory, env: gitEnv })
    }
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
})
