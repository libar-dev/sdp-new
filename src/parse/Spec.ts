/**
 * A spec is a Gherkin file whose Feature's tags say what it is: `@id=REQ-x`, its kind, its
 * attributes and its links. A Markdown file whose front matter has an `id` is one too, with its
 * Gherkin in fences, until the last of them is converted. Either way the same format covers an
 * idea written in one line and a fully designed, executable specification: maturity is a property
 * of the content, not of the format.
 */
import { annotate } from "sdp/annotations"
import { Predicate, Result } from "effect"
import type { Config } from "../model/Config.ts"
import { type Diagnostic, diagnostic } from "../model/Diagnostic.ts"
import type { Attrs } from "../model/Graph.ts"
import { activityRelation, linkKeys, made, type Vocabulary } from "../model/Vocabulary.ts"
import {
  type GherkinError,
  gherkinLangs,
  type GherkinResult,
  type LinkDecl,
  parseFeatureFile,
  parseGherkinFences,
  type Rule,
  type Scenario
} from "./Gherkin.ts"
import { type Json, type Located, type OpenQuestion, parseMarkdown, type Prose, type Reference, type Section } from "./Markdown.ts"

/** A node declared inside another spec's front matter (`nodes:`), e.g. phases and iterations of a plan. */
export interface InlineNode {
  readonly id: string
  readonly kind: string
  readonly title: string
  readonly attrs: Attrs
  /** Line of each attribute, as for a spec. */
  readonly attrLines: Readonly<Record<string, number>>
  readonly links: ReadonlyArray<LinkDecl>
  /** Line of its `id`. */
  readonly line: number
}

export interface Spec {
  readonly file: string
  readonly format: "markdown" | "feature"
  readonly id: string
  readonly kind: string
  readonly title: string
  readonly attrs: Attrs
  readonly tags: ReadonlyArray<string>
  readonly links: ReadonlyArray<LinkDecl>
  readonly references: ReadonlyArray<Reference>
  readonly inlineNodes: ReadonlyArray<InlineNode>
  readonly scenarios: ReadonlyArray<Scenario>
  /** The `Rule:` blocks: what must hold, each with its reason; the scenarios name the rule they are examples of. */
  readonly rules: ReadonlyArray<Rule>
  readonly openQuestions: ReadonlyArray<OpenQuestion>
  /** The first paragraph: the description the criteria of draft ask for. */
  readonly summary: string
  /** Paragraphs, lists and quotes, as written; of a Feature, the paragraphs of its description. */
  readonly prose: ReadonlyArray<Prose>
  readonly sections: ReadonlyArray<Section>
  readonly body: string
  /**
   * Line of each front matter attribute, and of each entry of a map attribute as
   * `<key>.<entry>`, so facts derived from one can point at it.
   */
  readonly attrLines: Readonly<Record<string, number>>
}

export interface ParsedFile {
  readonly spec: Spec | undefined
  readonly diagnostics: ReadonlyArray<Diagnostic>
}

const gherkinHint = "fix the Gherkin at this line; the spec's scenarios do not run until it parses"

const reserved = new Set(["id", "kind", "title", "links", "nodes"])

