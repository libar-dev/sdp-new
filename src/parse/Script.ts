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
  /**
   * How it loads the module, which decides the conditions TypeScript resolves the name under: by an
   * import or export statement, by `import()`, or by `require()` or `import … = require()`.
   */
  readonly kind: "static" | "dynamic" | "require"
}

/** How a module exports a name: declared by it, as a type alone or not, or passed on from a name of another module. */
export type Export = { readonly type: boolean } | { readonly from: string; readonly name: string }

/** What a module exports, by name, and the modules whose every name it exports (`export * from`), as types alone or not. */
export interface Exports {
  readonly named: ReadonlyMap<string, Export>
  readonly all: ReadonlyArray<{ readonly from: string; readonly type: boolean }>
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
   * What the module exports: which names are types alone — an interface, a type alias, a name
   * exported with `type` — so that an import of them alone loads none of its code, and which it
   * passes on from another module, whose own export says.
   */
  readonly exports: () => Exports
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
    exports: () => exportsOf(program)
  }
}

/**
 * The modules a file declares by name — `declare module "virtual-lib" { … }`, or a pattern of names,
 * `declare module "*.svg"` — which TypeScript takes an import of a name it matches to mean.
 */
export const declaredModules = (script: Script): ReadonlyArray<string> =>
  script.program.body.flatMap((statement) => {
    const id = statement.type === "TSModuleDeclaration" ? statement.id as Node : undefined
    return id?.type === "Literal" && typeof id.value === "string" ? [id.value] : []
  })

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
  readonly kind: Import["kind"]
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
      if (names.length === 0 || names.some((name) => name.type === "ImportNamespaceSpecifier")) return [{ source: statement.source as Node, kind: "static" }]
      const imported = names.filter((name) => name.importKind !== "type")
        .map((name) => name.type === "ImportDefaultSpecifier" ? "default" : nameOf(name.imported as Node))
      return [{ source: statement.source as Node, names: imported, kind: "static" }]
    }
    case "ExportNamedDeclaration": {
      if (isNode(statement.declaration)) return valueSources(statement.declaration)
      const names = statement.specifiers as ReadonlyArray<Node>
      const values = statement.exportKind !== "type" && names.some((name) => name.exportKind !== "type")
      const exported = names.filter((name) => name.exportKind !== "type").map((name) => nameOf(name.local as Node))
      return values && isNode(statement.source) ? [{ source: statement.source, names: exported, kind: "static" }] : []
    }
    case "ExportAllDeclaration":
      return statement.exportKind === "type" ? [] : [{ source: statement.source as Node, kind: "static" }]
    case "TSImportEqualsDeclaration": {
      const reference = statement.moduleReference as Node
      return statement.importKind !== "type" && reference.type === "TSExternalModuleReference" ? [{ source: reference.expression as Node, kind: "require" }] : []
    }
    default:
      return []
  }
}

/** The names `import()` and `require()` load within `node`. */
const dynamicSources = (node: Node): ReadonlyArray<Source> => [
  ...(node.type === "ImportExpression" && isNode(node.source) ? [{ source: node.source, kind: "dynamic" as const }] : []),
  ...(isRequire(node) ? [{ source: (node.arguments as ReadonlyArray<Node>)[0]!, kind: "require" as const }] : []),
  ...children(node).flatMap(dynamicSources)
]

/** `require(name)` of CommonJS. */
const isRequire = (node: Node): boolean =>
  node.type === "CallExpression" && isNode(node.callee) && node.callee.type === "Identifier" && node.callee.name === "require" &&
  (node.arguments as ReadonlyArray<Node>).length === 1

const valueImports = (program: Script["program"], dynamic: boolean, lineOf: (offset: number) => number): ReadonlyArray<Import> => {
  const named = [...program.body.flatMap(valueSources), ...(dynamic ? dynamicSources(program) : [])]
  // One module named twice on a line, the same way, is one import, by the names of both.
  const imports = new Map<string, Import>()
  for (const { kind, names, source } of named) {
    const value = literalName(source)
    if (value === undefined) continue
    const line = lineOf(source.start)
    const key = `${line}\u0000${kind}\u0000${value}`
    const seen = imports.get(key)
    const all = seen === undefined ? names : seen.names && names && [...seen.names, ...names]
    imports.set(key, { specifier: value, line, names: all, kind })
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
 * What a module exports. A name it also exports as a value, as a class that merges with an
 * interface, is a value; one it passes on from another module — re-exported, or imported and then
 * exported — is what that module exports it as.
 */
const exportsOf = (program: Script["program"]): Exports => {
  // The module's own declarations by name: whether each is a type alone.
  const local = new Map<string, boolean>()
  // What each name an import declares stands for.
  const imported = new Map<string, Export>()
  for (const statement of program.body) {
    if (statement.type === "ImportDeclaration") {
      const from = literalName(statement.source as Node)
      for (const specifier of statement.specifiers as ReadonlyArray<Node>) {
        const name = specifier.type === "ImportDefaultSpecifier" ? "default" : nameOf((specifier.imported ?? specifier.local) as Node)
        imported.set(
          nameOf(specifier.local as Node),
          statement.importKind === "type" || specifier.importKind === "type"
            ? { type: true }
            : from === undefined || specifier.type === "ImportNamespaceSpecifier" ? { type: false } : { from, name }
        )
      }
      continue
    }
    const declared = isNode(statement.declaration) ? statement.declaration : statement
    for (const name of declaredNames(declared)) local.set(name, isType(declared) && local.get(name) !== false)
  }
  const ownOrImported = (name: string): Export => imported.get(name) ?? { type: local.get(name) === true }
  const named = new Map<string, Export>()
  const all: Array<{ readonly from: string; readonly type: boolean }> = []
  // A name exported both ways is a value.
  const exported = (name: string, how: Export) => {
    if (!named.has(name) || ("type" in how && !how.type)) named.set(name, how)
  }
  for (const statement of program.body) {
    if (statement.type === "ExportDefaultDeclaration") {
      const declared = statement.declaration as Node
      exported("default", isType(declared) ? { type: true } : declared.type === "Identifier" ? ownOrImported(nameOf(declared)) : { type: false })
    } else if (statement.type === "ExportNamedDeclaration" && isNode(statement.declaration)) {
      for (const name of declaredNames(statement.declaration)) exported(name, { type: isType(statement.declaration) })
    } else if (statement.type === "ExportNamedDeclaration") {
      const from = isNode(statement.source) ? literalName(statement.source) : undefined
      for (const specifier of statement.specifiers as ReadonlyArray<Node>) {
        const name = nameOf(specifier.local as Node)
        exported(
          nameOf(specifier.exported as Node),
          statement.exportKind === "type" || specifier.exportKind === "type"
            ? { type: true }
            : !isNode(statement.source) ? ownOrImported(name) : from === undefined ? { type: false } : { from, name }
        )
      }
    } else if (statement.type === "ExportAllDeclaration") {
      const from = literalName(statement.source as Node)
      const type = statement.exportKind === "type"
      if (isNode(statement.exported)) exported(nameOf(statement.exported), { type })
      else if (from !== undefined) all.push({ from, type })
    }
  }
  return { named, all }
}
