/**
 * A spec is a Gherkin file, read by the official Cucumber parser as it is: the Feature is the
 * node, a `Rule:` the unit of content, its scenarios the examples. Tags say what a Feature, a Rule
 * or a Scenario is and what it links to — `@key=value` describes, `@rel:ID` links, any other tag
 * is a Cucumber tag — and the free text under each keyword line is its description. Markdown specs
 * keep their Gherkin in fenced blocks, read here as one Feature with every line the line it has in
 * the Markdown file.
 */
import { annotate } from "sdp/annotations"
import { AstBuilder, compile, GherkinClassicTokenMatcher, Parser } from "@cucumber/gherkin"
import type * as Messages from "@cucumber/messages"
import { IdGenerator } from "@cucumber/messages"
import { Result } from "effect"
import { createHash } from "node:crypto"
import type { RuleId } from "../model/Diagnostic.ts"
import type { Attrs } from "../model/Graph.ts"
import type { Fence } from "./Markdown.ts"

annotate(import.meta, { is: "ARCH-spec-parser" })

export interface LinkDecl {
  readonly rel: string
  readonly to: string
  readonly attrs?: Attrs | undefined
  readonly line: number
}

/** What the tags above a Feature, a Rule or a Scenario say about it. */
export interface Annotations {
  /** Cucumber tags, as written (`@slow`): inherited, matched by `--tags`, seen by a step handler. */
  readonly tags: ReadonlyArray<string>
  /** `@key=value`: facts about the node. A key written again holds a list; `@owner.team=core` nests. */
  readonly attrs: Attrs
  /** The line of each fact's first tag. */
  readonly attrLines: Readonly<Record<string, number>>
  /** `@rel:ID`: one link per tag, at its line. */
  readonly links: ReadonlyArray<LinkDecl>
}

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
  /** The Cucumber tags it inherits and its own; annotations are facts about a node, not tags. */
  readonly tags: ReadonlyArray<string>
  readonly steps: ReadonlyArray<PickleStep>
  /** Line of the example row this pickle came from, for outlines. */
  readonly exampleLine?: number | undefined
}

/** A `Rule:`: what must hold, why (its description), and the scenarios after it are its examples. */
export interface Rule extends Annotations {
  readonly id: string
  readonly name: string
  readonly description?: string | undefined
  readonly line: number
}

export interface Scenario extends Annotations {
  readonly id: string
  readonly specId: string
  readonly name: string
  readonly keyword: string
  readonly line: number
  /** The text under the `Scenario:` line. */
  readonly description?: string | undefined
  /** The id of the `Rule:` the scenario is an example of. */
  readonly rule?: string | undefined
  readonly steps: ReadonlyArray<ScenarioStep>
  readonly pickles: ReadonlyArray<Pickle>
  /** Stable hash of what a handler can observe — names, tags, steps and their arguments; results recorded for another hash are stale. */
  readonly hash: string
  /** True when the scenario states an observable outcome (has a `Then`). */
  readonly hasOutcome: boolean
}

/** A paragraph of a description, its lines joined, at its first line. */
export interface Paragraph {
  readonly text: string
  readonly line: number
}

/** What a Feature says about itself: its name, its tags and the paragraphs under it. */
export interface FeatureHead extends Annotations {
  readonly name: string
  readonly description: ReadonlyArray<Paragraph>
}

export interface GherkinError {
  readonly message: string
  readonly line: number
}

/** Something the parser accepts that sdp cannot read as written: an annotation where it says nothing, a line Gherkin drops. */
export interface GherkinProblem {
  readonly rule: Extract<RuleId, "annotation" | "description-comment">
  readonly message: string
  readonly line: number
  readonly hint: string
}

export interface GherkinResult {
  readonly scenarios: ReadonlyArray<Scenario>
  readonly rules: ReadonlyArray<Rule>
  readonly errors: ReadonlyArray<GherkinError>
  readonly problems: ReadonlyArray<GherkinProblem>
}

