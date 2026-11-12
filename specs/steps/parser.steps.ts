/**
 * The spec parser and the annotation scanner, each called on one file of the workspace. What they
 * read is asserted as tables whose header names the columns checked.
 */
import { Effect } from "effect"
import { strict as assert } from "node:assert"
import { defineSteps } from "sdp/steps"
import { defaultVocabulary } from "../../src/model/Vocabulary.ts"
import { layerMemoryWorkspace, memoryRoot } from "../../src/workspace/MemoryFileSystem.ts"
import { type Annotation, scanCode } from "../../src/parse/Annotations.ts"
import type { Annotations, Scenario } from "../../src/parse/Gherkin.ts"
import { type ParsedFile, parseFeatureSpec, type Spec } from "../../src/parse/Spec.ts"
import { loadConfig } from "../../src/workspace/Workspace.ts"
import { assertRows, attrsText, newWorld, reportRow, type Row, setFile, show, type World } from "./world.ts"

const parse = (world: World, path: string) =>
  Effect.map(loadConfig(memoryRoot).pipe(Effect.provide(layerMemoryWorkspace(world.files))), (config) => {
    const content = world.files.get(path)
    assert.ok(content !== undefined, `no file ${path}`)
    const result = parseFeatureSpec(path, content, config)
    world.scratch.parsed = result
    world.reported = result.diagnostics.map(reportRow)
  })

const parsed = (world: World): ParsedFile => {
  const result = world.scratch.parsed as ParsedFile | undefined
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

const hashes = (world: World, id: string): readonly [string, string] => {
  const previous = (world.scratch.previous as ParsedFile | undefined)?.spec
  assert.ok(previous, "parse the file, then parse it again after an edit")
  return [scenario(previous, id).hash, scenario(spec(world), id).hash]
}

const annotations = (world: World): ReadonlyArray<Annotation> => {
  const found = world.scratch.annotations as ReadonlyArray<Annotation> | undefined
  assert.ok(found, "scan a file first: When \"<path>\" is scanned for annotations")
  return found
}

/** What the tags of a Rule or a Scenario say: its Cucumber tags, its facts and its links (`-rel-> ID` each). */
const annotationColumns = (element: Annotations): Row => ({
  tags: element.tags.join(", "),
  attributes: attrsText(element.attrs),
  links: element.links.map((link) => `-${link.rel}-> ${link.to}`).join(", ")
})

const annotationRow = (a: Annotation): Row => ({
  line: String(a.line),
  relation: a.rel,
  targets: a.targets.join(", "),
  "binds to": a.symbol ?? "the file",
  "declared at": String(a.symbolLine ?? ""),
  "described as": a.doc ?? "",
  attributes: attrsText(a.attrs)
})

export default defineSteps(newWorld, ({ Given, Then, When }) => {
  When("{string} is parsed", ({ args: [path], world }) => parse(world, path))

  When("{string} is parsed with CRLF line endings", ({ args: [path], world }) => {
    const content = world.files.get(path)
    assert.ok(content !== undefined, `no file ${path}`)
    setFile(world, path, content.replaceAll("\n", "\r\n"))
    return parse(world, path)
  })

  When("{string} is parsed again after replacing {string} with {string}", ({ args: [path, text, replacement], world }) => {
    const content = world.files.get(path) ?? ""
    assert.ok(content.includes(text), `${path} does not contain ${JSON.stringify(text)}`)
    world.scratch.previous = world.scratch.parsed
    setFile(world, path, content.replace(text, replacement))
    return parse(world, path)
  })

  Then("the file is not a spec", ({ world }) => assert.equal(parsed(world).spec, undefined, "the file was parsed as a spec"))

  Then("the parsed spec has {word} {string}", ({ args: [key, expected], world }) => {
    const s = spec(world)
    const fields: Record<string, unknown> = { id: s.id, kind: s.kind, title: s.title, summary: s.summary }
    assert.equal(show(key in fields ? fields[key] : s.attrs[key]), expected, `${key} of the parsed spec`)
  })

  // Each attribute's value as a reader sees it, and as JSON, which shows its type.
  Then("the parsed spec has exactly these attributes:", ({ table, world }) =>
    assertRows(
      "attributes",
      Object.entries(spec(world).attrs).map(([key, value]) => ({ key, value: show(value), json: JSON.stringify(value) })),
      table,
      "exactly"
    ))

  Then("the parsed spec has attribute lines:", ({ table, world }) =>
    assertRows("attribute lines", Object.entries(spec(world).attrLines).map(([key, line]) => ({ key, line: String(line) })), table, "exactly"))

  Then("the parsed spec has links:", ({ table, world }) =>
    assertRows("links", spec(world).links.map((link) => ({ rel: link.rel, to: link.to, line: String(link.line) })), table, "in order"))

  Then("the parsed spec has open questions:", ({ table, world }) =>
    assertRows("open questions", spec(world).openQuestions.map((q) => ({ question: q.text, line: String(q.line) })), table, "in order"))

  // A scenario's rule by its name; its tags, attributes and links are its own annotations.
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
        ...annotationColumns(s)
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
        ...annotationColumns(rule)
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

  Then("the hash of {string} changes", ({ args: [id], world }) => {
    const [before, after] = hashes(world, id)
    assert.notEqual(after, before, `the hash of ${id} did not change`)
  })

  Then("the hash of {string} stays the same", ({ args: [id], world }) => {
    const [before, after] = hashes(world, id)
    assert.equal(after, before, `the hash of ${id} changed`)
  })

  When("{string} is scanned for annotations", ({ args: [path], world }) => {
    const content = world.files.get(path)
    assert.ok(content !== undefined, `no file ${path}`)
    const scan = scanCode(path, content, defaultVocabulary.relations.anchor)
    world.scratch.annotations = scan.annotations
    world.reported = scan.unreadable.map((problem) => ({ line: String(problem.line), message: problem.message }))
  })

  Then("the annotations are:", ({ table, world }) =>
    assertRows("annotations", annotations(world).map(annotationRow), table, "in order"))
})
