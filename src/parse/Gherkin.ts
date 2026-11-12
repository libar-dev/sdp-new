/**
 * Behaviour in specs is plain Gherkin, written in fenced ```gherkin blocks
 * inside Markdown (or in classic `.feature` files). All blocks of one spec form
 * one virtual Feature, parsed and compiled by the official Cucumber parser, with
 * every line mapped back to the Markdown file.
 */
import { annotate } from "sdp/annotations"
import { AstBuilder, compile, GherkinClassicTokenMatcher, Parser } from "@cucumber/gherkin"
import type * as Messages from "@cucumber/messages"
import { IdGenerator } from "@cucumber/messages"
import { createHash } from "node:crypto"
import type { Fence } from "./Markdown.ts"

annotate(import.meta, { is: "ARCH-spec-parser" })

export interface ScenarioStep {
  readonly keyword: string
  readonly text: string
  readonly line: number
}

export interface PickleStep {
  readonly keyword: string
  readonly text: string
  readonly line: number
  /** What the step does, with `And`/`But` resolved to the keyword before them; `*` steps are `Unknown`. */
  readonly type: "Context" | "Action" | "Outcome" | "Unknown"
  readonly docString?: string | undefined
  readonly dataTable?: ReadonlyArray<ReadonlyArray<string>> | undefined
}

/** One executable instance of a scenario (an outline yields one per example row). */
export interface Pickle {
  readonly name: string
  readonly tags: ReadonlyArray<string>
  readonly steps: ReadonlyArray<PickleStep>
  /** Line of the example row this pickle came from, for outlines. */
  readonly exampleLine?: number | undefined
}

export interface Scenario {
  readonly id: string
  readonly specId: string
  readonly name: string
  readonly keyword: string
  readonly tags: ReadonlyArray<string>
  readonly line: number
  readonly rule?: string | undefined
  readonly steps: ReadonlyArray<ScenarioStep>
  readonly pickles: ReadonlyArray<Pickle>
  /** Stable hash of the executable content; results recorded for another hash are stale. */
  readonly hash: string
  /** True when the scenario states an observable outcome (has a `Then`). */
  readonly hasOutcome: boolean
}

export interface GherkinError {
  readonly message: string
  readonly line: number
}

export interface GherkinResult {
  readonly scenarios: ReadonlyArray<Scenario>
  readonly errors: ReadonlyArray<GherkinError>
  /** Description text of an explicit `Feature:` (used for `.feature` files). */
  readonly description: string | undefined
  readonly featureName: string | undefined
  readonly featureTags: ReadonlyArray<string>
}

export const gherkinLangs: ReadonlySet<string> = new Set(["gherkin", "feature", "cucumber"])

const featureLine = /^\s*Feature:/

