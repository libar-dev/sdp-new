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
  /** The names it imports by, `default` among them; undefined when it loads the module whole. */
  readonly names?: ReadonlyArray<string> | undefined
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
   * loads with `import()` or `require()`: an import of types alone loads no code, and a computed
   * name names no module.
   */
  readonly imports: () => ReadonlyArray<Import>
  /**
   * The names the module exports as types alone — an interface, a type alias, a name exported with
   * `type` — so that an import of them alone loads none of its code.
   */
  readonly types: () => ReadonlySet<string>
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
    imports: () => valueImports(program, parsed.module.dynamicImports.length > 0 || content.includes("require"), lineOf),
    types: () => typeExports(program)
  }
}

/** What a string literal, or a template literal with nothing in it computed, holds: a module's name written statically. */
export const literalName = (node: Node): string | undefined => {
  if (node.type === "Literal") return typeof node.value === "string" ? node.value : undefined
  if (node.type !== "TemplateLiteral" || (node.expressions as ReadonlyArray<Node>).length > 0) return undefined
  return (node.quasis as ReadonlyArray<{ readonly value: { readonly cooked: string | null } }>)[0]?.value.cooked ?? undefined
}

/** An identifier's name, or a string literal's in its place (`import { "a-b" as ab }`). */
const nameOf = (node: Node): string => (node.name ?? node.value) as string

/** The name of a module a statement loads code from, with the names it imports by, if it names them. */
interface Source {
  readonly source: Node
  readonly names?: ReadonlyArray<string> | undefined
}

/** The names of what a top-level statement imports or re-exports a value from. */
const valueSources = (statement: Node): ReadonlyArray<Source> => {
  switch (statement.type) {
    case "ImportDeclaration": {
      const names = statement.specifiers as ReadonlyArray<Node>
      // Without names it imports the module for its effects, unless it is `import type {}`, erased with the types.
      const values = statement.importKind !== "type" && (names.length === 0 || names.some((name) => name.importKind !== "type"))
      if (!values) return []
      // For its effects, or as a namespace, it loads the module whole.
      if (names.length === 0 || names.some((name) => name.type === "ImportNamespaceSpecifier")) return [{ source: statement.source as Node }]
      const imported = names.filter((name) => name.importKind !== "type")
        .map((name) => name.type === "ImportDefaultSpecifier" ? "default" : nameOf(name.imported as Node))
      return [{ source: statement.source as Node, names: imported }]
    }
    case "ExportNamedDeclaration": {
      if (isNode(statement.declaration)) return valueSources(statement.declaration)
      const names = statement.specifiers as ReadonlyArray<Node>
      const values = statement.exportKind !== "type" && names.some((name) => name.exportKind !== "type")
      const exported = names.filter((name) => name.exportKind !== "type").map((name) => nameOf(name.local as Node))
      return values && isNode(statement.source) ? [{ source: statement.source, names: exported }] : []
    }
    case "ExportAllDeclaration":
      return statement.exportKind === "type" ? [] : [{ source: statement.source as Node }]
    case "TSImportEqualsDeclaration": {
      const reference = statement.moduleReference as Node
      return statement.importKind !== "type" && reference.type === "TSExternalModuleReference" ? [{ source: reference.expression as Node }] : []
    }
    default:
      return []
  }
}

/** The names `import()` and `require()` load within `node`. */
const dynamicSources = (node: Node): ReadonlyArray<Source> => [
  ...(node.type === "ImportExpression" && isNode(node.source) ? [{ source: node.source }] : []),
  ...(isRequire(node) ? [{ source: (node.arguments as ReadonlyArray<Node>)[0]! }] : []),
  ...children(node).flatMap(dynamicSources)
]

/** `require(name)` of CommonJS. */
const isRequire = (node: Node): boolean =>
  node.type === "CallExpression" && isNode(node.callee) && node.callee.type === "Identifier" && node.callee.name === "require" &&
  (node.arguments as ReadonlyArray<Node>).length === 1

const valueImports = (program: Script["program"], dynamic: boolean, lineOf: (offset: number) => number): ReadonlyArray<Import> => {
  const named = [...program.body.flatMap(valueSources), ...(dynamic ? dynamicSources(program) : [])]
  // One module named twice on a line is one import, by the names of both.
  const imports = new Map<string, Import>()
  for (const { names, source } of named) {
    const value = literalName(source)
    if (value === undefined) continue
    const line = lineOf(source.start)
    const key = `${line}\u0000${value}`
    const seen = imports.get(key)
    const all = seen === undefined ? names : seen.names && names && [...seen.names, ...names]
    imports.set(key, { specifier: value, line, names: all })
  }
  return [...imports.values()]
}

const isType = (node: Node): boolean => node.type === "TSInterfaceDeclaration" || node.type === "TSTypeAliasDeclaration"

/** The names a declaration declares: its own, or each a variable declaration's declarators name plainly. */
const declaredNames = (declared: Node): ReadonlyArray<string> =>
  declared.type === "VariableDeclaration"
    ? (declared.declarations as ReadonlyArray<Node>).flatMap((declarator) => (declarator.id as Node).type === "Identifier" ? [nameOf(declarator.id as Node)] : [])
    : isNode(declared.id) && declared.id.type === "Identifier" ? [nameOf(declared.id)] : []

/**
 * The names a module exports as types alone. A name it also exports as a value, as a class that
 * merges with an interface, is a value; so is one re-exported from another module without `type`,
 * since only that module knows what it is.
 */
const typeExports = (program: Script["program"]): ReadonlySet<string> => {
  // The module's own declarations by name: whether each is a type alone.
  const local = new Map<string, boolean>()
  for (const statement of program.body) {
    const declared = isNode(statement.declaration) ? statement.declaration : statement
    for (const name of declaredNames(declared)) local.set(name, isType(declared) && local.get(name) !== false)
  }
  const types = new Set<string>()
  const values = new Set<string>()
  const exported = (name: string, type: boolean) => (type ? types : values).add(name)
  for (const statement of program.body) {
    if (statement.type === "ExportDefaultDeclaration") {
      const declared = statement.declaration as Node
      exported("default", isType(declared) || (declared.type === "Identifier" && local.get(nameOf(declared)) === true))
    } else if (statement.type === "ExportNamedDeclaration" && isNode(statement.declaration)) {
      for (const name of declaredNames(statement.declaration)) exported(name, isType(statement.declaration))
    } else if (statement.type === "ExportNamedDeclaration") {
      for (const specifier of statement.specifiers as ReadonlyArray<Node>) {
        const own = !isNode(statement.source) && local.get(nameOf(specifier.local as Node)) === true
        exported(nameOf(specifier.exported as Node), statement.exportKind === "type" || specifier.exportKind === "type" || own)
      }
    }
  }
  return new Set([...types].filter((name) => !values.has(name)))
}
