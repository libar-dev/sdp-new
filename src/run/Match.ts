/**
 * Matching step text against step definitions, without running anything. The
 * runner matches each step against the definitions it loaded before it
 * executes it; `sdp context`, `sdp steps` and the MCP tool `sdp_snippets` match
 * against the definitions read statically from the step files, so they run no
 * workspace code. Either way an unmatched step gets a suggested definition.
 */
import { annotate } from "sdp/annotations"
import { CucumberExpression, CucumberExpressionGenerator, ParameterTypeRegistry } from "@cucumber/cucumber-expressions"
import { Predicate } from "effect"
import { isAbsolute, relative } from "node:path"
import type { Project } from "../graph/Build.ts"
import { formatSource } from "../model/Graph.ts"
import type { PickleStep, Scenario } from "../parse/Gherkin.ts"
import type { Spec } from "../parse/Spec.ts"
import { expressionProblem, type StepSignature } from "../parse/StepDefinitions.ts"
import { builtinSteps } from "./Builtin.ts"

annotate(import.meta, { is: "ARCH-runner" })

type Definition = Pick<StepSignature, "expression" | "location">

export interface Match<D extends Definition> {
  readonly definition: D
  /** A Cucumber Expression's parameters, converted; a regular expression's captures, as the text they matched. */
  readonly args: ReadonlyArray<unknown>
}

export interface Matcher<D extends Definition> {
  /** Every definition whose expression matches the text. */
  readonly match: (text: string) => ReadonlyArray<Match<D>>
  /** A paste-ready definition for a step nothing matches; it returns `pending()`. */
  readonly snippet: (step: Pick<PickleStep, "type" | "text">) => string
  /** Definitions whose Cucumber Expression is malformed, each with what is wrong: they match nothing. */
  readonly invalid: ReadonlyArray<{ readonly definition: D; readonly problem: string }>
}

const keywords: Record<PickleStep["type"], string> = { Context: "Given", Action: "When", Outcome: "Then", Unknown: "Step" }

export const makeMatcher = <D extends Definition>(definitions: ReadonlyArray<D>): Matcher<D> => {
  const registry = new ParameterTypeRegistry()
  const generator = new CucumberExpressionGenerator(() => registry.parameterTypes)
  const compiled: Array<{ readonly definition: D; readonly args: (text: string) => ReadonlyArray<unknown> | undefined }> = []
  const invalid: Array<{ readonly definition: D; readonly problem: string }> = []
  for (const definition of definitions) {
    const { expression } = definition
    if (Predicate.isString(expression)) {
      const problem = expressionProblem(expression)
      if (problem !== undefined) {
        invalid.push({ definition, problem })
        continue
      }
      const cucumber = new CucumberExpression(expression, registry)
      compiled.push({ definition, args: (text) => cucumber.match(text)?.map((arg) => arg.getValue(null)) })
    } else {
      // Matched afresh each time: a `g` or `y` flag would otherwise remember where the last match ended.
      const regexp = new RegExp(expression.source, expression.flags.replace(/[gy]/g, ""))
      compiled.push({ definition, args: (text) => regexp.exec(text)?.slice(1) })
    }
  }
  return {
    match: (text) =>
      compiled.flatMap(({ args, definition }) => {
        const matched = args(text)
        return matched ? [{ definition, args: matched }] : []
      }),
    snippet: ({ text, type }) => {
      const generated = generator.generateExpressions(text)[0]
      const names = generated?.parameterNames ?? []
      const args = names.length > 0 ? `, args: [${names.join(", ")}]` : ""
      return `${keywords[type]}(${JSON.stringify(generated?.source ?? text)}, ({ world${args} }) => pending())`
    },
    invalid
  }
}

/** Every step definition a run would know, as read without running the workspace: sdp's built-in ones, then those of the step files. */
export const stepDefinitions = (project: Project): ReadonlyArray<StepSignature> => [
  ...builtinSteps.definitions,
  ...project.steps.definitions
]

/**
 * What the step files hold that could not be read or cannot match, one `file:line: message` each:
 * a step that looks undefined to a reader may be one of these.
 */
export const stepProblems = (project: Project): ReadonlyArray<string> =>
  project.diagnostics
    .filter((diagnostic) => diagnostic.rule === "step-unreadable" || diagnostic.rule === "step-expression")
    .map((diagnostic) => `${formatSource(diagnostic.source)}: ${diagnostic.message}`)

/** What a reader knows of the workspace's steps without running anything: a matcher, the step files, and what could not be read. */
export const readSteps = (project: Project) => ({
  matcher: makeMatcher(stepDefinitions(project)),
  files: project.steps.files,
  problems: stepProblems(project)
})