/** A `.feature` file the parser has read: its Feature first, so the spec is named before its scenarios are read. */
export interface FeatureFile {
  /** Undefined when the file has no `Feature:`. */
  readonly feature: FeatureHead | undefined
  /** The scenarios and rules, with ids under `specId`; every scenario inherits `tags` before the Feature's own. */
  readonly read: (specId: string, tags: ReadonlyArray<string>) => GherkinResult
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
    const parsed = parseDocument([...header, ...padding, ...block.lines].join("\n"), newId)
    if (Result.isFailure(parsed)) {
      errors.push(...parsed.failure)
      continue
    }
    const feature = parsed.success.feature
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
  return readFeature(options.specId, { ...first, children }, options.tags, newId, [], [])
}

/** Parse a `.feature` file, or say where the parser stopped. */
export const parseFeatureFile = (content: string): Result.Result<FeatureFile, ReadonlyArray<GherkinError>> => {
  const newId = IdGenerator.incrementing()
  const parsed = parseDocument(content, newId)
  if (Result.isFailure(parsed)) return Result.fail(parsed.failure)
  const { comments, feature } = parsed.success
  const lines = content.split(/\r?\n/)
  return Result.succeed({
    feature: feature && {
      name: feature.name,
      description: paragraphs(placeDescription(lines, feature).lines),
      ...readTags(feature.tags, "Feature")
    },
    read: (specId, tags) => feature ? readFeature(specId, feature, tags, newId, lines, comments) : empty
  })
}

const empty: GherkinResult = { scenarios: [], rules: [], errors: [], problems: [] }

/** The document, or the errors that kept the parser from reading it. */
const parseDocument = (source: string, newId: IdGenerator.NewId): Result.Result<Messages.GherkinDocument, ReadonlyArray<GherkinError>> => {
  try {
    return Result.succeed(new Parser(new AstBuilder(newId), new GherkinClassicTokenMatcher()).parse(source))
  } catch (error) {
    return Result.fail(parserErrors(error))
  }
}

const annotationTag = /^@([A-Za-z][\w.-]*)([=:])(.+)$/

/** Where a tag sits: what an annotation there is about, and which ones it may hold. */
type Level = "Feature" | "Rule" | "Scenario" | "Examples"

/** A value that reads back as the number it is written as is a number; `true` and `false` are booleans; the rest is text. */
const tagValue = (text: string): unknown => {
  if (text === "true" || text === "false") return text === "true"
  const number = Number(text)
  return Number.isFinite(number) && String(number) === text ? number : text
}

/**
 * What the tags of one element say. `=` makes a fact, `:` a link, and the first of them decides;
 * any other tag is a Cucumber tag. An annotation that cannot mean what it says is a problem, and
 * neither a fact nor a tag.
 */
const readTags = (tags: ReadonlyArray<Messages.Tag>, level: Level, problems: Array<GherkinProblem> = []): Annotations => {
  const plain: Array<string> = []
  const values = new Map<string, Array<unknown>>()
  const attrLines = new Map<string, number>()
  const links: Array<LinkDecl> = []
  const problem = (tag: Messages.Tag, message: string, hint: string) =>
    problems.push({ rule: "annotation", message: `${tag.name}: ${message}`, line: tag.location.line, hint })
  for (const tag of tags) {
    const match = annotationTag.exec(tag.name)
    if (!match) {
      plain.push(tag.name)
      continue
    }
    const key = match[1]!
    const value = match[3]!
    const separator = match[2]
    const line = tag.location.line
    if (level === "Examples") {
      problem(tag, "an annotation on Examples is about no node", "put it on the Scenario or the Rule above; a plain tag such as @slow selects the table's rows")
    } else if (level !== "Feature" && (key === "id" || key === "kind")) {
      problem(tag, `only a Feature says what it is with @${key}=`, "move it above `Feature:`: a Rule or a Scenario is a node sdp names itself")
    } else if ((key === "id" || key === "kind") && values.has(key)) {
      problem(tag, `a spec has one ${key}`, `keep one @${key}= tag: another node is a file of its own`)
    } else if (separator === ":" && value.includes(",")) {
      problem(tag, "one tag is one link", `write ${value.split(",").map((to) => `@${key}:${to.trim()}`).join(" ")}`)
    } else if (separator === ":") {
      links.push({ rel: key, to: value, line })
    } else {
      values.set(key, [...(values.get(key) ?? []), tagValue(value)])
      if (!attrLines.has(key)) attrLines.set(key, line)
    }
  }
  return { tags: plain, attrs: nested(values, tags, problems), attrLines: Object.fromEntries(attrLines), links }
}

