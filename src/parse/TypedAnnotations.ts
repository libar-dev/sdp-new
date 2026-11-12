/**
 * Reads typed annotations — `annotate(target, links, declaration?)` calls
 * imported from "sdp/annotations" (or "sdp") — out of TypeScript and JavaScript
 * source. Statically: the code is parsed, never run. Only literal ids and
 * attributes count; anything computed is reported as unreadable rather than
 * guessed. A call counts where its name still refers to the import: a parameter
 * or declaration of the same name in an enclosing scope shadows it, as it would
 * at run time. Its target must be a module-level declaration, whose name is
 * unique in the file; a local or undeclared target is reported too.
 *
 * The annotated symbol's JSDoc (or the module's leading JSDoc for
 * `import.meta`) comes along as its description, so the code's own words reach
 * the graph and the context bundles.
 */
import { annotate } from "sdp/annotations"
import { parseSync } from "oxc-parser"
import type { Annotation } from "./Annotations.ts"

export interface TypedAnnotation extends Annotation {
  /** Line of the annotated declaration (1 for a module). */
  readonly symbolLine: number
  /** First paragraph of the declaration's JSDoc, if any. */
  readonly doc: string | undefined
}

export interface TypedAnnotationProblem {
  readonly line: number
  readonly message: string
  /** How to fix it, when the general advice (write literals) does not apply. */
  readonly hint?: string | undefined
}

export interface TypedScan {
  readonly annotations: ReadonlyArray<TypedAnnotation>
  readonly problems: ReadonlyArray<TypedAnnotationProblem>
}

export interface Comment {
  readonly type: "Line" | "Block"
  /** The text between the comment's delimiters. */
  readonly value: string
  readonly start: number
  readonly end: number
}

type Node = { readonly type: string; readonly start: number; readonly end: number; readonly [key: string]: unknown }

/** A TypeScript or JavaScript file, parsed once for both kinds of annotation. */
export interface Script {
  readonly program: Node & { readonly body: ReadonlyArray<Node> }
  readonly comments: ReadonlyArray<Comment>
  /** The first syntax error, when the file does not parse. */
  readonly error: { readonly line: number; readonly message: string } | undefined
  readonly lineOf: (offset: number) => number
}

const empty: TypedScan = { annotations: [], problems: [] }

/** The modules that export `annotate`: the package and its dependency-free subpath. */
const annotationModules: ReadonlySet<string> = new Set(["sdp", "sdp/annotations"])

const languageOf = (file: string): "ts" | "tsx" | "js" | "jsx" | undefined => {
  const ext = /\.([cm]?[jt]sx?)$/.exec(file)?.[1]
  if (!ext) return undefined
  // JavaScript may hold JSX wherever React projects write it; TypeScript only in .tsx, where `<T>x` casts cannot be.
  return ext.includes("t") ? (ext.endsWith("x") ? "tsx" : "ts") : "jsx"
}

const isNode = (value: unknown): value is Node =>
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

