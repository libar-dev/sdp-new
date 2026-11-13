/**
 * A spec is a Gherkin file, read by the official Cucumber parser as it is: the Feature is the
 * node, a `Rule:` the unit of content, its scenarios the examples. Tags say what a Feature, a Rule
 * or a Scenario is and what it links to — `@key=value` describes, `@rel:ID` links, any other tag
 * is a Cucumber tag — and the free text under each keyword line is its description.
 *
 * @sdp is ARCH-spec-parser
 */
import { AstBuilder, compile, dialects, GherkinClassicTokenMatcher, Parser } from "@cucumber/gherkin"
import type * as Messages from "@cucumber/messages"
import { IdGenerator } from "@cucumber/messages"
import { Result } from "effect"
import { createHash } from "node:crypto"
import type { RuleId } from "../model/Diagnostic.ts"
import type { Attrs } from "../model/Graph.ts"
import { idForm, idWordBreak, isId, isKey } from "../model/Vocabulary.ts"
import { tagValue } from "../model/TagValue.ts"
export interface LinkDecl {
  readonly rel: string
  readonly to: string
  readonly line: number
}

/** What the tags above a Feature, a Rule or a Scenario say about it. */
export interface Tagged {
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
  /** The Cucumber tags it inherits and its own; its facts and links are about a node, and no Cucumber tags. */
  readonly tags: ReadonlyArray<string>
  readonly steps: ReadonlyArray<PickleStep>
  /** Line of the example row this pickle came from, for outlines. */
  readonly exampleLine?: number | undefined
}

/** A `Rule:`: what must hold, why (its description), and the scenarios after it are its examples. */
export interface Rule extends Tagged {
  readonly id: string
  readonly name: string
  readonly description?: string | undefined
  readonly line: number
}

export interface Scenario extends Tagged {
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
}

/** A paragraph of a description, its lines joined, at its first line. */
export interface Paragraph {
  readonly text: string
  readonly line: number
}

/** What a Feature says about itself: its name, its tags and the paragraphs under it. */
export interface FeatureHead extends Tagged {
  readonly name: string
  readonly description: ReadonlyArray<Paragraph>
  /** The dialect its keywords are written in: `en`, unless the file's `# language:` names another. */
  readonly language: string
}

export interface GherkinError {
  readonly message: string
  readonly line: number
}

/** Something the parser accepts that sdp cannot read as written: a tag that says nothing where it is, a line Gherkin drops. */
export interface GherkinProblem {
  readonly rule: Extract<RuleId, "tag-syntax" | "description-comment" | "gherkin-syntax" | "link-syntax" | "background-empty" | "prose-step">
  readonly message: string
  readonly line: number
  readonly hint: string
}

export interface GherkinResult {
  readonly scenarios: ReadonlyArray<Scenario>
  readonly rules: ReadonlyArray<Rule>
  readonly problems: ReadonlyArray<GherkinProblem>
}

/** A `.feature` file the parser has read: its Feature first, so the spec is named before its scenarios are read. */
export interface FeatureFile {
  /** Undefined when the file has no `Feature:`. */
  readonly feature: FeatureHead | undefined
  /** The scenarios and rules, with ids under `specId`; every scenario inherits `tags` after the Feature's own. */
  readonly read: (specId: string, tags: ReadonlyArray<string>) => GherkinResult
}

/** The keywords that open a block of a Gherkin file. */
export type Block = "feature" | "rule" | "background" | "scenario" | "scenarioOutline" | "examples"

/** A line that opens one of `blocks` in the dialect of `language`: `Feature:`, or `Fonctionnalité:` in a French file. */
export const keywordLine = (language: string, blocks: ReadonlyArray<Block>): RegExp => {
  const dialect = dialects[language] ?? dialects.en!
  const words = blocks.flatMap((block) => dialect[block]).map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  return new RegExp(`^\\s*(?:${words.join("|")}):`)
}

/** Which keys link, so that one written with `=` is a slip: `@iteration=IT-beta` plans nothing. */
export type LinkKeys = (key: string) => boolean