/** Parse all gherkin fences of a Markdown spec as one Feature. */
export const parseGherkinFences = (options: {
  readonly specId: string
  readonly title: string
  readonly tags: ReadonlyArray<string>
  readonly fences: ReadonlyArray<Fence>
}): GherkinResult => {
  const blocks = options.fences.filter((fence) => gherkinLangs.has(fence.lang))
  if (blocks.length === 0) return empty
  const text: Array<string> = []
  const lineMap: Array<number> = [0]
  const emit = (line: string, source: number) => {
    text.push(line)
    lineMap.push(source)
  }
  // Only a `Feature:` line opening the first block counts; one inside a doc string is content.
  // Either way the feature carries the spec's tags: an explicit one gets them on its first tag
  // line, after any leading comments such as `# language:`.
  const lines = blocks[0]!.lines
  const opening = lines.findIndex((line) => line.trim() !== "" && !/^\s*(#|@)/.test(line))
  const explicitFeature = opening >= 0 && featureLine.test(lines[opening]!)
  const specTags = options.tags.map(toTag).join(" ")
  const firstTag = lines.findIndex((line, idx) => idx < opening && /^\s*@/.test(line))
  const tagsAt = explicitFeature && specTags ? (firstTag >= 0 ? firstTag : opening) : -1
  if (!explicitFeature) {
    const first = blocks[0]!.line
    if (specTags) emit(specTags, first)
    emit(`Feature: ${options.title.replace(/\n/g, " ")}`, first)
    emit("", first)
  }
  blocks.forEach((block, index) => {
    block.lines.forEach((line, idx) => {
      if (index === 0 && idx === tagsAt) emit(specTags, block.contentLine + idx)
      emit(line, block.contentLine + idx)
    })
    emit("", block.contentLine + block.lines.length)
  })
  return parseVirtual(options.specId, text.join("\n"), (line) => lineMap[line] ?? 1)
}

/** Parse a classic `.feature` file. */
export const parseFeatureFile = (specId: string, content: string): GherkinResult =>
  parseVirtual(specId, content, (line) => line)

const empty: GherkinResult = { scenarios: [], errors: [], description: undefined, featureName: undefined, featureTags: [] }

const parseVirtual = (specId: string, source: string, mapLine: (virtual: number) => number): GherkinResult => {
  const newId = IdGenerator.incrementing()
  const parser = new Parser(new AstBuilder(newId), new GherkinClassicTokenMatcher())
  let document: Messages.GherkinDocument
  try {
    document = parser.parse(source)
  } catch (error) {
    return { ...empty, errors: parserErrors(error, mapLine) }
  }
  const feature = document.feature
  if (!feature) return empty
  const pickles = compile(document, specId, newId)

  const astLines = new Map<string, number>()
  const astSteps = new Map<string, Messages.Step>()
  const scenarioDefs: Array<{ readonly scenario: Messages.Scenario; readonly rule: string | undefined }> = []
  const visitSteps = (steps: ReadonlyArray<Messages.Step>) => {
    for (const step of steps) {
      astLines.set(step.id, mapLine(step.location.line))
      astSteps.set(step.id, step)
    }
  }
  const visitScenario = (scenario: Messages.Scenario, rule: string | undefined) => {
    astLines.set(scenario.id, mapLine(scenario.location.line))
    visitSteps(scenario.steps)
    for (const examples of scenario.examples) {
      for (const row of examples.tableBody) astLines.set(row.id, mapLine(row.location.line))
    }
    scenarioDefs.push({ scenario, rule })
  }
  for (const child of feature.children) {
    if (child.background) visitSteps(child.background.steps)
    if (child.scenario) visitScenario(child.scenario, undefined)
    if (child.rule) {
      for (const ruleChild of child.rule.children) {
        if (ruleChild.background) visitSteps(ruleChild.background.steps)
        if (ruleChild.scenario) visitScenario(ruleChild.scenario, child.rule.name)
      }
    }
  }

  const picklesByScenario = new Map<string, Array<Messages.Pickle>>()
  for (const pickle of pickles) {
    const key = pickle.astNodeIds[0]!
    const list = picklesByScenario.get(key)
    if (list) list.push(pickle)
    else picklesByScenario.set(key, [pickle])
  }

  const usedIds = new Set<string>()
  const scenarios = scenarioDefs.map(({ rule, scenario }, index): Scenario => {
    const compiled = (picklesByScenario.get(scenario.id) ?? []).map((pickle): Pickle => ({
      name: pickle.name,
      tags: pickle.tags.map((tag) => tag.name),
      exampleLine: pickle.astNodeIds[1] ? astLines.get(pickle.astNodeIds[1]) : undefined,
      steps: pickle.steps.map((step): PickleStep => {
        const ast = astSteps.get(step.astNodeIds[0]!)
        return {
          keyword: ast?.keyword.trim() ?? "*",
          text: step.text,
          type: step.type ?? "Unknown",
          line: astLines.get(step.astNodeIds[0]!) ?? 1,
          docString: step.argument?.docString?.content,
          dataTable: step.argument?.dataTable?.rows.map((row) => row.cells.map((cell) => cell.value))
        }
      })
    }))
    const slug = slugify(scenario.name) || `scenario-${index + 1}`
    let id = `${specId}#${slug}`
    for (let n = 2; usedIds.has(id); n++) id = `${specId}#${slug}-${n}`
    usedIds.add(id)
    return {
      id,
      specId,
      name: scenario.name,
      keyword: scenario.keyword,
      tags: scenario.tags.map((tag) => tag.name),
      line: mapLine(scenario.location.line),
      rule,
      steps: scenario.steps.map((step) => ({ keyword: step.keyword.trim(), text: step.text, line: mapLine(step.location.line) })),
      pickles: compiled,
      hash: hashPickles(compiled),
      hasOutcome: scenario.steps.some((step) => step.keywordType === "Outcome")
    }
  })

  return {
    scenarios,
    errors: [],
    description: feature.description.trim() || undefined,
    featureName: feature.name,
    featureTags: feature.tags.map((tag) => tag.name)
  }
}

const parserErrors = (error: unknown, mapLine: (line: number) => number): ReadonlyArray<GherkinError> => {
  const nested = (error as { errors?: ReadonlyArray<{ message: string; location?: { line: number } }> }).errors
  const list = nested && nested.length > 0 ? nested : [error as { message: string; location?: { line: number } }]
  return list.map((e) => ({
    message: String(e.message).replace(/^\(\d+:\d+\):\s*/, ""),
    line: mapLine(e.location?.line ?? 1)
  }))
}

const toTag = (tag: string) => tag.startsWith("@") ? tag.replace(/\s+/g, "-") : `@${tag.replace(/\s+/g, "-")}`

/** Lower-case ASCII words joined by `-`; accents are dropped first, so "für Gäste" → "fur-gaste". */
export const slugify = (text: string): string =>
  text.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    .slice(0, 64).replace(/-+$/, "")

const hashPickles = (pickles: ReadonlyArray<Pickle>): string =>
  createHash("sha1")
    .update(JSON.stringify(pickles.map((p) => [p.name, p.steps.map((s) => [s.text, s.docString ?? null, s.dataTable ?? null])])))
    .digest("hex")
    .slice(0, 12)
