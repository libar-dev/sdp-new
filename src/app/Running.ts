/**
 * Running scenarios: `sdp run` and `sdp gate`.
 *
 * One run over a workspace selects scenarios and their examples, runs the
 * ordinary ones against the graph without results, commits their results,
 * then runs the gates (milestones and `@gate` examples) against a graph that
 * shows the ordinary results and no gate results. Records that no longer
 * apply (superseded, rejected, deprecated) do not run, and a workspace whose
 * scenarios cannot all be read does not run at all. Works on any
 * `FileSystem`, so executable specs run it in memory.
 */
import { annotate } from "sdp/annotations"
import parseTagExpression from "@cucumber/tag-expressions"
import { DateTime, type Duration, Effect } from "effect"
import type { Project } from "../graph/Build.ts"
import { dueMilestones, lifecycle } from "../lifecycle/Lifecycle.ts"
import { problemLine } from "../model/Diagnostic.ts"
import type { RunResults, ScenarioResult, StepStatus } from "../model/Results.ts"
import type { Vocabulary } from "../model/Vocabulary.ts"
import type { Pickle, Scenario } from "../parse/Gherkin.ts"
import type { Spec } from "../parse/Spec.ts"
import { builtinSteps } from "../run/Builtin.ts"
import { fingerprint, isActive, isGate, staleCounts } from "../run/Evidence.ts"
import { snippetModule } from "../run/Match.ts"
import { runScenarios, summarize } from "../run/Runner.ts"
import type { StepModule } from "../run/Steps.ts"
import { commitResults } from "../run/Store.ts"
import { loadConfig, loadProject, loadSteps, loadWorkspace, readFiles, type Workspace } from "../workspace/Workspace.ts"
import { type Answer, unread } from "./Answer.ts"
import { InvalidTags, Refused, UnknownNode, UnknownTargets, UnreadableSpecs } from "./Errors.ts"

annotate(import.meta, { is: "ARCH-reports" })

export interface Selection {
  /** Spec ids, scenario ids, files or directories; empty selects everything. */
  readonly targets?: ReadonlyArray<string> | undefined
  /** A Cucumber tag expression such as `@nfr and not @slow`, matched against each example's tags. */
  readonly tags?: string | undefined
}

/** The examples of a scenario a selection runs, or `undefined` when it selects none of them. */
export const selects = Effect.fnUntraced(function*(selection: Selection) {
  const targets = selection.targets ?? []
  const { tags: filter } = selection
  const tags = filter === undefined ? undefined : yield* Effect.try({
    try: () => parseTagExpression(filter),
    // The parser repeats the expression before saying what is wrong with it.
    catch: (error) => new InvalidTags({ tags: filter, problem: (error instanceof Error ? error.message : String(error)).replace(/^.*because of /, "") })
  })
  return (scenario: Scenario, spec: Spec): ReadonlyArray<Pickle> | undefined => {
    if (targets.length > 0 && !targets.some((target) => targetsScenario(target, scenario, spec))) return undefined
    if (tags === undefined) return scenario.pickles
    const chosen = scenario.pickles.filter((pickle) => tags.evaluate([...pickle.tags]))
    return chosen.length > 0 ? chosen : undefined
  }
})

/** Fails when Gherkin or front matter does not parse, a spec has no id, or an id is declared twice, before anything runs. */
export const ensureReadable = (project: Project): Effect.Effect<void, UnreadableSpecs> => {
  const problems = unread(project).filter((diagnostic) => diagnostic.severity === "error")
  return problems.length === 0 ? Effect.void : Effect.fail(new UnreadableSpecs({ problems: problems.map(problemLine) }))
}

const targetsScenario = (target: string, scenario: Scenario, spec: Spec) =>
  target === spec.id || target === scenario.id || spec.file === target || spec.file.startsWith(target.endsWith("/") ? target : `${target}/`)

const unmatched = (project: Project, targets: ReadonlyArray<string>): ReadonlyArray<string> =>
  targets.filter((target) =>
    !project.specs.some((spec) =>
      spec.id === target || spec.file === target || spec.scenarios.some((scenario) => targetsScenario(target, scenario, spec))
    )
  )

export interface WorkspaceRun {
  readonly scenarios: ReadonlyArray<ScenarioResult>
  readonly gates: ReadonlyArray<ScenarioResult>
  /** Everything stored after the run, including results of scenarios that were not selected. */
  readonly results: RunResults
  /** Stored results that no longer count, by what changed since they ran (scenarios the run did not select). */
  readonly stale: Readonly<Record<string, number>>
}

