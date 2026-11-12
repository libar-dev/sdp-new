/**
 * Language-agnostic code annotations. Any comment line of the form
 *
 *     @sdp <relation> <ID>[,<ID>...] [key=value ...]
 *
 * (the marker opens the comment's text; a string or prose that mentions it is not an annotation)
 * links the code (the declaration directly below, or the whole file when a blank line follows) to graph
 * nodes. The relation is free text (`implements`, `is`, `instance-of`, ...).
 * `is` anchors a node in code and declares it if no spec defines it.
 * `grep -rn "@sdp" src/` lists every annotation. One written after code on the
 * same line (`total() // @sdp implements X`) is not read; `ignoredAnnotations`
 * finds those so `sdp check` can say so.
 */
import { annotate } from "../annotations.ts"

annotate(import.meta, { is: "ARCH-code-annotations" })

export interface Annotation {
  readonly file: string
  readonly line: number
  readonly rel: string
  readonly targets: ReadonlyArray<string>
  readonly attrs: Readonly<Record<string, unknown>>
  /** The symbol declared right after the annotation, if any. */
  readonly symbol: string | undefined
  /** Line of the annotated declaration, when it is not the annotation's own (typed annotations). */
  readonly symbolLine?: number | undefined
  /** The annotated declaration's own description (its JSDoc), when known. */
  readonly doc?: string | undefined
}

const marker = /^\s*(?:(?:\/\/+|\/\*+|\*+|#+|--+|<!--|;+|%+|"""|''')!?\s*)?@sdp\s+([A-Za-z][\w.:-]*)\s+(.+)$/
const idToken = /^[A-Za-z][\w.:#/-]*$/
const declaration =
  /\b(?:class|interface|type|function\*?|const|let|var|enum|def|func|fn|struct|trait|module|object|record|namespace|impl)\s+([A-Za-z_$][\w$]*)/
const commentOnly = /^\s*(\/\/|\/\*|\*|#|--|<!--|;|%|"""|''')/

export const scanAnnotations = (file: string, content: string): ReadonlyArray<Annotation> => {
  if (!content.includes("@sdp")) return []
  const lines = content.split(/\r?\n/)
  const found: Array<Annotation> = []
  lines.forEach((text, index) => {
    const match = marker.exec(text)
    if (!match) return
    const tokens = tokenize(match[2]!.replace(/\s*(\*\/|-->|"""|''').*$/, ""))
    const targets: Array<string> = []
    const attrs: Record<string, unknown> = {}
    for (const token of tokens) {
      const eq = token.indexOf("=")
      if (eq > 0) attrs[token.slice(0, eq)] = coerce(unquote(token.slice(eq + 1)))
      else targets.push(...token.split(",").map((t) => t.trim()).filter(Boolean))
    }
    if (targets.length === 0 || !targets.every((t) => idToken.test(t))) return
    found.push({ file, line: index + 1, rel: match[1]!, targets, attrs, symbol: nextSymbol(lines, index) })
  })
  return found
}

const trailing = /\S.*?(?:\/\/+|\/\*+|#+|--+|;+)\s*(@sdp\s+[A-Za-z][\w.:-]*\s+[A-Za-z][\w.:#/-]*(?:,[A-Za-z][\w.:#/-]*)*)(?=\s|$|\*\/|-->)/

/** Comments after code that look like annotations but, not opening their comment line, are not read as one. */
export const ignoredAnnotations = (content: string): ReadonlyArray<{ readonly line: number; readonly text: string }> => {
  if (!content.includes("@sdp")) return []
  const found: Array<{ line: number; text: string }> = []
  content.split(/\r?\n/).forEach((text, index) => {
    // A comment line that mentions an annotation is prose; only code followed by a comment counts.
    if (marker.test(text) || commentOnly.test(text)) return
    const match = trailing.exec(text)
    if (match) found.push({ line: index + 1, text: match[1]! })
  })
  return found
}

/** An annotation directly above a declaration binds to it; one followed by a blank line binds to the file. */
const nextSymbol = (lines: ReadonlyArray<string>, from: number): string | undefined => {
  for (let i = from + 1; i < Math.min(lines.length, from + 8); i++) {
    const line = lines[i]!
    if (line.trim() === "") return undefined
    if (commentOnly.test(line) || line.includes("@sdp")) continue
    return declaration.exec(line)?.[1]
  }
  return undefined
}

const tokenize = (text: string): ReadonlyArray<string> => text.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? []

const unquote = (value: string) => value.replace(/^(["'])(.*)\1$/, "$2")

const coerce = (value: string): unknown =>
  value === "true" ? true : value === "false" ? false : /^-?\d+(\.\d+)?$/.test(value) ? Number(value) : value

export const codeNodeId = (annotation: Pick<Annotation, "file" | "symbol">): string =>
  annotation.symbol ? `code:${annotation.file}#${annotation.symbol}` : `code:${annotation.file}`
