/**
 * A spec is any Markdown file whose front matter has an `id`. The same format
 * covers an idea written in one line and a fully designed, executable
 * specification: maturity is a property of the content, not of the format.
 */
import { annotate } from "sdp/annotations"
import { Predicate } from "effect"
import type { Config } from "../model/Config.ts"
import { type Diagnostic, diagnostic } from "../model/Diagnostic.ts"
import type { Attrs } from "../model/Graph.ts"
import { activityRelation, linkKeys, made, type Vocabulary } from "../model/Vocabulary.ts"
import { gherkinLangs, parseFeatureFile, parseGherkinFences, type Scenario } from "./Gherkin.ts"
import { type Json, type Located, type OpenQuestion, parseMarkdown, type Prose, type Reference, type Section } from "./Markdown.ts"

export interface LinkDecl {
  readonly rel: string
  readonly to: string
  readonly attrs?: Attrs | undefined
  readonly line: number
}

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
  readonly openQuestions: ReadonlyArray<OpenQuestion>
  /** The first paragraph: the description the draft gate asks for. */
  readonly summary: string
  /** Paragraphs, lists and quotes, as written. */
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
  // Parse errors cascade; the first one is what needs fixing.
  for (const error of gherkin.errors.slice(0, 1)) {
    const more = gherkin.errors.length > 1 ? ` (and ${gherkin.errors.length - 1} follow-on errors)` : ""
    diagnostics.push(diagnostic("gherkin-syntax", {
      message: `${error.message}${more}`,
      node: id,
      source: { file, line: error.line },
      hint: gherkinHint
    }))
  }

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
      openQuestions: md.openQuestions,
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
 * Classic `.feature` files join the graph too. Metadata travels in tags:
 * `@id:REQ-x @kind:requirement @maturity:ready`; other `@key:value` tags become attributes.
 */
export const parseFeatureSpec = (file: string, content: string, config: Config): ParsedFile => {
  const tagValue = /^@([\w-]+):(.+)$/
  const fallbackId = `feature:${file}`
  const firstPass = parseFeatureFile(fallbackId, content)
  const meta: Record<string, string> = {}
  for (const tag of firstPass.featureTags) {
    const m = tagValue.exec(tag)
    if (m) meta[m[1]!] = m[2]!
  }
  const id = meta.id ?? fallbackId
  const parsed = id === fallbackId ? firstPass : parseFeatureFile(id, content)
  const diagnostics: Array<Diagnostic> = parsed.errors.map((error) =>
    diagnostic("gherkin-syntax", { message: error.message, node: id, source: { file, line: error.line }, hint: gherkinHint })
  )
  if (!parsed.featureName && parsed.errors.length === 0) return { spec: undefined, diagnostics }
  const plainTags = parsed.featureTags.filter((tag) => !tagValue.test(tag)).map((tag) => tag.slice(1))
  const { id: _id, kind: rawKind, title: rawTitle, ...rest } = meta
  const attrs: Record<string, unknown> = { ...rest }
  if (plainTags.length > 0) attrs.tags = plainTags
  // Tags sit on the lines above `Feature:`; the first line is where to look.
  const at = { file, owner: id, line: 1 }
  return {
    spec: {
      file,
      format: "feature",
      id,
      kind: writtenKind(rawKind, at, diagnostics) ?? (meta.id ? inferKind(id, config) : "feature"),
      title: rawTitle ?? parsed.featureName ?? id,
      attrs,
      tags: plainTags,
      links: linksOfKeys(rest, config.vocabulary, at, diagnostics),
      references: [],
      inlineNodes: [],
      scenarios: parsed.scenarios,
      openQuestions: [],
      summary: parsed.description?.split("\n\n")[0]?.replace(/\s+/g, " ") ?? "",
      prose: [],
      sections: [],
      body: content,
      attrLines: {}
    },
    diagnostics
  }
}
annotate(parseFeatureSpec, { is: "ARCH-spec-parser" })

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
 * The links a spec or an inline node declares ([[DEC-0010]]): everything under `links:`, in every
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
