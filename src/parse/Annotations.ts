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
 * that comment describes the code. A tag anywhere else, or one written after code or words on its
 * line, is not read, and is reported; a string is never a tag, nor is a line of code a doc comment
 * shows, in an `@example` or a fenced block. The modules a file anchored to a node imports come
 * from the same parse. Other languages have no parser here: a line that opens with a comment marker
 * and the tag annotates the declaration directly below it, past its decorators, or else the file —
 * best effort, even inside a multi-line string, but never in a fenced block of code a comment or a
 * docstring shows — the comment lines around it describe that code,
 * and their imports are not read. A tag in a Python docstring annotates the module, the class or the
 * function the docstring opens, and the docstring describes it.
 *
 * @sdp is ARCH-code-annotations
 * @sdp plays PAT-static-reading
 */
import { children, type Exports, type Import, isNode, literalName, type Node, parseScript, type Script } from "./Script.ts"
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
  /** What such a file exports, which says whether an import of some of its names loads its code. */
  readonly exports?: Exports | undefined
}

const nothing: CodeScan = { annotations: [], unreadable: [], ignored: [], imports: [] }

/**
 * Every tag of one code file, and what could not be read. `anchor` is the relation that anchors a
 * node, whose file's imports are read.
 *
 * @sdp is ARCH-code-annotations
 */
export const scanCode = (file: string, content: string, anchor: string): CodeScan => {
  if (!content.includes("@sdp") && !content.includes(retiredModule)) return nothing
  const script = parseScript(file, content)
  if (script === undefined) return { ...scanLines(file, content), imports: [] }
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
  const { annotations, ignored, unreadable } = readTags(file, content, script)
  // Only a module anchored to a node depends on another through what it imports.
  const anchored = annotations.some((annotation) => annotation.rel === anchor)
  const [imports, exports] = anchored ? [script.imports(), script.exports()] : [[], undefined]
  return { annotations, unreadable: [...unreadable, ...retiredImports(script)], ignored, imports, exports }
}

/** The module of `annotate()`, the form of annotation that tags replaced. */
const retiredModule = "sdp/annotations"

/**
 * Each place the file names the retired module — an import or a re-export of it, types alone
 * included, `import()`, `require()` or `import … = require()`: nothing reads what its `annotate()`
 * says any more. The hint translates into tags each call that plainly uses an import of it, the
 * function imported by name or `annotate` of the module imported whole, without asking what a name
 * means where the call is: the import is reported whatever its calls are.
 */
const retiredImports = (script: Script): ReadonlyArray<Unread> => {
  const imports = namesOf(script.program)
  if (imports.length === 0) return []
  const specifiers = script.program.body.flatMap((statement) =>
    statement.type === "ImportDeclaration" && literalName(statement.source as Node) === retiredModule
      ? statement.specifiers as ReadonlyArray<Node>
      : []
  )
  const local = (specifier: Node) => (specifier.local as Node).name as string
  const imported = (specifier: Node) => {
    const name = specifier.imported as Node
    return name.name ?? name.value
  }
  const functions = new Set(specifiers.filter((specifier) =>
    specifier.type === "ImportDefaultSpecifier" || (specifier.type === "ImportSpecifier" && imported(specifier) === "annotate")
  ).map(local))
  const modules = new Set(specifiers.filter((specifier) => specifier.type !== "ImportSpecifier").map(local))
  const plain = (callee: unknown): boolean => {
    if (!isNode(callee)) return false
    if (callee.type === "Identifier") return functions.has(callee.name as string)
    if (callee.type !== "MemberExpression" || !isNode(callee.object) || callee.object.type !== "Identifier") return false
    const property = callee.property as Node
    return modules.has(callee.object.name as string) && (callee.computed ? property.value : property.name) === "annotate"
  }
  const calls = (node: Node): ReadonlyArray<Node> => [
    ...(node.type === "CallExpression" && plain(node.callee) ? [node] : []),
    ...children(node).flatMap(calls)
  ]
  const said = calls(script.program).flatMap((call) => {
    const [subject, links] = call.arguments as ReadonlyArray<Node | undefined>
    const tags = isNode(links) && links.type === "ObjectExpression" ? retiredTags(links) : []
    const of = subject?.type === "Identifier" ? subject.name as string : "the declaration it annotates"
    return tags.length > 0 ? [`in the doc comment of ${of}, ${tags.join(" and ")} (the call at line ${script.lineOf(call.start)})`] : []
  })
  const hint = `delete the import and its calls, and write what they say as tags${
    said.length > 0 ? `: ${said.join("; ")}` : " in the doc comment of each declaration: `@sdp <relation> <ID>`"
  }`
  return imports.map((name) => ({
    line: script.lineOf(name.start),
    message: `${retiredModule} is retired, so no annotate() of it is read`,
    hint
  }))
}

