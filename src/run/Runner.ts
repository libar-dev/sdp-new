/**
 * Executes scenarios. A step with no matching definition is `undefined`, not
 * a failure: that is how a specification of something not yet built looks.
 * Statuses then roll up into each spec's and rule's `stage`.
 */
import { AsyncLocalStorage } from "node:async_hooks"
import { Cause, Clock, DateTime, Deferred, Duration, Effect, Exit, Fiber, Option, Predicate, Schema, type Scope } from "effect"
import * as CliError from "effect/cli/CliError"
import type { Project } from "../graph/Build.ts"
import { type ExampleResult, type ScenarioResult, type StepResult, type StepStatus, worstStatus } from "../model/Results.ts"
import { made } from "../model/Vocabulary.ts"
import type { Pickle, Scenario } from "../parse/Gherkin.ts"
import type { Spec } from "../parse/Spec.ts"
import type { Snapshot } from "./Evidence.ts"
import { locate, makeMatcher } from "./Match.ts"
import type { StepContext, StepModule } from "./Steps.ts"

/** Step definitions whose Cucumber Expression is malformed: nothing can be matched reliably, so nothing runs. */
export class InvalidStepExpressions extends Schema.TaggedError<InvalidStepExpressions>()("InvalidStepExpressions", {
  /** One line each: `file:line: invalid step expression "…": what is wrong`. */
  problems: Schema.Array(Schema.String)
}) {
  override get message() {
    return this.problems.join("\n")
  }
  override get [CliError.userMessage]() {
    return this.message
  }
}

/** Work a step left unawaited that failed once no step that started it still ran: the run reports it once it has recorded what it ran. */
export class UnawaitedFailures extends Schema.TaggedError<UnawaitedFailures>()("UnawaitedFailures", {
  /** One each: what failed, and where it was started when that is known. */
  problems: Schema.Array(Schema.String)
}) {
  override get message() {
    return `work nobody awaited failed outside the step that started it: ${this.problems.join("; ")}`
  }
  override get [CliError.userMessage]() {
    return this.message
  }
}

/**
 * Where work nobody awaited — a rejection no handler takes, an exception no caller catches — was
 * started: Node tells the process of it in the async context of the code that started it, and
 * that context carries its origin, a step as it runs or a step module as it loads.
 */
export interface Origin {
  /** The run or the load it is part of. */
  readonly watch: Watch
  /** Fails what it is the origin of, if that still runs: false once it is over. */
  readonly fail: (problem: string) => boolean
  /** Says where the work was started, for a report made after that is over. */
  readonly name: string
}

/** A run or a load that hears of work nobody awaited while it lasts. */
export interface Watch {
  /** Reports work whose origin is over, or that has none it could tell. */
  readonly report: (problem: string) => void
}

/** An origin, and the one it runs within: a run of specs inside a step of another, as sdp runs its own. */
interface Started extends Origin {
  readonly within: Started | undefined
}

const origins = new AsyncLocalStorage<Started>()
const watches = new Set<Watch>()

const unawaited = (error: unknown) => {
  const problem = message(error)
  const first = origins.getStore()
  const where = first === undefined ? problem : `${problem} (started by ${first.name})`
  for (let origin = first; origin !== undefined; origin = origin.within) {
    if (!watches.has(origin.watch)) continue
    if (!origin.fail(problem)) origin.watch.report(where)
    return
  }
  // No run or load it came from still hears, and none can tell that it is not theirs: each says so.
  for (const watch of watches) watch.report(where)
}

/**
 * Hears of work nobody awaited, in place of Node, until the scope closes: one process listener
 * for every run and load under way, so that none of it ends the process.
 */
export const watchUnawaited = (report: (problem: string) => void): Effect.Effect<Watch, never, Scope.Scope> =>
  Effect.acquireRelease(
    Effect.sync(() => {
      const watch: Watch = { report }
      if (watches.size === 0) {
        process.on("unhandledRejection", unawaited)
        process.on("uncaughtException", unawaited)
      }
      watches.add(watch)
      return watch
    }),
    (watch) =>
      Effect.sync(() => {
        watches.delete(watch)
        if (watches.size > 0) return
        process.removeListener("unhandledRejection", unawaited)
        process.removeListener("uncaughtException", unawaited)
      })
  )

/**
 * Runs `effect` hearing of work nobody awaited that fails once the run or load it came from is
 * over, as a run's results are recorded: `effect` does all it does, and then fails with it.
 */
export const failingOnUnawaited = <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E | UnawaitedFailures, R> =>
  Effect.scoped(Effect.gen(function*() {
    const problems: Array<string> = []
    yield* watchUnawaited((problem) => problems.push(problem))
    const done = yield* effect
    yield* aTurn
    return problems.length === 0 ? done : yield* new UnawaitedFailures({ problems })
  }))