/** Reads the `annotate()` calls of a parsed file without running it; computed ids are reported, not guessed. */
export const readTypedAnnotations = (file: string, content: string, script: Script): TypedScan => {
  if (!content.includes("annotate")) return empty
  const { lineOf, program } = script

  // Local names bound to `annotate`, and namespaces whose `.annotate` is it. Type-only imports bind no value.
  const direct = new Set<string>()
  const namespaces = new Set<string>()
  for (const statement of program.body) {
    if (statement.type !== "ImportDeclaration" || statement.importKind === "type") continue
    if (!annotationModules.has((statement.source as { value: string }).value)) continue
    for (const spec of statement.specifiers as ReadonlyArray<Node>) {
      const local = (spec.local as { name: string }).name
      if (spec.type === "ImportSpecifier" && spec.importKind !== "type" && importedName(spec) === "annotate") direct.add(local)
      if (spec.type === "ImportNamespaceSpecifier") namespaces.add(local)
    }
  }
  if (direct.size === 0 && namespaces.size === 0) return empty

  const jsdocs = script.comments.filter((c) => c.type === "Block" && c.value.startsWith("*"))
  const docBefore = (start: number): string | undefined => {
    const comment = [...jsdocs].reverse().find((c) => c.end <= start)
    if (!comment || content.slice(comment.end, start).trim() !== "") return undefined
    return summary(comment.value)
  }
  // The module's description: its first JSDoc, if it comes before any code other than imports.
  const firstCode = program.body.find((s) => s.type !== "ImportDeclaration")
  const moduleDoc = jsdocs[0] && (!firstCode || jsdocs[0].end <= firstCode.start) ? summary(jsdocs[0].value) : undefined

  // Top-level declarations by name: where they are and what their JSDoc says.
  const declarations = new Map<string, { readonly line: number; readonly doc: string | undefined }>()
  for (const statement of program.body) {
    const declared = statement.type === "ExportNamedDeclaration" || statement.type === "ExportDefaultDeclaration"
      ? (statement.declaration as Node | null) ?? undefined
      : statement
    if (!declared) continue
    for (const name of declaredNames(declared)) {
      declarations.set(name, { line: lineOf(declared.start), doc: docBefore(statement.start) })
    }
  }

  const annotations: Array<TypedAnnotation> = []
  const problems: Array<TypedAnnotationProblem> = []
  // `locals`: the names enclosing scopes declare, so there they mean something other than a module-level name.
  const visit = (node: Node, locals: ReadonlySet<string>) => {
    const declared = scopeNames(node)
    const inner = declared.length === 0 ? locals : new Set([...locals, ...declared])
    if (node.type === "CallExpression" && isAnnotate(unwrap(node.callee as Node)!, direct, namespaces, inner)) {
      read(node, inner)
      return
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) for (const child of value) isNode(child) && visit(child, inner)
      else if (isNode(value)) visit(value, inner)
    }
  }
  const read = (call: Node, locals: ReadonlySet<string>) => {
    const line = lineOf(call.start)
    const [target, links, declaration] = (call.arguments as ReadonlyArray<Node | undefined>).map(unwrap)
    const problem = (message: string, hint?: string) => problems.push({ line, message, hint })
    let symbol: string | undefined
    if (target?.type === "MetaProperty") symbol = undefined
    else if (target && symbolName(target) !== undefined) symbol = symbolName(target)
    else return problem("the annotation target must be a name (a class, function or constant) or import.meta")
    // A local name can repeat in the file; only a module-level one names a single code node.
    const name = symbol?.split(".")[0]
    if (name !== undefined && (locals.has(name) || !declarations.has(name))) {
      return problem(
        `the annotation target must be a module-level declaration or import.meta: ${name} is not one`,
        "annotate a class, function or constant declared at the top of the module, or the module itself with import.meta"
      )
    }
    if (links?.type !== "ObjectExpression") return problem("the links must be an object literal, e.g. { is: \"ARCH-x\" }")
    const attrs: Record<string, unknown> = {}
    if (declaration) {
      if (declaration.type !== "ObjectExpression") return problem("the declaration must be an object literal")
      for (const property of declaration.properties as ReadonlyArray<Node>) {
        const key = propertyKey(property)
        const value = property.type === "Property" ? literal(property.value as Node) : undefined
        if (key === undefined || value === undefined || Array.isArray(value)) {
          return problem("declaration attributes must be literal strings, numbers or booleans")
        }
        attrs[key] = value
      }
    }
    const where = name === undefined ? { line: 1, doc: moduleDoc } : declarations.get(name)
    for (const property of links.properties as ReadonlyArray<Node>) {
      const rel = propertyKey(property)
      const value = property.type === "Property" ? literal(property.value as Node) : undefined
      const targets = typeof value === "string" ? [value] : Array.isArray(value) ? value : undefined
      if (rel === undefined || targets === undefined) {
        problem(`ids must be string literals${rel ? ` (relation ${rel})` : ""}: sdp reads annotations without running code`)
        continue
      }
      annotations.push({
        file,
        line,
        rel,
        targets,
        attrs: rel === "is" ? attrs : {},
        symbol,
        symbolLine: where?.line ?? line,
        doc: where?.doc
      })
    }
  }
  visit(program, new Set())
  return { annotations, problems }
}
annotate(readTypedAnnotations, { is: "ARCH-code-annotations" })

