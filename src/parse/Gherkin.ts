/**
 * Behaviour in specs is plain Gherkin, written in fenced ```gherkin blocks
 * inside Markdown (or in classic `.feature` files). The blocks of one spec form
 * one Feature, parsed and compiled by the official Cucumber parser, with every
 * line the line it has in the Markdown file.
 */
import { annotate } from "sdp/annotations"
import { AstBuilder, compile, GherkinClassicTokenMatcher, Parser } from "@cucumber/gherkin"
import type * as Messages from "@cucumber/messages"
import { IdGenerator } from "@cucumber/messages"
import { Result } from "effect"
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
  /** The text under the `Scenario:` line. */
  readonly description?: string | undefined
  /** The name of the `Rule:` the scenario is an example of, and the text under it: what must hold, and why. */
  readonly rule?: string | undefined
  readonly ruleDescription?: string | undefined
  readonly steps: ReadonlyArray<ScenarioStep>
  readonly pickles: ReadonlyArray<Pickle>
  /** Stable hash of what a handler can observe — names, tags, steps and their arguments; results recorded for another hash are stale. */
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

/**
 * Parse the gherkin fences of a Markdown spec as one Feature. Each fence is parsed on its own, at
 * the lines it has in the file, so a `Rule:` — with its Background and its tags — ends with its
 * fence; a Background outside a Rule belongs to the file and opens it.
 */
export const parseGherkinFences = (options: {
  readonly specId: string
  readonly title: string
  readonly tags: ReadonlyArray<string>
  readonly fences: ReadonlyArray<Fence>
}): GherkinResult => {
  const blocks = options.fences.filter((fence) => gherkinLangs.has(fence.lang))
  if (blocks.length === 0) return empty
  const newId = IdGenerator.incrementing()
  const errors: Array<GherkinError> = []
  const children: Array<Messages.FeatureChild> = []
  let first: Messages.Feature | undefined
  for (const block of blocks) {
    // Only a `Feature:` line opening the first block counts; one inside a doc string is content.
    // Every other block gets a feature line above its own lines: the fence line leaves room for it.
    const opening = block.lines.find((line) => line.trim() !== "" && !/^\s*(#|@)/.test(line))
    const explicit = block === blocks[0] && opening !== undefined && featureLine.test(opening)
    const header = explicit ? [] : [`Feature: ${options.title.replace(/\n/g, " ")}`]
    const padding = Array.from({ length: block.contentLine - 1 - header.length }, () => "")
    const parsed = parseFeature([...header, ...padding, ...block.lines].join("\n"), newId)
    if (Result.isFailure(parsed)) {
      errors.push(...parsed.failure)
      continue
    }
    const feature = parsed.success
    if (!feature) continue
    for (const child of feature.children) {
      if (first && child.background) {
        errors.push({
          message: "a Background outside a Rule holds for the whole file, so it opens the first block; put these scenarios under a Rule to give them one of their own",
          line: child.background.location.line
        })
      }
    }
    first ??= feature
    children.push(...feature.children)
  }
  if (errors.length > 0 || !first) return { ...empty, errors }
  // The feature carries the spec's tags, before any of its own.
  const location = { line: blocks[0]!.line, column: 1 }
  const specTags = options.tags.map((tag) => ({ id: newId(), name: toTag(tag), location }))
  return scenariosOf(options.specId, { ...first, tags: [...specTags, ...first.tags], children }, newId)
}

/** Parse a classic `.feature` file. */
export const parseFeatureFile = (specId: string, content: string): GherkinResult => {
  const newId = IdGenerator.incrementing()
  const parsed = parseFeature(content, newId)
  if (Result.isFailure(parsed)) return { ...empty, errors: parsed.failure }
  return parsed.success ? scenariosOf(specId, parsed.success, newId) : empty
}

const empty: GherkinResult = { scenarios: [], errors: [], description: undefined, featureName: undefined, featureTags: [] }

/** The feature of a document, if it has one, or the errors that kept the parser from reading it. */
const parseFeature = (source: string, newId: IdGenerator.NewId): Result.Result<Messages.Feature | undefined, ReadonlyArray<GherkinError>> => {
  try {
    return Result.succeed(new Parser(new AstBuilder(newId), new GherkinClassicTokenMatcher()).parse(source).feature)
  } catch (error) {
    return Result.fail(parserErrors(error))
  }
}

/** The text under a keyword line, without the indentation it was written with. */
const describe = (description: string): string | undefined => {
  const lines = description.split("\n")
  const indent = Math.min(...lines.filter((line) => line.trim() !== "").map((line) => line.length - line.trimStart().length))
  return lines.map((line) => line.slice(indent).trimEnd()).join("\n").trim() || undefined
}

const scenariosOf = (specId: string, feature: Messages.Feature, newId: IdGenerator.NewId): GherkinResult => {
  const pickles = compile({ feature, comments: [] }, specId, newId)

  const astLines = new Map<string, number>()
  const astSteps = new Map<string, Messages.Step>()
  const scenarioDefs: Array<{ readonly scenario: Messages.Scenario; readonly rule: Messages.Rule | undefined }> = []
  const visitSteps = (steps: ReadonlyArray<Messages.Step>) => {
    for (const step of steps) {
      astLines.set(step.id, step.location.line)
      astSteps.set(step.id, step)
    }
  }
  const visitScenario = (scenario: Messages.Scenario, rule: Messages.Rule | undefined) => {
    visitSteps(scenario.steps)
    for (const examples of scenario.examples) {
      for (const row of examples.tableBody) astLines.set(row.id, row.location.line)
    }
    scenarioDefs.push({ scenario, rule })
  }
  for (const child of feature.children) {
    if (child.background) visitSteps(child.background.steps)
    if (child.scenario) visitScenario(child.scenario, undefined)
    if (child.rule) {
      for (const ruleChild of child.rule.children) {
        if (ruleChild.background) visitSteps(ruleChild.background.steps)
        if (ruleChild.scenario) visitScenario(ruleChild.scenario, child.rule)
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
      line: scenario.location.line,
      description: describe(scenario.description),
      rule: rule?.name,
      ruleDescription: rule && describe(rule.description),
      steps: scenario.steps.map((step) => ({ keyword: step.keyword.trim(), text: step.text, line: step.location.line })),
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

const parserErrors = (error: unknown): ReadonlyArray<GherkinError> => {
  const nested = (error as { errors?: ReadonlyArray<{ message: string; location?: { line: number } }> }).errors
  const list = nested && nested.length > 0 ? nested : [error as { message: string; location?: { line: number } }]
  return list.map((e) => ({
    message: String(e.message).replace(/^\(\d+:\d+\):\s*/, ""),
    line: e.location?.line ?? 1
  }))
}

const toTag = (tag: string) => tag.startsWith("@") ? tag.replace(/\s+/g, "-") : `@${tag.replace(/\s+/g, "-")}`

/** Lower-case ASCII words joined by `-`; accents are dropped first, so "für Gäste" → "fur-gaste". */
export const slugify = (text: string): string =>
  text.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    .slice(0, 64).replace(/-+$/, "")

/** Everything a step handler can observe of a scenario: each example's name, tags (inherited ones too) and steps with their arguments. */
const hashPickles = (pickles: ReadonlyArray<Pickle>): string =>
  createHash("sha1")
    .update(JSON.stringify(pickles.map((p) => [p.name, p.tags, p.steps.map((s) => [s.text, s.docString ?? null, s.dataTable ?? null])])))
    .digest("hex")
    .slice(0, 12)