type Tree = Map<string, unknown>

/** `@owner.team=core` is the fact `owner`, a map with the entry `team`. A key that is a value and a map is a problem. */
const nested = (values: ReadonlyMap<string, ReadonlyArray<unknown>>, tags: ReadonlyArray<Messages.Tag>, problems: Array<GherkinProblem>): Attrs => {
  const root: Tree = new Map()
  for (const [key, written] of values) {
    const path = key.split(".")
    const leaf = path.pop()!
    let at: Tree | undefined = root
    for (const part of path) {
      const next: unknown = at.get(part) ?? new Map()
      at.set(part, next)
      at = next instanceof Map ? next : undefined
      if (!at) break
    }
    if (!at || at.get(leaf) instanceof Map) {
      const tag = tags.find((candidate) => candidate.name.startsWith(`@${key}=`))!
      problems.push({
        rule: "annotation",
        message: `${tag.name}: ${path[0] ?? leaf} is written as a value and as a map`,
        line: tag.location.line,
        hint: `write either @${path[0] ?? leaf}=… or @${path[0] ?? leaf}.<key>=…`
      })
      continue
    }
    at.set(leaf, written.length === 1 ? written[0] : written)
  }
  const record = (tree: Tree): Attrs => Object.fromEntries([...tree].map(([key, value]) => [key, value instanceof Map ? record(value) : value]))
  return record(root)
}

/** Whether a tag is an annotation — a fact about the node it sits on — rather than a Cucumber tag. */
const isAnnotation = (tag: string): boolean => annotationTag.test(tag)

/** The text under a keyword line, without the indentation it was written with. */
const describe = (description: string): string | undefined => {
  const lines = description.split("\n")
  const indent = Math.min(...lines.filter((line) => line.trim() !== "").map((line) => line.length - line.trimStart().length))
  return lines.map((line) => line.slice(indent).trimEnd()).join("\n").trim() || undefined
}

/**
 * Where the lines of an element's description are in the file, and the `#` lines among them:
 * Gherkin drops those without a word, so a Markdown heading written there vanishes.
 */
const placeDescription = (lines: ReadonlyArray<string>, element: { readonly location: Messages.Location; readonly description: string }) => {
  const wanted = element.description === "" ? [] : element.description.split("\n")
  const placed: Array<Paragraph> = []
  const comments: Array<number> = []
  for (let index = element.location.line; index < lines.length && placed.length < wanted.length; index++) {
    const line = lines[index]!
    if (line.trimEnd() === wanted[placed.length]!.trimEnd()) placed.push({ text: line.trim(), line: index + 1 })
    else if (placed.length > 0 && line.trimStart().startsWith("#")) comments.push(index + 1)
  }
  return { lines: placed, comments }
}

/** Lines into paragraphs: a blank line ends one. */
const paragraphs = (lines: ReadonlyArray<Paragraph>): ReadonlyArray<Paragraph> => {
  const out: Array<{ text: string; line: number }> = []
  let open: { text: string; line: number } | undefined
  for (const { line, text } of lines) {
    if (text === "") open = undefined
    else if (open) open.text = `${open.text} ${text}`
    else out.push(open = { text, line })
  }
  return out
}

/**
 * The scenarios and rules of a Feature. `lines` and `comments` are the file's, for the checks only a
 * file read whole can make; a Feature put together from Markdown fences has neither.
 */