/** Where `node` names the retired module as one to import from. */
const namesOf = (node: Node): ReadonlyArray<Node> => {
  const source = moduleNamed(node)
  return [...(source !== undefined && literalName(source) === retiredModule ? [source] : []), ...children(node).flatMap(namesOf)]
}

/** The name of the module a node imports or re-exports from, loads, or requires. */
const moduleNamed = (node: Node): Node | undefined => {
  switch (node.type) {
    case "ImportDeclaration":
    case "ExportNamedDeclaration":
    case "ExportAllDeclaration":
    case "ImportExpression":
      return isNode(node.source) ? node.source : undefined
    case "TSExternalModuleReference":
      return node.expression as Node
    case "CallExpression": {
      const callee = node.callee as Node
      const [name] = node.arguments as ReadonlyArray<Node | undefined>
      return callee.type === "Identifier" && callee.name === "require" ? name : undefined
    }
    default:
      return undefined
  }
}

/** The tags an `annotate()` object says, one per key whose value is an id or a list of ids, as written. */
const retiredTags = (links: Node): ReadonlyArray<string> =>
  (links.properties as ReadonlyArray<Node>).flatMap((property) => {
    const key = isNode(property.key) ? (property.key.name ?? property.key.value) : undefined
    const value = property.value as Node | undefined
    const ids = value?.type === "Literal" ? [value.value] : value?.type === "ArrayExpression" ? (value.elements as ReadonlyArray<Node>).map((element) => element?.value) : []
    return typeof key === "string" && ids.length > 0 && ids.every((id) => typeof id === "string") ? [`@sdp ${key} ${ids.join(", ")}`] : []
  })

