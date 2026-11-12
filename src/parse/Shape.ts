/**
 * The shape of a TypeScript or JavaScript declaration as it is written: what it declares, and its
 * signature, members or type, on one line and without bodies, initial values or comments, as a
 * declaration file would have it. Read from the parse and never with a type checker, so a type the
 * compiler would infer is not there.
 *
 * @sdp is ARCH-code-annotations
 */
import { children, isNode, type Node, type Script } from "./Script.ts"

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

/** The functions of Effect that make a function of a generator: `Effect.fn`, and the untraced ones. */
const effectFunctions = new Set(["fn", "fnUntraced", "fnUntracedEager"])

/** The one of them that also takes a name first, `Effect.fn("pay")(body)`. */
const takesName: ReadonlySet<string> = new Set(["fn"])

/**
 * The names a file imports Effect's module under: `import { Effect } from "effect"`, or the module
 * itself, `import * as Effect from "effect/Effect"`.
 */
const effectNames = (program: Script["program"]): ReadonlySet<string> =>
  new Set(program.body.flatMap((statement) => {
    if (statement.type !== "ImportDeclaration" || statement.importKind === "type") return []
    const from = (statement.source as Node).value
    return (statement.specifiers as ReadonlyArray<Node>).flatMap((specifier) => {
      const local = (specifier.local as Node).name as string
      if (from === "effect") return specifier.type === "ImportSpecifier" && nameOf(specifier.imported as Node) === "Effect" ? [local] : []
      return from === "effect/Effect" && specifier.type !== "ImportSpecifier" ? [local] : []
    })
  }))

/**
 * The body Effect makes a function of, as its documentation has the arguments: `Effect.fn(body, …)`,
 * `Effect.fn(name, options?)(body, …)` whatever expression gives the name, and
 * `Effect.fn({ self }, body, …)`; the arguments after the body transform what it returns. Only
 * `Effect.fn` takes a name. Any other call is not read.
 */
const effectBody = (call: Node, effect: ReadonlySet<string>): Node | undefined => {
  const isFn = (callee: unknown, functions: ReadonlySet<string> = effectFunctions): boolean =>
    isNode(callee) && callee.type === "MemberExpression" && !callee.computed && isNode(callee.object) &&
    callee.object.type === "Identifier" && effect.has(callee.object.name as string) && functions.has(nameOf(callee.property as Node) ?? "")
  // A name is any expression but the body and the `{ self }` that the other forms begin with.
  const [name] = isNode(call.callee) && call.callee.type === "CallExpression" ? call.callee.arguments as ReadonlyArray<Node> : []
  const named = isNode(call.callee) && call.callee.type === "CallExpression" && isFn(call.callee.callee, takesName) &&
    name !== undefined && !functions.has(name.type) && name.type !== "ObjectExpression" && name.type !== "SpreadElement"
  if (!named && !isFn(call.callee)) return undefined
  const [first, second] = call.arguments as ReadonlyArray<Node>
  const body = first?.type === "ObjectExpression" ? second : first
  return body && functions.has(body.type) ? body : undefined
}

/**
 * The function a variable's value is: one written there, through what changes only its type, or
 * the body `Effect.fn` makes one of.
 */
const functionOf = (value: Node | null | undefined, effect: ReadonlySet<string>): Node | undefined => {
  if (!isNode(value)) return undefined
  if (typeOnly.has(value.type)) return functionOf(value.expression as Node, effect)
  if (functions.has(value.type)) return value
  return value.type === "CallExpression" ? effectBody(value, effect) : undefined
}

