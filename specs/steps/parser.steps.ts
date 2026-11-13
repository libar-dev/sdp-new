/**
 * The spec parser, called on one file of the workspace. What it reads is asserted as tables whose
 * header names the columns checked.
 */
import { Effect } from "effect"
import { strict as assert } from "node:assert"
import { defineSteps } from "sdp/steps"
import { layerMemoryWorkspace, memoryRoot } from "../../src/workspace/MemoryFileSystem.ts"
import type { Scenario, Tagged } from "../../src/parse/Gherkin.ts"
import { type ParsedFile, parseFeatureSpec, type Spec } from "../../src/parse/Spec.ts"
import { loadConfig } from "../../src/workspace/Workspace.ts"
import { assertRows, attrsText, newWorld, reportRow, type Row, show, type World } from "./world.ts"

const parse = (world: World, path: string) =>
  Effect.map(loadConfig(memoryRoot).pipe(Effect.provide(layerMemoryWorkspace(world.files))), (config) => {
    const content = world.files.get(path)
    assert.ok(content !== undefined, `no file ${path}`)
    const result = parseFeatureSpec(path, content, config)
    world.parsedFile = result
    world.reported = result.diagnostics.map(reportRow)
  })

const parsed = (world: World): ParsedFile => {
  const result = world.parsedFile
  assert.ok(result, "parse a file first: When \"<path>\" is parsed")
  return result
}

const spec = (world: World): Spec => {
  const { diagnostics, spec } = parsed(world)
  assert.ok(spec, `the file is not a spec${diagnostics.length ? `: ${diagnostics.map((d) => d.message).join("; ")}` : ""}`)
  return spec
}

const scenario = (spec: Spec, id: string): Scenario => {
  const found = spec.scenarios.find((s) => s.id === id)
  assert.ok(found, `no scenario ${id}; scenarios are: ${spec.scenarios.map((s) => s.id).join(", ") || "none"}`)
  return found
}

/** What the tags of a Rule or a Scenario say: its Cucumber tags, its facts and its links (`-rel-> ID` each). */
const tagColumns = (element: Tagged): Row => ({
  tags: element.tags.join(", "),
  attributes: attrsText(element.attrs),
  links: element.links.map((link) => `-${link.rel}-> ${link.to}`).join(", ")
})

export default defineSteps(newWorld, ({ Then, When }) => {
  When("{string} is parsed", ({ args: [path], world }) => parse(world, path))

  Then("the file is not a spec", ({ world }) => assert.equal(parsed(world).spec, undefined, "the file was parsed as a spec"))

  Then("the parsed spec has {word} {string}", ({ args: [key, expected], world }) => {
    const s = spec(world)
    const fields: Record<string, unknown> = { id: s.id, kind: s.kind, title: s.title, summary: s.summary }
    assert.equal(show(key in fields ? fields[key] : s.attrs[key]), expected, `${key} of the parsed spec`)
  })

  // Each attribute's value as a reader sees it, and as JSON, which shows its type.
  Then("the parsed spec has these attributes:", ({ table, world }) =>
    assertRows(
      "attributes",
      Object.entries(spec(world).attrs).map(([key, value]) => ({ key, value: show(value), json: JSON.stringify(value) })),
      table,
      "exactly"
    ))

  Then("the parsed spec has links:", ({ table, world }) =>
    assertRows("links", spec(world).links.map((link) => ({ rel: link.rel, to: link.to, line: String(link.line) })), table, "in order"))

  // A scenario's rule by its name; its Cucumber tags, attributes and links are its own.
  Then("the parsed spec has scenarios:", ({ table, world }) => {
    const { rules, scenarios } = spec(world)
    assertRows(
      "scenarios",
      scenarios.map((s) => ({
        id: s.id,
        name: s.name,
        line: String(s.line),
        description: s.description ?? "",
        rule: rules.find((rule) => rule.id === s.rule)?.name ?? "",
        ...tagColumns(s)
      })),
      table,
      "in order"
    )
  })

  Then("the parsed spec has rules:", ({ table, world }) =>
    assertRows(
      "rules",
      spec(world).rules.map((rule) => ({
        id: rule.id,
        name: rule.name,
        line: String(rule.line),
        description: rule.description ?? "",
        ...tagColumns(rule)
      })),
      table,
      "in order"
    ))

  Then("the executable steps of {string} are:", ({ args: [id], table, world }) =>
    assertRows(
      `executable steps of ${id}`,
      (scenario(spec(world), id).pickles[0]?.steps ?? []).map((step) => ({
        keyword: step.keyword,
        text: step.text,
        line: String(step.line),
        "doc string": step.docString ?? ""
      })),
      table,
      "in order"
    ))

  Then("the executable tags of {string} are {string}", ({ args: [id, expected], world }) =>
    assert.equal(scenario(spec(world), id).pickles[0]?.tags.join(", "), expected))
})
