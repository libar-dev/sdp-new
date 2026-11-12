/**
 * Reads step definitions out of step files statically: the file is parsed,
 * never run, so reading a workspace executes none of its code. A step file
 * registers its definitions in `defineSteps(world, ({ Given, When, Then }) => { … })`
 * calls at its top level, imported from "sdp/steps"; each registration is read
 * with its expression — a string or RegExp literal — and its `file:line`.
 * What cannot be read this way is reported, never guessed: only `sdp run`,
 * which imports the module, knows a registration whose expression is computed.
 */
import { annotate } from "sdp/annotations"
import { CucumberExpression, ParameterTypeRegistry } from "@cucumber/cucumber-expressions"
import { parseSync } from "oxc-parser"

export type StepKeyword = "Given" | "When" | "Then" | "Step"

/** A step definition as far as matching goes: what it matches and where it is registered. */
export interface StepSignature {
  readonly keyword: StepKeyword
  readonly expression: string | RegExp
  /** `file:line` of the registration. */
  readonly location: string
}

export interface StepProblem {
  readonly rule: "step-unreadable" | "step-expression"
  readonly line: number
  readonly message: string
}

export interface StepScan {
  readonly definitions: ReadonlyArray<StepSignature>
  readonly problems: ReadonlyArray<StepProblem>
}

/** The module step files import `defineSteps` from. */
const stepsModule = "sdp/steps"

const keywords: ReadonlySet<string> = new Set<StepKeyword>(["Given", "When", "Then", "Step"])

type Node = { readonly type: string; readonly start: number; readonly [key: string]: unknown }

const isNode = (value: unknown): value is Node =>
  typeof value === "object" && value !== null && typeof (value as { type?: unknown }).type === "string"

const languageOf = (file: string): "ts" | "tsx" | "js" | "jsx" =>
  /\.[cm]?tsx$/.test(file) ? "tsx" : /\.[cm]?jsx$/.test(file) ? "jsx" : /\.[cm]?ts$/.test(file) ? "ts" : "js"