const importedName = (spec: Node): string | undefined => {
  const imported = spec.imported as { name?: string; value?: string } | undefined
  return imported?.name ?? imported?.value
}

const isAnnotate = (callee: Node, direct: ReadonlySet<string>, namespaces: ReadonlySet<string>, locals: ReadonlySet<string>) => {
  if (callee.type === "Identifier") return direct.has(callee.name as string) && !locals.has(callee.name as string)
  if (callee.type !== "MemberExpression" || callee.computed) return false
  const object = callee.object as Node
  return object.type === "Identifier" && namespaces.has(object.name as string) && !locals.has(object.name as string) &&
    (callee.property as Node).name === "annotate"
}

/** Wrappers that change only types: parentheses, `as const`, `satisfies T`, `<T>x`, `x!`. */
const typeOnly = new Set(["ParenthesizedExpression", "TSAsExpression", "TSSatisfiesExpression", "TSTypeAssertion", "TSNonNullExpression"])

const unwrap = (node: Node | undefined): Node | undefined => node && typeOnly.has(node.type) ? unwrap(node.expression as Node) : node

const functions = new Set(["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"])

/**
 * The names a node binds for the code inside it: a function's own name (for an
 * expression), parameters and `var`s; a block's `let`, `const`, `class` and
 * function declarations; a loop head's declarations; a catch parameter.
 */
const scopeNames = (node: Node): ReadonlyArray<string> => {
  switch (node.type) {
    case "FunctionDeclaration":
    case "FunctionExpression":
    case "ArrowFunctionExpression": {
      const own = node.type === "FunctionExpression" && isNode(node.id) ? [node.id.name as string] : []
      const params = (node.params as ReadonlyArray<Node>).flatMap(boundNames)
      return [...own, ...params, ...(isNode(node.body) ? hoisted(node.body) : [])]
    }
    case "ClassExpression":
      return isNode(node.id) ? [node.id.name as string] : []
    case "CatchClause":
      return isNode(node.param) ? boundNames(node.param) : []
    case "BlockStatement":
      return (node.body as ReadonlyArray<Node>).flatMap(lexicalNames)
    case "StaticBlock":
    case "TSModuleBlock":
      return [...(node.body as ReadonlyArray<Node>).flatMap(lexicalNames), ...hoisted(node)]
    case "SwitchStatement":
      return (node.cases as ReadonlyArray<Node>).flatMap((c) => (c.consequent as ReadonlyArray<Node>).flatMap(lexicalNames))
    case "ForStatement":
      return isNode(node.init) ? lexicalNames(node.init) : []
    case "ForInStatement":
    case "ForOfStatement":
      return lexicalNames(node.left as Node)
    default:
      return []
  }
}

/** Value names a statement declares in its block (type-only declarations bind none). */
const lexicalNames = (statement: Node): ReadonlyArray<string> => {
  const declared = statement.type === "ExportNamedDeclaration" ? statement.declaration : statement
  if (!isNode(declared)) return []
  switch (declared.type) {
    case "VariableDeclaration":
      return (declared.declarations as ReadonlyArray<Node>).flatMap((d) => boundNames(d.id as Node))
    case "FunctionDeclaration":
    case "TSDeclareFunction":
    case "ClassDeclaration":
    case "TSEnumDeclaration":
    case "TSModuleDeclaration":
    case "TSImportEqualsDeclaration":
      return isNode(declared.id) && declared.id.type === "Identifier" ? [declared.id.name as string] : []
    default:
      return []
  }
}