/** Parses one Markdown spec — front matter, links, inline nodes, prose links, open questions and Gherkin — with exact lines. */
export const parseMarkdownSpec = (file: string, content: string, config: Config): ParsedFile => {
  const md = parseMarkdown(content)
  const diagnostics: Array<Diagnostic> = []
  if (md.frontMatterError) {
    diagnostics.push(diagnostic("front-matter", {
      message: `invalid front matter: ${md.frontMatterError.message}`,
      source: { file, line: md.frontMatterError.line },
      hint: "fix the YAML between the --- lines; until then the file is not part of the graph"
    }))
    return { spec: undefined, diagnostics }
  }
  const front = md.frontMatter
  const id = front && usableId(field(front, "id"))
  if (!front || id === undefined) {
    // Plainly meant as a spec: without an id its scenarios would be dropped silently.
    const meant = front?.data.kind !== undefined
      ? `front matter declares kind "${String(front.data.kind)}"`
      : md.fences.some((fence) => gherkinLangs.has(fence.lang))
      ? "the file has a Gherkin block"
      : undefined
    if (meant) {
      diagnostics.push(diagnostic("missing-id", {
        message: `${meant} but no id, so the file is not part of the graph`,
        source: { file, line: 1 },
        hint: "add `id: <PREFIX>-<slug>` to the front matter; a document that only shows Gherkin as an example belongs under `exclude`"
      }))
    }
    return { spec: undefined, diagnostics }
  }
  const fm = front.data
  const kind = writtenKind(fm.kind, { file, owner: id, line: field(front, "kind")?.line ?? 1 }, diagnostics) ?? inferKind(id, config)
  const title = Predicate.isString(fm.title) ? fm.title : md.title ?? id
  const tags = normalizeTags(fm.tags)
  const attrs = attributesOf(front)
  if (tags.length > 0) attrs.tags = tags

  const gherkin = parseGherkinFences({ specId: id, title, tags: [...tags, kind], fences: md.fences })
  diagnostics.push(...gherkinDiagnostics(id, file, gherkin))

  return {
    spec: {
      file,
      format: "markdown",
      id,
      kind,
      title,
      attrs,
      tags,
      links: readLinks(front, config.vocabulary, { file, owner: id }, diagnostics),
      references: md.references,
      inlineNodes: readInlineNodes(field(front, "nodes"), config, file, diagnostics),
      scenarios: gherkin.scenarios,
      rules: gherkin.rules,
      openQuestions: [...md.openQuestions, ...openIn(gherkin)],
      summary: md.summary,
      prose: md.prose,
      sections: md.sections,
      body: md.body,
      attrLines: attributeLines(front)
    },
    diagnostics
  }
}
annotate(parseMarkdownSpec, { is: "ARCH-spec-parser", "instance-of": "PAT-pipes-and-filters" })

/**
 * A `.feature` file is a spec: the tags above `Feature:` say what it is — `@id=`, `@kind=` and any
 * other `@key=value` its identity and attributes, `@rel:ID` its links, any other tag a Cucumber
 * tag its scenarios inherit, as they inherit its kind. The Feature's name is its title and the
 * paragraphs under it its description. A file without an `@id=` is a spec named by its path.
 */
export const parseFeatureSpec = (file: string, content: string, config: Config): ParsedFile => {
  const fallbackId = `feature:${file}`
  const parsed = parseFeatureFile(content)
  if (Result.isFailure(parsed)) return { spec: undefined, diagnostics: syntaxDiagnostics(fallbackId, file, parsed.failure) }
  const { feature, read } = parsed.success
  if (!feature) return { spec: undefined, diagnostics: [] }
  const diagnostics: Array<Diagnostic> = []
  const { attrLines, links } = feature
  const { id: writtenId, kind: rawKind, ...attrs } = feature.attrs
  const id = Predicate.isString(writtenId) || Predicate.isNumber(writtenId) ? String(writtenId) : fallbackId
  const kind = writtenKind(rawKind, { file, owner: id, line: attrLines.kind ?? 1 }, diagnostics) ??
    (id === fallbackId ? "feature" : inferKind(id, config))
  const gherkin = read(id, [kind])
  diagnostics.push(...gherkinDiagnostics(id, file, gherkin))
  // A scenario is an example of a rule. A file named by its path is a suite sdp runs as it is.
  const outside = gherkin.scenarios.filter((scenario) => scenario.rule === undefined)
  if (outside.length > 0 && id !== fallbackId && config.rules === "required") {
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
      format: "feature",
      id,
      kind,
      title: feature.name || id,
      attrs: tags.length > 0 ? { ...attrs, tags } : attrs,
      tags,
      links,
      references: [],
      inlineNodes: [],
      scenarios: gherkin.scenarios,
      rules: gherkin.rules,
      openQuestions: openIn(gherkin),
      summary: feature.description[0]?.text ?? "",
      prose: feature.description,
      sections: [],
      body: content,
      attrLines
    },
    diagnostics
  }
}
annotate(parseFeatureSpec, { is: "ARCH-spec-parser" })

