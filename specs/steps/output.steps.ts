/**
 * What a step left to read: the output of a command or of a view, as text, as lines, as the
 * sections of a Markdown document or as JSON, and the files of the workspace. After a command its
 * exit code comes first (world.ts).
 */
import { Effect, Predicate } from "effect"
import { strict as assert } from "node:assert"
import { defineSteps } from "sdp/steps"
import { ids, load, newWorld, output, stdout } from "./world.ts"
import { existingFile, fileOf } from "./process.ts"
import { stateRecords } from "../../src/graph/Export.ts"

/** One step of a path into JSON: a key of an object, an index of a list, or the key in every item of a list. */
const field = (value: unknown, key: string): unknown => {
  if (Array.isArray(value)) {
    if (/^\d+$/.test(key)) return value[Number(key)]
    const fields = value.map((item) => field(item, key)).filter((item) => item !== undefined)
    return value.length > 0 && fields.length === 0 ? undefined : fields.flatMap((item) => item ?? [])
  }
  return Predicate.hasProperty(value, key) ? value[key] : undefined
}

/** Whether a key names a field: of an object, or of any item of a list. */
const has = (value: unknown, key: string): boolean =>
  Array.isArray(value) ? (/^\d+$/.test(key) ? Number(key) < value.length : value.some((item) => has(item, key))) : Predicate.hasProperty(value, key)

const json = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch (error) {
    return assert.fail(`not JSON (${error instanceof Error ? error.message : String(error)}):\n${text}`)
  }
}

/** A value as a table cell says it: text as it is, a record by its id, anything else as JSON. */
const shown = (value: unknown): string =>
  typeof value === "string" ? value : Predicate.hasProperty(value, "id") ? String(value.id) : JSON.stringify(value)

const outputLine = (output: string, text: string) => {
  const line = output.split("\n").find((l) => l.includes(text))
  assert.ok(line !== undefined, `no output line contains ${JSON.stringify(text)}:\n${output}`)
  return line
}

/** Text from a `## <heading…>` line up to the next `## ` heading. */
const section = (output: string, heading: string): string => {
  const start = output.split("\n").findIndex((line) => line.startsWith(`## ${heading}`))
  assert.ok(start >= 0, `no section "${heading}" in:\n${output}`)
  const rest = output.split("\n").slice(start + 1)
  const end = rest.findIndex((line) => line.startsWith("## "))
  return (end < 0 ? rest : rest.slice(0, end)).join("\n")
}

export default defineSteps(newWorld, ({ Then }) => {
  // `\t` and `\n` in the expected text stand for a tab and a line break.
  Then("the output contains {string}", ({ args: [text], world }) => {
    const expected = text.replace(/\\t/g, "\t").replace(/\\n/g, "\n")
    assert.ok(output(world).includes(expected), `output does not contain ${JSON.stringify(expected)}:\n${output(world)}`)
  })

  // Lines of the output that follow one another and contain the lines of the doc string, one each;
  // a blank line stands for a blank line.
  Then("the output contains:", ({ doc, world }) => {
    const wanted = (doc ?? "").split("\n").map((line) => line.trim())
    const lines = output(world).split("\n")
    const here = (start: number) => wanted.every((want, i) => want === "" ? lines[start + i]?.trim() === "" : lines[start + i]?.includes(want))
    assert.ok(lines.some((_, start) => here(start)), `no lines of the output contain these, one after the other:\n${doc}\n\noutput:\n${output(world)}`)
  })

  Then("the output contains {string} {int} time(s)", ({ args: [text, count], world }) => {
    assert.equal(output(world).split(text).length - 1, count, `occurrences of ${JSON.stringify(text)} in:\n${output(world)}`)
  })

  Then("the output does not contain {string}", ({ args: [text], world }) => {
    assert.ok(!output(world).includes(text), `output unexpectedly contains ${JSON.stringify(text)}`)
  })

  // What a command hands to the next one in a pipe: the lines of its stdout, in any order; `\t` stands for a tab.
  Then("the output lines are {string}", ({ args: [expected], world }) => {
    const lines = stdout(world).split("\n").filter((line) => line !== "")
    assert.deepEqual(lines.sort(), ids(expected.replace(/\\t/g, "\t")), `output:\n${output(world)}`)
  })

  Then("the output line with {string} contains {string}", ({ args: [anchor, text], world }) => {
    const line = outputLine(output(world), anchor)
    assert.ok(line.includes(text), `${JSON.stringify(line)} does not contain ${JSON.stringify(text)}`)
  })

  Then("the output section {string} contains {string}", ({ args: [heading, text], world }) => {
    assert.ok(section(output(world), heading).includes(text), `section "${heading}" does not contain ${JSON.stringify(text)}:\n${output(world)}`)
  })

  Then("the output section {string} does not contain {string}", ({ args: [heading, text], world }) => {
    assert.ok(!section(output(world), heading).includes(text), `section "${heading}" contains ${JSON.stringify(text)}:\n${output(world)}`)
  })

  // Each row is a path into the JSON on stdout and the value there: `data.summary.passed | 1`. A
  // path reads through a list into each of its items; a list is its items in any order, an item
  // with an id that id, and "nothing" an empty list.
  Then("the JSON output has:", ({ table, world }) => {
    const text = stdout(world)
    const read = json(text)
    for (const [path = "", expected = ""] of table ?? []) {
      const value = path.split(".").reduce(field, read)
      assert.notEqual(value, undefined, `no field ${path} in:\n${text}`)
      if (Array.isArray(value)) assert.deepEqual(value.map(shown).sort(), ids(expected), path)
      else assert.equal(shown(value), expected, path)
    }
  })

  // Each row is a path whose last key names no field, where the path before it names one: read
  // through a list, no item has the key.
  Then("the JSON output has none of these fields:", ({ table, world }) => {
    const text = stdout(world)
    const read = json(text)
    for (const [path = ""] of table ?? []) {
      const keys = path.split(".")
      const parent = keys.slice(0, -1).reduce(field, read)
      assert.notEqual(parent, undefined, `no field ${keys.slice(0, -1).join(".")} in:\n${text}`)
      assert.ok(!has(parent, keys.at(-1)!), `${path} is a field:\n${text}`)
    }
  })

  Then("the output has one line per node and edge", ({ world }) =>
    Effect.map(load(world), (project) => {
      const lines = output(world).trimEnd().split("\n")
      assert.equal(lines.length, stateRecords(project.graph, project.config.vocabulary).length)
    }))

  Then("the file {string} is:", async ({ args: [file], doc, world }) => {
    assert.equal((await existingFile(world, file)).trimEnd(), doc)
  })

  Then("the file {string} contains {string}", async ({ args: [file, text], world }) => {
    const content = await existingFile(world, file)
    assert.ok(content.includes(text.replace(/\\t/g, "\t")), `${file} does not contain ${JSON.stringify(text)}:\n${content}`)
  })

  Then("the file {string} does not exist", async ({ args: [file], world }) => {
    assert.equal(await fileOf(world, file), undefined, `${file} exists`)
  })
})
