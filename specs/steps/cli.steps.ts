/**
 * Steps that run the real `sdp` command line as a process, the way people and
 * agents use it. Files given with `a file … containing:` are written to a fresh
 * temporary directory before the first command; commands run in it, with `sdp`
 * standing for `node <this repository>/src/cli/main.ts`. Shares its world with
 * every other module (world.ts).
 */
import { Effect } from "effect"
import { strict as assert } from "node:assert"
import { execFile } from "node:child_process"
import { rmSync } from "node:fs"
import { cp, mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { newSpec } from "../../src/cli/templates.ts"
import { defineSteps } from "../../src/run/Steps.ts"
import { load, newWorld, setFile, type World } from "./world.ts"

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

/** Shell-like words: quotes group, and are removed. */
const words = (command: string) => [...command.matchAll(/'([^']*)'|"([^"]*)"|(\S+)/g)].map((m) => m[1] ?? m[2] ?? m[3]!)

const exec = (command: string, cwd: string, input = "") =>
  new Promise<{ code: number; stdout: string; stderr: string }>((done, reject) => {
    const [bin, ...args] = words(command)
    const sdp = bin === "sdp"
    const child = execFile(sdp ? process.execPath : bin!, sdp ? [cli, ...args] : args, { cwd, env }, (error, stdout, stderr) => {
      if (error && typeof error.code !== "number") reject(error)
      else done({ code: error ? Number(error.code) : 0, stdout, stderr })
    })
    child.stdin?.end(input)
  })

const record = (world: World, result: { code: number; stdout: string; stderr: string }) => {
  world.exitCode = result.code
  world.output = result.stdout + result.stderr
  world.scratch.stdout = result.stdout
}

export default defineSteps(newWorld, ({ Given, Then, When }) => {
  Given("the workspace is a copy of {string}", async ({ args: [source], world }) => {
    const directory = await directoryOf(world)
    await cp(join(repository, source), directory, {
      recursive: true,
      filter: (file) => ![".sdp", "node_modules"].includes(basename(file))
    })
    // Its step definitions import "sdp", as they would with sdp installed.
    await mkdir(join(directory, "node_modules"), { recursive: true })
    await symlink(repository, join(directory, "node_modules/sdp"), "dir")
  })

  Given("specs created from the sdp new templates:", ({ table, world }) =>
    Effect.map(load(world), (project) => {
      const [header = [], ...rows] = table ?? []
      const existing = [...project.graph.nodes.keys()]
      for (const row of rows) {
        const cell = (name: string) => row[header.indexOf(name)] ?? ""
        const spec = newSpec({
          kind: cell("kind"),
          title: cell("title"),
          maturity: cell("maturity") || "idea",
          today: "2026-11-12",
          config: project.config,
          existing
        })
        existing.push(spec.id)
        setFile(world, spec.file, spec.content)
      }
    }))

  When("I run {string}", async ({ args: [command], world }) => {
    record(world, await exec(command, await workspace(world)))
  })

  When("I run {string} in the repository", async ({ args: [command], project, world }) => {
    record(world, await exec(command, project.root))
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
    record(world, result)
    world.output = reply.result.content.map((c: { text?: string }) => c.text ?? "").join("\n")
  })

  Then("the exit code is {int}", ({ args: [code], world }) => {
    assert.equal(world.exitCode, code, `exit code ${world.exitCode}, output:\n${world.output}`)
  })

  Then("the output is valid JSON", ({ world }) => {
    const stdout = String(world.scratch.stdout ?? world.output)
    try {
      JSON.parse(stdout)
    } catch (error) {
      assert.fail(`not JSON (${error instanceof Error ? error.message : String(error)}):\n${stdout}`)
    }
  })

  Then("the file {string} contains {string}", async ({ args: [file, text], world }) => {
    const content = await readFile(join(await directoryOf(world), file), "utf8")
    assert.ok(content.includes(text.replace(/\\t/g, "\t")), `${file} does not contain ${JSON.stringify(text)}:\n${content}`)
  })
})
