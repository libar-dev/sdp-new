/**
 * Reads one Markdown file — YAML front matter, then a CommonMark body — once, into everything
 * later stages need: front matter as JSON data in which every value keeps its line, the fenced
 * code blocks, the prose with its sections and summary, open questions and wiki-links. The body
 * is parsed by a CommonMark parser, so what a renderer shows as code or HTML, or hides in the
 * destination of a link, is never read as a scenario, a link or a question. Every fact keeps its
 * 1-based file line.
 */
import { annotate } from "sdp/annotations"
import { Predicate } from "effect"
import type { Heading, List, Nodes, Paragraph } from "mdast"
import { fromMarkdown } from "mdast-util-from-markdown"
import { type Document, isAlias, isMap, isNode, isScalar, isSeq, LineCounter, parseDocument } from "yaml"

annotate(import.meta, { is: "ARCH-spec-parser" })

export interface Fence {
  readonly lang: string
  /** Line of the opening fence. */
  readonly line: number
  /** Line of the first content line (opening fence + 1). */
  readonly contentLine: number
  readonly lines: ReadonlyArray<string>
}

export interface Reference {
  readonly id: string
  readonly line: number
  /** Relation for typed inline links (`rel:: [[ID]]`); undefined for plain `[[ID]]` mentions. */
  readonly rel?: string | undefined
}

export interface FrontMatterError {
  readonly message: string
  /** File line the problem is on. */
  readonly line: number
}

export interface OpenQuestion {
  readonly text: string
  readonly line: number
  readonly resolved: boolean
}

/** What front matter holds. */
export type Json = string | number | boolean | null | ReadonlyArray<Json> | { readonly [key: string]: Json }

/** A front matter value and the line it starts on; a map's entries and a list's items keep theirs. */
export interface Located {
  readonly line: number
  readonly data: Json
  readonly entries?: ReadonlyArray<Entry> | undefined
  readonly items?: ReadonlyArray<Located> | undefined
}

/** The front matter: a mapping, as data and with the lines of its entries. */
export interface FrontMatter extends Located {
  readonly data: { readonly [key: string]: Json }
  readonly entries: ReadonlyArray<Entry>
}

export interface Entry {
  readonly key: string
  /** Line of the key. */
  readonly line: number
  readonly value: Located
}

/** A paragraph, list or quote of the body, as written, its lines joined. */
export interface Prose {
  readonly line: number
  readonly text: string
}

/** A heading and the prose under it, up to the next heading of the same or a higher level. */
export interface Section {
  readonly heading: string
  readonly level: number
  readonly line: number
  readonly text: string
}

export interface MarkdownDoc {
  readonly frontMatter: FrontMatter | undefined
  readonly frontMatterError: FrontMatterError | undefined
  readonly fences: ReadonlyArray<Fence>
  readonly references: ReadonlyArray<Reference>
  readonly openQuestions: ReadonlyArray<OpenQuestion>
  readonly prose: ReadonlyArray<Prose>
  readonly sections: ReadonlyArray<Section>
  /** The first paragraph, at most 280 characters. */
  readonly summary: string
  /** The first top-level heading. */
  readonly title: string | undefined
  /** Body text below the front matter. */
  readonly body: string
}

