/**
 * Code annotations, in any language. A comment line of the form
 *
 *     @sdp <relation> <ID>[,<ID>...] [key=value ...]
 *
 * links the code (the declaration directly below, or the whole file when a blank line follows) to graph
 * nodes. The relation is free text (`implements`, `is`, `instance-of`, ...).
 * `is` anchors a node in code and declares it if no spec defines it.
 * `grep -rn "@sdp" src/` lists every annotation. One written after code on the
 * same line (`total() // @sdp implements X`) is not read, and is reported.
 *
 * A TypeScript or JavaScript file is parsed once: its comment annotations come
 * from the parser's comments, so a string is never one, its typed `annotate()`
 * calls from the same parse (TypedAnnotations.ts), and, when it anchors a node,
 * so do the modules it imports. Other languages have no parser here: a line
 * whose text opens with a comment marker and `@sdp` is an annotation, even
 * inside a multi-line string — best effort — and their imports are not read.
 */
import { annotate } from "sdp/annotations"
import { type Import, parseScript, type Script } from "./Script.ts"
import { readTypedAnnotations, type TypedAnnotationProblem } from "./TypedAnnotations.ts"

annotate(import.meta, { is: "ARCH-code-annotations" })

export interface Annotation {
  readonly file: string
  readonly line: number
  readonly rel: string
  readonly targets: ReadonlyArray<string>
  readonly attrs: Readonly<Record<string, unknown>>
  /** The symbol declared right after the annotation, if any. */
  readonly symbol: string | undefined
  /** Line of the annotated declaration, when it is not the annotation's own (typed annotations). */
  readonly symbolLine?: number | undefined
  /** The annotated declaration's own description (its JSDoc), when known. */
  readonly doc?: string | undefined
}

export interface CodeScan {
  readonly annotations: ReadonlyArray<Annotation>
  /** Annotations sdp cannot read without running the code, and files that do not parse. */
  readonly unreadable: ReadonlyArray<TypedAnnotationProblem>
  /** Comment annotations after code on the same line, which are not read. */
  readonly ignored: ReadonlyArray<{ readonly line: number; readonly text: string }>
  /** The modules a TypeScript or JavaScript file that anchors a node loads code from. */
  readonly imports: ReadonlyArray<Import>
}

const nothing: CodeScan = { annotations: [], unreadable: [], ignored: [], imports: [] }