/** One `sdp run`: ordinary scenarios first, their results committed, then the gates against a graph that shows them. */
export const runWorkspace = Effect.fn("runWorkspace")(function*(root: string, options: {
  readonly modules: ReadonlyArray<StepModule<any>>
  /**
   * Workspace files the step modules have imported so far (`loadSteps`): part of what the results
   * are evidence about. Asked again after each batch, for files a handler imported while it ran.
   */
  readonly imports?: (() => ReadonlyArray<string>) | undefined
  readonly selection?: Selection | undefined
  readonly timeout?: Duration.Input | undefined
  /** Scenarios run at once; `@serial` scenarios always run alone. */
  readonly concurrency?: number | undefined
  readonly onScenario?: ((result: ScenarioResult) => Effect.Effect<void>) | undefined
}) {
  const selected = yield* selects(options.selection ?? {})
  const imports = options.imports ?? (() => [])

  // Ordinary scenarios see no results at all, so none of them can depend on another's outcome.
  const before = yield* loadWorkspace(root, { results: "none", imports: imports() })
  yield* ensureReadable(before.project)
  const unknown = unmatched(before.project, options.selection?.targets ?? [])
  if (unknown.length > 0) return yield* new UnknownTargets({ targets: unknown })
  const { config } = before.project
  // Whether a scenario is a gate is decided by the examples this run selected.
  const select = (gates: boolean, vocabulary: Vocabulary) => (scenario: Scenario, spec: Spec) => {
    const chosen = isActive(spec, vocabulary) ? selected(scenario, spec) : undefined
    return chosen && isGate(scenario, spec, vocabulary, chosen) === gates ? chosen : undefined
  }
  const live = new Set(before.project.specs.flatMap((spec) => spec.scenarios.map((scenario) => scenario.id)))
  /**
   * Commits one batch as evidence about the sources it ran against: those read before it started
   * and every file a handler imported while it ran.
   */
  const commit = Effect.fnUntraced(function*(batch: ReadonlyArray<ScenarioResult>, ranAgainst: Workspace) {
    const known = new Set(ranAgainst.sources.map((file) => file.path))
    const late = yield* readFiles(root, imports().filter((file) => !known.has(file)))
    const sources = late.length === 0 ? ranAgainst.now.sources : fingerprint([...ranAgainst.sources, ...late])
    const executed = batch.map((result) => ({ ...result, evidence: { ...result.evidence, sources } }))
    return { executed, sources, results: yield* commitResults(root, config, { executed, live, imports: imports() }) }
  })
  const run = (workspace: Workspace, gates: boolean) =>
    runScenarios({
      project: workspace.project,
      modules: options.modules,
      against: workspace.now,
      select: select(gates, workspace.project.config.vocabulary),
      gates,
      timeout: options.timeout,
      concurrency: options.concurrency,
      onScenario: options.onScenario
    })

  const ordinary = yield* commit(yield* run(before, false), before)
  // Gates see the ordinary results, the fresh ones included, and never the results of gates.
  const after = yield* loadWorkspace(root, { results: "ordinary", imports: imports() })
  const gates = yield* commit(yield* run(after, true), after)
  return {
    scenarios: ordinary.executed,
    gates: gates.executed,
    results: gates.results,
    stale: staleCounts(after.project.specs, gates.results, { ...after.now, sources: gates.sources }, config.vocabulary)
  } satisfies WorkspaceRun
})

export interface RunInput {
  /** Spec ids, scenario ids, files or directories, relative to the workspace root; none runs everything. */
  readonly targets?: ReadonlyArray<string> | undefined
  readonly tags?: string | undefined
  /** Also suggest one step definition module for the undefined steps. */
  readonly snippets?: boolean | undefined
  readonly concurrency?: number | undefined
  /** Called with each scenario's result as it is known, in order. */
  readonly onScenario?: ((result: ScenarioResult) => Effect.Effect<void>) | undefined
}

export interface RunReport {
  /**
   * What the command exits by. `sdp run`: no ordinary scenario failed or is ambiguous — an unmet
   * gate is information. `sdp gate`: there are gate scenarios and every one of them passed.
   */
  readonly passed: boolean
  /** The ordinary scenarios by status. */
  readonly summary: Readonly<Record<StepStatus, number>>
  /** The gate scenarios by status. */
  readonly gates: Readonly<Record<StepStatus, number>>
  /** Stored results of scenarios this run did not select that no longer count, by what changed. */
  readonly stale: Readonly<Record<string, number>>
  /** Every result of this run: the ordinary scenarios, then the gates. */
  readonly scenarios: ReadonlyArray<ScenarioResult>
  /** A step definition module for the undefined steps, when asked for and there are any. */
  readonly snippets?: string | undefined
}

