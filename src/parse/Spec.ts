/**
 * A spec is a Gherkin file whose Feature's tags say what it is: `@id=guest-checkout`, its kind, its
 * attributes and its links. The same format covers an idea written in one line and a fully
 * designed, executable specification: how far it has come is the team's judgement, not a matter of format.
 */
import { Predicate, Result } from "effect"
import type { Config } from "../model/Config.ts"
import { type Diagnostic, diagnostic } from "../model/Diagnostic.ts"
import type { Attrs } from "../model/Graph.ts"
import { isLinkKey, made, wordFor } from "../model/Vocabulary.ts"
import { type GherkinError, type GherkinResult, type LinkDecl, type Paragraph, parseFeatureFile, type Rule, type Scenario } from "./Gherkin.ts"

/** A Rule tagged `@open`: its name is the question. */
export interface OpenQuestion {
  readonly text: string
  readonly line: number
}

export interface Spec {
  readonly file: string
  readonly id: string
  readonly kind: string
  readonly title: string
  readonly attrs: Attrs
  readonly links: ReadonlyArray<LinkDecl>
  readonly scenarios: ReadonlyArray<Scenario>
  /** The `Rule:` blocks: what must hold, each with its reason; the scenarios name the rule they are examples of. */
  readonly rules: ReadonlyArray<Rule>
  readonly openQuestions: ReadonlyArray<OpenQuestion>
  /** The first paragraph: who needs what, and why. */
  readonly summary: string
  /** The paragraphs under the Feature. */
  readonly description: ReadonlyArray<Paragraph>
  /** The file as written. */
  readonly body: string
  /** The line of each attribute's tag. */
  readonly attrLines: Readonly<Record<string, number>>
}

export interface ParsedFile {
  readonly spec: Spec | undefined
  readonly diagnostics: ReadonlyArray<Diagnostic>
}

const gherkinHint = "fix the Gherkin at this line; the spec's scenarios do not run until it parses"

/** The id of a feature file without an `@id=`: someone else's suite, named by its path. */
export const suiteId = (file: string): string => `suite:${file}`

/**
 * A `.feature` file is a spec: the tags above `Feature:` say what it is — `@id=`, `@kind=` and any
 * other `@key=value` its identity and attributes, `@rel:ID` its links, any other tag a Cucumber
 * tag its scenarios inherit, as they inherit its kind. The Feature's name is its title and the
 * paragraphs under it its description. A file without an `@id=` is a suite named by its path.
 *
 * @sdp is ARCH-spec-parser
 */
export const parseFeatureSpec = (file: string, content: string, config: Config): ParsedFile => {
  const fallbackId = suiteId(file)
  const parsed = parseFeatureFile(content, (key) => isLinkKey(config.vocabulary, key))
  if (Result.isFailure(parsed)) return { spec: undefined, diagnostics: syntaxDiagnostics(fallbackId, file, parsed.failure) }
  const { feature, read } = parsed.success
  if (!feature) return { spec: undefined, diagnostics: [] }
  const diagnostics: Array<Diagnostic> = []
  const { attrLines, links } = feature
  const { id: writtenId, kind: rawKind, ...attrs } = feature.attrs
  const id = Predicate.isString(writtenId) ? writtenId : fallbackId
  const kind = writtenKind(rawKind, { file, owner: id, line: attrLines.kind ?? 1 }, diagnostics) ??
    (id === fallbackId ? "suite" : inferKind(id, config))
  const gherkin = read(id, [kind])
  diagnostics.push(...gherkinDiagnostics(id, file, gherkin))
  // A scenario is an example of a rule. A file named by its path is a suite sdp runs as it is.
  const outside = gherkin.scenarios.filter((scenario) => scenario.rule === undefined)
  if (outside.length > 0 && id !== fallbackId) {
    diagnostics.push(diagnostic("scenario-outside-rule", {
      message: `${id}: "${outside[0]!.name}" is an example of no rule${outside.length > 1 ? `, nor are ${outside.length - 1} more` : ""}`,
      node: id,
      source: { file, line: outside[0]!.line },
      hint: "put each scenario under the `Rule:` it is an example of: the rule's name says what must hold, the lines under it why"
    }))
  }
  const tags = feature.tags.map((tag) => tag.slice(1))
  return {
    spec: {
      file,
      id,
      kind,
      title: feature.name || id,
      attrs: tags.length > 0 ? { ...attrs, tags } : attrs,
      links,
      scenarios: gherkin.scenarios,
      rules: gherkin.rules,
      openQuestions: openIn(gherkin),
      summary: feature.description[0]?.text ?? "",
      description: feature.description,
      body: content,
      attrLines
    },
    diagnostics
  }
}

/** A Rule tagged `@open` is a question still open, and its name is the question; a Scenario is an example, tagged so or not. */
const openIn = (gherkin: GherkinResult): ReadonlyArray<OpenQuestion> =>
  gherkin.rules
    .filter((rule) => rule.tags.includes(made.tags.open))
    .map((rule) => ({ text: rule.name, line: rule.line }))

/** Parse errors cascade: the first one is what needs fixing. */
const syntaxDiagnostics = (id: string, file: string, errors: ReadonlyArray<GherkinError>): ReadonlyArray<Diagnostic> =>
  errors.slice(0, 1).map((error) =>
    diagnostic("gherkin-syntax", {
      message: `${error.message}${errors.length > 1 ? ` (and ${errors.length - 1} follow-on errors)` : ""}`,
      node: id,
      source: { file, line: error.line },
      hint: gherkinHint
    })
  )

/** What the Gherkin of a spec reports, as diagnostics of that spec. */
const gherkinDiagnostics = (id: string, file: string, gherkin: GherkinResult): ReadonlyArray<Diagnostic> =>
  gherkin.problems.map((problem) =>
    diagnostic(problem.rule, { message: problem.message, node: id, source: { file, line: problem.line }, hint: problem.hint })
  )

/**
 * The kind an author gives a node, if any. The kinds sdp makes itself are not an author's to give:
 * one written is an error, and the node is of the kind its id says.
 */
export const writtenKind = (
  written: unknown,
  at: { readonly file: string; readonly owner: string; readonly line: number },
  diagnostics: Array<Diagnostic>
): string | undefined => {
  if (!Predicate.isString(written)) return undefined
  if (!Object.values<string>(made.kinds).includes(written)) return written
  diagnostics.push(diagnostic("derived-attribute", {
    message: `${at.owner}: sdp makes the nodes of kind ${written} itself, so the kind written here is ignored`,
    node: at.owner,
    source: { file: at.file, line: at.line },
    hint: "give it a kind of your own; `sdp vocabulary` lists the kinds sdp makes"
  }))
  return undefined
}

/**
 * `ARCH-orders` → `element` when the config maps that prefix, written as it is configured: `it-` and
 * `ms-` begin words as often as ids. An id with no prefix it maps names no kind.
 */
export const prefixKind = (id: string, config: Config): string | undefined => {
  const prefix = /^([A-Za-z]+)[-_]/.exec(id)?.[1]
  if (prefix === undefined) return undefined
  return Object.entries(config.ids).find(([, p]) => p === prefix)?.[0]
}

/** The kind an id's prefix names; otherwise, as `guest-checkout`, a feature. */
export const inferKind = (id: string, config: Config): string => prefixKind(id, config) ?? wordFor(config.vocabulary.kinds.feature)
