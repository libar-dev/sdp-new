/**
 * A line-oriented Markdown scanner. It extracts only what the graph needs
 * (front matter, headings, fenced blocks, links, open questions, a summary)
 * and keeps exact 1-based line numbers so every fact points back to a
 * greppable `file:line`.
 */
import { Predicate } from "effect"
import { parse as parseYaml } from "yaml"

export interface Heading {
  readonly level: number
  readonly text: string
  readonly line: number
}

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
  /** File line the problem is on: the YAML error's line, or the opening `---`. */
  readonly line: number
}

export interface OpenQuestion {
  readonly text: string
  readonly line: number
  readonly resolved: boolean
}

export interface MarkdownDoc {
  readonly lines: ReadonlyArray<string>
  readonly frontMatter: Readonly<Record<string, unknown>> | undefined
  readonly frontMatterError: FrontMatterError | undefined
  /** Number of lines taken by the front matter block, including both `---` fences. */
  readonly frontMatterLines: number
  readonly headings: ReadonlyArray<Heading>
  readonly fences: ReadonlyArray<Fence>
  readonly references: ReadonlyArray<Reference>
  readonly openQuestions: ReadonlyArray<OpenQuestion>
  readonly summary: string
  readonly title: string | undefined
  /** Body text below the front matter. */
  readonly body: string
}