/** Imports the step modules and runs the selection; `enforce` says which scenarios decide `passed`. */
const execute = Effect.fnUntraced(function*(root: string, input: RunInput, enforce: "scenarios" | "gates") {
  const config = yield* loadConfig(root)
  const steps = yield* loadSteps(root, config)
  const run = yield* runWorkspace(root, {
    modules: [builtinSteps, ...steps.modules],
    imports: steps.imports,
    selection: { targets: input.targets, tags: input.tags },
    concurrency: input.concurrency,
    onScenario: input.onScenario
  })
  const summary = summarize(run.scenarios)
  const gates = summarize(run.gates)
  const scenarios = [...run.scenarios, ...run.gates]
  const suggested = scenarios.flatMap((result) => result.examples.flatMap((example) => example.steps.flatMap((step) => step.snippet ? [step.snippet] : [])))
  const report: RunReport = {
    passed: enforce === "gates" ? run.gates.length > 0 && gates.passed === run.gates.length : summary.failed + summary.ambiguous === 0,
    summary,
    gates,
    stale: run.stale,
    scenarios,
    snippets: input.snippets && suggested.length > 0 ? snippetModule(suggested, steps.files) : undefined
  }
  const notes = steps.empty.map((file) => `${file} defines no steps: export the module, e.g. \`export default defineSteps(…)\``)
  // Nothing runs on a workspace that cannot be fully read, so what ran is the whole answer.
  return { complete: true, notes, data: report } satisfies Answer<RunReport>
})

/** `sdp run`: executes the selected scenarios and records their results. An unmet gate does not fail it. */
export const run = Effect.fn("run")(function*(root: string, input: RunInput = {}) {
  return yield* execute(root, input, "scenarios")
})

export interface GateInput {
  /** The milestone whose gate to evaluate — or any spec with scenarios tagged `@gate`. */
  readonly milestone?: string | undefined
  /** Instead: the milestones of the current phase and of every phase before it, as `sdp lifecycle` dates them. */
  readonly due?: boolean | undefined
  readonly onScenario?: RunInput["onScenario"]
}

export interface GateReport extends RunReport {
  /** The specs whose gates were evaluated. */
  readonly milestones: ReadonlyArray<string>
}

/**
 * `sdp gate`: evaluates gate scenarios against the current graph, and passes only when each
 * milestone asked for has gate scenarios and every one of them passed.
 */
export const gate = Effect.fn("gate")(function*(root: string, input: GateInput) {
  const project = yield* loadProject(root)
  yield* ensureReadable(project)
  const vocabulary = project.config.vocabulary
  const hasGates = (id: string) => {
    const spec = project.specById.get(id)
    return spec !== undefined && spec.scenarios.some((scenario) => isGate(scenario, spec, vocabulary))
  }
  if ((input.due === true) === (input.milestone !== undefined)) {
    return yield* new Refused({ reason: "name one milestone, or pass --due for the milestones of the current and earlier phases" })
  }
  if (input.milestone !== undefined) {
    if (!project.graph.node(input.milestone)) return yield* new UnknownNode({ id: input.milestone })
    if (!hasGates(input.milestone)) {
      return yield* new Refused({
        reason: `${input.milestone} has no gate scenarios: gates are the scenarios of milestones and scenarios tagged @gate`
      })
    }
  }
  const milestones = input.milestone !== undefined
    ? [input.milestone]
    : dueMilestones(lifecycle(project, DateTime.formatIsoDate(yield* DateTime.now))).map((milestone) => milestone.id)
  const gated = milestones.filter(hasGates)
  const notes = milestones.length === 0
    ? ["no milestone is due: no phase with a milestone has begun"]
    : milestones.filter((id) => !hasGates(id)).map((id) => `${id} has no gate scenarios, so it is not met`)
  // No targets would select every scenario, so a run needs at least one milestone with a gate.
  const ran = gated.length === 0
    ? { complete: true, notes: [], data: { passed: true, summary: summarize([]), gates: summarize([]), stale: {}, scenarios: [] } }
    : yield* execute(root, { targets: gated, onScenario: input.onScenario }, "gates")
  const report: GateReport = { ...ran.data, passed: ran.data.passed && gated.length === milestones.length, milestones }
  return { complete: true, notes: [...ran.notes, ...notes], data: report } satisfies Answer<GateReport>
})