/** A Rule or a Scenario tagged `@open` is a question still open, and its name is the question. */
const openIn = (gherkin: GherkinResult): ReadonlyArray<OpenQuestion> =>
  [...gherkin.rules, ...gherkin.scenarios]
    .filter((element) => element.tags.includes(made.tags.open))
    .map((element) => ({ text: element.name, line: element.line, resolved: false }))
    .sort((a, b) => a.line - b.line)

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
const gherkinDiagnostics = (id: string, file: string, gherkin: GherkinResult): ReadonlyArray<Diagnostic> => [
  ...syntaxDiagnostics(id, file, gherkin.errors),
  ...gherkin.problems.map((problem) =>
    diagnostic(problem.rule, { message: problem.message, node: id, source: { file, line: problem.line }, hint: problem.hint })
  )
]

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

/** `REQ-foo` → `requirement` when the config maps that prefix; otherwise `spec`. */
export const inferKind = (id: string, config: Config): string => {
  const prefix = /^([A-Za-z]+)[-_]/.exec(id)?.[1]
  if (prefix) {
    for (const [kind, p] of Object.entries(config.ids)) {
      if (p.toLowerCase() === prefix.toLowerCase()) return kind
    }
  }
  return "spec"
}

const normalizeTags = (value: unknown): ReadonlyArray<string> => {
  if (Predicate.isString(value)) return value.split(/[\s,]+/).filter(Boolean).map((t) => t.replace(/^@/, ""))
  if (Array.isArray(value)) return value.filter(Predicate.isString).map((t) => t.replace(/^@/, ""))
  return []
}

/** The value of a front matter key, if the mapping has it. */
const field = (map: Located, key: string): Located | undefined => map.entries?.find((entry) => entry.key === key)?.value

/** The rule for every id, of a spec or of an inline node: a string, trimmed, not empty. */
const usableId = (value: Located | undefined): string | undefined =>
  Predicate.isString(value?.data) && value.data.trim() !== "" ? value.data.trim() : undefined

const attributesOf = (map: Located): Record<string, unknown> =>
  Object.fromEntries((map.entries ?? []).filter((entry) => !reserved.has(entry.key)).map((entry) => [entry.key, entry.value.data]))

/** The line of each attribute, and of each entry of a map attribute as `<key>.<entry>`. */
const attributeLines = (map: Located): Record<string, number> =>
  Object.fromEntries(
    (map.entries ?? []).filter((entry) => !reserved.has(entry.key)).flatMap((entry) => [
      [entry.key, entry.line] as const,
      ...(entry.value.entries ?? []).map((inner) => [`${entry.key}.${inner.key}`, inner.line] as const)
    ])
  )

const linkHint = "use `links: { <rel>: <ID> | [<ID>, ...] | { to: <ID>, ...attrs } }`"

/** Collects links in every shape a link key takes, each at the line of its target; a value without a target is an error there. */
const collectLinks = (at: { readonly file: string; readonly owner: string }, diagnostics: Array<Diagnostic>) => {
  const links: Array<LinkDecl> = []
  const invalid = (message: string, line: number) =>
    diagnostics.push(diagnostic("link-syntax", { message, node: at.owner, source: { file: at.file, line }, hint: linkHint }))
  const add = (rel: string, target: Located) => {
    const { data } = target
    const to = target.entries ? field(target, "to") : undefined
    if (Predicate.isString(data)) {
      for (const id of data.split(",").map((t) => t.trim()).filter(Boolean)) links.push({ rel, to: id, line: target.line })
    } else if (Predicate.isNumber(data)) {
      links.push({ rel, to: String(data), line: target.line })
    } else if (target.items) {
      for (const item of target.items) add(rel, item)
    } else if (to !== undefined && Predicate.isString(to.data)) {
      const attrs = Object.fromEntries((target.entries ?? []).filter((e) => e.key !== "to" && e.key !== "rel").map((e) => [e.key, e.value.data]))
      links.push({ rel, to: to.data, attrs, line: to.line })
    } else {
      invalid(`${rel}: ${JSON.stringify(data)} has no target`, target.line)
    }
  }
  return { links, add, invalid }
}

/**
 * The keys the vocabulary names as links — the plan and phase relations, a workspace's own link
 * keys, and each discipline of `activity` under `activity.<discipline>`.
 */
