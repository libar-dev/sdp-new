/**
 * The shape of a TypeScript or JavaScript declaration as it is written: what it declares, and its
 * signature, members or type, on one line and without bodies, initial values or comments, as a
 * declaration file would have it. Read from the parse and never with a type checker, so a type the
 * compiler would infer is not there.
 */
import { isNode, type Node, type Script } from "./Script.ts"

export interface Shape {
  /** `function total(lines: ReadonlyArray<Priced>): number`, `interface Priced { … }`, `const limit`. */
  readonly text: string
  /** For a function, whether it states the type it returns. */
  readonly returnType?: boolean | undefined
}

export interface Shapes {
  /** The shape of what a module-level statement declares, if it declares something. */
  readonly of: (statement: Node) => Shape | undefined
  /** The shapes of what the file exports from its own declarations, in the order it exports them. */
  readonly exports: () => ReadonlyArray<string>
}

const functions = new Set(["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression", "TSDeclareFunction"])

/** Wrappers that change only types: parentheses, `as`, `satisfies`, `<T>x`, `x!`. */
const typeOnly = new Set(["ParenthesizedExpression", "TSAsExpression", "TSSatisfiesExpression", "TSTypeAssertion", "TSNonNullExpression"])

/**
 * The function a constant's value is: a function written there, or the one a call wraps as its last
 * argument, as `Effect.fn("load")(function*(…) { … })` does.
 */
const functionOf = (value: Node | null | undefined): Node | undefined => {
  if (!isNode(value)) return undefined
  if (typeOnly.has(value.type)) return functionOf(value.expression as Node)
  if (functions.has(value.type)) return value
  if (value.type !== "CallExpression") return undefined
  const last = (value.arguments as ReadonlyArray<Node>).at(-1)
  return last && (typeOnly.has(last.type) ? functionOf(last) : functions.has(last.type) ? last : undefined)
}