/** Parse a `.feature` file, or say where the parser stopped. */
export const parseFeatureFile = (content: string, links: LinkKeys): Result.Result<FeatureFile, ReadonlyArray<GherkinError>> => {
  const newId = IdGenerator.incrementing()
  const parsed = parseDocument(content, newId)
  if (Result.isFailure(parsed)) return Result.fail(parsed.failure)
  const { comments, feature } = parsed.success
  const lines = content.split(/\r?\n/)
  return Result.succeed({
    feature: feature && {
      name: feature.name,
      description: paragraphs(placeDescription(lines, feature).lines),
      language: feature.language,
      ...readTags(feature.tags, "Feature", links)
    },
    read: (specId, tags) =>
      feature ? readFeature(specId, { ...feature, tags: [...feature.tags, ...inherited(feature, tags, newId)] }, newId, lines, comments, links) : empty
  })
}

const empty: GherkinResult = { scenarios: [], rules: [], problems: [] }

/** Tags a Feature's scenarios inherit from what the spec is, though they are not written on it. */
const inherited = (feature: Messages.Feature, tags: ReadonlyArray<string>, newId: IdGenerator.NewId): ReadonlyArray<Messages.Tag> =>
  tags.map((tag) => ({ id: newId(), name: toTag(tag), location: { line: feature.location.line, column: 1 } }))

/** The document, or the errors that kept the parser from reading it. */
const parseDocument = (source: string, newId: IdGenerator.NewId): Result.Result<Messages.GherkinDocument, ReadonlyArray<GherkinError>> => {
  try {
    return Result.succeed(new Parser(new AstBuilder(newId), new GherkinClassicTokenMatcher()).parse(source))
  } catch (error) {
    return Result.fail(parserErrors(error))
  }
}

/** Where a tag sits: what a fact or a link there is about, and which ones it may hold. */
type Level = "Feature" | "Rule" | "Scenario" | "Examples"


/**
 * What the tags of one element say. `=` makes a fact, `:` a link, and the first of them decides;
 * a tag with neither is a Cucumber tag. A tag that cannot mean what it says is a problem, and
 * neither a fact, a link nor a Cucumber tag. What a spec is — its `id` and `kind` — is the text written.
 */
const readTags = (tags: ReadonlyArray<Messages.Tag>, level: Level, linkKeys: LinkKeys, problems: Array<GherkinProblem> = []): Tagged => {
  const plain: Array<string> = []
  const values = new Map<string, Array<unknown>>()
  const attrLines = new Map<string, number>()
  const links: Array<LinkDecl> = []
  const problem = (tag: Messages.Tag, message: string, hint: string, rule: GherkinProblem["rule"] = "tag-syntax") =>
    problems.push({ rule, message: `${tag.name}: ${message}`, line: tag.location.line, hint })
  const split = splitWords(tags)
  for (const word of split) {
    problems.push({
      rule: "tag-syntax",
      message: `${word.map((tag) => tag.name).join("")}: a tag holds no @, so Gherkin reads it as ${word.map((tag) => tag.name).join(" and ")}`,
      line: word[0]!.location.line,
      hint: "a value with @ has no tag form: write it in the description"
    })
  }
  const fragments = new Set(split.flat().map((tag) => tag.id))
  for (const tag of tags) {
    if (fragments.has(tag.id)) continue
    const at = tag.name.search(/[=:]/)
    if (at < 0) {
      plain.push(tag.name)
      continue
    }
    const key = tag.name.slice(1, at)
    const separator = tag.name[at]
    const value = tag.name.slice(at + 1)
    const line = tag.location.line
    if (!isKey(key)) {
      problem(tag, "this key names nothing: a key is a letter, then letters, digits, _ or -, in parts joined by single dots", "write @key=value or @rel:ID; a tag without = and : is a Cucumber tag")
      continue
    }
    if ((level === "Scenario" || level === "Examples") && key === "maturity") {
      problem(
        tag,
        "only a Feature or a Rule declares a maturity: on an example it would switch that example off alone",
        "declare it on the Rule the example is under, or on its Feature; a rule without one has its Feature's"
      )
    } else if (level === "Examples") {
      problem(tag, "a fact or a link on Examples is about no node", "put it on the Scenario or the Rule above; a Cucumber tag such as @slow selects the table's rows")
    } else if (value === "") {
      problem(tag, `${key} has no value`, `write @${key}${separator}${separator === ":" ? "<ID>" : "<value>"}, or @${key} alone for a Cucumber tag`)
    } else if (separator === "=" && linkKeys(key)) {
      problem(tag, `${key} is a link, so a value written with = links nothing`, `write @${key}:${value}`, "link-syntax")
    } else if (level !== "Feature" && (key === "id" || key === "kind")) {
      problem(tag, `only a Feature says what it is with @${key}=`, "move it above `Feature:`: a Rule or a Scenario is a node sdp names itself")
    } else if ((key === "id" || key === "kind") && separator === ":") {
      problem(tag, `a spec's ${key} is written with =, so this links nothing`, `write @${key}=${value}`)
    } else if (key === "id" && value.includes("#")) {
      problem(tag, "a spec's id holds no #, which names a rule or an example of a spec", "write the id without #; a rule is a `Rule:` in its spec's file")
    } else if (key === "id" && !isId(value)) {
      problem(tag, `${value} is no id, so no tag in code could name it`, `write an id: ${idForm}`)
    } else if ((key === "id" || key === "kind") && values.has(key)) {
      problem(tag, `a spec has one ${key}`, `keep one @${key}= tag: another node is a file of its own`)
    } else if (separator === ":" && value.includes(",")) {
      problem(tag, "one tag is one link", `write ${value.split(",").map((to) => `@${key}:${to.trim()}`).join(" ")}`)
    } else if (separator === ":") {
      links.push({ rel: key, to: value, line })
    } else {
      values.set(key, [...(values.get(key) ?? []), key === "id" || key === "kind" ? value : tagValue(value)])
      if (!attrLines.has(key)) attrLines.set(key, line)
    }
  }
  return { tags: plain, attrs: nested(values, tags, problems), attrLines: Object.fromEntries(attrLines), links }
}

