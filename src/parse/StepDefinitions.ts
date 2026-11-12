/**
 * Reads step definitions out of step files statically: the file is parsed,
 * never run, so reading a workspace executes none of its code. A step file
 * registers its definitions in `defineSteps(world, ({ Given, When, Then }) => { … })`
 * calls it exports at its top level, imported from "sdp/steps", one call per
 * step as a statement of that callback: `Given("…", handler)`, with its
 * expression a string or RegExp literal. That form is read, with each
 * `file:line`. What is registered any other way — under a condition, in a
 * loop, after a statement that may return, through another name or a helper,
 * with a computed expression, by a `defineSteps` renamed or not exported, as
 * the export of another call — is
 * reported, never guessed: only `sdp run`, which imports the module, knows it.
 */
import { CucumberExpression, ParameterTypeRegistry } from "@cucumber/cucumber-expressions"
import { children, isNode, type Node, parseScript } from "./Script.ts"

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

const isKeyword = (name: unknown): name is StepKeyword => typeof name === "string" && keywords.has(name)

const nameOf = (node: unknown): string | undefined => isNode(node) && node.type === "Identifier" ? node.name as string : undefined

/** The identifiers inside `node` that name one of `names`, outside imports. */
const references = (node: Node, names: ReadonlySet<string>): ReadonlyArray<Node> =>
  node.type === "ImportDeclaration" ? [] : names.has(nameOf(node) ?? "") ? [node] : children(node).flatMap((child) => references(child, names))

/** The calls inside `node` of a function that one of `names` names. */
const callsOf = (node: Node, names: ReadonlySet<string>): ReadonlyArray<Node> => [
  ...(node.type === "CallExpression" && names.has(nameOf(node.callee) ?? "") ? [node] : []),
  ...children(node).flatMap((child) => callsOf(child, names))
]

/** Whether `node` can leave the function it is written in: a return or a throw outside any function inside it. */
const exits = (node: Node): boolean =>
  node.type === "ReturnStatement" || node.type === "ThrowStatement" || (!node.type.includes("Function") && children(node).some(exits))

/**
 * Reads the step definitions of one step file without running it.
 *
 * @sdp is ARCH-spec-parser
 */