const wikiLinkRe = /\[\[([^\]|#\s][^\]|]*?)(?:\|[^\]]*)?\]\]/g
const inlineFieldRe = /(?:^|[\s(*_-])([A-Za-z][\w-]*)::\s*((?:\[\[[^\]]+\]\][\s,;]*)+)/g
const openQuestionsHeading = /^(open questions?|unresolved( questions)?|questions|tbd)\b/i
const checkbox = /^\[([ xX])\]\s+/

export const parseMarkdown = (content: string): MarkdownDoc => {
  const lines = content.replace(/\r\n?/g, "\n").split("\n")
  const fm = readFrontMatter(lines)
  const body = lines.slice(fm.lines).join("\n")
  const tree = fromMarkdown(body)
  const lineOf = (node: Nodes) => node.position!.start.line + fm.lines
  /** The node as written, its lines trimmed and joined. */
  const joined = (node: Nodes) =>
    body.slice(node.position!.start.offset, node.position!.end.offset).split("\n").map((line) => line.trim()).join(" ").trim()
  /** A heading's text as written, without its `#` marks. */
  const headingText = (node: Heading) => {
    const first = node.children[0]
    const last = node.children.at(-1)
    return first && last ? body.slice(first.position!.start.offset, last.position!.end.offset).trim() : ""
  }
  const question = (paragraph: Paragraph): OpenQuestion => {
    const written = joined(paragraph)
    const box = checkbox.exec(written)
    const text = box ? written.slice(box[0].length) : written
    return { text, line: lineOf(paragraph), resolved: (box !== null && box[1] !== " ") || /^~~.*~~$/.test(text) }
  }

  const fences: Array<Fence> = []
  /** What is no prose: code, HTML, and of a link everything but its text — the destination, the title, a definition. */
  const hidden: Array<Span> = []
  for (const node of descendants(tree)) {
    const { end, start } = node.position!
    if (["code", "inlineCode", "html", "image", "definition"].includes(node.type)) hidden.push([start.offset!, end.offset!])
    if (node.type === "link") {
      const text = node.children.map((child) => child.position!)
      hidden.push([start.offset!, text[0]?.start.offset ?? end.offset!], [text.at(-1)?.end.offset ?? end.offset!, end.offset!])
    }
    if (node.type === "code" && node.lang) {
      const line = lineOf(node)
      fences.push({ lang: node.lang.toLowerCase(), line, contentLine: line + 1, lines: node.value === "" ? [] : node.value.split("\n") })
    }
  }

  const references: Array<Reference> = []
  blanked(body, hidden).split("\n").forEach((text, index) => collectReferences(text, index + 1 + fm.lines, references))

  const headings: Array<Omit<Section, "text">> = []
  const prose: Array<Prose> = []
  const openQuestions: Array<OpenQuestion> = []
  let summary: string | undefined
  let questionsLevel: number | undefined
  for (const node of tree.children) {
    if (node.type === "heading") {
      const heading = headingText(node)
      headings.push({ heading, level: node.depth, line: lineOf(node) })
      if (questionsLevel !== undefined && node.depth <= questionsLevel) questionsLevel = undefined
      if (openQuestionsHeading.test(heading)) questionsLevel = node.depth
    } else if ((node.type === "paragraph" || node.type === "list" || node.type === "blockquote") && hasText(node)) {
      prose.push({ line: lineOf(node), text: joined(node) })
      if (node.type === "paragraph") summary ??= joined(node)
      if (node.type === "list" && questionsLevel !== undefined) openQuestions.push(...itemTexts(node).map(question))
    }
  }
  const sections = headings.map((heading, index): Section => {
    const next = headings.slice(index + 1).find((h) => h.level <= heading.level)
    const under = prose.filter((p) => p.line > heading.line && (next === undefined || p.line < next.line))
    return { ...heading, text: under.map((p) => p.text).join(" ") }
  })

  return {
    frontMatter: fm.data,
    frontMatterError: fm.error,
    fences,
    references,
    openQuestions,
    prose,
    sections,
    summary: truncate(summary ?? "", 280),
    title: headings.find((h) => h.level === 1)?.heading,
    body
  }
}

/** Every node below `node`, in document order. */
function* descendants(node: Nodes): Generator<Nodes> {
  if (!("children" in node)) return
  for (const child of node.children) {
    yield child
    yield* descendants(child)
  }
}

/** The paragraph opening each item of a list, nested items too. */
const itemTexts = (list: List): ReadonlyArray<Paragraph> =>
  [...descendants(list)].flatMap((node) => node.type === "listItem" && node.children[0]?.type === "paragraph" ? [node.children[0]] : [])

/** Whether a reader sees any text in `node`: text or code spans, not markup alone. */
const hasText = (node: Nodes): boolean =>
  [...descendants(node)].some((child) => (child.type === "text" || child.type === "inlineCode") && child.value.trim() !== "")

/** From one offset in the body up to another. */
type Span = readonly [start: number, end: number]

/** The body with the spans blanked out, so line numbers stay as they are. */
const blanked = (body: string, spans: ReadonlyArray<Span>): string => {
  let out = ""
  let at = 0
  for (const [start, end] of [...spans].sort((a, b) => a[0] - b[0])) {
    if (end <= at) continue
    out += body.slice(at, Math.max(at, start)) + body.slice(Math.max(at, start), end).replace(/[^\n]/g, " ")
    at = end
  }
  return out + body.slice(at)
}

const readFrontMatter = (lines: ReadonlyArray<string>): {
  readonly data: FrontMatter | undefined
  readonly error: FrontMatterError | undefined
  readonly lines: number
} => {
  if (lines[0]?.trim() !== "---") return { data: undefined, error: undefined, lines: 0 }
  const end = lines.findIndex((line, idx) => idx > 0 && (line.trim() === "---" || line.trim() === "..."))
  if (end < 0) return { data: undefined, error: { message: "front matter is not closed with ---", line: 1 }, lines: 0 }
  const counter = new LineCounter()
  const doc = parseDocument(lines.slice(1, end).join("\n"), { lineCounter: counter, prettyErrors: false })
  // The YAML starts on the file's second line.
  const lineAt = (offset: number | undefined) => counter.linePos(offset ?? 0).line + 1
  const yamlError = doc.errors[0]
  if (yamlError) return { data: undefined, error: { message: yamlError.message.split("\n")[0]!, line: lineAt(yamlError.pos[0]) }, lines: end + 1 }
  if (doc.contents === null) return { data: { line: 1, data: {}, entries: [] }, error: undefined, lines: end + 1 }
  const { problem, value } = toJson(doc.contents, doc, lineAt)
  if (problem) return { data: undefined, error: problem, lines: end + 1 }
  if (!value.entries || !isMapping(value.data)) {
    return { data: undefined, error: { message: "front matter must be a YAML mapping", line: value.line }, lines: end + 1 }
  }
  return { data: { line: value.line, data: value.data, entries: value.entries }, error: undefined, lines: end + 1 }
}

const isMapping = (data: Json): data is { readonly [key: string]: Json } => Predicate.isObject(data) && !Array.isArray(data)

const jsonTags = new Set(["str", "int", "float", "bool", "null", "map", "seq"].map((tag) => `tag:yaml.org,2002:${tag}`))

/**
 * A YAML node as JSON data with its lines. An alias stands for the value it names, at the line of
 * the alias; one that names no anchor or is inside the value it names, tags and numbers JSON
 * cannot hold, and keys that are not text, are errors.
 */
const toJson = (
  root: unknown,
  doc: Document,
  lineAt: (offset: number | undefined) => number
): { readonly value: Located; readonly problem: FrontMatterError | undefined } => {
  let problem: FrontMatterError | undefined
  const fail = (message: string, line: number): Located => {
    problem ??= { message, line }
    return { line, data: null }
  }
  const convert = (node: unknown, line: number, inside: ReadonlyArray<unknown>): Located => {
    if (node === null || node === undefined) return { line, data: null }
    if (isAlias(node)) {
      const target = node.resolve(doc)
      const used = lineAt(node.range?.[0])
      if (target === undefined) return fail(`the alias *${node.source} names no anchor`, used)
      if (inside.includes(target)) return fail(`the alias *${node.source} repeats a value it is inside`, used)
      // The value is written at its anchor; the reference to it is here.
      return { ...convert(target, line, inside), line: used }
    }
    if (!isScalar(node) && !isMap(node) && !isSeq(node)) return fail("not JSON data", line)
    const at = lineAt(node.range?.[0])
    if (node.tag !== undefined && !jsonTags.has(node.tag)) return fail(`${node.tag.replace("tag:yaml.org,2002:", "!!")} has no JSON type`, at)
    if (isScalar(node)) {
      const value = node.value
      if (Predicate.isNumber(value) && !Number.isFinite(value)) return fail(`${node.source ?? value} is not a JSON number`, at)
      if (Predicate.isString(value) || Predicate.isNumber(value) || Predicate.isBoolean(value) || value === null) return { line: at, data: value }
      return fail("not JSON data", at)
    }
    const within = [...inside, node]
    if (isSeq(node)) {
      const items = node.items.map((item) => convert(item, at, within))
      return { line: at, data: items.map((item) => item.data), items }
    }
    const entries: Array<Entry> = []
    for (const pair of node.items) {
      const key = pair.key
      const keyLine = isNode(key) ? lineAt(key.range?.[0]) : at
      if (!isScalar(key) || !(Predicate.isString(key.value) || Predicate.isNumber(key.value))) return fail("a key must be plain text", keyLine)
      entries.push({ key: String(key.value), line: keyLine, value: convert(pair.value, keyLine, within) })
    }
    return { line: at, data: Object.fromEntries(entries.map((entry) => [entry.key, entry.value.data])), entries }
  }
  const value = convert(root, 1, [])
  return { value, problem }
}

const collectReferences = (text: string, line: number, out: Array<Reference>) => {
  if (!text.includes("[[")) return
  const typed = new Set<string>()
  for (const match of text.matchAll(inlineFieldRe)) {
    const rel = match[1]!
    for (const link of match[2]!.matchAll(wikiLinkRe)) {
      const id = link[1]!.trim()
      typed.add(id)
      out.push({ id, line, rel })
    }
  }
  for (const link of text.matchAll(wikiLinkRe)) {
    const id = link[1]!.trim()
    if (!typed.has(id)) out.push({ id, line })
  }
}

const truncate = (text: string, max: number) => text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`
