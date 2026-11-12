/**
 * Code annotations, in any language: a tag in a comment,
 *
 *     @sdp <relation> <ID>[,<ID>...] [key=value ...]
 *
 * links code to graph nodes. The relation is free text (`implements`, `is`, `plays`, ...); `is`
 * anchors a node in code and declares it if no spec does. `grep -rn "@sdp" src/` lists every one.
 *
 * In TypeScript and JavaScript the file is parsed, never run: a tag annotates the module-level
 * declaration its comment documents, or the file when its comment opens the file, and the rest of
 * that comment describes the code. A tag anywhere else, or one written after code on its line, is
 * not read, and is reported; a string is never a tag. The modules a file anchored to a node imports
 * come from the same parse. Other languages have no parser here: a line that opens with a comment
 * marker and the tag annotates the declaration directly below it, or else the file — best effort,
 * even inside a multi-line string — and their imports are not read.
 *
 * @sdp is ARCH-code-annotations
 * @sdp plays PAT-static-reading
 */
import { type Import, isNode, type Node, parseScript, type Script } from "./Script.ts"
import { shapes } from "./Shape.ts"

export interface Annotation {
  readonly file: string
  /** The line of the tag. */
  readonly line: number
  readonly rel: string
  readonly targets: ReadonlyArray<string>
  readonly attrs: Readonly<Record<string, unknown>>
  /** The module-level declaration the tag annotates; undefined when it annotates the file. */
  readonly symbol: string | undefined
  /** The line of what the tag annotates: its declaration, or the first of the file. */
  readonly symbolLine: number
  /** What the comment around the tag says of that code, without its tags. */
  readonly doc?: string | undefined
  /** The shape of the declaration, as written (Shape.ts). */
  readonly shape?: string | undefined
  /** For a function, whether it states the type it returns. */
  readonly returnType?: boolean | undefined
  /** For a file, the shapes of what it exports. */
  readonly exports?: ReadonlyArray<string> | undefined
}

/** Something written that sdp does not read, at its line, with why and what to do instead. */
export interface Unread {
  readonly line: number
  readonly message: string
  readonly hint: string
}

export interface CodeScan {
  readonly annotations: ReadonlyArray<Annotation>
  /** Files that annotate but do not parse, so none of their tags can be read. */
  readonly unreadable: ReadonlyArray<Unread>
  /** Tags written where they annotate nothing. */
  readonly ignored: ReadonlyArray<Unread>
  /** The modules a TypeScript or JavaScript file that anchors a node loads code from. */
  readonly imports: ReadonlyArray<Import>
}

const nothing: CodeScan = { annotations: [], unreadable: [], ignored: [], imports: [] }

/**
 * Every tag of one code file, and what could not be read. `anchor` is the relation that anchors a
 * node, whose file's imports are read.
 *
 * @sdp is ARCH-code-annotations
 */
export const scanCode = (file: string, content: string, anchor: string): CodeScan => {
  if (!content.includes("@sdp")) return nothing
  const script = parseScript(file, content)
  if (script === undefined) {
    return { annotations: scanLines(file, content), unreadable: [], ignored: ignoredLines(content), imports: [] }
  }
  if (script.error) {
    // Unread tags would silently drop out of the graph: say so.
    return {
      ...nothing,
      unreadable: [{
        line: script.error.line,
        message: `the file does not parse, so its annotations cannot be read: ${script.error.message}`,
        hint: "fix the syntax error; until then none of the file's annotations are in the graph"
      }]
    }
  }
  const { annotations, ignored } = readTags(file, content, script)
  // Only a module anchored to a node depends on another through what it imports.
  const imports = annotations.some((annotation) => annotation.rel === anchor) ? script.imports() : []
  return { annotations, unreadable: [], ignored, imports }
}