/** A comment's line, after the comment's own `/`, `*` and `!`, that opens with the tag. */
const commentMarker = /^[\s/*!]*@sdp\s+([A-Za-z][\w.:-]*)\s+(.+)$/

/** A tag after words on a comment's line. */
const afterWords = /\s@sdp\s+([A-Za-z][\w.:-]*)\s+(.+)$/

/**
 * In a doc comment, the line that opens an example of code, and one that opens any tag — a word
 * after `@`, then a space or the line's end — which ends it, as a decorator such as `@Injectable()`
 * does not.
 */
const exampleTag = /^[\s*]*@example\b/
const blockTag = /^[\s*]*@\w+(?:\s|$)/

/** In a doc comment, a line that opens or closes a fenced block of code. */
const fence = /^[\s/*!]*(?:```|~~~)/

/** What a tag annotates: a module-level declaration, or the file, with what the comment and the code say of it. */
type Target = Pick<Annotation, "symbol" | "symbolLine" | "doc" | "shape" | "returnType" | "exports">

/**
 * The tags of a parsed file. Comments on lines of their own with no blank line between them are one
 * comment: it documents the module-level declaration that follows it directly, or else, when no
 * code comes before it, opens the file.
 */
const readTags = (file: string, content: string, script: Script): Pick<CodeScan, "annotations" | "ignored" | "unreadable"> => {
  const annotations: Array<Annotation> = []
  const ignored: Array<Unread> = []
  const unreadable: Array<Unread> = []
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
  const firstCode = program.body[0] === undefined ? content.length : leadingStart(program.body[0])
  const opening = script.comments.find((comment) => comment.start < firstCode)
  const shaped = shapes(content, script)
  for (const group of groups) {
    let example = false
    let fenced = false
    const tags = group.flatMap((comment, at) => {
      // A block ends what it shows; a fenced block goes on over a run of line comments.
      if (comment.type === "Block" || group[at - 1]?.type !== "Line") [example, fenced] = [false, false]
      return comment.value.split(/\r?\n/).flatMap((text, index) => {
        // Code a doc comment shows, as an example or in a fenced block, is code, whatever it says.
        if (fence.test(text)) {
          fenced = !fenced
          return []
        }
        if (comment.type === "Block" && !fenced && (exampleTag.test(text) || (example && blockTag.test(text)))) {
          example = exampleTag.test(text)
        }
        if (fenced || example) return []
        const line = lineOf(comment.start) + index
        const match = commentMarker.exec(text)
        const tag = match && readTag(match[1]!, match[2]!)
        if (tag && "unread" in tag) unreadable.push({ line, ...tag.unread })
        if (!match) ignored.push(...wordsBefore(text, line))
        return tag && !("unread" in tag) ? [{ ...tag, line, trailing: index === 0 && afterCode(comment.start), at }] : []
      })
    })
    if (tags.length === 0) continue
    const end = group.at(-1)!.end
    const next = program.body.find((statement) => leadingStart(statement) >= end)
    const declared = next && /^[ \t]*\r?\n?[ \t]*$/.test(content.slice(end, leadingStart(next))) ? declaredName(next) : undefined
    const shape = declared === undefined ? undefined : shaped.of(next!)
    const target: Target | undefined = declared !== undefined
      ? { symbol: declared, symbolLine: lineOf(next!.start), shape: shape?.text, returnType: shape?.returnType }
      : end <= firstCode
      ? { symbol: undefined, symbolLine: 1, exports: nonEmpty(shaped.exports()) }
      : undefined
    for (const { line, rel, targets, attrs, trailing, at } of tags) {
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
        annotations.push({ file, line, rel, targets, attrs, ...target, doc: carrying(group, at, opening) })
      }
    }
  }
  return { annotations, ignored, unreadable }
}

/**
 * What the comment that carries a tag says: its block, or the run of line comments that holds it —
 * or, when that says nothing but tags, the comment directly above it, a block or a run of line
 * comments, unless that one opens the file. A comment further up, or the one that opens the file, a
 * licence or a copyright, describes no code below it.
 */
const carrying = (
  group: ReadonlyArray<Script["comments"][number]>,
  at: number,
  opening: Script["comments"][number] | undefined
): string | undefined => {
  const run = (index: number) => {
    let first = index
    let last = index
    if (group[index]!.type === "Line") {
      while (group[first - 1]?.type === "Line") first--
      while (group[last + 1]?.type === "Line") last++
    }
    return { first, said: description(group.slice(first, last + 1).map((comment) => comment.value)) }
  }
  const { first, said } = run(at)
  if (said !== undefined || first === 0) return said
  const above = run(first - 1)
  return group[above.first] === opening ? undefined : above.said
}

/** A tag that a comment's line has after words, which is not read: well formed, it was meant as one. */
const wordsBefore = (text: string, line: number): ReadonlyArray<Unread> => {
  const match = afterWords.exec(text)
  const tag = match && readTag(match[1]!, match[2]!)
  return tag && !("unread" in tag)
    ? [{
      line,
      message: `"@sdp ${tag.rel} ${tag.targets.join(", ")}" follows words on its line, so it is not read as an annotation`,
      hint: "start a comment line of its own with it, below the words that describe the code"
    }]
    : []
}

/** Where a module-level statement starts, its decorators included: `@sealed()` above `export class` is part of the class. */
const leadingStart = (statement: Node): number => {
  const declared = isNode(statement.declaration) ? statement.declaration : statement
  const decorators = [...(Array.isArray(statement.decorators) ? statement.decorators : []), ...(Array.isArray(declared.decorators) ? declared.decorators : [])]
  return Math.min(statement.start, ...decorators.filter(isNode).map((decorator) => decorator.start))
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
 * What a comment says of the code it documents: its first paragraph without its tags or a tool's
 * directives, before any other tag of the comment's own (`@internal`, `@param`). A fenced block of
 * code it shows is no paragraph of it.
 */
const description = (comments: ReadonlyArray<string>): string | undefined => {
  let fenced = false
  const lines = comments
    .flatMap((comment) => comment.split(/\r?\n/))
    .map((line) => line.replace(/^\s*\*+ ?/, "").replace(/^[/!]+ ?/, "").trimEnd())
    .flatMap((line) => {
      if (!fence.test(line)) return fenced ? [] : [line]
      fenced = !fenced
      return [""]
    })
    .filter((line) => !commentMarker.test(line) && !directive.test(line))
  const tagged = lines.findIndex((line) => /^\s*@\w/.test(line))
  const words = tagged < 0 ? lines : lines.slice(0, tagged)
  return words.join("\n").split(/\n\s*\n/).map((text) => text.replace(/\s+/g, " ").trim()).find((text) => text !== "")
}

/**
 * A comment's line that directs a tool, not the reader: a linter, a type checker, a formatter, a
 * coverage tool, a licence scanner or an editor, or the encoding an interpreter reads, in any language.
 */
const directive = new RegExp(`^\\s*(?:${
  [
    // JavaScript and TypeScript
    String.raw`eslint-(?:disable|enable|env)\b|eslint [\w@/-]+:|@ts-[a-z-]+|prettier-ignore|biome-ignore|oxlint-[a-z-]+`,
    String.raw`deno-(?:lint|fmt)-ignore|dprint-ignore|tslint:|jshint\b|istanbul ignore|[cv]8 ignore|<reference\b`,
    // Python
    String.raw`noqa\b|type: ?ignore|(?:pylint|pyright|mypy|ruff|flake8|pytype|isort|yapf|autopep8): ?[\w-]+|pyre-[a-z-]+`,
    String.raw`fmt: ?(?:off|on|skip)|pragma: ?no (?:cover|branch)|nosec\b`,
    // Ruby
    String.raw`frozen_string_literal:|(?:warn_indent|shareable_constant_value|typed):|rubocop:[a-z]+|standard:(?:disable|enable)|:no(?:doc|cov):`,
    // An interpreter's encoding, an editor's settings
    String.raw`(?:en)?coding[:=] ?[\w.-]+\s*$|-\*-.*-\*-|vim?: ?(?:set )?\w+[=:]|#(?:end)?region\b`,
    // Shell, Swift, PHP, Kotlin and Java, Go, C and C++
    String.raw`shellcheck\b|swiftlint:|swiftformat:|phpcs:|@phpstan-[a-z-]+|@psalm-[a-z-]+`,
    String.raw`ktlint-(?:disable|enable)|CHECKSTYLE[:.]|NOPMD\b|NOSONAR\b|noinspection\b|@formatter:(?:off|on)`,
    String.raw`nolint\b|lint:(?:ignore|file-ignore)\b|go:[a-z]+|\+build\b|NOLINT|clang-format (?:off|on)`,
    // A licence's identifier, a spelling checker
    String.raw`SPDX-[\w.-]+:|cspell:|spell-?checker:|codespell:`
  ].join("|")
})`)

const lineMarker = /^\s*(?:(?:\/\/+|\/\*+|\*+|#+|--+|<!--|;+|%+|"""|''')!?\s*)?@sdp\s+([A-Za-z][\w.:-]*)\s+(.+)$/
/**
 * An id as a spec declares it: a letter or a digit, then letters, digits and - _ . : # /, in any
 * script — but for a full stop at its end, which ends a sentence.
 */
const idToken = /^[\p{L}\p{N}](?:[\p{L}\p{M}\p{N}_.:#/-]*[\p{L}\p{M}\p{N}_:#/-])?$/u
/** A placeholder for an id, as a guide writes the form of a tag: `<ID>`. */
const placeholder = /^<[^<>\s]+>$/
const declaration =
  /\b(?:class|interface|type|function\*?|const|let|var|enum|def|func|fn|struct|trait|module|object|record|namespace|impl)\s+([A-Za-z_$][\w$]*)/
const commentOnly = /^\s*(\/\/|\/\*|\*|#|--|<!--|;|%|"""|''')/
/**
 * A line that opens with `#` as a comment does, and is code: an interpreter line, an attribute
 * (`#[derive(Debug)]`), or a directive of the preprocessor.
 */