/** Calls `f` as the origin of the work it starts and does not await. */
export const startedBy = <A>(origin: Origin, f: () => A): A => origins.run({ ...origin, within: origins.getStore() }, f)

/** A turn of Node's event loop: Node tells of a rejection nobody awaited once the microtasks before it ran. */
export const aTurn: Effect.Effect<void> = Effect.promise(() => new Promise<void>((done) => setImmediate(done)))

export interface RunOptions<E = never, R = never> {
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
  /** How long a step may take. Cooperative: a step that never yields is failed once it returns. */
  readonly timeout: Duration.Input
  readonly concurrency?: number | undefined
  /**
   * Called once per scenario, one call at a time and in order, e.g. for progress output, before
   * the scenario's place is given to another: one that fails stops the run there.
   */
  readonly onScenario?: ((result: ScenarioResult) => Effect.Effect<void>) | undefined
  /** Called, uninterrupted, with the results of the scenarios that finished when a run stops before its end: interrupted, or failed. */
  readonly onStop?: ((finished: ReadonlyArray<ScenarioResult>) => Effect.Effect<void, E, R>) | undefined
}

interface Selected {
  readonly spec: Spec
  readonly scenario: Scenario
  readonly pickles: ReadonlyArray<Pickle>
}

/**
 * Runs the selected scenarios against the step modules and records each result with what it ran
 * against, so a result counts only while that is unchanged.
 *
 * @sdp is ARCH-runner
 *
 * @remarks
 * Executes the selected scenarios against the step modules and returns their results; undefined steps are not failures.
 */