/**
 * The tags Gherkin split out of one word written with an `@` inside it — `@owner=a@b.c` is read as
 * `@owner=a` and `@b.c` — each word as the tags it became: one starts where the one before it ends.
 */
const splitWords = (tags: ReadonlyArray<Messages.Tag>): ReadonlyArray<ReadonlyArray<Messages.Tag>> => {
  const words: Array<Array<Messages.Tag>> = []
  for (const tag of tags) {
    const word = words.at(-1)
    const last = word?.at(-1)
    const touches = last !== undefined && last.location.line === tag.location.line && last.location.column !== undefined &&
      tag.location.column === last.location.column + last.name.length
    if (touches) word!.push(tag)
    else words.push([tag])
  }
  return words.filter((word) => word.length > 1)
}

/**
 * The tags a comment drops from a tag line: whitespace and then `#` ends the line, so a tag after it
 * is no tag at all. A `#` inside a tag is part of it.
 */
const droppedTags = (line: string): { readonly comment: string; readonly tags: ReadonlyArray<string> } | undefined => {
  const comment = /\s(#.*)$/.exec(line)?.[1]?.trim()
  const tags = comment?.match(/@\S+/g) ?? []
  return comment !== undefined && tags.length > 0 ? { comment, tags } : undefined
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
        rule: "tag-syntax",
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

/** Whether a tag is a fact or a link about the node it sits on, or meant as one, rather than a Cucumber tag. */
const isFactOrLink = (tag: string): boolean => /[=:]/.test(tag)

/** The text under a keyword line, without the indentation it was written with. */
const describe = (description: string): string | undefined => {
  const lines = description.split("\n")
  const indent = Math.min(...lines.filter((line) => line.trim() !== "").map((line) => line.length - line.trimStart().length))
  return lines.map((line) => line.slice(indent).trimEnd()).join("\n").trim() || undefined
}

/**
 * Where the lines of an element's description are in the file, and the `#` lines among them or
 * above them under the keyword line: Gherkin drops those without a word, so a heading written there
 * vanishes.
 */
const placeDescription = (lines: ReadonlyArray<string>, element: { readonly location: Messages.Location; readonly description: string }) => {
  const wanted = element.description === "" ? [] : element.description.split("\n")
  const placed: Array<Paragraph> = []
  const comments: Array<number> = []
  for (let index = element.location.line; index < lines.length && placed.length < wanted.length; index++) {
    const line = lines[index]!
    if (line.trimEnd() === wanted[placed.length]!.trimEnd()) placed.push({ text: line.trim(), line: index + 1 })
    else if (line.trimStart().startsWith("#")) comments.push(index + 1)
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

/** The scenarios and rules of a Feature; `lines` and `comments` are the file's, for the checks of its descriptions. */
const readFeature = (
  specId: string,
  feature: Messages.Feature,
  newId: IdGenerator.NewId,
  lines: ReadonlyArray<string>,
  comments: ReadonlyArray<Messages.Comment>,
  links: LinkKeys
): GherkinResult => {
  const problems: Array<GherkinProblem> = []
  const pickles = compile({ feature, comments: [] }, specId, newId)
  readTags(feature.tags, "Feature", links, problems)

  const astLines = new Map<string, number>()
  const astSteps = new Map<string, Messages.Step>()
  const scenarioDefs: Array<{ readonly scenario: Messages.Scenario; readonly rule: Messages.Rule | undefined }> = []
  const described: Array<{ readonly location: Messages.Location; readonly description: string }> = [feature]
  const visitSteps = (steps: ReadonlyArray<Messages.Step>) => {
    // A reason written under a Scenario becomes a step when it starts with Then: one after a Then
    // that ends a sentence is most likely such a reason.
    let outcome = false
    for (const step of steps) {
      astLines.set(step.id, step.location.line)
      astSteps.set(step.id, step)
      const isOutcome: boolean = step.keywordType === "Outcome" || (step.keywordType === "Conjunction" && outcome)
      if (isOutcome && outcome && step.text.trimEnd().endsWith(".")) {
        problems.push({
          rule: "prose-step",
          message: `"${step.keyword.trim()} ${step.text}" reads as a sentence, so it may be a reason Gherkin made a step`,
          line: step.location.line,
          hint: "write a reason under `Rule:`, where no line becomes a step; a step ends without a full stop"
        })
      }
      outcome = isOutcome
    }
  }
  const visitScenario = (scenario: Messages.Scenario, rule: Messages.Rule | undefined) => {
    visitSteps(scenario.steps)
    described.push(scenario)
    for (const examples of scenario.examples) {
      described.push(examples)
      readTags(examples.tags, "Examples", links, problems)
      for (const row of examples.tableBody) astLines.set(row.id, row.location.line)
    }
    scenarioDefs.push({ scenario, rule })
  }
  const writtenRules: Array<Messages.Rule> = []
  const visitBackground = (background: Messages.Background) => {
    visitSteps(background.steps)
    described.push(background)
    if (background.steps.length === 0) {
      problems.push({
        rule: "background-empty",
        message: `"${`${background.keyword}: ${background.name}`.trim()}" has no steps, so it adds nothing to a scenario`,
        line: background.location.line,
        hint: "write its steps, or delete it; in a description, start no line with `Background:`"
      })
    }
  }
  for (const child of feature.children) {
    if (child.background) visitBackground(child.background)
    if (child.scenario) visitScenario(child.scenario, undefined)
    if (child.rule) {
      writtenRules.push(child.rule)
      described.push(child.rule)
      for (const ruleChild of child.rule.children) {
        if (ruleChild.background) visitBackground(ruleChild.background)
        if (ruleChild.scenario) visitScenario(ruleChild.scenario, child.rule)
      }
    }
  }
  const placed = described.map((element) => placeDescription(lines, element))
  const inside = new Set(placed.flatMap((description) => description.comments))
  for (const comment of comments.filter((c) => inside.has(c.location.line))) {
    problems.push({
      rule: "description-comment",
      message: `"${comment.text.trim()}" is a comment, so Gherkin leaves it out of the description around it`,
      line: comment.location.line,
      hint: "write it as text, or move the comment below the description; a heading has no place in a description"
    })
  }
  // A tag line's comment drops the tags written after it, and a word with an `@` inside is split.
  const tagged = [
    feature.tags,
    ...writtenRules.map((rule) => rule.tags),
    ...scenarioDefs.flatMap(({ scenario }) => [scenario.tags, ...scenario.examples.map((examples) => examples.tags)])
  ]
  const tagLines = new Set(tagged.flat().map((tag) => tag.location.line).filter((line) => lines[line - 1]?.trimStart().startsWith("@")))
  for (const line of [...tagLines].sort((a, b) => a - b)) {
    const dropped = droppedTags(lines[line - 1]!)
    if (dropped) {
      problems.push({
        rule: "tag-syntax",
        message: `"${dropped.comment}" is a comment, so the tags in it are dropped: ${dropped.tags.join(" ")}`,
        line,
        hint: "write the comment on a line of its own, above the tags"
      })
    }
  }
  const fragments = new Set(tagged.flatMap((tags) => splitWords(tags).flat().map((tag) => tag.id)))
  // Gherkin reads a second Feature as text of the description above it, and nothing of it as a spec.
  const featureLine = keywordLine(feature.language, ["feature"])
  for (const { line, text } of placed.flatMap((description) => description.lines).filter((placed) => featureLine.test(placed.text))) {
    problems.push({
      rule: "gherkin-syntax",
      message: `"${text}" is read as text of the description above it, so the Feature it opens is not read`,
      line,
      hint: "one file is one spec: move this Feature and what follows it to a file of its own"
    })
  }

  const picklesByScenario = new Map<string, Array<Messages.Pickle>>()
  for (const pickle of pickles) {
    const key = pickle.astNodeIds[0]!
    const list = picklesByScenario.get(key)
    if (list) list.push(pickle)
    else picklesByScenario.set(key, [pickle])
  }

  // A rule is named by what it says, so two alike are one id twice: the graph reports it. A
  // scenario's name says its case, and a case named like another or like a rule is numbered.
  const ruleIds = new Map(writtenRules.map((rule, index) => [rule, `${specId}#${slugify(rule.name) || `rule-${index + 1}`}`]))
  const usedIds = new Set<string>(ruleIds.values())
  const unique = (slug: string) => {
    let id = `${specId}#${slug}`
    for (let n = 2; usedIds.has(id); n++) id = `${specId}#${slug}-${n}`
    usedIds.add(id)
    return id
  }
  const rules = writtenRules.map((rule): Rule => ({
    id: ruleIds.get(rule)!,
    name: rule.name,
    description: describe(rule.description),
    line: rule.location.line,
    ...readTags(rule.tags, "Rule", links, problems)
  }))
  const scenarios = scenarioDefs.map(({ rule, scenario }, index): Scenario => {
    const compiled = (picklesByScenario.get(scenario.id) ?? []).map((pickle): Pickle => ({
      name: pickle.name,
      tags: pickle.tags.filter((tag) => !fragments.has(tag.astNodeId)).map((tag) => tag.name).filter((tag) => !isFactOrLink(tag)),
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
      ...readTags(scenario.tags, "Scenario", links, problems),
      steps: scenario.steps.map((step) => ({ keyword: step.keyword.trim(), text: step.text, line: step.location.line })),
      pickles: compiled,
      hash: hashPickles(compiled)
    }
  })

  return { scenarios, rules, problems: problems.sort((a, b) => a.line - b.line) }
}

/**
 * A `.feature` file with `tag` added to its first tag line, before a comment on it; undefined when
 * no tag line is above its Feature.
 */
export const withTag = (content: string, tag: string): string | undefined => {
  const parsed = parseDocument(content, IdGenerator.incrementing())
  const [first] = Result.isSuccess(parsed) ? parsed.success.feature?.tags ?? [] : []
  if (first === undefined) return undefined
  const lines = content.split("\n")
  const index = first.location.line - 1
  const line = lines[index]!
  const end = /\s+#/.exec(line)?.index ?? line.trimEnd().length
  lines[index] = `${line.slice(0, end)} ${tag}${line.slice(end)}`
  return lines.join("\n")
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

/**
 * The slug of a title, or of a rule's or a scenario's name: its words in any script, lower-case and
 * joined by `-`, a Latin letter without its accents, so "Die Größe zählt" → "die-große-zahlt" and
 * "Корзина пуста" → "корзина-пуста". A word is letters and digits with the marks they carry, so a
 * mark on nothing is dropped: only a text without a letter or a digit has no slug.
 */
export const slugify = (text: string): string =>
  shortened(
    text.normalize("NFKD").replace(/(\p{Script=Latin})\p{M}+/gu, "$1").normalize("NFC").toLowerCase()
      .split(idWordBreak).map((word) => word.replace(/^\p{M}+/u, "")).filter((word) => word !== "").join("-")
  )

/** A slug of at most 64 characters, cut after the last whole word that fits, so an id never ends in half a word. */
const shortened = (slug: string): string => {
  if (slug.length <= 64) return slug
  const cut = slug.lastIndexOf("-", 64)
  return cut > 0 ? slug.slice(0, cut) : [...slug].slice(0, 64).join("")
}

/** Everything a step handler can observe of a scenario: each example's name, tags (inherited ones too) and steps with their arguments. */
const hashPickles = (pickles: ReadonlyArray<Pickle>): string =>
  createHash("sha1")
    .update(JSON.stringify(pickles.map((p) => [p.name, p.tags, p.steps.map((s) => [s.text, s.docString ?? null, s.dataTable ?? null])])))
    .digest("hex")
    .slice(0, 12)