/** Reads the step definitions of one step file without running it. */
export const scanStepDefinitions = (file: string, content: string): StepScan => {
  const lineStarts = [0]
  for (let i = 0; i < content.length; i++) if (content[i] === "\n") lineStarts.push(i + 1)
  const lineOf = (offset: number) => lineStarts.findLastIndex((start) => start <= offset) + 1

  const parsed = parseSync(file, content, { lang: languageOf(file), sourceType: "module" })
  if (parsed.errors.length > 0) {
    const error = parsed.errors[0]!
    return {
      definitions: [],
      problems: [{
        rule: "step-unreadable",
        line: lineOf(error.labels[0]?.start ?? 0),
        message: `the file does not parse, so its step definitions cannot be read: ${error.message}`
      }]
    }
  }
  const program = parsed.program as unknown as { readonly body: ReadonlyArray<Node> }

  // Local names of `defineSteps`, as imported from the steps module.
  const defineSteps = new Set<string>()
  for (const statement of program.body) {
    if (statement.type !== "ImportDeclaration" || (statement.source as { value: string }).value !== stepsModule) continue
    for (const specifier of statement.specifiers as ReadonlyArray<Node>) {
      const imported = specifier.imported as { name?: string; value?: string } | undefined
      if ((imported?.name ?? imported?.value) === "defineSteps") defineSteps.add((specifier.local as { name: string }).name)
    }
  }

  const definitions: Array<StepSignature> = []
  const problems: Array<StepProblem> = []
  const unreadable = (node: Node, message: string) => problems.push({ rule: "step-unreadable", line: lineOf(node.start), message })

  /** One `Given("…", handler)` call inside a `defineSteps` callback. */
  const register = (keyword: StepKeyword, call: Node) => {
    const line = lineOf(call.start)
    const argument = (call.arguments as ReadonlyArray<Node>)[0]
    const invalid = regexProblem(argument)
    if (invalid) return problems.push({ rule: "step-expression", line, message: `invalid step expression: ${invalid}` })
    const expression = literalExpression(argument)
    if (expression === undefined) {
      return unreadable(
        call,
        `the expression of this ${keyword} definition is computed, so it cannot be read without running the file`
      )
    }
    const problem = typeof expression === "string" ? expressionProblem(expression) : undefined
    if (problem) return problems.push({ rule: "step-expression", line, message: `invalid step expression ${JSON.stringify(expression)}: ${problem}` })
    definitions.push({ keyword, expression, location: `${file}:${line}` })
  }

  /** `defineSteps(world, (registrar) => { … })`: reads every registration in the callback. */
  const readModule = (call: Node) => {
    const callback = (call.arguments as ReadonlyArray<Node>)[1]
    const registrar = callback && /^(Arrow)?FunctionExpression$/.test(callback.type) ? (callback.params as ReadonlyArray<Node>)[0] : undefined
    if (!callback || !registrar) {
      return unreadable(call, "the second argument of defineSteps is not a function written in place, so its step definitions cannot be read")
    }
    // `({ Given, When: when })` binds registrars to local names; `(steps)` is used as `steps.Given(…)`.
    const local = new Map<string, StepKeyword>()
    if (registrar.type === "ObjectPattern") {
      for (const property of registrar.properties as ReadonlyArray<Node>) {
        const key = (property.key as { name?: string } | undefined)?.name
        const value = property.value as { name?: string } | undefined
        if (key !== undefined && keywords.has(key) && value?.name !== undefined) local.set(value.name, key as StepKeyword)
      }
    }
    const object = registrar.type === "Identifier" ? registrar.name as string : undefined
    const visit = (node: Node) => {
      if (node.type === "CallExpression") {
        const callee = node.callee as Node
        if (callee.type === "Identifier" && local.has(callee.name as string)) register(local.get(callee.name as string)!, node)
        const member = callee.type === "MemberExpression" && !callee.computed ? (callee.property as { name?: string }).name : undefined
        if (member !== undefined && keywords.has(member) && (callee.object as { name?: string }).name === object) {
          register(member as StepKeyword, node)
        }
      }
      for (const value of Object.values(node)) {
        for (const child of Array.isArray(value) ? value : [value]) if (isNode(child)) visit(child)
      }
    }
    visit(callback.body as Node)
  }

  let modules = 0
  for (const statement of program.body) {
    const declared = statement.type === "ExportDefaultDeclaration" || statement.type === "ExportNamedDeclaration"
      ? statement.declaration
      : statement
    if (!isNode(declared)) continue
    const values = declared.type === "VariableDeclaration"
      ? (declared.declarations as ReadonlyArray<Node>).map((declaration) => declaration.init)
      : [declared]
    for (const value of values) {
      if (!isNode(value) || value.type !== "CallExpression") continue
      const callee = value.callee as Node
      if (callee.type !== "Identifier" || !defineSteps.has(callee.name as string)) continue
      modules++
      readModule(value)
    }
  }
  if (modules === 0) {
    problems.push({
      rule: "step-unreadable",
      line: 1,
      message: `no defineSteps(…) call at the top level of this step file, imported from "${stepsModule}", so no step definition can be read from it`
    })
  }
  return { definitions, problems }
}
annotate(scanStepDefinitions, { is: "ARCH-spec-parser" })

/** Why a RegExp literal is no regular expression — the parser reads it without checking — or `undefined`. */
const regexProblem = (node: Node | undefined): string | undefined => {
  const regex = node?.regex as { readonly pattern: string; readonly flags: string } | undefined
  if (!regex) return undefined
  try {
    new RegExp(regex.pattern, regex.flags)
    return undefined
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

/** A string, a template without placeholders, or a RegExp literal; undefined for anything computed. */
const literalExpression = (node: Node | undefined): string | RegExp | undefined => {
  if (node?.type === "Literal") {
    const regex = node.regex as { readonly pattern: string; readonly flags: string } | undefined
    if (regex) return new RegExp(regex.pattern, regex.flags)
    return typeof node.value === "string" ? node.value : undefined
  }
  if (node?.type === "TemplateLiteral" && (node.expressions as ReadonlyArray<unknown>).length === 0) {
    return ((node.quasis as ReadonlyArray<Node>)[0]!.value as { cooked: string }).cooked
  }
  return undefined
}

/** Why a Cucumber Expression is malformed, in one line; `undefined` when it is well-formed. */
export const expressionProblem = (expression: string): string | undefined => {
  try {
    new CucumberExpression(expression, new ParameterTypeRegistry())
    return undefined
  } catch (error) {
    // Cucumber draws the expression with a caret under the problem; the line after it names it.
    const lines = (error instanceof Error ? error.message : String(error)).split("\n").filter((line) => line.trim() !== "")
    const caret = lines.findIndex((line) => /^\s*\^/.test(line))
    return (lines[caret + 1] ?? lines[0] ?? "malformed expression").trim()
  }
}