/** A `file:line` inside the workspace, relative to its root; anywhere else (sdp's built-in steps) as it is. */
export const locate = (root: string, location: string): string => {
  if (!isAbsolute(location)) return location
  const inside = relative(root, location)
  return inside === "" || inside.startsWith("..") || isAbsolute(inside) ? location : inside
}

/** One step definition as `sdp steps` lists it. */
export interface ListedStep {
  readonly file: string
  readonly line: number
  readonly keyword: string
  /** The Cucumber Expression, or the regular expression between slashes. */
  readonly expression: string
}

/** The step definitions a run would know; with `text`, those whose expression contains it or that match it as a step. */
export const listSteps = (project: Project, text?: string): ReadonlyArray<ListedStep> => {
  const all = stepDefinitions(project)
  const matching = new Set(text === undefined ? all : makeMatcher(all).match(text).map((match) => match.definition))
  const mentions = (expression: string) => text !== undefined && expression.toLowerCase().includes(text.toLowerCase())
  return all.filter((step) => matching.has(step) || mentions(String(step.expression))).map((step) => {
    const location = locate(project.root, step.location)
    const colon = location.lastIndexOf(":")
    return {
      file: location.slice(0, colon),
      line: Number(location.slice(colon + 1)),
      keyword: step.keyword,
      expression: String(step.expression)
    }
  })
}

/** A step of a scenario that no definition matches (`undefined`), or more than one (`ambiguous`). */
export interface UnmatchedStep {
  readonly spec: string
  readonly scenario: string
  readonly file: string
  readonly line: number
  readonly keyword: string
  readonly text: string
  readonly status: "undefined" | "ambiguous"
  /** The suggested definition of an undefined step. */
  readonly snippet?: string | undefined
  /** `file:line` of each definition an ambiguous step matches. */
  readonly definitions?: ReadonlyArray<string> | undefined
}

/** The unmatched steps of every selected scenario, each step text once per scenario. */
export const unmatchedSteps = (
  project: Project,
  matcher: Matcher<Definition>,
  filter: (scenario: Scenario, spec: Spec) => boolean = () => true
): ReadonlyArray<UnmatchedStep> => {
  const found: Array<UnmatchedStep> = []
  for (const spec of project.specs) {
    for (const scenario of spec.scenarios.filter((s) => filter(s, spec))) {
      const seen = new Set<string>()
      for (const step of scenario.pickles.flatMap((pickle) => pickle.steps)) {
        if (seen.has(step.text)) continue
        seen.add(step.text)
        const matches = matcher.match(step.text)
        if (matches.length === 1) continue
        const base = { spec: spec.id, scenario: scenario.id, file: spec.file, line: step.line, keyword: step.keyword, text: step.text }
        found.push(
          matches.length === 0
            ? { ...base, status: "undefined", snippet: matcher.snippet(step) }
            : { ...base, status: "ambiguous", definitions: matches.map((m) => m.definition.location) }
        )
      }
    }
  }
  return found
}

/**
 * One step definition module for the given suggestions, ready to save as a
 * `.steps.ts` file: each expression once (a second definition of the same text
 * would make the step ambiguous), with the step files that already exist named
 * so the author can add to one of them instead.
 */
export const snippetModule = (snippets: ReadonlyArray<string>, stepFiles: ReadonlyArray<string>): string => {
  const unique = new Map<string, string>()
  // Keyword-agnostic: `Given("x"…)` and `When("x"…)` define the same step.
  for (const snippet of snippets) {
    const key = snippet.replace(/^\w+/, "")
    if (!unique.has(key)) unique.set(key, snippet)
  }
  const used = ["Given", "When", "Then", "Step"].filter((keyword) => [...unique.values()].some((s) => s.startsWith(`${keyword}(`)))
  const existing = stepFiles.length > 0
    ? `// Existing step files: ${stepFiles.join(", ")}. Add these there, or save this as a new *.steps.ts file.`
    : "// No step files yet: save this as e.g. specs/steps/my.steps.ts (any file the `steps` globs match)."
  return [
    existing,
    "// Each scenario gets a fresh world per world factory; step modules that pass the same factory share it,",
    "// so once there are several files, export newWorld from one module and import it in the others.",
    `import { defineSteps, pending } from "sdp/steps"`,
    "",
    "const newWorld = () => ({})",
    "",
    `export default defineSteps(newWorld, ({ ${used.join(", ")} }) => {`,
    ...[...unique.values()].map((snippet) => `  ${snippet}`),
    "})",
    ""
  ].join("\n")
}
