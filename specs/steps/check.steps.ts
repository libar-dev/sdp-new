/**
 * What `sdp check` is given and what it answers, where the other subjects' steps do not say it: a
 * file as another editor saves it, and the diagnostics of `sdp check --json` as rows.
 */
import { Predicate } from "effect"
import { strict as assert } from "node:assert"
import { defineSteps } from "sdp/steps"
import { assertRows, newWorld, type Row, setFile, stdout } from "./world.ts"

/** A diagnostic of `sdp check --json` as a row, with the columns `sdp reports:` has: `at` is empty where it names no file. */
const diagnosticRow = (record: unknown): Row => {
  const text = (key: string) => Predicate.hasProperty(record, key) && record[key] !== null && record[key] !== undefined ? String(record[key]) : ""
  return {
    rule: text("rule"),
    severity: text("severity"),
    node: text("node"),
    at: text("file") === "" ? "" : `${text("file")}:${text("line")}`,
    line: text("line"),
    message: text("message"),
    hint: text("hint")
  }
}

export default defineSteps(newWorld, ({ Given, Then }) => {
  // A file as an editor on Windows saves it: every line ends with a carriage return and a line feed.
  Given("the file {string} is saved with CRLF line endings", ({ args: [path], world }) => {
    const content = world.files.get(path)
    assert.ok(content !== undefined, `no file ${path} was given`)
    setFile(world, path, content.replace(/\r?\n/g, "\r\n"))
  })

  // The diagnostics of the answer on stdout, each a row of the table at least once; the table names
  // the columns it checks, as `sdp reports at least:` does, and an empty `at` is no file.
  Then("the JSON output reports at least:", ({ table, world }) => {
    const text = stdout(world)
    const answer: unknown = (() => {
      try {
        return JSON.parse(text)
      } catch (error) {
        return assert.fail(`not JSON (${error instanceof Error ? error.message : String(error)}):\n${text}`)
      }
    })()
    const data = Predicate.hasProperty(answer, "data") ? answer.data : undefined
    assert.ok(Array.isArray(data), `no list of diagnostics under data:\n${text}`)
    assertRows("diagnostics", data.map(diagnosticRow), table, "including")
  })
})
