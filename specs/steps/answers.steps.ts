/**
 * An answer whole, whichever way it was asked: what an MCP tool answered set beside what a command
 * prints in the scenario's directory, everything a command printed, and the lines it hands on.
 */
import { Predicate } from "effect"
import { strict as assert } from "node:assert"
import { defineSteps } from "sdp/steps"
import { ids, newWorld, output, stdout } from "./world.ts"
import { exec, workspace } from "./process.ts"

/** JSON as text, or the reason it is none: a comparison fails with what was printed, not with a parse error. */
const parsed = (text: string, what: string): unknown => {
  try {
    return JSON.parse(text)
  } catch (error) {
    return assert.fail(`${what} is not JSON (${error instanceof Error ? error.message : String(error)}):\n${text}`)
  }
}

/**
 * What a command prints on stdout when it did what it was asked. A tool has no exit code to set
 * beside the command's, so a command that exits with anything but 0 is no answer to compare with.
 */
const printed = async (command: string, directory: string) => {
  const result = await exec(command, directory)
  assert.equal(result.code, 0, `${command} exited with ${result.code}:\n${result.stdout}${result.stderr}`)
  return result.stdout
}

/** The value at a path of fields into JSON, `data.snippets`. */
const at = (json: unknown, path: string): unknown =>
  path.split(".").reduce<unknown>((value, key) => Predicate.hasProperty(value, key) ? value[key] : undefined, json)

export default defineSteps(newWorld, ({ Then }) => {
  // The last answer — a tool's, in memory — against the command run on the same files on disk: with
  // --json the same envelope, field for field; else the same text as the command's stdout.
  Then("the answer is what {string} prints", async ({ args: [command], world }) => {
    const answer = output(world)
    const text = await printed(command, await workspace(world))
    if (/(^|\s)--json(\s|$)/.test(command)) {
      assert.deepEqual(parsed(answer, "the answer"), parsed(text, `what ${command} prints`))
    } else {
      assert.equal(answer.trimEnd(), text.trimEnd())
    }
  })

  // The last answer holds, whole, the text at one field of the JSON a command prints.
  Then("the answer contains the {string} of what {string} prints", async ({ args: [path, command], world }) => {
    const answer = output(world)
    const value = at(parsed(await printed(command, await workspace(world)), `what ${command} prints`), path)
    assert.ok(typeof value === "string" && value.trim() !== "", `${command} prints no text at ${path}`)
    assert.ok(answer.includes(value.trimEnd()), `the answer does not contain the ${path} of ${command}:\n${value}\n\nanswer:\n${answer}`)
  })

  // Everything the last step printed — for a command, stdout and then stderr — and nothing else;
  // `\t` and `\n` stand for a tab and a line break, and the final line break is not compared.
  Then("the output is {string}", ({ args: [text], world }) => {
    assert.equal(output(world).trimEnd(), text.replace(/\\t/g, "\t").replace(/\\n/g, "\n"))
  })

  // What a command hands to the next one in a pipe has these lines among its own, each apart from its indent.
  Then("the output lines include {string}", ({ args: [expected], world }) => {
    const lines = new Set(stdout(world).split("\n").map((line) => line.trim()))
    const missing = ids(expected).filter((line) => !lines.has(line))
    assert.deepEqual(missing, [], `stdout:\n${stdout(world)}`)
  })
})
