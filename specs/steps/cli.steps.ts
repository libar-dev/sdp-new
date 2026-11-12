/**
 * Steps that run the real `sdp` command line as a process, the way people and
 * agents use it. Files given with `a file … containing:` are written to a fresh
 * temporary directory before the first command; commands run in it, with `sdp`
 * standing for `node <this repository>/src/cli/main.ts`, `$PWD` for that
 * directory and leading `NAME=value` words setting environment variables, as
 * in a shell. Shares its world with every other module (world.ts).
 */
import * as NodeServices from "@effect/platform-node/NodeServices"
import { Effect, Predicate, Result } from "effect"
import { McpProtocol, McpTest } from "effect/ai"
import { strict as assert } from "node:assert"
import { execFile } from "node:child_process"
import { rmSync } from "node:fs"
import { access, cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { describe } from "../../src/app/Errors.ts"
import { run } from "../../src/app/Running.ts"
import { newSpec } from "../../src/app/Templates.ts"
import * as Text from "../../src/app/Text.ts"
import { registrations } from "../../src/mcp/Server.ts"
import { defineSteps, Pending } from "sdp/steps"
import { exitCode, ids, load, newWorld, output, produce, setFile, settled, stdout, type World } from "./world.ts"

const repository = resolve(fileURLToPath(new URL("../..", import.meta.url)))
const cli = join(repository, "src/cli/main.ts")
// Every command is a fresh Node process; a shared compile cache keeps start-up short.
const env = { ...process.env, NO_COLOR: "1", NODE_COMPILE_CACHE: join(tmpdir(), "sdp-compile-cache") }

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

const directoryOf = async (world: World) => world.directory ??= await scenarioDirectory()

/** The scenario's directory with every given file written to it (again, if it changed since). */
const workspace = async (world: World) => {
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

/** One step of a path into JSON: a key of an object, an index of a list, or the key in every item of a list. */
const field = (value: unknown, key: string): unknown => {
  if (Array.isArray(value)) return /^\d+$/.test(key) ? value[Number(key)] : value.flatMap((item) => field(item, key) ?? [])
  return Predicate.hasProperty(value, key) ? value[key] : undefined
}

/** A value as a table cell says it: text as it is, a record by its id, anything else as JSON. */
const shown = (value: unknown): string =>
  typeof value === "string" ? value : Predicate.hasProperty(value, "id") ? String(value.id) : JSON.stringify(value)

/** Shell-like words: quotes group, and are removed. */
const words = (command: string) => [...command.matchAll(/'([^']*)'|"([^"]*)"|(\S+)/g)].map((m) => m[1] ?? m[2] ?? m[3]!)

const exec = (command: string, cwd: string, input = "") =>
  new Promise<{ code: number; stdout: string; stderr: string }>((done, reject) => {
    const all = words(command).map((word) => word.replaceAll("$PWD", cwd))
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

const record = (world: World, line: string, result: { code: number; stdout: string; stderr: string }) =>
  produce(world, result.stdout + result.stderr, { line, code: result.code, stdout: result.stdout })

export default defineSteps(newWorld, ({ Given, Then, When }) => {
  Given("the workspace is a copy of {string}", async ({ args: [source], world }) => {
    const directory = await directoryOf(world)
    // Its step definitions import "sdp/steps" with nothing installed: sdp resolves that import itself.
    await cp(join(repository, source), directory, {
      recursive: true,
      filter: (file) => ![".sdp", "node_modules"].includes(basename(file))
    })
  })

  Given("specs created from the sdp new templates:", ({ table, world }) =>
    Effect.map(load(world), (project) => {
      const [header = [], ...rows] = table ?? []
      const existing = project.graph.nodes().map((n) => n.id)
      for (const row of rows) {
        const cell = (name: string) => row[header.indexOf(name)] ?? ""
        const created = newSpec({
          kind: cell("kind"),
          title: cell("title"),
          maturity: cell("maturity") || undefined,
          today: "2026-11-12",
          config: project.config,
          existing
        })
        if (Result.isFailure(created)) assert.fail(created.failure)
        const spec = created.success
        existing.push(spec.id)
        setFile(world, spec.file, spec.content)
      }
    }))

  When("I run {string}", async ({ args: [command], world }) => {
    record(world, command, await exec(command, await workspace(world)))
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

  When("I run {string} in the repository", async ({ args: [command], project, world }) => {
    record(world, command, await exec(command, project.root))
  })

  When("I run {string} in {string}", async ({ args: [command, subdirectory], world }) => {
    const directory = await workspace(world)
    await mkdir(join(directory, subdirectory), { recursive: true })
    record(world, command, await exec(command, join(directory, subdirectory)))
  })

  When("an MCP client of {string} calls {string} with:", async ({ args: [command, tool], doc, world }) => {
    const messages = [
      {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "sdp-specs", version: "1" } }
      },
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: tool, arguments: JSON.parse(doc ?? "{}") } }
    ]
    const result = await exec(command, await workspace(world), messages.map((m) => `${JSON.stringify(m)}\n`).join(""))
    const replies = result.stdout.split("\n").filter(Boolean).map((line) => JSON.parse(line))
    const reply = replies.find((m) => m.id === 2)
    assert.ok(reply?.result, `no reply to tools/call:\n${result.stdout}${result.stderr}`)
    const text: string = reply.result.content.map((c: { text?: string }) => c.text ?? "").join("\n")
    produce(world, text, { line: command, code: result.code, stdout: text })
  })

  // A program that runs a workspace more than once, as this process: it keeps the modules it imported.
  When("this process runs the workspace through the API", ({ world }) =>
    Effect.gen(function*() {
      const directory = yield* Effect.promise(() => workspace(world))
      const outcome = yield* Effect.result(run(directory))
      produce(world, Result.isSuccess(outcome) ? Text.runSummary(outcome.success.data) : describe(outcome.failure))
    }).pipe(Effect.provide(NodeServices.layer)))

  // A server in this very process, on the files on disk: like a long-running `sdp mcp`, every call
  // shares one module cache, so it shows whether edits to step files are seen.
  When("an agent calls the MCP tool {string} on the workspace directory with:", ({ args: [tool], doc, world }) =>
    Effect.gen(function*() {
      const directory = yield* Effect.promise(() => workspace(world))
      const client = yield* McpTest.makeClient(registrations(directory), { protocols: [McpProtocol.v2025_11_25] })
      const result = yield* client.callTool({ name: tool, arguments: JSON.parse(doc ?? "{}") })
      produce(world, result.content.map((c) => (c.type === "text" ? c.text : "")).join("\n"))
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)))

  Then("the exit code is {int}", ({ args: [code], world }) => {
    const actual = exitCode(world)
    assert.equal(actual, code, `exit code ${actual}, output:\n${output(world)}`)
  })

  // What a command hands to the next one in a pipe: the lines of its stdout, in any order; `\t` stands for a tab.
  Then("the output lines are {string}", ({ args: [expected], world }) => {
    const lines = stdout(world).split("\n").filter((line) => line !== "")
    assert.deepEqual(lines.sort(), ids(expected.replace(/\\t/g, "\t")), `output:\n${output(world)}`)
  })

  // Each row is a path into the JSON on stdout and the value there: `data.summary.passed | 1`. A
  // path reads through a list into each of its items; a list is its items in any order, an item
  // with an id that id, and "nothing" an empty list.
  Then("the JSON output has:", ({ table, world }) => {
    const text = stdout(world)
    const json: unknown = (() => {
      try {
        return JSON.parse(text)
      } catch (error) {
        return assert.fail(`not JSON (${error instanceof Error ? error.message : String(error)}):\n${text}`)
      }
    })()
    for (const [path = "", expected = ""] of table ?? []) {
      const value = path.split(".").reduce(field, json)
      assert.notEqual(value, undefined, `no field ${path} in:\n${text}`)
      if (Array.isArray(value)) assert.deepEqual(value.map(shown).sort(), ids(expected), path)
      else assert.equal(shown(value), expected, path)
    }
  })

  Then("the file {string} does not exist", async ({ args: [file], world }) => {
    settled(world)
    const exists = await access(join(await directoryOf(world), file)).then(() => true, () => false)
    assert.ok(!exists, `${file} exists`)
  })

  Then("the file {string} is:", async ({ args: [file], doc, world }) => {
    settled(world)
    assert.equal((await readFile(join(await directoryOf(world), file), "utf8")).trimEnd(), doc)
  })

  Then("the file {string} contains {string}", async ({ args: [file, text], world }) => {
    settled(world)
    const content = await readFile(join(await directoryOf(world), file), "utf8")
    assert.ok(content.includes(text.replace(/\\t/g, "\t")), `${file} does not contain ${JSON.stringify(text)}:\n${content}`)
  })

  Then("the file {string} does not contain {string}", async ({ args: [file, text], world }) => {
    settled(world)
    const content = await readFile(join(await directoryOf(world), file), "utf8")
    assert.ok(!content.includes(text), `${file} contains ${JSON.stringify(text)}:\n${content}`)
  })
})