/** A comment's line, after the comment's own `/`, `*` and `!`, that opens with the tag. */
const commentMarker = /^[\s/*!]*@sdp\s+([A-Za-z][\w.:-]*)\s+(.+)$/

/** What a tag annotates: a module-level declaration, or the file, with what the comment and the code say of it. */
type Target = Pick<Annotation, "symbol" | "symbolLine" | "doc" | "shape" | "returnType" | "exports">

/**
 * The tags of a parsed file. Comments on lines of their own with no blank line between them are one
 * comment: it documents the module-level declaration that follows it directly, or else, when no
 * code comes before it, opens the file.
 */
const readTags = (file: string, content: string, script: Script): Pick<CodeScan, "annotations" | "ignored"> => {
  const annotations: Array<Annotation> = []
  const ignored: Array<Unread> = []
  const { lineOf, program } = script
  const lineStart = (offset: number) => content.lastIndexOf("\n", offset - 1) + 1
  const afterCode = (offset: number) => content.slice(lineStart(offset), offset).trim() !== ""
  const groups: Array<Array<Script["comments"][number]>> = []
  for (const comment of script.comments) {
    const last = groups.at(-1)?.at(-1)
    const joined = last !== undefined && !afterCode(comment.start) && !afterCode(last.start) &&
      /^[ \t]*\r?\n?[ \t]*$/.test(content.slice(last.end, comment.start))
    if (joined) groups.at(-1)!.push(comment)
    else groups.push([comment])
  }
  const firstCode = program.body[0]?.start ?? content.length
  const shaped = shapes(content, script)
  for (const group of groups) {
    const tags = group.flatMap((comment) =>
      comment.value.split(/\r?\n/).flatMap((text, index) => {
        const match = commentMarker.exec(text)
        const tag = match && readTag(match[1]!, match[2]!)
        return tag ? [{ ...tag, line: lineOf(comment.start) + index, trailing: index === 0 && afterCode(comment.start) }] : []
      })
    )
    if (tags.length === 0) continue
    const end = group.at(-1)!.end
    const next = program.body.find((statement) => statement.start >= end)
    const doc = description(group.map((comment) => comment.value))
    const declared = next && /^[ \t]*\r?\n?[ \t]*$/.test(content.slice(end, next.start)) ? declaredName(next) : undefined
    const shape = declared === undefined ? undefined : shaped.of(next!)
    const target: Target | undefined = declared !== undefined
      ? { symbol: declared, symbolLine: lineOf(next!.start), doc, shape: shape?.text, returnType: shape?.returnType }
      : end <= firstCode
      ? { symbol: undefined, symbolLine: 1, doc, exports: nonEmpty(shaped.exports()) }
      : undefined
    for (const { line, rel, targets, attrs, trailing } of tags) {
      const written = `@sdp ${rel} ${targets.join(", ")}`
      if (trailing) {
        ignored.push({ line, message: `"${written}" follows code on the same line, so it is not read as an annotation`, hint: trailingHint })
      } else if (target === undefined) {
        ignored.push({
          line,
          message: `"${written}" documents no module-level declaration and does not open the file, so it is not read`,
          hint: "write it in the doc comment directly above a module-level declaration, or in the comment that opens the file"
        })
      } else {
        annotations.push({ file, line, rel, targets, attrs, ...target })
      }
    }
  }
  return { annotations, ignored }
}

const nonEmpty = <A>(list: ReadonlyArray<A>): ReadonlyArray<A> | undefined => list.length > 0 ? list : undefined

const trailingHint =
  "put it on a comment line of its own: in the doc comment of a declaration it annotates that declaration, in the comment that opens the file the file"

/** The name a module-level statement declares, `default` for an anonymous default export; undefined for any other statement. */
const declaredName = (statement: Node): string | undefined => {
  if (statement.type === "ExportDefaultDeclaration") {
    const declared = statement.declaration as Node
    return isNode(declared.id) ? declared.id.name as string : "default"
  }
  const declared = statement.type === "ExportNamedDeclaration" ? statement.declaration : statement
  if (!isNode(declared)) return undefined
  switch (declared.type) {
    case "FunctionDeclaration":
    case "TSDeclareFunction":
    case "ClassDeclaration":
    case "TSInterfaceDeclaration":
    case "TSTypeAliasDeclaration":
    case "TSEnumDeclaration":
    case "TSModuleDeclaration":
      return isNode(declared.id) && declared.id.type === "Identifier" ? declared.id.name as string : undefined
    case "VariableDeclaration": {
      const [first] = declared.declarations as ReadonlyArray<Node>
      const id = first?.id as Node | undefined
      return id?.type === "Identifier" ? id.name as string : undefined
    }
    default:
      return undefined
  }
}

/**
 * What a comment says of the code it documents: its first paragraph without its tags, before any
 * other tag of the comment's own (`@internal`, `@param`).
 */
const description = (comments: ReadonlyArray<string>): string | undefined => {
  const lines = comments
    .flatMap((comment) => comment.split(/\r?\n/))
    .map((line) => line.replace(/^\s*\*+ ?/, "").replace(/^[/!]+ ?/, "").trimEnd())
    .filter((line) => !commentMarker.test(line))
  const tagged = lines.findIndex((line) => /^\s*@\w/.test(line))
  const words = tagged < 0 ? lines : lines.slice(0, tagged)
  return words.join("\n").split(/\n\s*\n/).map((text) => text.replace(/\s+/g, " ").trim()).find((text) => text !== "")
}

const lineMarker = /^\s*(?:(?:\/\/+|\/\*+|\*+|#+|--+|<!--|;+|%+|"""|''')!?\s*)?@sdp\s+([A-Za-z][\w.:-]*)\s+(.+)$/
const idToken = /^[A-Za-z][\w.:#/-]*$/
const declaration =
  /\b(?:class|interface|type|function\*?|const|let|var|enum|def|func|fn|struct|trait|module|object|record|namespace|impl)\s+([A-Za-z_$][\w$]*)/
const commentOnly = /^\s*(\/\/|\/\*|\*|#|--|<!--|;|%|"""|''')/

/** Languages without a parser: comment lines that open with the tag, line by line. */
const scanLines = (file: string, content: string): ReadonlyArray<Annotation> => {
  const lines = content.split(/\r?\n/)
  return lines.flatMap((text, index) => {
    const match = lineMarker.exec(text)
    const tag = match && readTag(match[1]!, match[2]!)
    if (!tag) return []
    const below = nextSymbol(lines, index)
    return [{ file, line: index + 1, ...tag, symbol: below?.name, symbolLine: below?.line ?? 1 }]
  })
}

const trailing = /\S.*?(?:\/\/+|\/\*+|#+|--+|;+)\s*(@sdp\s+[A-Za-z][\w.:-]*\s+[A-Za-z][\w.:#/-]*(?:,[A-Za-z][\w.:#/-]*)*)(?=\s|$|\*\/|-->)/

/** Languages without a parser: comments after code that look like tags but, not opening their line, are not read. */
const ignoredLines = (content: string): ReadonlyArray<Unread> =>
  content.split(/\r?\n/).flatMap((text, index) => {
    // A comment line that mentions a tag is prose; only code followed by a comment counts.
    if (lineMarker.test(text) || commentOnly.test(text)) return []
    const match = trailing.exec(text)
    return match
      ? [{ line: index + 1, message: `"${match[1]!}" follows code on the same line, so it is not read as an annotation`, hint: trailingHint }]
      : []
  })

/** The relation, ids and attributes `@sdp <rel> <rest>` says, or undefined when its targets are not ids. */
const readTag = (rel: string, rest: string) => {
  const tokens = tokenize(rest.replace(/\s*(\*\/|-->|"""|''').*$/, ""))
  const targets: Array<string> = []
  const attrs: Array<readonly [string, unknown]> = []
  for (const token of tokens) {
    const eq = token.indexOf("=")
    if (eq > 0) attrs.push([token.slice(0, eq), coerce(unquote(token.slice(eq + 1)))])
    else targets.push(...token.split(",").map((t) => t.trim()).filter(Boolean))
  }
  if (targets.length === 0 || !targets.every((t) => idToken.test(t))) return undefined
  // Not assigned one by one: `__proto__` is a key like any other.
  return { rel, targets, attrs: Object.fromEntries(attrs) }
}

/** A tag directly above a declaration annotates it; one followed by a blank line, the file. */
const nextSymbol = (lines: ReadonlyArray<string>, from: number): { readonly name: string; readonly line: number } | undefined => {
  for (let i = from + 1; i < Math.min(lines.length, from + 8); i++) {
    const line = lines[i]!
    if (line.trim() === "") return undefined
    if (commentOnly.test(line) || line.includes("@sdp")) continue
    const name = declaration.exec(line)?.[1]
    return name === undefined ? undefined : { name, line: i + 1 }
  }
  return undefined
}

const tokenize = (text: string): ReadonlyArray<string> => text.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? []

const unquote = (value: string) => value.replace(/^(["'])(.*)\1$/, "$2")

const coerce = (value: string): unknown =>
  value === "true" ? true : value === "false" ? false : /^-?\d+(\.\d+)?$/.test(value) ? Number(value) : value

export const codeNodeId = (annotation: Pick<Annotation, "file" | "symbol">): string =>
  annotation.symbol ? `code:${annotation.file}#${annotation.symbol}` : `code:${annotation.file}`
