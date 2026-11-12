/**
 * Matching step text against step definitions, without running anything. The
 * runner matches each step before it executes it; `sdp context`, `sdp run
 * --snippets` and the MCP tool `sdp_snippets` use the same matcher to show
 * what is not automated yet, with a suggested definition for each such step.
 */
import { annotate } from "../annotations.ts"
import {
  type Argument,
  CucumberExpression,
  CucumberExpressionGenerator,
  type Expression,
  ParameterTypeRegistry,
  RegularExpression
} from "@cucumber/cucumber-expressions"
import { Predicate } from "effect"
import type { Project } from "../graph/Build.ts"
import type { PickleStep, Scenario } from "../parse/Gherkin.ts"
import type { Spec } from "../parse/Spec.ts"
import type { StepDefinition, StepModule } from "./Steps.ts"

annotate(import.meta, { is: "ARCH-runner" })

export interface Match {
  readonly definition: StepDefinition
  readonly module: StepModule<any>
  readonly args: ReadonlyArray<Argument>
}

export interface Matcher {
  /** Every definition whose expression matches the whole text. */
  readonly match: (text: string) => ReadonlyArray<Match>
  /** A paste-ready definition for a step nothing matches; it returns `pending()`. */
  readonly snippet: (step: Pick<PickleStep, "type" | "text">) => string
}

const keywords: Record<PickleStep["type"], string> = { Context: "Given", Action: "When", Outcome: "Then", Unknown: "Step" }

export const makeMatcher = (modules: ReadonlyArray<StepModule<any>>): Matcher => {
  const registry = new ParameterTypeRegistry()
  const generator = new CucumberExpressionGenerator(() => registry.parameterTypes)
  const compiled: Array<{ readonly definition: StepDefinition; readonly module: StepModule<any>; readonly expression: Expression }> =
    modules.flatMap((module) =>
      module.definitions.map((definition) => ({
        definition,
        module,
        expression: Predicate.isString(definition.expression)
          ? new CucumberExpression(definition.expression, registry)
          : new RegularExpression(definition.expression, registry)
      }))
    )
  return {
    match: (text) =>
      compiled.flatMap(({ definition, expression, module }) => {
        const args = expression.match(text)
        return args ? [{ definition, module, args }] : []
      }),
    snippet: ({ text, type }) => {
      const generated = generator.generateExpressions(text)[0]
      const names = generated?.parameterNames ?? []
      const args = names.length > 0 ? `, args: [${names.join(", ")}]` : ""
      return `${keywords[type]}(${JSON.stringify(generated?.source ?? text)}, ({ world${args} }) => pending())`
    }
  }
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
  matcher: Matcher,
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
    `import { defineSteps, pending } from "sdp"`,
    "",
    "const newWorld = () => ({})",
    "",
    `export default defineSteps(newWorld, ({ ${used.join(", ")} }) => {`,
    ...[...unique.values()].map((snippet) => `  ${snippet}`),
    "})",
    ""
  ].join("\n")
}
