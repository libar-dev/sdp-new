/**
 * The real `sdp` command line as a process, the way people and agents use it. The files a scenario
 * is given are written to a fresh temporary directory before the first command (process.ts).
 */
import { Effect } from "effect"
import { strict as assert } from "node:assert"
import { existsSync } from "node:fs"
import { mkdir } from "node:fs/promises"
import { join } from "node:path"
import { defineSteps, Pending } from "sdp/steps"
import { exitCode, newWorld, output, produce } from "./world.ts"
import { cli, execute, gitEnv, record, spawned, workspace } from "./process.ts"

export default defineSteps(newWorld, ({ Given, Then, When }) => {
  When("I run {string}", ({ args: [command], world }) =>
    Effect.gen(function*() {
      record(world, command, yield* execute(command, yield* Effect.promise(() => workspace(world))))
    }))

  When("I run {string} in {string}", ({ args: [command, subdirectory], world }) =>
    Effect.gen(function*() {
      const directory = join(yield* Effect.promise(() => workspace(world)), subdirectory)
      yield* Effect.promise(() => mkdir(directory, { recursive: true }))
      record(world, command, yield* execute(command, directory))
    }))

  When("I run {string} in the repository", ({ args: [command], project, world }) =>
    Effect.gen(function*() {
      record(world, command, yield* execute(command, project.root))
    }))

  // A shell pipeline, for what sdp's output is piped into; `sdp` is this repository's command line.
  When("I run the pipeline:", ({ doc, world }) =>
    Effect.gen(function*() {
      const script = `sdp() { "${process.execPath}" "${cli}" "$@"; }\n${doc ?? ""}`
      const result = yield* spawned("sh", ["-c", script], { cwd: yield* Effect.promise(() => workspace(world)) })
      // What the pipeline shows cannot be judged on a machine that lacks one of its tools.
      if (result.code === 127) return yield* Effect.fail(new Pending({ reason: `a command of the pipeline is not installed: ${result.stderr.trim()}` }))
      record(world, (doc ?? "").trim(), result)
    }))

  // The files as given so far, committed on a branch of that name: the first starts the repository,
  // and each other starts where HEAD is.
  Given("the files are committed on the branch {string}", ({ args: [branch], world }) =>
    Effect.gen(function*() {
      const directory = yield* Effect.promise(() => workspace(world))
      const start = existsSync(join(directory, ".git")) ? ["checkout", "-q", "-B", branch] : ["init", "-q", "-b", branch]
      for (const args of [start, ["add", "-A"], ["commit", "-q", "--allow-empty", "-m", branch]]) {
        const git = yield* spawned("git", args, { cwd: directory, env: gitEnv })
        assert.equal(git.code, 0, `git ${args.join(" ")} exited ${git.code}: ${git.stderr}`)
      }
    }))

  Then("the exit code is {int}", ({ args: [code], world }) => {
    const actual = exitCode(world)
    assert.equal(actual, code, `exit code ${actual}, output:\n${output(world)}`)
  })

  // Every module the import loads, one URL per line, as a load hook sees them.
  When("a fresh Node process imports {string}", ({ args: [specifier], project, world }) =>
    Effect.gen(function*() {
      const script = [
        `import { registerHooks } from "node:module"`,
        `registerHooks({ load: (url, context, nextLoad) => (console.log(url), nextLoad(url, context)) })`,
        `await import(${JSON.stringify(specifier)})`
      ].join("\n")
      const node = yield* spawned(process.execPath, ["--input-type=module", "-e", script], { cwd: project.root })
      assert.equal(node.code, 0, `the import exited ${node.code}: ${node.stderr}`)
      produce(world, node.stdout)
    }))
})