const hashCode = /^\s*#(?:!|\[|(?:if|ifdef|ifndef|elif|else|endif|define|undef|include|pragma|region|endregion|nullable)\b)/
/** A comment's line, with nothing else on it. */
const commentLine = (line: string): boolean => commentOnly.test(line) && !hashCode.test(line)

/** Languages without a parser: comment lines that open with the tag, line by line, but for code a doc comment shows. */
const scanLines = (file: string, content: string): Pick<CodeScan, "annotations" | "unreadable" | "ignored"> => {
  const lines = content.split(/\r?\n/)
  const unreadable: Array<Unread> = []
  const docstrings = /\.pyi?$/.test(file) ? pythonDocstrings(content, lines) : []
  const shown = fencedLines(lines, docstrings)
  const annotations = lines.flatMap((text, index) => {
    if (shown.has(index)) return []
    const match = lineMarker.exec(text)
    const tag = match && readTag(match[1]!, match[2]!)
    if (!tag) return []
    if ("unread" in tag) {
      unreadable.push({ line: index + 1, ...tag.unread })
      return []
    }
    const docstring = docstrings.find(({ first, last }) => first <= index && index <= last)
    if (docstring) return [{ file, line: index + 1, ...tag, symbol: docstring.of?.name, symbolLine: docstring.of?.line ?? 1, doc: docstring.doc }]
    const below = nextSymbol(lines, index)
    return [{ file, line: index + 1, ...tag, symbol: below?.name, symbolLine: below?.line ?? 1, doc: lineCommentDoc(lines, index) }]
  })
  return { annotations, unreadable, ignored: ignoredLines(lines, shown) }
}

