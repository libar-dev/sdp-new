/**
 * A spec is any Markdown file whose front matter has an `id`. The same format
 * covers an idea written in one line and a fully designed, executable
 * specification: maturity is a property of the content, not of the format.
 */
import { annotate } from "sdp/annotations"
import { Predicate } from "effect"
import type { Config } from "../model/Config.ts"
import type { Diagnostic } from "../model/Diagnostic.ts"
import type { Attrs } from "../model/Graph.ts"
import { gherkinLangs, parseFeatureFile, parseGherkinFences, type Scenario } from "./Gherkin.ts"
import { frontMatterKeyLine, frontMatterLineOf, type MarkdownDoc, type OpenQuestion, parseMarkdown, type Reference } from "./Markdown.ts"

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
  readonly links: ReadonlyArray<LinkDecl>
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
  readonly summary: string
  readonly headings: ReadonlyArray<string>
  readonly body: string
  /** File line of the body's first line (the line after the front matter). */
  readonly bodyLine: number
  /** Fenced gherkin blocks present (even if empty or unparseable). */
  readonly hasGherkin: boolean
  /** Line of each top-level front matter attribute, so facts derived from one can point at it. */
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
    diagnostics.push({
      rule: "front-matter",
      severity: "error",
      message: `invalid front matter: ${md.frontMatterError.message}`,
      source: { file, line: md.frontMatterError.line },
      hint: "fix the YAML between the --- lines; until then the file is not part of the graph"
    })
    return { spec: undefined, diagnostics }
  }
  const fm = md.frontMatter
  if (!fm || !Predicate.isString(fm.id) || fm.id.trim() === "") {
    // Plainly meant as a spec: without an id its scenarios would be dropped silently.
    const meant = fm?.kind !== undefined
      ? `front matter declares kind "${String(fm.kind)}"`
      : md.fences.some((fence) => gherkinLangs.has(fence.lang))
      ? "the file has a Gherkin block"
      : undefined
    if (meant) {
      diagnostics.push({
        rule: "missing-id",
        severity: "error",
        message: `${meant} but no id, so the file is not part of the graph`,
        source: { file, line: 1 },
        hint: "add `id: <PREFIX>-<slug>` to the front matter; a document that only shows Gherkin as an example belongs under `exclude`"
      })
    }
    return { spec: undefined, diagnostics }
  }
  const id = fm.id.trim()
  const kind = Predicate.isString(fm.kind) ? fm.kind : inferKind(id, config)
  const title = Predicate.isString(fm.title) ? fm.title : md.title ?? id
  const tags = normalizeTags(fm.tags)
  const attrs = Object.fromEntries(Object.entries(fm).filter(([key]) => !reserved.has(key)))
  if (tags.length > 0) attrs.tags = tags

  const gherkin = parseGherkinFences({ specId: id, title, tags: [...tags, kind], fences: md.fences })
  // Parse errors cascade; the first one is what needs fixing.
  for (const error of gherkin.errors.slice(0, 1)) {
    const more = gherkin.errors.length > 1 ? ` (and ${gherkin.errors.length - 1} follow-on errors)` : ""
    diagnostics.push({
      rule: "gherkin-syntax",
      severity: "error",
      message: `${error.message}${more}`,
      node: id,
      source: { file, line: error.line },
      hint: gherkinHint
    })
  }

  const links = normalizeLinks(fm.links, {
    file,
    owner: id,
    line: frontMatterKeyLine(md, "links"),
    lineOf: (to) => frontMatterLineOf(md, to)
  }, diagnostics)
  const inlineNodes = normalizeInlineNodes(fm.nodes, md, config, file, diagnostics)

  return {
    spec: {
      file,
      format: "markdown",
      id,
      kind,
      title,
      attrs,
      tags,
      links,
      references: md.references,
      inlineNodes,
      scenarios: gherkin.scenarios,
      openQuestions: md.openQuestions,
      summary: md.summary,
      headings: md.headings.map((h) => h.text),
      body: md.body,
      bodyLine: md.frontMatterLines + 1,
      hasGherkin: md.fences.some((fence) => gherkinLangs.has(fence.lang)),
      attrLines: Object.fromEntries(Object.keys(attrs).map((key) => [key, frontMatterKeyLine(md, key)]))
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
  const diagnostics: Array<Diagnostic> = parsed.errors.map((error) => ({
    rule: "gherkin-syntax",
    severity: "error" as const,
    message: error.message,
    node: id,
    source: { file, line: error.line },
    hint: gherkinHint
  }))
  if (!parsed.featureName && parsed.errors.length === 0) return { spec: undefined, diagnostics }
  const plainTags = parsed.featureTags.filter((tag) => !tagValue.test(tag)).map((tag) => tag.slice(1))
  const { id: _id, kind: rawKind, title: rawTitle, ...rest } = meta
  const attrs: Record<string, unknown> = { ...rest }
  if (plainTags.length > 0) attrs.tags = plainTags
  return {
    spec: {
      file,
      format: "feature",
      id,
      kind: rawKind ?? (meta.id ? inferKind(id, config) : "feature"),
      title: rawTitle ?? parsed.featureName ?? id,
      attrs,
      tags: plainTags,
      links: [],
      references: [],
      inlineNodes: [],
      scenarios: parsed.scenarios,
      openQuestions: [],
      summary: parsed.description?.split("\n\n")[0]?.replace(/\s+/g, " ") ?? "",
      headings: [],
      body: content,
      bodyLine: 1,
      hasGherkin: true,
      attrLines: {}
    },
    diagnostics
  }
}
annotate(parseFeatureSpec, { is: "ARCH-spec-parser" })

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

/**
 * Accepts every shape people naturally write:
 *   links: { refines: CAP-x, uses: [A, B], calls: { to: C, via: http } }
 *   links: [ { rel: uses, to: A, note: sync } ]
 */
export const normalizeLinks = (
  value: unknown,
  at: {
    readonly file: string
    readonly owner: string
    /** Where unusable links are reported: the `links:` key. */
    readonly line: number
    /** Where a link to `target` is written. */
    readonly lineOf: (target: string) => number
  },
  diagnostics: Array<Diagnostic>
): ReadonlyArray<LinkDecl> => {
  const { file, lineOf, owner } = at
  if (value === undefined || value === null) return []
  const links: Array<LinkDecl> = []
  const invalid = (what: string) =>
    diagnostics.push({
      rule: "link-syntax",
      severity: "warning",
      message: `ignored link ${what}`,
      node: owner,
      source: { file, line: at.line },
      hint: "use `links: { <rel>: <ID> | [<ID>, ...] | { to: <ID>, ...attrs } }`"
    })
  const add = (rel: string, target: unknown) => {
    if (Predicate.isString(target)) {
      for (const to of target.split(",").map((t) => t.trim()).filter(Boolean)) links.push({ rel, to, line: lineOf(to) })
    } else if (Predicate.isNumber(target)) {
      links.push({ rel, to: String(target), line: lineOf(String(target)) })
    } else if (Array.isArray(target)) {
      for (const t of target) add(rel, t)
    } else if (Predicate.isObject(target) && Predicate.isString((target as Record<string, unknown>).to)) {
      const { to, rel: _rel, ...attrs } = target as Record<string, unknown>
      links.push({ rel, to: String(to), attrs, line: lineOf(String(to)) })
    } else {
      invalid(`${rel}: ${JSON.stringify(target)}`)
    }
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      if (Predicate.isObject(item) && Predicate.isString((item as Record<string, unknown>).rel)) {
        add(String((item as Record<string, unknown>).rel), item)
      } else invalid(JSON.stringify(item))
    }
  } else if (Predicate.isObject(value)) {
    for (const [rel, target] of Object.entries(value)) add(rel, target)
  } else {
    invalid(JSON.stringify(value))
  }
  return links
}

