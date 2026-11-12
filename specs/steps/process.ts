/**
 * Processes and the directory they run in. Files given with `a file … containing:` are written to
 * a fresh temporary directory before the first command; commands run there, with `sdp` standing
 * for `node <this repository>/src/cli/main.ts`, the repository's own tools (`tsc`) found as under
 * `npm run`, `$PWD` for that directory, `$TODAY` for today's date (YYYY-MM-DD, as sdp's clock gives
 * it) and leading `NAME=value` words setting environment variables, as in a shell.
 */
import { strict as assert } from "node:assert"
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises"
import { delimiter, dirname, join, resolve } from "node:path"
import { execFile } from "node:child_process"
import { realpathSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"
import { produce, settled, type World } from "./world.ts"

export const repository = resolve(fileURLToPath(new URL("../..", import.meta.url)))
export const cli = join(repository, "src/cli/main.ts")
// Every command is a fresh Node process; a shared compile cache keeps start-up short.
// No repository above the temporary directory is one of a scenario's, whatever the machine has there.
export const env = {
  ...process.env,
  PATH: [join(repository, "node_modules/.bin"), process.env.PATH].filter(Boolean).join(delimiter),
  NO_COLOR: "1",
  NODE_COMPILE_CACHE: join(tmpdir(), "sdp-compile-cache"),
  GIT_CEILING_DIRECTORIES: [tmpdir(), realpathSync(tmpdir())].join(delimiter)
}

/** Git as a scenario's own repository uses it: none of the machine's configuration, and an author for its commits. */
export const gitEnv = {
  ...env,
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "sdp",
  GIT_AUTHOR_EMAIL: "sdp@example.com",
  GIT_COMMITTER_NAME: "sdp",
  GIT_COMMITTER_EMAIL: "sdp@example.com"
}

// Created once (scenarios may run concurrently, so the promise is shared, not the result).
let base: Promise<string> | undefined

/** A new directory per scenario, all removed when the run exits. */
const scenarioDirectory = async () => {
  base ??= mkdtemp(join(tmpdir(), "sdp-cli-")).then((created) => {
    process.once("exit", () => rmSync(created, { recursive: true, force: true }))
    return created
  })
  return mkdtemp(join(await base, "workspace-"))
}

export const directoryOf = async (world: World) => world.directory ??= await scenarioDirectory()

/** The scenario's directory with every given file written to it (again, if it changed since). */
export const workspace = async (world: World) => {
  const directory = await directoryOf(world)
  const written = (world.scratch.written ??= new Map<string, string>()) as Map<string, string>
  for (const [file, content] of world.files) {
    if (written.get(file) === content) continue
    await mkdir(dirname(join(directory, file)), { recursive: true })
    await writeFile(join(directory, file), content)
    written.set(file, content)
  }
  return directory
}

/** Shell-like words: quotes group, and are removed. */
const words = (command: string) => [...command.matchAll(/'([^']*)'|"([^"]*)"|(\S+)/g)].map((m) => m[1] ?? m[2] ?? m[3]!)

export const exec = (command: string, cwd: string, input = "") =>
  new Promise<{ code: number; stdout: string; stderr: string }>((done, reject) => {
    const today = new Date().toISOString().slice(0, 10)
    const all = words(command).map((word) => word.replaceAll("$PWD", cwd).replaceAll("$TODAY", today))
    const assignments = all.findIndex((word) => !/^[A-Z_][A-Z0-9_]*=/.test(word))
    const variables = Object.fromEntries(all.slice(0, assignments).map((word) => word.split(/=(.*)/s).slice(0, 2)))
    const [bin, ...args] = all.slice(assignments)
    const sdp = bin === "sdp"
    const options = { cwd, env: { ...env, ...variables } }
    const child = execFile(sdp ? process.execPath : bin!, sdp ? [cli, ...args] : args, options, (error, stdout, stderr) => {
      if (error && typeof error.code !== "number") reject(error)
      else done({ code: error ? Number(error.code) : 0, stdout, stderr })
    })
    child.stdin?.end(input)
  })

/**
 * A file of the scenario's workspace: on disk once a command has run there, else in memory. A
 * command run for what it leaves behind is asserted on by reading that.
 */
export const fileOf = async (world: World, file: string): Promise<string | undefined> => {
  settled(world)
  if (world.directory === undefined) return world.files.get(file)
  return readFile(join(world.directory, file), "utf8").catch(() => undefined)
}

export const existingFile = async (world: World, file: string): Promise<string> => {
  const content = await fileOf(world, file)
  assert.ok(content !== undefined, `no file ${file}`)
  return content
}

export const record = (world: World, line: string, result: { code: number; stdout: string; stderr: string }) =>
  produce(world, result.stdout + result.stderr, { line, code: result.code, stdout: result.stdout })