/**
 * The lines of the fenced blocks of code that comments and docstrings show, their fences included:
 * from a line that opens with ``` or ~~~ to the one that closes the block, or else to the end of the
 * comment.
 */
const fencedLines = (lines: ReadonlyArray<string>, docstrings: ReadonlyArray<Docstring>): ReadonlySet<number> => {
  const shown = new Set<number>()
  let fenced = false
  // Whether a block comment opened above goes on: its lines need no marker of their own.
  let block = false
  lines.forEach((line, index) => {
    const docstring = docstrings.find(({ first, last }) => first <= index && index <= last)
    const opens = !block && blockStart.test(line)
    if (docstring === undefined && !block && !opens && !commentLine(line)) {
      fenced = false
      return
    }
    const fences = fence.test(docstring === undefined ? commentText(line) : line)
    if (fenced || fences) shown.add(index)
    if (fences) fenced = !fenced
    const inBlock = block || opens
    block = inBlock && !blockEnd.test(opens ? line.replace(blockStart, "") : line)
    if (docstring?.last === index || (inBlock && !block)) fenced = false
  })
  return shown
}

/** A comment's line that opens a block, and one that closes it. */
const blockStart = /^\s*(?:\/\*+|<!--)/
const blockEnd = /\*\/|-->/

/** A Python docstring: the lines it spans, what it says, and the class or function it documents — none for the module's. */
interface Docstring {
  readonly first: number
  readonly last: number
  readonly doc: string | undefined
  readonly of: { readonly name: string; readonly line: number } | undefined
}

