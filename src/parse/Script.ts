/**
 * A TypeScript or JavaScript file, parsed and never run: what sdp reads out of
 * code statically — annotations, the modules it imports and step definitions —
 * it reads from this one parse, with the line of everything it finds.
 */
import { type EcmaScriptModule, parseSync } from "oxc-parser"

export interface Comment {
  readonly type: "Line" | "Block"
  /** The text between the comment's delimiters. */
  readonly value: string
  readonly start: number
  readonly end: number
}

/** A module a file loads code from, named as the file names it, at the line that names it. */
export interface Import {
  readonly specifier: string
  readonly line: number
}

export type Node = { readonly type: string; readonly start: number; readonly end: number; readonly [key: string]: unknown }

/** A TypeScript or JavaScript file as parsed. */
export interface Script {
  readonly program: Node & { readonly body: ReadonlyArray<Node> }
  readonly comments: ReadonlyArray<Comment>
  /** The first syntax error, when the file does not parse. */
  readonly error: { readonly line: number; readonly message: string } | undefined
  readonly lineOf: (offset: number) => number
  /**
   * The modules the file imports or re-exports a value from, or loads with `import()`: an import of
   * types alone loads no code, and an `import()` of a computed name names no module.
   */
  readonly imports: () => ReadonlyArray<Import>
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
    lineOf,
    imports: () => valueImports(content, parsed.module, lineOf)
  }
}

/** A string literal, or a template literal with nothing in it computed: what `import()` names statically. */
const literalName = /^(?:"([^"\\]*)"|'([^'\\]*)'|`([^`\\$]*)`)$/

const valueImports = (content: string, module: EcmaScriptModule, lineOf: (offset: number) => number): ReadonlyArray<Import> => {
  const named = [
    ...module.staticImports.filter((i) => i.entries.length === 0 || i.entries.some((entry) => !entry.isType)).map((i) => i.moduleRequest),
    ...module.staticExports.flatMap((e) => e.entries.flatMap((entry) => entry.moduleRequest && !entry.isType ? [entry.moduleRequest] : [])),
    ...module.dynamicImports.flatMap(({ moduleRequest: { end, start } }) => {
      const match = literalName.exec(content.slice(start, end))
      return match ? [{ value: match[1] ?? match[2] ?? match[3]!, start }] : []
    })
  ]
  // One statement re-exports several names from one module: it is one import.
  const seen = new Set<string>()
  return named.flatMap(({ start, value }) => {
    const line = lineOf(start)
    const key = `${line}\u0000${value}`
    if (seen.has(key)) return []
    seen.add(key)
    return [{ specifier: value, line }]
  })
}
