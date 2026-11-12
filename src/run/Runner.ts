/**
 * Executes scenarios. A step with no matching definition is `undefined`, not
 * a failure: that is how a specification of something not yet built looks.
 * Statuses then roll up into each spec's `verification` and `stage`.
 */
import { annotate } from "sdp/annotations"
import { Cause, DateTime, Duration, Effect, Exit, Fiber, Predicate, Queue, Schema } from "effect"
import { isAbsolute, relative } from "node:path"
import type { Project } from "../graph/Build.ts"
import { type PickleResult, type ScenarioResult, type StepResult, type StepStatus, worstStatus } from "../model/Results.ts"
import type { Pickle, Scenario } from "../parse/Gherkin.ts"
import type { Spec } from "../parse/Spec.ts"
import type { Snapshot } from "./Evidence.ts"
import { makeMatcher } from "./Match.ts"
import type { StepContext, StepModule } from "./Steps.ts"

/** Step definitions whose Cucumber Expression is malformed: nothing can be matched reliably, so nothing runs. */
export class InvalidStepExpressions extends Schema.TaggedError<InvalidStepExpressions>()("InvalidStepExpressions", {
  /** One line each: `file:line: invalid step expression "…": what is wrong`. */
  problems: Schema.Array(Schema.String)
}) {
  override get message() {
    return this.problems.join("\n")
  }
}

export interface RunOptions {
  /** The graph the scenarios see: without results for ordinary scenarios, with the ordinary results for gates. */
  readonly project: Project
  readonly modules: ReadonlyArray<StepModule<any>>
  /** Fingerprints of what the scenarios run against, recorded as each result's evidence. */
  readonly against: Snapshot
  /**
   * The examples of a scenario to run: `undefined` leaves the scenario out, an empty list runs one
   * that has none. The default runs every example of every scenario.
   */
  readonly select?: ((scenario: Scenario, spec: Spec) => ReadonlyArray<Pickle> | undefined) | undefined
  /** These are gates, run after the ordinary scenarios: a gate that reads the graph depends on their results. */
  readonly gates?: boolean | undefined
  /** How long a step may take (default 30 seconds). Cooperative: a step that never yields is failed once it returns. */
  readonly timeout?: Duration.Input | undefined
  readonly concurrency?: number | undefined
  /** Called once per scenario, one call at a time and in order, e.g. for progress output. */
  readonly onScenario?: ((result: ScenarioResult) => Effect.Effect<void>) | undefined
}

interface Selected {
  readonly spec: Spec
  readonly scenario: Scenario
  readonly pickles: ReadonlyArray<Pickle>
}

