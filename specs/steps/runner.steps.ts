/**
 * What a run meets besides its own steps: a program that runs the specs through the API, a person
 * who presses Ctrl-C, another run that holds the lock on the results, another version of sdp or of
 * Node, and packages a workspace has installed. The files a scenario is given are written before
 * the first process starts (process.ts).
 */
import { existsSync } from "node:fs"
import { mkdir, symlink } from "node:fs/promises"
import { constants } from "node:os"
import { dirname, join } from "node:path"
import { pathToFileURL } from "node:url"
import { strict as assert } from "node:assert"
import { defineSteps } from "sdp/steps"
import { cli, directoryOf, execProgram, existingFile, record, repository, spawnInGroup, workspace } from "./process.ts"
import { newWorld, type World } from "./world.ts"

/** The results file of a workspace that does not configure one, and the lock a run takes on it. */
const results = ".sdp/results.json"
const lock = `${results}.lock`

/** Shell-like words: quotes group, and are removed. */
const words = (command: string) => [...command.matchAll(/'([^']*)'|"([^"]*)"|(\S+)/g)].map((m) => m[1] ?? m[2] ?? m[3]!)

/** Code Node runs before sdp, given as a module: what it changes is what sdp sees. */
const preload = (code: string) => `--import=data:text/javascript,${encodeURIComponent(code)}`

/** The version of sdp as sdp reads it, from its package.json: as another version of sdp would read it. */
const asSdp = (version: string) =>
  preload(`
    import { registerHooks } from "node:module"
    const manifest = ${JSON.stringify(pathToFileURL(join(repository, "package.json")).href)}
    registerHooks({
      load: (url, context, next) => {
        const loaded = next(url, context)
        if (url !== manifest) return loaded
        return { ...loaded, source: JSON.stringify({ ...JSON.parse(String(loaded.source)), version: ${JSON.stringify(version)} }) }
      }
    })
  `)

/** Node's version as sdp reads it: as another version of Node would give it. */
const onNode = (major: number) => preload(`Object.defineProperty(process.versions, "node", { value: "${major}.0.0" })`)

/** Runs an sdp command in the scenario's directory, with Node's options before it. */
const runSdp = async (world: World, command: string, options: ReadonlyArray<string>, signal: AbortSignal) => {
  const cwd = await workspace(world)
  const [bin, ...args] = words(command)
  assert.equal(bin, "sdp", "only sdp is run this way")
  record(world, command, await execProgram(process.execPath, [...options, cli, ...args], cwd, signal))
}

export default defineSteps(newWorld, ({ Given, Then, When }) => {
  // The package sdp itself runs with, linked into the workspace's node_modules as an install would put it there.
  Given("the package {string} is installed in the workspace", async ({ args: [name], world }) => {
    const installed = join(await directoryOf(world), "node_modules", name)
    await mkdir(dirname(installed), { recursive: true })
    await symlink(join(repository, "node_modules", name), installed, "dir")
  })

  // A program in a Node process of its own, in the workspace's directory, written as an ES module.
  // `$SDP` stands for this sdp's programmatic API: what `import … from "sdp"` loads where it is installed.
  When("a program runs:", async ({ doc, signal, world }) => {
    const cwd = await workspace(world)
    const source = (doc ?? "").replaceAll("$SDP", pathToFileURL(join(repository, "src/index.ts")).href)
    record(world, "the program", await execProgram(process.execPath, ["--input-type=module", "-e", source], cwd, signal))
  })

  // What another version of sdp, or of Node, would do: the version it reads is that one's.
  When("I run {string} as sdp {string}", ({ args: [command, version], signal, world }) => runSdp(world, command, [asSdp(version)], signal))
  When("I run {string} on Node {int}", ({ args: [command, major], signal, world }) => runSdp(world, command, [onNode(major)], signal))

  // Ctrl-C once the file exists, which a step of the run writes: the run is interrupted while that step runs.
  When("I run {string} and interrupt it once {string} exists", async ({ args: [command, file], signal, world }) => {
    const cwd = await workspace(world)
    const [bin, ...args] = words(command)
    assert.equal(bin, "sdp", "only sdp is run and interrupted")
    const child = spawnInGroup(process.execPath, [cli, ...args], cwd, signal)
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (chunk) => stdout += String(chunk))
    child.stderr.on("data", (chunk) => stderr += String(chunk))
    const watching = setInterval(() => {
      if (!existsSync(join(cwd, file))) return
      clearInterval(watching)
      child.kill("SIGINT")
    }, 20)
    const [code, killedBy] = await new Promise<[number | null, NodeJS.Signals | null]>((done, reject) => {
      child.on("error", reject)
      child.on("close", (exitCode, exitSignal) => done([exitCode, exitSignal]))
    }).finally(() => clearInterval(watching))
    // A process a signal ended exits as a shell reports it: 128 and the signal's number.
    record(world, `${command}, interrupted`, { code: code ?? 128 + (killedBy ? constants.signals[killedBy] : 0), stdout, stderr })
  })

  // The lock file as another run's commit leaves it while it records, removed once the time is up:
  // that time starts when a run first looks for the lock to take it, so however long the run takes
  // to get there, it finds the lock held.
  Given("another run holds the lock on the results for {int} ms", ({ args: [ms], world }) => {
    const holding = { tried: false, released: false, writtenWhileHeld: false }
    world.resultsLock = holding
    const { files } = world
    files.set(lock, "")
    const has = files.has.bind(files)
    files.has = (file: string) => {
      if (file === lock && !holding.tried) {
        holding.tried = true
        setTimeout(() => {
          holding.writtenWhileHeld = has(results)
          files.delete(lock)
          holding.released = true
        }, ms)
      }
      return has(file)
    }
  })

  Then("the results were recorded only after the lock was released", ({ world }) => {
    const holding = world.resultsLock
    assert.ok(holding, "no other run held the lock")
    assert.ok(holding.tried, "no run tried to take the lock")
    assert.ok(holding.released, "the other run still holds the lock")
    assert.ok(!holding.writtenWhileHeld, `${results} was written while another run held the lock`)
    assert.ok(world.files.has(results), `${results} was not written`)
  })

  Then("the file {string} does not contain {string}", async ({ args: [file, text], world }) => {
    const content = await existingFile(world, file)
    assert.ok(!content.includes(text), `${file} contains ${JSON.stringify(text)}:\n${content}`)
  })
})
