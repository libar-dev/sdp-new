/**
 * A TypeScript or JavaScript file, parsed and never run: what sdp reads out of
 * code statically — annotations, the modules it imports and step definitions —
 * it reads from this one parse, with the line of everything it finds.
 *
 * @sdp is PAT-static-reading
 */
import { Predicate } from "effect"
import { parseSync } from "oxc-parser"

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
   * The modules the file imports or re-exports a value from, `import … = require()` among them, or
   * loads with `import()`: an import of types alone loads no code, and an `import()` of a computed
   * name names no module.
   */
  readonly imports: () => ReadonlyArray<Import>
}

const languageOf = (file: string): "ts" | "tsx" | "js" | "jsx" | undefined => {
  const ext = /\.([cm]?[jt]sx?)$/.exec(file)?.[1]
  if (!ext) return undefined
  // JavaScript may hold JSX wherever React projects write it; TypeScript only in .tsx, where `<T>x` casts cannot be.
  return ext.includes("t") ? (ext.endsWith("x") ? "tsx" : "ts") : "jsx"
}

export const isNode = (value: unknown): value is Node => Predicate.hasProperty(value, "type") && Predicate.isString(value.type)

/** The nodes directly inside `node`. */
export const children = (node: Node): ReadonlyArray<Node> =>
  Object.values(node).flatMap((value) => (Array.isArray(value) ? value : [value]).filter(isNode))

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
  const program = parsed.program as unknown as Script["program"]
  const error = parsed.errors[0]
  return {
    program,
    comments: parsed.comments,
    error: error && { line: lineOf(error.labels[0]?.start ?? 0), message: error.message },
    lineOf,
    imports: () => valueImports(program, parsed.module.dynamicImports.length > 0, lineOf)
  }
}

/** What a string literal, or a template literal with nothing in it computed, holds: a module's name written statically. */
export const literalName = (node: Node): string | undefined => {
  if (node.type === "Literal") return typeof node.value === "string" ? node.value : undefined
  if (node.type !== "TemplateLiteral" || (node.expressions as ReadonlyArray<Node>).length > 0) return undefined
  return (node.quasis as ReadonlyArray<{ readonly value: { readonly cooked: string | null } }>)[0]?.value.cooked ?? undefined
}

/** The names of what a top-level statement imports or re-exports a value from. */
const valueSources = (statement: Node): ReadonlyArray<Node> => {
  switch (statement.type) {
    case "ImportDeclaration": {
      const names = statement.specifiers as ReadonlyArray<Node>
      // Without names it imports the module for its effects, unless it is `import type {}`, erased with the types.
      const values = statement.importKind !== "type" && (names.length === 0 || names.some((name) => name.importKind !== "type"))
      return values ? [statement.source as Node] : []
    }
    case "ExportNamedDeclaration": {
      if (isNode(statement.declaration)) return valueSources(statement.declaration)
      const names = statement.specifiers as ReadonlyArray<Node>
      const values = statement.exportKind !== "type" && names.some((name) => name.exportKind !== "type")
      return values && isNode(statement.source) ? [statement.source] : []
    }
    case "ExportAllDeclaration":
      return statement.exportKind === "type" ? [] : [statement.source as Node]
    case "TSImportEqualsDeclaration": {
      const reference = statement.moduleReference as Node
      return statement.importKind !== "type" && reference.type === "TSExternalModuleReference" ? [reference.expression as Node] : []
    }
    default:
      return []
  }
}

/** The names `import()` loads within `node`. */
const dynamicSources = (node: Node): ReadonlyArray<Node> => [
  ...(node.type === "ImportExpression" && isNode(node.source) ? [node.source] : []),
  ...children(node).flatMap(dynamicSources)
]

const valueImports = (program: Script["program"], dynamic: boolean, lineOf: (offset: number) => number): ReadonlyArray<Import> => {
  const named = [...program.body.flatMap(valueSources), ...(dynamic ? dynamicSources(program) : [])]
  // One module named twice on a line is one import.
  const seen = new Set<string>()
  return named.flatMap((source) => {
    const value = literalName(source)
    if (value === undefined) return []
    const line = lineOf(source.start)
    const key = `${line}\u0000${value}`
    if (seen.has(key)) return []
    seen.add(key)
    return [{ specifier: value, line }]
  })
}