/** One of the annotation modules named in a string literal: a file that means to annotate, even when it does not parse. */
const mentionsAnnotationModule = /["'`]sdp(\/annotations)?["'`]/

/**
 * Every annotation of one code file, typed and in comments, and what could not be read. `anchor` is
 * the relation whose `annotate()` call may declare the node it names.
 */
export const scanCode = (file: string, content: string, anchor: string): CodeScan => {
  if (!content.includes("@sdp") && !content.includes("annotate")) return nothing
  const script = parseScript(file, content)
  if (script === undefined) {
    return { annotations: scanLines(file, content), unreadable: [], ignored: ignoredLines(content), imports: [] }
  }
  if (script.error) {
    // Unread annotations would silently drop out of the graph: say so, for files that annotate.
    if (!mentionsAnnotationModule.test(content) && !content.includes("@sdp")) return nothing
    return {
      annotations: [],
      unreadable: [{
        line: script.error.line,
        message: `the file does not parse, so its annotations cannot be read: ${script.error.message}`,
        hint: "fix the syntax error; until then none of the file's annotations are in the graph"
      }],
      ignored: [],
      imports: []
    }
  }
  const comments = readComments(file, content, script)
  const typed = readTypedAnnotations(file, content, script, anchor)
  const annotations = [...comments.annotations, ...typed.annotations]
  // Only a module anchored to a node depends on another through what it imports.
  const imports = annotations.some((annotation) => annotation.rel === anchor) ? script.imports() : []
  return { annotations, unreadable: typed.problems, ignored: comments.ignored, imports }
}
annotate(scanCode, { is: "ARCH-code-annotations" })

/** A comment's text, after the comment's own `/`, `*` and `!`, that opens with the marker. */
const commentMarker = /^[\s/*!]*@sdp\s+([A-Za-z][\w.:-]*)\s+(.+)$/

const readComments = (file: string, content: string, script: Script): Pick<CodeScan, "annotations" | "ignored"> => {
  const lines = content.split(/\r?\n/)
  const annotations: Array<Annotation> = []
  const ignored: Array<{ line: number; text: string }> = []
  for (const comment of script.comments) {
    const first = script.lineOf(comment.start)
    const afterCode = content.slice(content.lastIndexOf("\n", comment.start - 1) + 1, comment.start).trim() !== ""
    comment.value.split(/\r?\n/).forEach((text, index) => {
      const match = commentMarker.exec(text)
      const line = first + index
      const annotation = match && readAnnotation(file, line, match[1]!, match[2]!, nextSymbol(lines, line - 1))
      if (!annotation) return
      if (index === 0 && afterCode) ignored.push({ line, text: `@sdp ${annotation.rel} ${annotation.targets.join(",")}` })
      else annotations.push(annotation)
    })
  }
  return { annotations, ignored }
}

const lineMarker = /^\s*(?:(?:\/\/+|\/\*+|\*+|#+|--+|<!--|;+|%+|"""|''')!?\s*)?@sdp\s+([A-Za-z][\w.:-]*)\s+(.+)$/
const idToken = /^[A-Za-z][\w.:#/-]*$/
const declaration =
  /\b(?:class|interface|type|function\*?|const|let|var|enum|def|func|fn|struct|trait|module|object|record|namespace|impl)\s+([A-Za-z_$][\w$]*)/
const commentOnly = /^\s*(\/\/|\/\*|\*|#|--|<!--|;|%|"""|''')/

/** Languages without a parser: comment lines that open with the marker, line by line. */
const scanLines = (file: string, content: string): ReadonlyArray<Annotation> => {
  const lines = content.split(/\r?\n/)
  return lines.flatMap((text, index) => {
    const match = lineMarker.exec(text)
    const annotation = match && readAnnotation(file, index + 1, match[1]!, match[2]!, nextSymbol(lines, index))
    return annotation ? [annotation] : []
  })
}

const trailing = /\S.*?(?:\/\/+|\/\*+|#+|--+|;+)\s*(@sdp\s+[A-Za-z][\w.:-]*\s+[A-Za-z][\w.:#/-]*(?:,[A-Za-z][\w.:#/-]*)*)(?=\s|$|\*\/|-->)/

/** Languages without a parser: comments after code that look like annotations but, not opening their line, are not read. */
const ignoredLines = (content: string): CodeScan["ignored"] =>
  content.split(/\r?\n/).flatMap((text, index) => {
    // A comment line that mentions an annotation is prose; only code followed by a comment counts.
    if (lineMarker.test(text) || commentOnly.test(text)) return []
    const match = trailing.exec(text)
    return match ? [{ line: index + 1, text: match[1]! }] : []
  })

/** The annotation `@sdp <rel> <rest>` says, or undefined when its targets are not ids. */
const readAnnotation = (file: string, line: number, rel: string, rest: string, symbol: string | undefined): Annotation | undefined => {
  const tokens = tokenize(rest.replace(/\s*(\*\/|-->|"""|''').*$/, ""))
  const targets: Array<string> = []
  const attrs: Array<readonly [string, unknown]> = []
  for (const token of tokens) {
    const eq = token.indexOf("=")
    if (eq > 0) attrs.push([token.slice(0, eq), coerce(unquote(token.slice(eq + 1)))])
    else targets.push(...token.split(",").map((t) => t.trim()).filter(Boolean))
  }
  if (targets.length === 0 || !targets.every((t) => idToken.test(t))) return undefined
  return { file, line, rel, targets, attrs: Object.fromEntries(attrs), symbol }
}

/** An annotation directly above a declaration binds to it; one followed by a blank line binds to the file. */
const nextSymbol = (lines: ReadonlyArray<string>, from: number): string | undefined => {
  for (let i = from + 1; i < Math.min(lines.length, from + 8); i++) {
    const line = lines[i]!
    if (line.trim() === "") return undefined
    if (commentOnly.test(line) || line.includes("@sdp")) continue
    return declaration.exec(line)?.[1]
  }
  return undefined
}

const tokenize = (text: string): ReadonlyArray<string> => text.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? []

const unquote = (value: string) => value.replace(/^(["'])(.*)\1$/, "$2")

const coerce = (value: string): unknown =>
  value === "true" ? true : value === "false" ? false : /^-?\d+(\.\d+)?$/.test(value) ? Number(value) : value

export const codeNodeId = (annotation: Pick<Annotation, "file" | "symbol">): string =>
  annotation.symbol ? `code:${annotation.file}#${annotation.symbol}` : `code:${annotation.file}`