const addKeyLinks = (map: Located, vocabulary: Vocabulary, add: (rel: string, target: Located) => void) => {
  for (const key of linkKeys(vocabulary)) {
    const value = field(map, key)
    if (value !== undefined) add(key, value)
  }
  const activity = field(map, vocabulary.attributes.activity)
  for (const entry of activity?.entries ?? []) add(activityRelation(vocabulary, entry.key), entry.value)
}

/**
 * The links a spec or an inline node declares (ARCH-graph-builder): everything under `links:`, in every
 * shape people naturally write, and the keys the vocabulary names as links, each link at the line
 * of its target:
 *   links: { refines: CAP-x, uses: [A, B], calls: { to: C, via: http } }
 *   links: [ { rel: uses, to: A, note: sync } ]
 *   iteration: E1
 * An empty `links:` declares none; anything else is an error where it is written.
 */
const readLinks = (
  map: Located,
  vocabulary: Vocabulary,
  at: { readonly file: string; readonly owner: string },
  diagnostics: Array<Diagnostic>
): ReadonlyArray<LinkDecl> => {
  const { add, invalid, links } = collectLinks(at, diagnostics)
  const value = field(map, "links")
  if (value === undefined || value.data === null) {
    // No links under `links:`.
  } else if (value.items) {
    for (const item of value.items) {
      const rel = item.entries ? field(item, "rel")?.data : undefined
      if (Predicate.isString(rel) && Predicate.isString(field(item, "to")?.data)) add(rel, item)
      else invalid(`a link in a list needs rel and to: ${JSON.stringify(item.data)}`, item.line)
    }
  } else if (value.entries) {
    for (const entry of value.entries) add(entry.key, entry.value)
  } else {
    invalid(`links must be a map or a list, not ${JSON.stringify(value.data)}`, value.line)
  }
  addKeyLinks(map, vocabulary, add)
  return links
}

/** Attribute data as a located value, every part of it at `line`. */
const locatedAt = (value: unknown, line: number): Located => {
  const data = value as Json
  if (Array.isArray(value)) return { line, data, items: value.map((item) => locatedAt(item, line)) }
  if (!Predicate.isObject(value)) return { line, data }
  return { line, data, entries: Object.entries(value).map(([key, entry]) => ({ key, line, value: locatedAt(entry, line) })) }
}

/** The links of attributes that are written on one line — feature tags, a code annotation — where they name link keys. */
export const linksOfKeys = (
  attrs: Attrs,
  vocabulary: Vocabulary,
  at: { readonly file: string; readonly owner: string; readonly line: number },
  diagnostics: Array<Diagnostic>
): ReadonlyArray<LinkDecl> => {
  const { add, links } = collectLinks(at, diagnostics)
  addKeyLinks(locatedAt(attrs, at.line), vocabulary, add)
  return links
}

/** `nodes:` is a list of maps, each with an id; an empty `nodes:` declares none. */
const readInlineNodes = (
  value: Located | undefined,
  config: Config,
  file: string,
  diagnostics: Array<Diagnostic>
): ReadonlyArray<InlineNode> => {
  if (value === undefined || value.data === null) return []
  const invalid = (message: string, line: number) =>
    diagnostics.push(diagnostic("inline-node", { message, source: { file, line }, hint: "write `nodes: [{ id: <ID>, kind: <kind>, ... }]`" }))
  if (!value.items) {
    invalid(`nodes must be a list, not ${JSON.stringify(value.data)}`, value.line)
    return []
  }
  const nodes: Array<InlineNode> = []
  for (const item of value.items) {
    const id = item.entries ? usableId(field(item, "id")) : undefined
    if (id === undefined) {
      invalid(`an entry under nodes needs an id: ${JSON.stringify(item.data)}`, item.line)
      continue
    }
    const kind = field(item, "kind")
    const title = field(item, "title")?.data
    const line = item.entries!.find((entry) => entry.key === "id")!.line
    nodes.push({
      id,
      kind: writtenKind(kind?.data, { file, owner: id, line: kind?.line ?? line }, diagnostics) ?? inferKind(id, config),
      title: Predicate.isString(title) ? title : id,
      attrs: attributesOf(item),
      attrLines: attributeLines(item),
      links: readLinks(item, config.vocabulary, { file, owner: id }, diagnostics),
      line
    })
  }
  return nodes
}