/** Executes the selected scenarios against the step modules and returns their results; undefined steps are not failures. */
export const runScenarios = Effect.fn("runScenarios")(function*(
  options: RunOptions
): Effect.fn.Return<ReadonlyArray<ScenarioResult>, InvalidStepExpressions> {
  const { against, gates = false } = options
  const { root } = options.project
  // Inside the workspace relative to its root; anywhere else (sdp's built-in steps) absolute.
  const where = (location: string) => {
    if (!isAbsolute(location)) return location
    const inside = relative(root, location)
    return inside === "" || inside.startsWith("..") || isAbsolute(inside) ? location : inside
  }
  const matcher = makeMatcher(options.modules.flatMap((module) => module.definitions.map((definition) => ({ ...definition, module }))))
  if (matcher.invalid.length > 0) {
    return yield* new InvalidStepExpressions({
      problems: matcher.invalid.map(({ definition, problem }) =>
        `${where(definition.location)}: invalid step expression ${JSON.stringify(definition.expression)}: ${problem}`
      )
    })
  }
  const timeout = Duration.fromInputUnsafe(options.timeout ?? "30 seconds")

  /** Runs one example; `reads.graph` records whether a step used the project, i.e. read the graph. */
  const runPickle = Effect.fnUntraced(function*(spec: Spec, scenario: Scenario, pickle: Pickle, reads: { graph: boolean }) {
    // One world per scenario per world factory: modules built on the same factory share state.
    const worlds = new Map<() => unknown, unknown>()
    const steps: Array<StepResult> = []
    let blocked = false
    for (const step of pickle.steps) {
      const base = { keyword: step.keyword, text: step.text, line: step.line }
      // Every step is matched, even after one did not pass, so all missing and
      // ambiguous definitions show up in one run; only execution stops.
      const matches = matcher.match(step.text)
      if (matches.length === 0) {
        blocked = true
        steps.push({ ...base, status: "undefined", durationMs: 0, snippet: matcher.snippet(step) })
        continue
      }
      if (matches.length > 1) {
        blocked = true
        steps.push({
          ...base,
          status: "ambiguous",
          durationMs: 0,
          error: `matches ${matches.length} definitions: ${matches.map((m) => where(m.definition.location)).join(", ")}`
        })
        continue
      }
      if (blocked) {
        steps.push({ ...base, status: "skipped", durationMs: 0 })
        continue
      }
      const { args, definition: matched } = matches[0]!
      const { module } = matched
      // Aborted when the step times out or the run is interrupted, so Promise handlers can stop their work.
      const controller = new AbortController()
      // The world is made as part of the step: a factory that throws fails the step that needs it.
      const execute = Effect.gen(function*() {
        if (!worlds.has(module.world)) {
          worlds.set(
            module.world,
            yield* Effect.try({
              try: () => module.world(),
              catch: (error) => new Error(`could not create the world of ${where(module.name)}: ${message(error)}`)
            })
          )
        }
        const context: StepContext<unknown, ReadonlyArray<unknown>> = {
          world: worlds.get(module.world),
          args,
          doc: step.docString,
          table: step.dataTable,
          get project() {
            reads.graph = true
            return options.project
          },
          scenario: { id: scenario.id, name: pickle.name, specId: spec.id, tags: pickle.tags, gate: gates },
          signal: controller.signal
        }
        return yield* toEffect(matched.handler(context))
      })
      const started = performance.now()
      const exit = yield* Effect.exit(
        execute.pipe(Effect.onInterrupt(() => Effect.sync(() => controller.abort())), Effect.timeout(timeout))
      )
      const durationMs = Math.round(performance.now() - started)
      const definition = where(matched.location)
      // A step that never yielded could not be interrupted: it is late all the same.
      if (Exit.isSuccess(exit) && durationMs <= Duration.toMillis(timeout)) {
        steps.push({ ...base, status: "passed", durationMs, definition })
        continue
      }
      blocked = true
      if (Exit.isSuccess(exit)) {
        steps.push({ ...base, status: "failed", durationMs, definition, error: timedOut })
        continue
      }
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
      // No steps means nothing is automated: undefined, like a step without a definition.
      status: steps.length === 0 ? "undefined" : worstStatus(steps.map((s) => s.status)),
      ...(pickle.exampleLine ? { exampleLine: pickle.exampleLine } : {}),
      steps
    } satisfies PickleResult
  })

  const select = options.select ?? ((scenario: Scenario) => scenario.pickles)
  const selected = options.project.specs.flatMap((spec) =>
    spec.scenarios.flatMap((scenario): ReadonlyArray<Selected> => {
      const pickles = select(scenario, spec)
      return pickles ? [{ spec, scenario, pickles }] : []
    })
  )
  const runAt = DateTime.formatIso(yield* DateTime.now)
  const runOne = Effect.fnUntraced(function*({ pickles: chosen, scenario, spec }: Selected) {
    const started = performance.now()
    const reads = { graph: false }
    const pickles: Array<PickleResult> = []
    for (const pickle of scenario.pickles) {
      // An example the run did not select is recorded, but as not run: the scenario cannot pass without it.
      pickles.push(
        chosen.includes(pickle)
          ? yield* runPickle(spec, scenario, pickle, reads)
          : { name: pickle.name, status: "skipped", ...(pickle.exampleLine ? { exampleLine: pickle.exampleLine } : {}), steps: [] }
      )
    }
    return {
      id: scenario.id,
      spec: spec.id,
      name: scenario.name,
      file: spec.file,
      line: scenario.line,
      status: pickles.length === 0 ? "undefined" : worstStatus(pickles.map((p) => p.status)),
      hash: scenario.hash,
      // What this result is evidence about: it stops counting as soon as any of it changes.
      evidence: {
        sources: against.sources,
        toolchain: against.toolchain,
        inputs: against.inputs,
        ...(reads.graph ? { specs: against.specs } : {}),
        ...(reads.graph && gates ? { results: against.results } : {})
      },
      runAt,
      durationMs: Math.round(performance.now() - started),
      pickles
    } satisfies ScenarioResult
  })

  // Scenarios run concurrently when asked to, except `@serial` ones (timings, shared resources),
  // which run alone afterwards. Whatever finishes first, one publisher reports them in this order.
  const isSerial = ({ pickles }: Selected) => pickles.some((p) => p.tags.includes("@serial"))
  const together = selected.filter((item) => !isSerial(item))
  const alone = selected.filter(isSerial)
  const finished = yield* Queue.unbounded<readonly [position: number, result: ScenarioResult]>()
  const publisher = yield* Effect.forkChild(Effect.gen(function*() {
    const waiting = new Map<number, ScenarioResult>()
    let next = 0
    while (next < selected.length) {
      const [position, result] = yield* Queue.take(finished)
      waiting.set(position, result)
      while (waiting.has(next)) {
        if (options.onScenario) yield* options.onScenario(waiting.get(next)!)
        next++
      }
    }
  }))
  const run = (item: Selected, position: number) => Effect.tap(runOne(item), (result) => Queue.offer(finished, [position, result]))
  const first = yield* Effect.forEach(together, run, { concurrency: options.concurrency ?? 1 })
  const rest = yield* Effect.forEach(alone, (item, index) => run(item, together.length + index))
  yield* Fiber.join(publisher)
  const byId = new Map([...first, ...rest].map((r) => [r.id, r]))
  return selected.map(({ scenario }) => byId.get(scenario.id)!)
})
annotate(runScenarios, { is: "ARCH-runner" })

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

const timedOut = "step timed out"

const message = (error: unknown): string => error instanceof Error ? error.message : String(error)

const describe = (error: unknown, cause: Cause.Cause<unknown>): string => {
  if (Predicate.isTagged(error, "TimeoutError")) return timedOut
  // Effect.tryPromise/try wrap what was thrown; the wrapped error is what the author wrote.
  if (Predicate.isTagged(error, "UnknownError") && Predicate.hasProperty(error, "cause") && error.cause !== undefined) {
    return describe(error.cause, cause)
  }
  if (error instanceof Error) return error.message
  if (Predicate.isString(error)) return error
  return Cause.pretty(cause)
}