/** The shapes of the declarations of one parsed file. */
export const shapes = (content: string, script: Script): Shapes => {
  /** The source between two offsets, without its comments, on one line. */
  const written = (start: number, end: number): string => {
    let text = ""
    let at = start
    for (const comment of script.comments) {
      if (comment.start < at || comment.end > end) continue
      text += content.slice(at, comment.start)
      at = comment.end
    }
    // A line break between two members of a type, which separates them as written, stays a separator.
    return (text + content.slice(at, end)).replace(/([\w)\]>"'`?])[ \t]*\r?\n\s*(?=[A-Za-z_$#[])/g, "$1; ").replace(/\s+/g, " ").trim()
  }
  const of = (node: Node | null | undefined): string => isNode(node) ? written(node.start, node.end) : ""
  /** A type annotation's type, without its colon. */
  const typeOf = (annotation: unknown): string | undefined => isNode(annotation) ? of(annotation.typeAnnotation as Node) : undefined
  const member = (node: Node) => written(node.start, node.end).replace(/[;,]$/, "")

  const signature = (fn: Node, name: string): Shape => {
    const returns = typeOf(fn.returnType)
    const params = (fn.params as ReadonlyArray<Node>).map(of).join(", ")
    return { text: `function ${name}${of(fn.typeParameters as Node)}(${params})${returns ? `: ${returns}` : ""}`, returnType: returns !== undefined }
  }

  /** A class's public members: a method by its signature, a property by its type, nothing private. */
  const classMember = (node: Node): string | undefined => {
    const key = node.key as Node | undefined
    if (node.accessibility === "private" || node.accessibility === "protected" || key?.type === "PrivateIdentifier") return undefined
    if (node.type === "MethodDefinition" || node.type === "TSAbstractMethodDefinition") {
      // The method's function starts at its type parameters or its `(`: what comes before is its name and modifiers.
      const fn = node.value as Node
      const returns = typeOf(fn.returnType)
      return `${written(node.start, fn.start)}${of(fn.typeParameters as Node)}(${(fn.params as ReadonlyArray<Node>).map(of).join(", ")})${
        returns ? `: ${returns}` : ""
      }`
    }
    if (node.type === "PropertyDefinition" || node.type === "TSAbstractPropertyDefinition" || node.type === "AccessorProperty") {
      const value = node.value as Node | null
      return value ? written(node.start, value.start).replace(/=$/, "").trim() : member(node)
    }
    return node.type === "StaticBlock" ? undefined : member(node)
  }

  const declarationShape = (declared: Node, name: string): Shape | undefined => {
    switch (declared.type) {
      case "FunctionDeclaration":
      case "TSDeclareFunction":
        return signature(declared, name)
      case "ClassDeclaration":
      case "ClassExpression": {
        const body = declared.body as Node
        const head = written(declared.start, body.start).replace(/^(export\s+)?(default\s+)?/, "")
        const members = (body.body as ReadonlyArray<Node>).flatMap((node) => classMember(node) ?? [])
        return { text: `${head} {${members.length > 0 ? ` ${members.join("; ")} ` : ""}}` }
      }
      case "TSInterfaceDeclaration": {
        const body = declared.body as Node
        const members = (body.body as ReadonlyArray<Node>).map(member)
        return { text: `${written(declared.start, body.start)} {${members.length > 0 ? ` ${members.join("; ")} ` : ""}}` }
      }
      case "TSTypeAliasDeclaration":
      case "TSEnumDeclaration":
        return { text: written(declared.start, declared.end).replace(/;$/, "") }
      case "TSModuleDeclaration":
        return { text: `${declared.kind === "module" ? "module" : "namespace"} ${of(declared.id as Node)}` }
      default:
        return undefined
    }
  }

  /** A variable's shape: the function its value is, or its type as written; a variable declared without a value has its type alone. */
  const variableShape = (kind: string, declarator: Node, name: string): Shape => {
    const fn = functionOf(declarator.init as Node | null)
    if (fn) return signature(fn, name)
    const type = typeOf((declarator.id as Node).typeAnnotation)
    return { text: `${kind} ${name}${type ? `: ${type}` : ""}` }
  }

  /** What a module-level statement declares, under each name it declares. */
  const declarations = (statement: Node): ReadonlyArray<readonly [string, Shape]> => {
    if (statement.type === "ExportDefaultDeclaration") {
      const declared = statement.declaration as Node
      const name = isNode(declared.id) ? declared.id.name as string : "default"
      const shape = declarationShape(declared, name) ?? (functions.has(declared.type) ? signature(declared, name) : { text: "default" })
      return [[name, shape]]
    }
    const declared = statement.type === "ExportNamedDeclaration" ? statement.declaration : statement
    if (!isNode(declared)) return []
    if (declared.type === "VariableDeclaration") {
      return (declared.declarations as ReadonlyArray<Node>).flatMap((declarator) => {
        const id = declarator.id as Node
        return id.type === "Identifier" ? [[id.name as string, variableShape(declared.kind as string, declarator, id.name as string)] as const] : []
      })
    }
    const name = isNode(declared.id) && declared.id.type === "Identifier" ? declared.id.name as string : undefined
    const shape = name === undefined ? undefined : declarationShape(declared, name)
    return name === undefined || shape === undefined ? [] : [[name, shape]]
  }

  const exports = (): ReadonlyArray<string> => {
    const local = new Map(script.program.body.flatMap((statement) => declarations(statement).map(([name, shape]) => [name, statement] as const)))
    return script.program.body.flatMap((statement) => {
      if (statement.type === "ExportDefaultDeclaration" || (statement.type === "ExportNamedDeclaration" && isNode(statement.declaration))) {
        return declarations(statement).map(([, shape]) => shape.text)
      }
      // `export { total, rate as vat }` of the file's own declarations; a module named after `from` is another file's.
      if (statement.type !== "ExportNamedDeclaration" || isNode(statement.source)) return []
      return (statement.specifiers as ReadonlyArray<Node>).flatMap((specifier) => {
        const localName = nameOf(specifier.local as Node)
        const exported = nameOf(specifier.exported as Node)
        const declaring = localName === undefined ? undefined : local.get(localName)
        const shape = declaring && declarations(declaring).find(([name]) => name === localName)?.[1]
        return shape && exported ? [renamed(shape.text, localName!, exported)] : []
      })
    })
  }

  return { of: (statement) => declarations(statement)[0]?.[1], exports }
}

const nameOf = (node: Node | undefined): string | undefined =>
  node === undefined ? undefined : typeof node.name === "string" ? node.name : typeof node.value === "string" ? node.value : undefined

/** A shape under the name it is exported as: its first word after what it declares. */
const renamed = (text: string, from: string, to: string): string =>
  from === to ? text : text.replace(new RegExp(`^(\\S+ )${from.replace(/[$]/g, "\\$&")}\\b`), `$1${to}`)