/** The shapes of the declarations of one parsed file. */
export const shapes = (content: string, script: Script): Shapes => {
  /** The source between two offsets, without its comments, and with each `skipped` range in it left out or put as it says, on one line. */
  const written = (start: number, end: number, skipped: ReadonlyArray<readonly [number, number, string?]> = []): string => {
    let text = ""
    let at = start
    const left = [...script.comments.map((comment) => [comment.start, comment.end] as const), ...skipped].sort(([a], [b]) => a - b)
    for (const [from, to, put = ""] of left) {
      if (from < at || to > end) continue
      text += content.slice(at, from) + put
      at = to
    }
    // A line break between two members of a type, which separates them as written, stays a separator.
    return (text + content.slice(at, end)).replace(/([\w)\]>"'`?])[ \t]*\r?\n\s*(?=[A-Za-z_$#[])/g, "$1; ").replace(/\s+/g, " ").trim()
  }
  const of = (node: Node | null | undefined): string => isNode(node) ? written(node.start, node.end) : ""
  /** A type annotation's type, without its colon. */
  const typeOf = (annotation: unknown): string | undefined => isNode(annotation) ? of(annotation.typeAnnotation as Node) : undefined
  const member = (node: Node) => written(node.start, node.end).replace(/[;,]$/, "")

  /** Where a pattern gives a default value, ` = value`, to leave out. */
  const defaults = (node: Node): ReadonlyArray<readonly [number, number]> =>
    node.type === "AssignmentPattern"
      ? [[(node.left as Node).end, (node.right as Node).end], ...defaults(node.left as Node)]
      : children(node).flatMap(defaults)
  /**
   * A parameter as a declaration file has it: one with a default value without the value, of the
   * type written or else the literal value's, optional — or, before a parameter that is not, of that
   * type or undefined — and a property it declares only if public: a private one is a parameter like
   * any other.
   */
  const parameter = (node: Node, beforeRequired: boolean): string => {
    if (node.type === "TSParameterProperty") {
      const inner = node.parameter as Node
      const hidden = node.accessibility === "private" || node.accessibility === "protected"
      return hidden ? parameter(inner, beforeRequired) : `${written(node.start, inner.start)} ${parameter(inner, beforeRequired)}`.trim()
    }
    if (node.type !== "AssignmentPattern") return written(node.start, node.end, defaults(node))
    const left = node.left as Node
    const annotation = isNode(left.typeAnnotation) ? left.typeAnnotation : undefined
    const name = written(left.start, annotation?.start ?? left.end, defaults(left))
    const type = annotation === undefined ? literalType(node.right as Node) : typeOf(annotation)
    if (!beforeRequired) return `${name}?${type ? `: ${type}` : ""}`
    const bare = isNode(annotation?.typeAnnotation) && looseTypes.has(annotation.typeAnnotation.type) ? `(${type})` : type
    return `${name}${type ? `: ${bare} | undefined` : ""}`
  }
  const parameters = (fn: Node) => {
    const params = fn.params as ReadonlyArray<Node>
    return params.map((param, index) => parameter(param, params.slice(index + 1).some(required))).join(", ")
  }

  const signature = (fn: Node, name: string): Shape => {
    const returns = typeOf(fn.returnType)
    return { text: `function ${name}${of(fn.typeParameters as Node)}(${parameters(fn)})${returns ? `: ${returns}` : ""}`, returnType: returns !== undefined }
  }

  /** A class's public members: a method by its signature, a property by its type, nothing private. */
  const classMember = (node: Node): string | undefined => {
    const key = node.key as Node | undefined
    if (node.accessibility === "private" || node.accessibility === "protected" || key?.type === "PrivateIdentifier") return undefined
    if (node.type === "MethodDefinition" || node.type === "TSAbstractMethodDefinition") {
      // The method's function starts at its type parameters or its `(`: what comes before is its name and modifiers.
      const fn = node.value as Node
      const returns = typeOf(fn.returnType)
      return `${written(node.start, fn.start)}${of(fn.typeParameters as Node)}(${parameters(fn)})${returns ? `: ${returns}` : ""}`
    }
    if (node.type === "PropertyDefinition" || node.type === "TSAbstractPropertyDefinition" || node.type === "AccessorProperty") {
      const value = node.value as Node | null
      return value ? written(node.start, value.start).replace(/=$/, "").trim() : member(node)
    }
    return node.type === "StaticBlock" ? undefined : member(node)
  }

  /** A class's members as it can be called: an overloaded method by its signatures, not its implementation's. */
  const classMembers = (body: ReadonlyArray<Node>): ReadonlyArray<string> => {
    const method = (node: Node) => node.type === "MethodDefinition" ? `${node.static ? "static " : ""}${of(node.key as Node)}` : undefined
    const overloaded = new Set(body.filter((node) => method(node) !== undefined && !isNode((node.value as Node).body)).map(method))
    return body.filter((node) => !overloaded.has(method(node)) || !isNode((node.value as Node).body)).flatMap((node) => classMember(node) ?? [])
  }

  /** Where an expression holds the body of a function, and what is put in its place: `{…}`, or `…` for an arrow's expression. */
  const bodies = (node: Node): ReadonlyArray<readonly [number, number, string]> => {
    if (!functions.has(node.type) || !isNode(node.body)) return children(node).flatMap(bodies)
    const body = node.body
    return [...children(node).filter((child) => child !== body).flatMap(bodies), [body.start, body.end, body.type === "BlockStatement" ? "{…}" : "…"]]
  }
  /** What a class extends, as written but for the bodies of the functions in it, which are code and no surface. */
  const heritage = (node: Node): string => written(node.start, node.end, bodies(node))

  const declarationShape = (declared: Node, name: string): Shape | undefined => {
    switch (declared.type) {
      case "FunctionDeclaration":
      case "TSDeclareFunction":
        return functionShape(declared, name)
      case "ClassDeclaration":
      case "ClassExpression": {
        const body = declared.body as Node
        const implemented = declared.implements as ReadonlyArray<Node>
        const head = [
          `${declared.abstract ? "abstract " : ""}class${isNode(declared.id) ? ` ${of(declared.id)}` : ""}${of(declared.typeParameters as Node)}`,
          ...isNode(declared.superClass) ? [`extends ${heritage(declared.superClass)}${of(declared.superTypeArguments as Node)}`] : [],
          ...implemented.length > 0 ? [`implements ${implemented.map(of).join(", ")}`] : []
        ].join(" ")
        const members = classMembers(body.body as ReadonlyArray<Node>)
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

  const effect = effectNames(script.program)
  /** A variable's shape: its type as written, or else the function its value is; any other value says nothing of itself. */
  const variableShape = (kind: string, declarator: Node, name: string): Shape => {
    const type = typeOf((declarator.id as Node).typeAnnotation)
    const fn = type === undefined ? functionOf(declarator.init as Node | null, effect) : undefined
    return fn ? signature(fn, name) : { text: `${kind} ${name}${type ? `: ${type}` : ""}` }
  }

  /** The module-level functions of each name: one, or the signatures of an overloaded one and its implementation. */
  const functionsByName = new Map<string, Array<Node>>()
  for (const statement of script.program.body) {
    const declared = statement.type === "ExportNamedDeclaration" || statement.type === "ExportDefaultDeclaration" ? statement.declaration : statement
    if (!isNode(declared) || (declared.type !== "FunctionDeclaration" && declared.type !== "TSDeclareFunction")) continue
    const name = isNode(declared.id) ? declared.id.name as string : undefined
    if (name !== undefined) functionsByName.set(name, [...functionsByName.get(name) ?? [], declared])
  }
  /** A function's shape: its signature, or, overloaded, each signature it can be called with — not its implementation's. */
  const functionShape = (fn: Node, name: string): Shape => {
    const all = functionsByName.get(name) ?? [fn]
    const overloads = all.length > 1 ? all.filter((candidate) => !isNode(candidate.body)) : []
    const callable = (overloads.length > 0 ? overloads : [fn]).map((candidate) => signature(candidate, name))
    return { text: callable.map((shape) => shape.text).join("; "), returnType: callable.every((shape) => shape.returnType) }
  }

  /** What a module-level statement declares, under each name it declares. */
  const declarations = (statement: Node): ReadonlyArray<readonly [string, Shape]> => {
    if (statement.type === "ExportDefaultDeclaration") {
      const declared = statement.declaration as Node
      // `export default Billing` exports the file's own Billing, as it declares it.
      const local = declared.type === "Identifier" ? ownDeclaration(declared.name as string) : undefined
      if (local !== undefined) return [["default", local]]
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
  /** The shape of a name the file declares, by a statement other than a default export. */
  const ownDeclaration = (name: string): Shape | undefined =>
    script.program.body.filter((statement) => statement.type !== "ExportDefaultDeclaration")
      .flatMap((statement) => declarations(statement)).find(([declared]) => declared === name)?.[1]

  const exports = (): ReadonlyArray<string> => {
    const local = new Map(script.program.body.flatMap((statement) => declarations(statement).map(([name, shape]) => [name, statement] as const)))
    // An overloaded function is exported once, with every signature, whichever of its declarations says `export`.
    return [...new Set(script.program.body.flatMap((statement) => {
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
    }))]
  }

  return { of: (statement) => declarations(statement)[0]?.[1], exports }
}

/** Whether a parameter must be given: one with no default value, not marked optional and not a rest parameter. */
const required = (node: Node): boolean => {
  const inner = node.type === "TSParameterProperty" ? node.parameter as Node : node
  return inner.type !== "AssignmentPattern" && inner.type !== "RestElement" && inner.optional !== true
}

/** The types that a union with `undefined` has to put in parentheses. */
const looseTypes: ReadonlySet<string> = new Set(["TSFunctionType", "TSConstructorType", "TSConditionalType"])

/** The type a declaration file gives a parameter whose default value is a literal: a string's, a number's, a boolean's or a bigint's. */
const literalType = (value: Node): string | undefined => {
  if (value.type === "TemplateLiteral") return "string"
  if (value.type === "UnaryExpression" && (value.operator === "-" || value.operator === "+")) {
    const of = literalType(value.argument as Node)
    return of === "number" || (of === "bigint" && value.operator === "-") ? of : undefined
  }
  if (value.type !== "Literal") return undefined
  if (typeof value.bigint === "string") return "bigint"
  return typeof value.value === "string" || typeof value.value === "number" || typeof value.value === "boolean" ? typeof value.value : undefined
}

const nameOf = (node: Node | undefined): string | undefined =>
  node === undefined ? undefined : typeof node.name === "string" ? node.name : typeof node.value === "string" ? node.value : undefined

/** A shape under the name it is exported as: the first word after what it declares, and after each further signature of a function's. */
const renamed = (text: string, from: string, to: string): string =>
  from === to ? text : text.replace(new RegExp(`(^\\S+ |; function )${from.replace(/[$]/g, "\\$&")}\\b`, "g"), `$1${to}`)