const readFeature = (
  specId: string,
  written: Messages.Feature,
  inherited: ReadonlyArray<string>,
  newId: IdGenerator.NewId,
  lines: ReadonlyArray<string>,
  comments: ReadonlyArray<Messages.Comment>
): GherkinResult => {
  const problems: Array<GherkinProblem> = []
  // The feature carries what the spec inherits — its kind, and in Markdown its tags — before its own tags.
  const location = { line: written.location.line, column: 1 }
  const feature = { ...written, tags: [...inherited.map((tag) => ({ id: newId(), name: toTag(tag), location })), ...written.tags] }
  const pickles = compile({ feature, comments: [] }, specId, newId)
  readTags(written.tags, "Feature", problems)

  const astLines = new Map<string, number>()
  const astSteps = new Map<string, Messages.Step>()
  const scenarioDefs: Array<{ readonly scenario: Messages.Scenario; readonly rule: Messages.Rule | undefined }> = []
  const described: Array<{ readonly location: Messages.Location; readonly description: string }> = [written]
  const visitSteps = (steps: ReadonlyArray<Messages.Step>) => {
    for (const step of steps) {
      astLines.set(step.id, step.location.line)
      astSteps.set(step.id, step)
    }
  }
  const visitScenario = (scenario: Messages.Scenario, rule: Messages.Rule | undefined) => {
    visitSteps(scenario.steps)
    described.push(scenario)
    for (const examples of scenario.examples) {
      readTags(examples.tags, "Examples", problems)
      for (const row of examples.tableBody) astLines.set(row.id, row.location.line)
    }
    scenarioDefs.push({ scenario, rule })
  }
  const writtenRules: Array<Messages.Rule> = []
  for (const child of feature.children) {
    if (child.background) visitSteps(child.background.steps)
    if (child.scenario) visitScenario(child.scenario, undefined)
    if (child.rule) {
      writtenRules.push(child.rule)
      described.push(child.rule)
      for (const ruleChild of child.rule.children) {
        if (ruleChild.background) visitSteps(ruleChild.background.steps)
        if (ruleChild.scenario) visitScenario(ruleChild.scenario, child.rule)
      }
    }
  }
  if (lines.length > 0) {
    const inside = new Set(described.flatMap((element) => placeDescription(lines, element).comments))
    for (const comment of comments.filter((c) => inside.has(c.location.line))) {
      problems.push({
        rule: "description-comment",
        message: `"${comment.text.trim()}" is a comment, so Gherkin leaves it out of the description around it`,
        line: comment.location.line,
        hint: "write it as text, or move the comment below the description; a heading has no place in a description"
      })
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
  const unique = (slug: string) => {
    let id = `${specId}#${slug}`
    for (let n = 2; usedIds.has(id); n++) id = `${specId}#${slug}-${n}`
    usedIds.add(id)
    return id
  }
  // Rules first, in the order written, so a rule keeps its id whatever its examples are called.
  const ruleIds = new Map(writtenRules.map((rule, index) => [rule, unique(slugify(rule.name) || `rule-${index + 1}`)]))
  const rules = writtenRules.map((rule): Rule => ({
    id: ruleIds.get(rule)!,
    name: rule.name,
    description: describe(rule.description),
    line: rule.location.line,
    ...readTags(rule.tags, "Rule", problems)
  }))
  const scenarios = scenarioDefs.map(({ rule, scenario }, index): Scenario => {
    const compiled = (picklesByScenario.get(scenario.id) ?? []).map((pickle): Pickle => ({
      name: pickle.name,
      tags: pickle.tags.map((tag) => tag.name).filter((tag) => !isAnnotation(tag)),
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
    return {
      id: unique(slugify(scenario.name) || `scenario-${index + 1}`),
      specId,
      name: scenario.name,
      keyword: scenario.keyword,
      line: scenario.location.line,
      description: describe(scenario.description),
      rule: rule && ruleIds.get(rule),
      ...readTags(scenario.tags, "Scenario", problems),
      steps: scenario.steps.map((step) => ({ keyword: step.keyword.trim(), text: step.text, line: step.location.line })),
      pickles: compiled,
      hash: hashPickles(compiled),
      hasOutcome: scenario.steps.some((step) => step.keywordType === "Outcome")
    }
  })

  return { scenarios, rules, errors: [], problems: problems.sort((a, b) => a.line - b.line) }
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