/** `var`s declared anywhere in a body but not in a nested function: they are bound throughout it. */
const hoisted = (body: Node): ReadonlyArray<string> => {
  const names: Array<string> = []
  const walk = (node: Node) => {
    if (node.type === "VariableDeclaration" && node.kind === "var") {
      names.push(...(node.declarations as ReadonlyArray<Node>).flatMap((d) => boundNames(d.id as Node)))
    }
    for (const value of Object.values(node)) {
      for (const child of Array.isArray(value) ? value : [value]) {
        if (isNode(child) && !functions.has(child.type) && child.type !== "StaticBlock") walk(child)
      }
    }
  }
  walk(body)
  return names
}

/** The names a binding pattern declares: `a`, `{ a, b: c }`, `[a, ...b]`, `a = 1`, `private a`. */
const boundNames = (pattern: Node): ReadonlyArray<string> => {
  switch (pattern.type) {
    case "Identifier":
      return [pattern.name as string]
    case "ObjectPattern":
      return (pattern.properties as ReadonlyArray<Node>).flatMap(boundNames)
    case "Property":
      return boundNames(pattern.value as Node)
    case "ArrayPattern":
      return (pattern.elements as ReadonlyArray<Node | null>).flatMap((element) => element ? boundNames(element) : [])
    case "AssignmentPattern":
      return boundNames(pattern.left as Node)
    case "RestElement":
      return boundNames(pattern.argument as Node)
    case "TSParameterProperty":
      return boundNames(pattern.parameter as Node)
    default:
      return []
  }
}

const symbolName = (node: Node): string | undefined => {
  if (node.type === "Identifier") return node.name as string
  if (node.type === "MemberExpression" && !node.computed) {
    const object = symbolName(node.object as Node)
    return object === undefined ? undefined : `${object}.${(node.property as Node).name as string}`
  }
  return undefined
}

const propertyKey = (property: Node): string | undefined => {
  if (property.type !== "Property" || property.computed) return undefined
  const key = property.key as Node
  return key.type === "Identifier" ? key.name as string : typeof key.value === "string" ? key.value : undefined
}

/** A literal string, number or boolean, or an array of string literals; undefined for anything computed. */
const literal = (node: Node): string | number | boolean | ReadonlyArray<string> | undefined => {
  node = unwrap(node)!
  if (node.type === "Literal" && ["string", "number", "boolean"].includes(typeof node.value)) {
    return node.value as string | number | boolean
  }
  if (node.type === "TemplateLiteral" && (node.expressions as ReadonlyArray<unknown>).length === 0) {
    return ((node.quasis as ReadonlyArray<Node>)[0]!.value as { cooked: string }).cooked
  }
  if (node.type === "ArrayExpression") {
    const values = (node.elements as ReadonlyArray<Node | null>).map((element) => element && literal(element))
    return values.every((v): v is string => typeof v === "string") ? values : undefined
  }
  return undefined
}

const declaredNames = (node: Node): ReadonlyArray<string> => {
  switch (node.type) {
    case "FunctionDeclaration":
    case "ClassDeclaration":
    case "TSInterfaceDeclaration":
    case "TSTypeAliasDeclaration":
    case "TSEnumDeclaration":
    case "TSModuleDeclaration":
      return isNode(node.id) && node.id.type === "Identifier" ? [node.id.name as string] : []
    case "VariableDeclaration":
      return (node.declarations as ReadonlyArray<Node>).flatMap((d) => boundNames(d.id as Node))
    default:
      return []
  }
}

/** The first paragraph of a JSDoc comment, without its leading asterisks and before any @tag. */
const summary = (comment: string): string | undefined => {
  const text = comment
    .split("\n")
    .map((line) => line.replace(/^\s*\*+ ?/, "").trimEnd())
    .join("\n")
  const paragraph = text.split(/\n\s*\n|\n@/)[0]!.replace(/\s+/g, " ").trim()
  return paragraph === "" ? undefined : paragraph
}
