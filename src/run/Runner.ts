/**
 * Executes scenarios. A step with no matching definition is `undefined`, not
 * a failure: that is how a specification of something not yet built looks.
 * Statuses then roll up into each spec's `verification` and `stage`.
 */
import {
  CucumberExpression,
  CucumberExpressionGenerator,
  type Expression,
  ParameterTypeRegistry,
  RegularExpression
} from "@cucumber/cucumber-expressions"
import { Cause, DateTime, Duration, Effect, Exit, Predicate } from "effect"
import { relative } from "node:path"
import type { Project } from "../graph/Build.ts"
import type { Pickle, Scenario } from "../parse/Gherkin.ts"
import type { Spec } from "../parse/Spec.ts"
import { type PickleResult, type RunResults, type ScenarioResult, type StepResult, type StepStatus, worstStatus } from "./Results.ts"
import type { StepContext, StepDefinition, StepModule } from "./Steps.ts"

// @sdp is ARCH-runner

export interface RunOptions {
  readonly project: Project
  readonly modules: ReadonlyArray<StepModule<any>>
  readonly filter?: ((scenario: Scenario, spec: Spec) => boolean) | undefined
  readonly timeout?: Duration.Input | undefined
  readonly concurrency?: number | undefined
  /** Called after each scenario, e.g. for progress output. */
  readonly onScenario?: ((result: ScenarioResult) => Effect.Effect<void>) | undefined
}

interface Compiled {
  readonly definition: StepDefinition
  readonly module: StepModule<any>
  readonly expression: Expression
}

export const runScenarios = Effect.fn("runScenarios")(function*(options: RunOptions): Effect.fn.Return<RunResults> {
  const registry = new ParameterTypeRegistry()
  const generator = new CucumberExpressionGenerator(() => registry.parameterTypes)
  const compiled: Array<Compiled> = options.modules.flatMap((module) =>
    module.definitions.map((definition) => ({
      definition,
      module,
      expression: Predicate.isString(definition.expression)
        ? new CucumberExpression(definition.expression, registry)
        : new RegularExpression(definition.expression, registry)
    }))
  )
  const timeout = options.timeout ?? "30 seconds"
  const root = options.project.root
  const where = (location: string) => location.startsWith("/") ? relative(root, location) || location : location

  const runPickle = Effect.fnUntraced(function*(spec: Spec, scenario: Scenario, pickle: Pickle) {
    const worlds = new Map<StepModule<any>, unknown>()
    const steps: Array<StepResult> = []
    let blocked = false
    for (const step of pickle.steps) {
      const base = { keyword: step.keyword, text: step.text, line: step.line }
      if (blocked) {
        steps.push({ ...base, status: "skipped", durationMs: 0 })
        continue
      }
      const matches = compiled.flatMap((c) => {
        const args = c.expression.match(step.text)
        return args ? [{ c, args }] : []
      })
      if (matches.length === 0) {
        blocked = true
        steps.push({ ...base, status: "undefined", durationMs: 0, snippet: snippet(generator, step.keyword, step.text) })
        continue
      }
      if (matches.length > 1) {
        blocked = true
        steps.push({
          ...base,
          status: "ambiguous",
          durationMs: 0,
          error: `matches ${matches.length} definitions: ${matches.map((m) => where(m.c.definition.location)).join(", ")}`
        })
        continue
      }
      const { args, c } = matches[0]!
      if (!worlds.has(c.module)) worlds.set(c.module, c.module.world())
      const context: StepContext<unknown, ReadonlyArray<unknown>> = {
        world: worlds.get(c.module),
        args: args.map((arg) => arg.getValue(null)),
        doc: step.docString,
        table: step.dataTable,
        project: options.project,
        scenario: { id: scenario.id, name: pickle.name, specId: spec.id, tags: pickle.tags }
      }
      const started = performance.now()
      const exit = yield* Effect.exit(
        Effect.suspend(() => toEffect(c.definition.handler(context))).pipe(Effect.timeout(timeout))
      )
      const durationMs = Math.round(performance.now() - started)
      const definition = where(c.definition.location)
      if (Exit.isSuccess(exit)) {
        steps.push({ ...base, status: "passed", durationMs, definition })
        continue
      }
      blocked = true
      const error = Cause.squash(exit.cause)
      if (Predicate.isTagged(error, "StepPending")) {
        const reason = (error as { reason?: string }).reason
        steps.push({ ...base, status: "pending", durationMs, definition, ...(reason ? { error: reason } : {}) })
      } else {
        steps.push({ ...base, status: "failed", durationMs, definition, error: describe(error, exit.cause) })
      }
    }
    return {
      name: pickle.name,
      status: worstStatus(steps.map((s) => s.status)),
      ...(pickle.exampleLine ? { exampleLine: pickle.exampleLine } : {}),
      steps
    } satisfies PickleResult
  })

  const selected = options.project.specs.flatMap((spec) =>
    spec.scenarios.filter((scenario) => options.filter?.(scenario, spec) ?? true).map((scenario) => ({ spec, scenario }))
  )
  const runAt = DateTime.formatIso(yield* DateTime.now)
  const results = yield* Effect.forEach(
    selected,
    Effect.fnUntraced(function*({ scenario, spec }) {
      const started = performance.now()
      const pickles: Array<PickleResult> = []
      for (const pickle of scenario.pickles) pickles.push(yield* runPickle(spec, scenario, pickle))
      const result: ScenarioResult = {
        id: scenario.id,
        spec: spec.id,
        name: scenario.name,
        file: spec.file,
        line: scenario.line,
        status: pickles.length === 0 ? "skipped" : worstStatus(pickles.map((p) => p.status)),
        hash: scenario.hash,
        runAt,
        durationMs: Math.round(performance.now() - started),
        pickles
      }
      if (options.onScenario) yield* options.onScenario(result)
      return result
    }),
    { concurrency: options.concurrency ?? 1 }
  )
  return { version: 1, runAt, scenarios: Object.fromEntries(results.map((r) => [r.id, r])) } satisfies RunResults
})