export const scanStepDefinitions = (file: string, content: string): StepScan => {
  const script = parseScript(file, content)
  const unread = (line: number, message: string): StepScan => ({ definitions: [], problems: [{ rule: "step-unreadable", line, message }] })
  if (script === undefined) return unread(1, "the file is not TypeScript or JavaScript, so its step definitions cannot be read")
  if (script.error) return unread(script.error.line, `the file does not parse, so its step definitions cannot be read: ${script.error.message}`)
  const { lineOf, program } = script

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

  /** One `Given("…", handler)` statement of a `defineSteps` callback. */
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

  /**
   * `defineSteps(world, (registrar) => { … })`: reads the registrations that are statements of the
   * callback. Handlers are not looked into, and a statement that uses the registrar any other way
   * registers what only a run knows.
   */
  const readModule = (call: Node) => {
    const callback = (call.arguments as ReadonlyArray<Node>)[1]
    const registrar = callback && /^(Arrow)?FunctionExpression$/.test(callback.type) ? (callback.params as ReadonlyArray<Node>)[0] : undefined
    if (!callback || !registrar) {
      return unreadable(call, "the second argument of defineSteps is not a function written in place, so its step definitions cannot be read")
    }
    // `({ Given, When: when })` binds registrars to local names; `(steps)` is used as `steps.Given(…)`.
    const local = new Map<string, StepKeyword>()
    const whole = nameOf(registrar)
    for (const property of registrar.type === "ObjectPattern" ? registrar.properties as ReadonlyArray<Node> : []) {
      const key = nameOf(property.key)
      const bound = nameOf(property.value)
      if (property.type !== "Property" || property.computed || key === undefined || bound === undefined) {
        return unreadable(registrar, "the registrar of this defineSteps is taken apart in a way that cannot be read: write ({ Given, When, Then }) or (steps)")
      }
      if (isKeyword(key)) local.set(bound, key)
    }
    if (registrar.type !== "ObjectPattern" && whole === undefined) {
      return unreadable(registrar, "the registrar of this defineSteps is neither ({ Given, When, Then }) nor one name, so its step definitions cannot be read")
    }
    const keywordOf = (callee: Node): StepKeyword | undefined => {
      if (callee.type === "Identifier") return local.get(callee.name as string)
      const member = callee.type === "MemberExpression" && !callee.computed ? nameOf(callee.property) : undefined
      return whole !== undefined && nameOf(callee.object) === whole && isKeyword(member) ? member : undefined
    }
    const names = new Set([...local.keys(), ...(whole === undefined ? [] : [whole])])
    const body = callback.body as Node
    // `(steps) => steps.Given(…)` is a callback of one statement.
    const statements = body.type === "BlockStatement" ? body.body as ReadonlyArray<Node> : [body]
    for (const [index, statement] of statements.entries()) {
      const expression = statement.type === "ExpressionStatement" ? statement.expression as Node : statement
      const keyword = expression.type === "CallExpression" ? keywordOf(expression.callee as Node) : undefined
      if (keyword !== undefined) register(keyword, expression)
      else if (references(statement, names).length > 0) {
        unreadable(
          statement,
          "this statement registers steps under a condition, in a loop or through another name, so they cannot be read without running the file"
        )
      } else if (exits(statement) && index < statements.length - 1) {
        unreadable(statement, "this statement may return before the registrations after it, so only a run knows whether they are made")
        return
      }
    }
  }

  // A run loads what the file exports: `export default defineSteps(…)`, `export const steps = defineSteps(…)`,
  // or a constant exported by name. A call at the top level that is none of these defines nothing a run loads.
  const exported = new Set(program.body.flatMap((statement) =>
    statement.type === "ExportDefaultDeclaration"
      ? [nameOf(statement.declaration)]
      : statement.type === "ExportNamedDeclaration" && !statement.source
      ? (statement.specifiers as ReadonlyArray<Node>).map((specifier) => nameOf(specifier.local))
      : []
  ).filter((name) => name !== undefined))
  let modules = 0
  for (const statement of program.body) {
    const isExport = statement.type === "ExportDefaultDeclaration" || statement.type === "ExportNamedDeclaration"
    const declared = isExport ? statement.declaration : statement.type === "ExpressionStatement" ? statement.expression : statement
    if (!isNode(declared)) continue
    const values = declared.type === "VariableDeclaration"
      ? (declared.declarations as ReadonlyArray<Node>).map((declaration) => ({
        value: declaration.init,
        loaded: isExport || exported.has(nameOf(declaration.id) ?? "")
      }))
      : [{ value: declared, loaded: isExport }]
    for (const { loaded, value } of values) {
      if (!isNode(value) || value.type !== "CallExpression") continue
      if (!defineSteps.has(nameOf(value.callee) ?? "")) {
        if (loaded) unreadable(value, "this export is what a call returns, which a run loads if it is a step module: export defineSteps(…) itself")
        continue
      }
      if (!loaded) {
        unreadable(value, "this defineSteps(…) is not exported, so a run loads none of its steps: write `export default defineSteps(…)`")
        continue
      }
      modules++
      readModule(value)
    }
  }
  // Renamed or passed on, it defines steps under a name sdp does not follow.
  const called = new Set(callsOf(program, defineSteps).map((call) => call.callee))
  const aliases = references(program, defineSteps).filter((reference) => !called.has(reference))
  for (const alias of aliases) unreadable(alias, "defineSteps is renamed or passed on here, so the steps it defines cannot be read without running the file")
  if (modules === 0 && problems.length === 0) {
    problems.push({
      rule: "step-unreadable",
      line: 1,
      message: `no defineSteps(…) call at the top level of this step file, imported from "${stepsModule}", so no step definition can be read from it`
    })
  }
  return { definitions, problems }
}

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
