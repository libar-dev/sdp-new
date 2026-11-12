/**
 * Reads typed annotations — `annotate(target, links, declaration?)` calls
 * imported from "sdp/annotations" — out of TypeScript and JavaScript source.
 * Statically: the code is parsed, never run. Only literal ids and attributes
 * count; anything computed is reported as unreadable rather than guessed.
 *
 * The annotated symbol's JSDoc (or the module's leading JSDoc for
 * `import.meta`) comes along as its description, so the code's own words reach
 * the graph and the context bundles.
 */
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
}

export interface TypedScan {
  readonly annotations: ReadonlyArray<TypedAnnotation>
  readonly problems: ReadonlyArray<TypedAnnotationProblem>
}

const empty: TypedScan = { annotations: [], problems: [] }

/** "sdp", "sdp/annotations", or a relative path to an annotations module (sdp's own source). */
const annotationModule = /^sdp(\/annotations)?$|(^|\/)annotations(\.[cm]?[jt]sx?)?$/

const languageOf = (file: string): "ts" | "tsx" | "js" | "jsx" | undefined => {
  const ext = /\.([cm]?[jt]sx?)$/.exec(file)?.[1]
  if (!ext) return undefined
  return ext.endsWith("tsx") ? "tsx" : ext.endsWith("jsx") ? "jsx" : ext.includes("t") ? "ts" : "js"
}

type Node = { readonly type: string; readonly start: number; readonly end: number; readonly [key: string]: unknown }

const isNode = (value: unknown): value is Node =>
  typeof value === "object" && value !== null && typeof (value as { type?: unknown }).type === "string"

export const scanTypedAnnotations = (file: string, content: string): TypedScan => {
  const lang = languageOf(file)
  if (!lang || !content.includes("annotate")) return empty
  const parsed = parseSync(file, content, { lang, sourceType: "module" })
  if (parsed.errors.length > 0) return empty
  const program = parsed.program as unknown as Node & { readonly body: ReadonlyArray<Node> }

  // Local names bound to `annotate`, and namespaces whose `.annotate` is it.
  const direct = new Set<string>()
  const namespaces = new Set<string>()
  for (const statement of program.body) {
    if (statement.type !== "ImportDeclaration") continue
    const source = (statement.source as { value: string }).value
    if (!annotationModule.test(source)) continue
    for (const spec of statement.specifiers as ReadonlyArray<Node>) {
      const local = (spec.local as { name: string }).name
      if (spec.type === "ImportSpecifier" && importedName(spec) === "annotate") direct.add(local)
      if (spec.type === "ImportNamespaceSpecifier") namespaces.add(local)
    }
  }
  if (direct.size === 0 && namespaces.size === 0) return empty

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

  const jsdocs = (parsed.comments as ReadonlyArray<{ type: string; value: string; start: number; end: number }>)
    .filter((c) => c.type === "Block" && c.value.startsWith("*"))
  const docBefore = (start: number): string | undefined => {
    const comment = [...jsdocs].reverse().find((c) => c.end <= start)
    if (!comment || content.slice(comment.end, start).trim() !== "") return undefined
    return summary(comment.value)
  }
  const moduleDoc = jsdocs[0] && (!program.body[0] || jsdocs[0].end <= program.body[0].start) ? summary(jsdocs[0].value) : undefined

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
  const visit = (node: Node) => {
    if (node.type === "CallExpression" && isAnnotate(node.callee as Node, direct, namespaces)) {
      read(node)
      return
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) for (const child of value) isNode(child) && visit(child)
      else if (isNode(value)) visit(value)
    }
  }
  const read = (call: Node) => {
    const line = lineOf(call.start)
    const [target, links, declaration] = call.arguments as ReadonlyArray<Node | undefined>
    const problem = (message: string) => problems.push({ line, message })
    let symbol: string | undefined
    if (target?.type === "MetaProperty") symbol = undefined
    else if (target && symbolName(target) !== undefined) symbol = symbolName(target)
    else return problem("the annotation target must be a name (a class, function or constant) or import.meta")
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
    const where = symbol === undefined ? { line: 1, doc: moduleDoc } : declarations.get(symbol.split(".")[0]!)
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
  visit(program)
  return { annotations, problems }
}

const importedName = (spec: Node): string | undefined => {
  const imported = spec.imported as { name?: string; value?: string } | undefined
  return imported?.name ?? imported?.value
}

const isAnnotate = (callee: Node, direct: ReadonlySet<string>, namespaces: ReadonlySet<string>) =>
  (callee.type === "Identifier" && direct.has(callee.name as string)) ||
  (callee.type === "MemberExpression" && !callee.computed && (callee.object as Node).type === "Identifier" &&
    namespaces.has((callee.object as Node).name as string) && ((callee.property as Node).name as string) === "annotate")

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
  if (node.type === "TSAsExpression" || node.type === "TSSatisfiesExpression") return literal(node.expression as Node)
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
      return (node.declarations as ReadonlyArray<Node>).flatMap((d) =>
        isNode(d.id) && d.id.type === "Identifier" ? [d.id.name as string] : []
      )
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