export const runScenarios = Effect.fn("runScenarios")(function*<E, R>(
  options: RunOptions<E, R>
): Effect.fn.Return<ReadonlyArray<ScenarioResult>, InvalidStepExpressions | UnawaitedFailures | E, R | Scope.Scope> {
  const { against, gates = false } = options
  const { root } = options.project
  const where = (location: string) => locate(root, location)
  const matcher = makeMatcher(options.modules.flatMap((module) => module.definitions.map((definition) => ({ ...definition, module }))))
  if (matcher.invalid.length > 0) {
    return yield* new InvalidStepExpressions({
      problems: matcher.invalid.map(({ definition, problem }) =>
        `${where(definition.location)}: invalid step expression ${JSON.stringify(definition.expression)}: ${problem}`
      )
    })
  }
  const timeout = Duration.fromInputUnsafe(options.timeout)
  // Work a step left unawaited fails that step while it runs; what fails after it, the run reports.
  const left: Array<string> = []
  const watch = yield* watchUnawaited((problem) => left.push(problem))

  /** Runs one example; `reads.graph` records whether a step used the project, i.e. read the graph. */
  const runPickle = Effect.fnUntraced(function*(spec: Spec, scenario: Scenario, pickle: Pickle, reads: { graph: boolean }) {
    // One world per example — a scenario, or one row of an outline — per world factory.
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
      // What the step started and did not await fails it, while it runs.
      const unawaitedFailure = Deferred.makeUnsafe<never, string>()
      let running = true
      const origin: Origin = {
        watch,
        name: `the step "${step.text}" of ${scenario.id}`,
        // The first failure fails the step; one after it, whenever it comes, adds nothing to that.
        fail: (problem) =>
          Deferred.isDoneUnsafe(unawaitedFailure) ||
          (running && Deferred.doneUnsafe(unawaitedFailure, Effect.fail(`${problem} (nobody awaited it)`)))
      }
      // The world is made as part of the step: a factory that throws fails the step that needs it.
      const execute = Effect.gen(function*() {
        if (!worlds.has(module.world)) {
          worlds.set(
            module.world,
            yield* Effect.try({
              try: () => startedBy(origin, () => module.world()),
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
        return yield* toEffect(startedBy(origin, () => matched.handler(context)), origin)
      })
      const started = yield* Clock.currentTimeMillis
      const exit = yield* Effect.exit(
        Effect.raceFirst(
          Deferred.await(unawaitedFailure),
          // A turn after the handler: a rejection it left as it returned is told of only then.
          execute.pipe(Effect.onInterrupt(() => Effect.sync(() => controller.abort())), Effect.andThen(aTurn))
        ).pipe(Effect.timeoutOption(timeout), Effect.ensuring(Effect.sync(() => running = false)))
      )
      const durationMs = Math.round((yield* Clock.currentTimeMillis) - started)
      const definition = where(matched.location)
      // A step that never yielded could not be interrupted: it is late all the same.
      if (Exit.isSuccess(exit) && Option.isSome(exit.value) && durationMs <= Duration.toMillis(timeout)) {
        steps.push({ ...base, status: "passed", durationMs, definition })
        continue
      }
      blocked = true
      if (Exit.isSuccess(exit)) {
        // Noticed only once it returned, but late all the same: what it started is told to stop.
        controller.abort()
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
    } satisfies ExampleResult
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
    const started = yield* Clock.currentTimeMillis
    const reads = { graph: false }
    const examples: Array<ExampleResult> = []
    for (const pickle of scenario.pickles) {
      // An example the run did not select is recorded, but as not run: the scenario cannot pass without it.
      examples.push(
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
      status: examples.length === 0 ? "undefined" : worstStatus(examples.map((example) => example.status)),
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
      durationMs: Math.round((yield* Clock.currentTimeMillis) - started),
      examples
    } satisfies ScenarioResult
  })

  // Scenarios run concurrently when asked to, except `@serial` ones (timings, shared resources),
  // which run alone afterwards. Whatever finishes first, they are reported in this order.
  const isSerial = ({ pickles }: Selected) => pickles.some((p) => p.tags.includes(made.tags.serial))
  const together = selected.filter((item) => !isSerial(item))
  const alone = selected.filter(isSerial)
  const finished: Array<ScenarioResult> = []
  const waiting = new Map<number, ScenarioResult>()
  let next = 0
  let reporting = false
  /**
   * Reports each result whose turn has come, by the fiber that ran a scenario, before it runs
   * another: a report that fails stops the run there. One fiber reports at a time; one that finds
   * another reporting leaves its result to it, which looks again after each report.
   */
  const reportNext: Effect.Effect<void> = Effect.suspend(() => {
    const known = waiting.get(next)
    if (reporting || known === undefined || options.onScenario === undefined) return Effect.void
    reporting = true
    waiting.delete(next)
    next++
    return options.onScenario(known).pipe(Effect.ensuring(Effect.sync(() => reporting = false)), Effect.andThen(reportNext))
  })
  // A scenario that has finished counts, whenever the run stops after it.
  const run = (item: Selected, position: number) =>
    Effect.uninterruptibleMask((restore) =>
      restore(runOne(item)).pipe(Effect.tap((result) => Effect.sync(() => finished.push(result))))
    ).pipe(Effect.tap((result) => Effect.andThen(Effect.sync(() => waiting.set(position, result)), reportNext)))
  const work = Effect.gen(function*() {
    yield* Effect.forEach(together, run, { concurrency: options.concurrency ?? 1, discard: true })
    yield* Effect.forEach(alone, (item, index) => run(item, together.length + index), { discard: true })
    // What the last steps left unawaited is told of after a turn, too.
    yield* aTurn
    if (left.length > 0) return yield* new UnawaitedFailures({ problems: left })
    const byId = new Map(finished.map((result) => [result.id, result]))
    return selected.map(({ scenario }) => byId.get(scenario.id)!)
  })
  return yield* work.pipe(
    Effect.onExit((exit) => Exit.isFailure(exit) && options.onStop ? Effect.uninterruptible(options.onStop([...finished])) : Effect.void)
  )
}, Effect.scoped)

export const summarize = (results: ReadonlyArray<ScenarioResult>): Readonly<Record<StepStatus, number>> => {
  const counts: Record<StepStatus, number> = { passed: 0, failed: 0, pending: 0, undefined: 0, ambiguous: 0, skipped: 0 }
  for (const r of results) counts[r.status]++
  return counts
}

/**
 * What a handler returned, as an Effect. One it returned as an Effect runs in a fiber of its own,
 * started as `origin`: a fiber resumes in the async context it was started in, so what its code
 * starts and does not await is the step's too, as a Promise handler's is.
 */
const toEffect = (outcome: unknown, origin: Origin): Effect.Effect<unknown, unknown> => {
  if (Effect.isEffect(outcome)) {
    const effect = outcome as Effect.Effect<unknown, unknown>
    return Effect.flatMap(Effect.context<never>(), (services) =>
      Effect.callback<unknown, unknown>((resume) => {
        const fiber = startedBy(origin, () => Effect.runForkWith(services)(effect))
        fiber.addObserver(resume)
        return Fiber.interrupt(fiber)
      }))
  }
  if (Predicate.isPromiseLike(outcome)) return Effect.tryPromise({ try: () => Promise.resolve(outcome), catch: (e) => e })
  return Effect.void
}

const timedOut = "step timed out"

const message = (error: unknown): string => error instanceof Error ? error.message : String(error)

const describe = (error: unknown, cause: Cause.Cause<unknown>): string => {
  // Effect.tryPromise/try wrap what was thrown; the wrapped error is what the author wrote.
  if (Predicate.isTagged(error, "UnknownError") && Predicate.hasProperty(error, "cause") && error.cause !== undefined) {
    return describe(error.cause, cause)
  }
  if (error instanceof Error && error.message !== "") return error.message
  if (Predicate.isString(error) && error !== "") return error
  return Cause.pretty(cause)
}