const normalizeInlineNodes = (
  value: unknown,
  md: MarkdownDoc,
  config: Config,
  file: string,
  diagnostics: Array<Diagnostic>
): ReadonlyArray<InlineNode> => {
  if (!Array.isArray(value)) return []
  const nodes: Array<InlineNode> = []
  for (const item of value) {
    if (!Predicate.isObject(item) || !Predicate.isString((item as Record<string, unknown>).id)) {
      diagnostics.push({
        rule: "inline-node",
        severity: "warning",
        message: `ignored entry under nodes: ${JSON.stringify(item)}`,
        source: { file, line: frontMatterKeyLine(md, "nodes") },
        hint: "each entry needs at least an `id`"
      })
      continue
    }
    const record = item as Record<string, unknown>
    const id = String(record.id)
    const declared = frontMatterLineOf(md, `id: ${id}`)
    const line = declared === 1 ? frontMatterLineOf(md, id) : declared
    const attrs = Object.fromEntries(Object.entries(record).filter(([key]) => !reserved.has(key)))
    nodes.push({
      id,
      kind: Predicate.isString(record.kind) ? record.kind : inferKind(id, config),
      title: Predicate.isString(record.title) ? record.title : id,
      attrs,
      links: normalizeLinks(record.links, { file, owner: id, line, lineOf: () => line }, diagnostics),
      line
    })
  }
  return nodes
}
