/**
 * The configuration a workspace is given and the files `sdp init` writes: the lines that refuse a
 * configuration, what the configuration init writes reads as, and an sdp whose installation lost a
 * file of its own.
 */
import { Effect } from "effect"
import { strict as assert } from "node:assert"
import { copyFile, cp, mkdtemp, symlink } from "node:fs/promises"
import { rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { isDeepStrictEqual } from "node:util"
import { defineSteps } from "sdp/steps"
import { ConfigFile, resolveConfig } from "../../src/model/Config.ts"
import { parseConfig } from "../../src/workspace/Workspace.ts"
import { assertRows, newWorld, output, type Row } from "./world.ts"
import { execProgram, existingFile, record, repository, workspace } from "./process.ts"

/** A key of the configuration commented out, as `# key: value`, its depth in the spaces after `#`. */
const keyLine = /^#( +)([A-Za-z][\w-]*):(.*)$/

/** The key lines of a configuration file, uncommented: what it says once every key is written. */
const uncommented = (content: string): string =>
  content.split("\n").flatMap((line) => {
    const key = keyLine.exec(line)
    return key ? [`${key[1]!.slice(1)}${key[2]}:${key[3]}`] : []
  }).join("\n")

/** A line of the output that refuses a configuration: its file, the problem, and the key it is at. */
const problemLine = /^(?<file>.+?): invalid configuration: (?<message>.*?)(?: at (?<key>(?:\[[^\]]*\])+))?$/

/** The top-level keys a configuration file has commented out. */
const listedKeys = (content: string) =>
  content.split("\n").flatMap((line) => {
    const key = keyLine.exec(line)
    return key && key[1] === " " ? [key[2]!] : []
  })

/**
 * sdp as it would be installed without its skill: its sources, package.json and dependencies, and
 * no `.claude/skills/sdp/SKILL.md`. Copied, not linked, so that its modules know themselves at the
 * copy; made once per process, and removed when the process exits.
 */
let withoutSkill: Promise<string> | undefined
const installedWithoutSkill = () =>
  withoutSkill ??= (async () => {
    const directory = await mkdtemp(join(tmpdir(), "sdp-without-skill-"))
    process.once("exit", () => rmSync(directory, { recursive: true, force: true }))
    await cp(join(repository, "src"), join(directory, "src"), { recursive: true })
    await copyFile(join(repository, "package.json"), join(directory, "package.json"))
    await symlink(join(repository, "node_modules"), join(directory, "node_modules"), "dir")
    return directory
  })()

/** Shell-like words, as `I run` reads them: quotes group, and are removed. */
const words = (command: string) => [...command.matchAll(/'([^']*)'|"([^"]*)"|(\S+)/g)].map((m) => m[1] ?? m[2] ?? m[3]!)

export default defineSteps(newWorld, ({ Then, When }) => {
  When("I run {string} with an sdp installed without its skill", async ({ args: [command], signal, world }) => {
    const [bin, ...args] = words(command)
    assert.equal(bin, "sdp", `${command} runs no sdp`)
    const cli = join(await installedWithoutSkill(), "src/cli/main.ts")
    record(world, command, await execProgram(process.execPath, [cli, ...args], await workspace(world), signal))
  })

  // Every line the last command printed refuses a configuration, one problem each: a row of the table
  // is a line, by its file, the key it is at and its message (contained), and no line is left over.
  Then("the output is one line per configuration problem:", ({ table, world }) => {
    const rows = output(world).trimEnd().split("\n").map((line): Row => {
      const { file = "", key = "", message = line } = problemLine.exec(line)?.groups ?? {}
      return { file, key, message }
    })
    assertRows("configuration problems", rows, table, "exactly")
  })

  // Everything the last command printed, stdout and stderr, is one line: no stack trace, no second thought.
  Then("the output is one line containing {string}", ({ args: [text], world }) => {
    const lines = output(world).trimEnd().split("\n")
    assert.equal(lines.length, 1, `the output is ${lines.length} lines:\n${output(world)}`)
    assert.ok(lines[0]!.includes(text), `${JSON.stringify(lines[0])} does not contain ${JSON.stringify(text)}`)
  })

  // The keys a file has commented out at its top level, `# key: …`, against the keys sdp reads.
  Then("the keys commented out in {string} are every key of the configuration", async ({ args: [file], world }) => {
    const listed = listedKeys(await existingFile(world, file))
    assert.deepEqual([...listed].sort(), Object.keys(ConfigFile.fields).sort(), `the keys ${file} lists`)
  })

  // Every key line uncommented, as sdp reads that file, is the configuration of a workspace that has none.
  Then("{string} with every key uncommented reads as no configuration at all", ({ args: [file], world }) =>
    Effect.gen(function*() {
      const content = uncommented(yield* Effect.promise(() => existingFile(world, file)))
      const read = yield* parseConfig({ path: file, content })
      const none = resolveConfig(undefined)
      const differ = (Object.keys(none) as Array<keyof typeof none>).filter((key) => !isDeepStrictEqual(read[key], none[key]))
      assert.deepEqual(
        differ.map((key) => `${key}: ${JSON.stringify(read[key])}`),
        [],
        `with every key uncommented, ${file} reads otherwise than no configuration; with none, these are ${
          JSON.stringify(Object.fromEntries(differ.map((key) => [key, none[key]])))
        }`
      )
    }))
})