/** Merge a partial run into earlier results, dropping entries for scenarios that no longer exist. */
export const mergeResults = (previous: RunResults | undefined, next: RunResults, project: Project): RunResults => {
  const live = new Set(project.specs.flatMap((spec) => spec.scenarios.map((s) => s.id)))
  const scenarios: Record<string, ScenarioResult> = {}
  for (const [id, result] of Object.entries(previous?.scenarios ?? {})) if (live.has(id)) scenarios[id] = result
  Object.assign(scenarios, next.scenarios)
  return { version: 1, runAt: next.runAt, scenarios }
}

export const summarize = (results: ReadonlyArray<ScenarioResult>): Readonly<Record<StepStatus, number>> => {
  const counts: Record<StepStatus, number> = { passed: 0, failed: 0, pending: 0, undefined: 0, ambiguous: 0, skipped: 0 }
  for (const r of results) counts[r.status]++
  return counts
}

const toEffect = (outcome: unknown): Effect.Effect<unknown, unknown> => {
  if (Effect.isEffect(outcome)) return outcome as Effect.Effect<unknown, unknown>
  if (Predicate.isPromiseLike(outcome)) return Effect.tryPromise({ try: () => Promise.resolve(outcome), catch: (e) => e })
  return Effect.void
}

const describe = (error: unknown, cause: Cause.Cause<unknown>): string => {
  if (Predicate.isTagged(error, "TimeoutError")) return "step timed out"
  if (error instanceof Error) return error.message
  if (Predicate.isString(error)) return error
  return Cause.pretty(cause)
}

const snippet = (generator: CucumberExpressionGenerator, keyword: string, text: string): string => {
  const generated = generator.generateExpressions(text)[0]
  const expression = generated?.source ?? text
  const names = generated?.parameterNames ?? []
  const fn = ["Given", "When", "Then"].includes(keyword) ? keyword : "Step"
  const args = names.length > 0 ? `, args: [${names.join(", ")}]` : ""
  return `${fn}(${JSON.stringify(expression)}, ({ world${args} }) => pending())`
}