/** A line of Python that opens a class or a function. */
const pythonDeclaration = /^\s*(?:async\s+def|def|class)\s+([A-Za-z_]\w*)/

/**
 * The docstrings of Python source, its doc comments (PEP 257): a string in triple quotes that is
 * the first statement of the module, or of the class or function whose header ends on the line above.
 */
const pythonDocstrings = (content: string, lines: ReadonlyArray<string>): ReadonlyArray<Docstring> => {
  const breaks = [...content.matchAll(/\n/g)].map((match) => match.index)
  const lineOf = (offset: number) => breaks.filter((at) => at < offset).length
  const significant = (line: string) => line.trim() !== "" && !line.trimStart().startsWith("#")
  return tripleQuoted(content).flatMap(({ end, start }): ReadonlyArray<Docstring> => {
    const [first, last] = [lineOf(start), lineOf(end)]
    if (!/^\s*[rRuU]?$/.test(content.slice(content.lastIndexOf("\n", start - 1) + 1, start))) return []
    if (!/^\s*(?:#.*)?$/.test(lines[last]!.slice(end - (content.lastIndexOf("\n", end - 1) + 1)))) return []
    const doc = description([content.slice(start + 3, end - 3)])
    let header = first - 1
    while (header >= 0 && !significant(lines[header]!)) header--
    if (header < 0) return [{ first, last, doc, of: undefined }]
    if (!/:\s*(?:#.*)?$/.test(lines[header]!)) return []
    let opens = header
    while (opens >= 0 && !pythonDeclaration.test(lines[opens]!)) opens--
    if (opens < 0) return []
    // A header of several lines opens brackets on its first line that only its last closes.
    let open = 0
    for (let at = opens; at < header; at++) {
      open += brackets(lines[at]!)
      if (open <= 0) return []
    }
    if (open + brackets(lines[header]!) !== 0) return []
    return [{ first, last, doc, of: { name: pythonDeclaration.exec(lines[opens]!)![1]!, line: opens + 1 } }]
  })
}

/** Where the strings in triple quotes of Python source start and end, past its comments and its other strings. */
const tripleQuoted = (content: string): ReadonlyArray<{ readonly start: number; readonly end: number }> => {
  const strings: Array<{ readonly start: number; readonly end: number }> = []
  let at = 0
  while (at < content.length) {
    const char = content[at]!
    if (char === "#") {
      const next = content.indexOf("\n", at)
      at = next < 0 ? content.length : next
    } else if (char === "\"" || char === "'") {
      const quote = content.startsWith(char.repeat(3), at) ? char.repeat(3) : char
      let end = at + quote.length
      while (end < content.length && !content.startsWith(quote, end) && (quote.length === 3 || content[end] !== "\n")) {
        end += content[end] === "\\" ? 2 : 1
      }
      end = Math.min(content.length, end + quote.length)
      if (quote.length === 3) strings.push({ start: at, end })
      at = end
    } else at++
  }
  return strings
}

/** A line comment's text, without the marker that opens it or the one that closes a block. */
const commentText = (line: string): string =>
  line.replace(/^\s*(?:\/\/+|\/\*+|\*+|#+|--+|<!--|;+|%+|"""|''')!?\s?/, "").replace(/\s*(?:\*\/|-->|"""|''')\s*$/, "")

/**
 * What the comment that carries a tag says, as in a parsed file: its block, or the run of line
 * comments that holds it — or, when that says nothing but tags, the comment directly above it, unless
 * that one opens the file. A comment is on lines of its own, up to a blank line or code; a block ends
 * where it closes, and a run of line comments where their marker changes, from `//` to `///`.
 */
const lineCommentDoc = (lines: ReadonlyArray<string>, at: number): string | undefined => {
  const comment = (index: number) => index >= 0 && index < lines.length && commentLine(lines[index]!)
  const marker = (index: number) => lineCommentMarker.exec(lines[index]!)?.[1]
  // Whether the line at `index` goes on with the comment of the line above it.
  const goesOn = (index: number) =>
    comment(index - 1) && comment(index) && (marker(index - 1) === undefined || marker(index) === undefined
      ? !blockEnd.test(lines[index - 1]!) && !blockStart.test(lines[index]!)
      : marker(index - 1) === marker(index))
  const around = (index: number) => {
    let first = index
    let last = index
    while (goesOn(first)) first--
    while (goesOn(last + 1)) last++
    return { first, said: description([lines.slice(first, last + 1).map(commentText).join("\n")]) }
  }
  const { first, said } = around(at)
  if (said !== undefined || !comment(first - 1)) return said
  const above = around(first - 1)
  return lines.slice(0, above.first).every((line) => line.trim() === "" || preamble.test(line)) ? undefined : above.said
}

/** The marker that opens a line comment: `//`, `///`, `//!`, `#`, `--`, `;` or `%`. */
const lineCommentMarker = /^\s*(\/\/+!?|#+|--+|;+|%+)/
/** A line that only opens the file: an interpreter line, or PHP's opening tag. */
const preamble = /^\s*(?:#!|<\?php\s*$)/

const trailing =
  /\S.*?(?:\/\/+|\/\*+|#+|--+|;+)\s*(@sdp\s+[A-Za-z][\w.:-]*\s+[\p{L}\p{N}][\p{L}\p{M}\p{N}_.:#/-]*(?:,[\p{L}\p{N}][\p{L}\p{M}\p{N}_.:#/-]*)*)(?=\s|$|\*\/|-->)/u

/** Languages without a parser: tags after code or words on their line, which look like tags but, not opening it, are not read. */
const ignoredLines = (lines: ReadonlyArray<string>, shown: ReadonlySet<number>): ReadonlyArray<Unread> =>
  lines.flatMap((text, index) => {
    if (shown.has(index) || lineMarker.test(text)) return []
    // A comment line that mentions a tag in its words is prose, unless the tag is one as written.
    if (commentLine(text)) return wordsBefore(text, index + 1)
    const match = trailing.exec(text)
    return match
      ? [{ line: index + 1, message: `"${match[1]!}" follows code on the same line, so it is not read as an annotation`, hint: trailingHint }]
      : []
  })

/**
 * The relation, ids and attributes `@sdp <rel> <ids> [key=value ...]` says, its ids separated by
 * commas. A tag that names something that is no id, or goes on after its ids with other words, was
 * meant as a tag and cannot be read; one whose ids are whole placeholders, `@sdp implements <ID>`,
 * only mentions the form, and is undefined.
 */
const readTag = (
  rel: string,
  rest: string
): Pick<Annotation, "rel" | "targets" | "attrs"> | { readonly unread: Omit<Unread, "line"> } | undefined => {
  const text = rest.replace(/\s*(\*\/|-->|"""|''').*$/, "").trim()
  const targets: Array<string> = []
  const attrs: Array<readonly [string, unknown]> = []
  const after: Array<string> = []
  // Whether the next word goes on with the list of ids: the first does, and one after a comma.
  let listing = true
  for (const token of tokenize(text)) {
    const eq = token.indexOf("=")
    if (eq > 0) {
      attrs.push([token.slice(0, eq), coerce(unquote(token.slice(eq + 1)))])
      listing = false
    } else if (listing || (token.startsWith(",") && attrs.length === 0)) {
      targets.push(...token.split(",").map((t) => t.trim()).filter(Boolean))
      listing = token.endsWith(",")
    } else after.push(token)
  }
  if (targets.length > 0 && targets.every((t) => placeholder.test(t))) return undefined
  const wrong = targets.filter((t) => !idToken.test(t))
  const hint =
    "write the ids it links to, separated by commas, then any key=value: an id is a letter or a digit, then letters, digits and - _ . : # /, with no full stop at its end"
  const unread = (says: string) => ({ unread: { message: `"@sdp ${rel} ${text}" ${says}, so the tag is not read`, hint } })
  if (wrong.length > 0) return unread(`names ${wrong.join(", ")}, which ${wrong.length === 1 ? "is" : "are"} no id`)
  if (after.length > 0) return unread(`goes on after its ids with "${after.join(" ")}"`)
  if (targets.length === 0) return unread("names no id")
  // Not assigned one by one: `__proto__` is a key like any other.
  return { rel, targets, attrs: Object.fromEntries(attrs) }
}

/**
 * A tag directly above a declaration annotates it, past the comments and the decorators between
 * them, however many lines a decorator's arguments take; one followed by a blank line, the file.
 */
const nextSymbol = (lines: ReadonlyArray<string>, from: number): { readonly name: string; readonly line: number } | undefined => {
  // The brackets a decorator has opened and not closed yet: its arguments go on.
  let open = 0
  for (let i = from + 1; i < lines.length; i++) {
    const line = lines[i]!
    if (open > 0) {
      open += brackets(line)
      continue
    }
    if (line.trim() === "") return undefined
    const decorated = decorating(line)
    if (decorated !== undefined) {
      open = decorated
      continue
    }
    if (commentOnly.test(line) || line.includes("@sdp")) continue
    const name = declaration.exec(line)?.[1]
    return name === undefined ? undefined : { name, line: i + 1 }
  }
  return undefined
}

/**
 * Whether a line of code only decorates the declaration below it, with one decorator or attribute or
 * more — `@Service`, `@app.route("/pay")`, `@RequestMapping("/pay") @ResponseBody`, `[ApiController]`,
 * `#[derive(Debug)]` — and if so, how many brackets they leave open for the lines below to close.
 */
const decorating = (line: string): number | undefined => {
  let open = 0
  let decorators = 0
  let at = 0
  while (at < line.length) {
    const char = line[at]!
    if (open > 0) {
      if (char === "\"" || char === "'") {
        const close = line.indexOf(char, at + 1)
        at = close < 0 ? line.length : close + 1
        continue
      }
      open += "([{".includes(char) ? 1 : ")]}".includes(char) ? -1 : 0
    } else if (line.startsWith("//", at) || (char === "#" && line[at + 1] !== "[")) {
      break
    } else if (char === "@" || char === "[" || char === "#") {
      const name = /^@[A-Za-z_$][\w$.]*|^#?/.exec(line.slice(at))![0]
      at += name.length
      decorators++
      if (line[at] === "(" || line[at] === "[") open = 1
      else if (!name.startsWith("@")) return undefined
    } else if (!/\s/.test(char)) return undefined
    at++
  }
  return decorators > 0 ? open : undefined
}

/** How many more brackets a line of code opens than it closes, outside its strings. */
const brackets = (line: string): number => {
  const code = line.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, "")
  return (code.match(/[([{]/g)?.length ?? 0) - (code.match(/[)\]}]/g)?.length ?? 0)
}

const tokenize = (text: string): ReadonlyArray<string> => text.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? []

const unquote = (value: string) => value.replace(/^(["'])(.*)\1$/, "$2")

const coerce = (value: string): unknown =>
  value === "true" ? true : value === "false" ? false : /^-?\d+(\.\d+)?$/.test(value) ? Number(value) : value

export const codeNodeId = (annotation: Pick<Annotation, "file" | "symbol">): string =>
  annotation.symbol ? `code:${annotation.file}#${annotation.symbol}` : `code:${annotation.file}`