const fenceOpen = /^(\s{0,3})(`{3,}|~{3,})\s*([\w+-]*)/
const headingRe = /^(#{1,6})\s+(.*?)\s*#*\s*$/
const wikiLinkRe = /\[\[([^\]|#\s][^\]|]*?)(?:\|[^\]]*)?\]\]/g
const inlineFieldRe = /(?:^|[\s(*_-])([A-Za-z][\w-]*)::\s*((?:\[\[[^\]]+\]\][\s,;]*)+)/g
const openQuestionsHeading = /^(open questions?|unresolved( questions)?|questions|tbd)\b/i
const listItem = /^\s*[-*+]\s+(?:\[( |x|X)\]\s+)?(.*)$/

export const parseMarkdown = (content: string): MarkdownDoc => {
  const lines = content.replace(/\r\n?/g, "\n").split("\n")
  const fm = readFrontMatter(lines)
  const headings: Array<Heading> = []
  const fences: Array<Fence> = []
  const references: Array<Reference> = []
  const openQuestions: Array<OpenQuestion> = []
  let summary = ""
  let paragraph: Array<string> = []
  let inQuestions: number | undefined

  const flushParagraph = () => {
    if (!summary && paragraph.length > 0) summary = paragraph.join(" ").trim()
    paragraph = []
  }

  let i = fm.lines
  while (i < lines.length) {
    const text = lines[i]!
    const lineNo = i + 1
    const fence = fenceOpen.exec(text)
    if (fence) {
      flushParagraph()
      const marker = fence[2]!
      const body: Array<string> = []
      let j = i + 1
      while (j < lines.length && !lines[j]!.trimStart().startsWith(marker)) {
        body.push(lines[j]!)
        j++
      }
      fences.push({ lang: fence[3]!.toLowerCase(), line: lineNo, contentLine: lineNo + 1, lines: body })
      i = j + 1
      continue
    }
    const heading = headingRe.exec(text)
    if (heading) {
      flushParagraph()
      const level = heading[1]!.length
      const headingText = heading[2]!
      headings.push({ level, text: headingText, line: lineNo })
      if (inQuestions !== undefined && level <= inQuestions) inQuestions = undefined
      if (openQuestionsHeading.test(headingText)) inQuestions = level
      collectReferences(headingText, lineNo, references)
      i++
      continue
    }
    collectReferences(text, lineNo, references)
    if (inQuestions !== undefined) {
      const item = listItem.exec(text)
      if (item) {
        const itemText = item[2]!.trim()
        const struck = /^~~.*~~$/.test(itemText)
        openQuestions.push({ text: itemText, line: lineNo, resolved: item[1] === "x" || item[1] === "X" || struck })
      }
    }
    if (text.trim() === "") flushParagraph()
    else if (!/^\s*([-*+>|]|\d+\.)\s/.test(text) && !/^\s*(<!--|\|)/.test(text)) paragraph.push(text.trim())
    else flushParagraph()
    i++
  }
  flushParagraph()

  const h1 = headings.find((h) => h.level === 1)
  return {
    lines,
    frontMatter: fm.data,
    frontMatterError: fm.error,
    frontMatterLines: fm.lines,
    headings,
    fences,
    references,
    openQuestions,
    summary: truncate(summary, 280),
    title: h1?.text,
    body: lines.slice(fm.lines).join("\n")
  }
}

const readFrontMatter = (lines: ReadonlyArray<string>): {
  readonly data: Record<string, unknown> | undefined
  readonly error: FrontMatterError | undefined
  readonly lines: number
} => {
  if (lines[0]?.trim() !== "---") return { data: undefined, error: undefined, lines: 0 }
  const end = lines.findIndex((line, idx) => idx > 0 && (line.trim() === "---" || line.trim() === "..."))
  if (end < 0) return { data: undefined, error: { message: "front matter is not closed with ---", line: 1 }, lines: 0 }
  try {
    const data: unknown = parseYaml(lines.slice(1, end).join("\n"))
    if (data === null || data === undefined) return { data: {}, error: undefined, lines: end + 1 }
    if (!Predicate.isObject(data) || Array.isArray(data)) {
      return { data: undefined, error: { message: "front matter must be a YAML mapping", line: 1 }, lines: end + 1 }
    }
    return { data: data as Record<string, unknown>, error: undefined, lines: end + 1 }
  } catch (error) {
    return { data: undefined, error: yamlError(error), lines: end + 1 }
  }
}

/** YAML reports positions within the front matter block; point at the file line instead. */
const yamlError = (error: unknown): FrontMatterError => {
  const text = error instanceof Error ? error.message : String(error)
  const position = (error as { linePos?: ReadonlyArray<{ line: number }> }).linePos?.[0]
  return {
    message: text.split("\n")[0]!.replace(/ at line \d+, column \d+:?$/, ""),
    line: position ? position.line + 1 : 1
  }
}

const collectReferences = (text: string, line: number, out: Array<Reference>) => {
  if (!text.includes("[[")) return
  const withoutCode = text.replace(/`[^`]*`/g, "")
  const typed = new Set<string>()
  for (const match of withoutCode.matchAll(inlineFieldRe)) {
    const rel = match[1]!
    for (const link of match[2]!.matchAll(wikiLinkRe)) {
      const id = link[1]!.trim()
      typed.add(id)
      out.push({ id, line, rel })
    }
  }
  for (const link of withoutCode.matchAll(wikiLinkRe)) {
    const id = link[1]!.trim()
    if (!typed.has(id)) out.push({ id, line })
  }
}

const truncate = (text: string, max: number) => text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`

/**
 * Finds the first line (1-based) within the front matter that mentions `needle` as a whole token,
 * for precise link locations: `REQ-cart` is not found in `REQ-cart-totals`.
 */
export const frontMatterLineOf = (doc: MarkdownDoc, needle: string): number => {
  const pattern = new RegExp(`(?<![\\w-])${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w-]|\\.\\w)`)
  for (let i = 1; i < doc.frontMatterLines - 1; i++) {
    if (pattern.test(doc.lines[i]!)) return i + 1
  }
  return 1
}

/** The line (1-based) of a top-level front matter key, or 1 when it is not written out. */
export const frontMatterKeyLine = (doc: MarkdownDoc, key: string): number => {
  for (let i = 1; i < doc.frontMatterLines - 1; i++) {
    if (doc.lines[i]!.startsWith(`${key}:`)) return i + 1
  }
  return 1
}
