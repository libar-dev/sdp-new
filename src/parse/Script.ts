/**
 * A TypeScript or JavaScript file, parsed and never run: what sdp reads out of
 * code statically — annotations and step definitions — it reads from this one
 * parse, with the line of everything it finds.
 */
import { parseSync } from "oxc-parser"

export interface Comment {
  readonly type: "Line" | "Block"
  /** The text between the comment's delimiters. */
  readonly value: string
  readonly start: number
  readonly end: number
}

export type Node = { readonly type: string; readonly start: number; readonly end: number; readonly [key: string]: unknown }

/** A TypeScript or JavaScript file as parsed. */
export interface Script {
  readonly program: Node & { readonly body: ReadonlyArray<Node> }
  readonly comments: ReadonlyArray<Comment>
  /** The first syntax error, when the file does not parse. */
  readonly error: { readonly line: number; readonly message: string } | undefined
  readonly lineOf: (offset: number) => number
}

const languageOf = (file: string): "ts" | "tsx" | "js" | "jsx" | undefined => {
  const ext = /\.([cm]?[jt]sx?)$/.exec(file)?.[1]
  if (!ext) return undefined
  // JavaScript may hold JSX wherever React projects write it; TypeScript only in .tsx, where `<T>x` casts cannot be.
  return ext.includes("t") ? (ext.endsWith("x") ? "tsx" : "ts") : "jsx"
}

export const isNode = (value: unknown): value is Node =>
  typeof value === "object" && value !== null && typeof (value as { type?: unknown }).type === "string"

/** Parses a TypeScript or JavaScript file; undefined for any other language. */
export const parseScript = (file: string, content: string): Script | undefined => {
  const lang = languageOf(file)
  if (!lang) return undefined
  const lineStarts = [0]
  for (let i = 0; i < content.length; i++) if (content[i] === "\n") lineStarts.push(i + 1)
  const lineOf = (offset: number) => {
    let lo = 0
    let hi = lineStarts.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (lineStarts[mid]! <= offset) lo = mid
      else hi = mid - 1
    }
    return lo + 1
  }

  const parsed = parseSync(file, content, { lang, sourceType: "module" })
  const error = parsed.errors[0]
  return {
    program: parsed.program as unknown as Script["program"],
    comments: parsed.comments,
    error: error && { line: lineOf(error.labels[0]?.start ?? 0), message: error.message },
    lineOf
  }
}
