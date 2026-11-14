/**
 * What sdp reports about a workspace: the diagnostics of checking it, or of the last step that
 * parsed, loaded or scanned it, and those of `sdp check --json`, as rows; and a file as another
 * editor saves it.
 */
import { Effect, Predicate } from "effect"
import { strict as assert } from "node:assert"
import { defineSteps } from "sdp/steps"
import { check } from "../../src/check/Check.ts"
import { assertRows, ids, newWorld, reload, reportRow, type Row, setFile, stdout, type World } from "./world.ts"

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

const reported = (world: World) => {
  assert.ok(world.reported, "nothing was parsed, loaded, checked or scanned yet")
  return world.reported
}

export default defineSteps(newWorld, ({ Given, Then, When }) => {
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

  // The diagnostics of the last step that parsed a file, loaded or checked the workspace, or
  // scanned code. A table names the columns it checks: rule, severity, node, at (file:line), line,
  // message and hint, the last two matched by what they contain.
  When("the workspace is checked", ({ world }) =>
    Effect.map(reload(world), (project) => {
      world.reported = check(project).map(reportRow)
    }))

  // The rules of the diagnostics, each as often as it is reported; "nothing" for none.
  Then("sdp reports {string}", ({ args: [rules], world }) => assert.deepEqual(reported(world).map((row) => row.rule).sort(), ids(rules)))

  Then("sdp reports:", ({ table, world }) => assertRows("diagnostics", reported(world), table, "exactly"))

  Then("sdp reports at least:", ({ table, world }) => assertRows("diagnostics", reported(world), table, "including"))
})
