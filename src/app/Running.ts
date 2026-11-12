/**
 * Running scenarios: `sdp run` and `sdp gate`.
 *
 * One run over a workspace selects scenarios and their examples, runs the
 * ordinary ones against the graph without results, commits their results,
 * then runs the gates (milestones and `@gate` examples) against a graph that
 * shows the ordinary results and no gate results. The gate of a milestone
 * that is met does not run again, and a workspace that cannot all be read as
 * written, or has a scenario outside a rule, does not run at all. Works on any
 * `FileSystem`, so executable specs run it in memory.
 */
import { annotate } from "sdp/annotations"
import parseTagExpression from "@cucumber/tag-expressions"
import { DateTime, type Duration, Effect, FileSystem, Path } from "effect"
import type { Project } from "../graph/Build.ts"
import { lifecycle, unmetBefore } from "../lifecycle/Lifecycle.ts"
import { problemLine } from "../model/Diagnostic.ts"
import { tally } from "../model/Graph.ts"
import type { RunResults, ScenarioResult, StepStatus } from "../model/Results.ts"
import { attribute, hasKind, made, metOn } from "../model/Vocabulary.ts"
import type { Pickle, Scenario } from "../parse/Gherkin.ts"
import { withTag } from "../parse/Gherkin.ts"
import type { Spec } from "../parse/Spec.ts"
import { builtinSteps } from "../run/Builtin.ts"
import { fingerprint, isClosed, isGate } from "../run/Evidence.ts"
import { snippetModule } from "../run/Match.ts"
import { runScenarios, summarize } from "../run/Runner.ts"
import type { StepModule } from "../run/Steps.ts"
import { commitResults } from "../run/Store.ts"
import { type LoadedSteps, loadConfig, loadProject, loadSteps, loadWorkspace, readFiles, SourcesChanged, type Workspace } from "../workspace/Workspace.ts"
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

/**
 * Fails before anything runs when part of the specs was not read as written, or a scenario is
 * outside a rule: a result of such a workspace would be evidence about specs sdp check rejects.
 */
export const ensureReadable = (project: Project): Effect.Effect<void, UnreadableSpecs> => {
  const problems = [
    ...unread(project).filter((diagnostic) => diagnostic.severity === "error"),
    ...project.diagnostics.filter((diagnostic) => diagnostic.rule === "scenario-outside-rule")
  ]
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

/**
 * One `sdp run`: ordinary scenarios first, their results committed, then the gates against a graph
 * that shows them. A process imports step modules once, so a run whose step files or their imports
 * changed after that fails before it records anything: its results would be about code that did
 * not run.
 */
export const runWorkspace = Effect.fn("runWorkspace")(function*(root: string, options: {
  readonly modules: ReadonlyArray<StepModule<any>>
  /**
   * The step modules as this process loaded them (`loadSteps`): the workspace files they imported
   * are part of what the results are evidence about, and are asked for again after each batch, for
   * files a handler imported while it ran.
   */
  readonly loaded?: Pick<LoadedSteps, "imports" | "changed"> | undefined
  readonly selection?: Selection | undefined
  readonly timeout?: Duration.Input | undefined
  /** Scenarios run at once; `@serial` scenarios always run alone. */
  readonly concurrency?: number | undefined
  readonly onScenario?: ((result: ScenarioResult) => Effect.Effect<void>) | undefined
}) {
  const selected = yield* selects(options.selection ?? {})
  const imports = options.loaded?.imports ?? (() => [])
  const asLoaded = (sources: Workspace["sources"]) => {
    const changed = options.loaded?.changed(sources) ?? []
    return changed.length === 0 ? Effect.void : Effect.fail(new SourcesChanged({ files: changed }))
  }

  // Ordinary scenarios see no results at all, so none of them can depend on another's outcome.
  const before = yield* loadWorkspace(root, { results: "none", imports: imports() })
  yield* ensureReadable(before.project)
  yield* asLoaded(before.sources)
  const unknown = unmatched(before.project, options.selection?.targets ?? [])
  if (unknown.length > 0) return yield* new UnknownTargets({ targets: unknown })
  const { config } = before.project
  // Whether a scenario is a gate is decided by the examples this run selected.
  const select = (gates: boolean) => (scenario: Scenario, spec: Spec) => {
    const chosen = isClosed(spec, config.vocabulary) ? undefined : selected(scenario, spec)
    return chosen && isGate(scenario, spec, config.vocabulary, chosen) === gates ? chosen : undefined
  }
  const live = new Set(before.project.specs.flatMap((spec) => spec.scenarios.map((scenario) => scenario.id)))
  /**
   * Commits one batch as evidence about the sources it ran against: those read before it started
   * and every file a handler imported while it ran — all of them still as this process loaded them.
   */
  const commit = Effect.fnUntraced(function*(batch: ReadonlyArray<ScenarioResult>, ranAgainst: Workspace) {
    const known = new Set(ranAgainst.sources.map((file) => file.path))
    const late = yield* readFiles(root, imports().filter((file) => !known.has(file)))
    const files = [...ranAgainst.sources, ...late]
    yield* asLoaded(files)
    const sources = late.length === 0 ? ranAgainst.now.sources : fingerprint(files)
    const executed = batch.map((result) => ({ ...result, evidence: { ...result.evidence, sources } }))
    return { executed, results: yield* commitResults(root, config, { executed, live, imports: imports() }) }
  })
  const run = (workspace: Workspace, gates: boolean) =>
    runScenarios({
      project: workspace.project,
      modules: options.modules,
      against: workspace.now,
      select: select(gates),
      gates,
      timeout: options.timeout,
      concurrency: options.concurrency,
      onScenario: options.onScenario
    })

  const ordinary = yield* commit(yield* run(before, false), before)
  // Gates see what the ordinary results say, the fresh ones included, and never the results of gates.
  const after = yield* loadWorkspace(root, { results: "ordinary", imports: imports() })
  const gates = yield* commit(yield* run(after, true), after)
  const { graph } = (yield* loadWorkspace(root)).project
  const reasons = graph.ofKind([made.kinds.scenario]).flatMap((node) => {
    const reason = attribute(node, "staleBecause")
    return typeof reason === "string" ? [reason] : []
  })
  return { scenarios: ordinary.executed, gates: gates.executed, results: gates.results, stale: tally(reasons) } satisfies WorkspaceRun
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
  const { concurrency = 1 } = input
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    return yield* new Refused({ reason: `--concurrency ${concurrency}: the number of scenarios to run at once is 1 or more` })
  }
  const config = yield* loadConfig(root)
  const steps = yield* loadSteps(root, config)
  const run = yield* runWorkspace(root, {
    modules: [builtinSteps, ...steps.modules],
    loaded: steps,
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
  readonly milestone: string
  /** When the gate passes, write `@met=<today>` on the milestone's tag line. */
  readonly record?: boolean | undefined
  readonly onScenario?: RunInput["onScenario"]
}

export interface GateReport extends RunReport {
  /** The spec whose gate was evaluated. */
  readonly milestone: string
  /** The day the milestone is recorded as met: by this call, or before it — and then nothing ran. */
  readonly met?: string | undefined
}

/** Why a milestone cannot be recorded as met whatever its gate says, or `undefined` when it can. */
const unrecordable = (project: Project, spec: Spec): string | undefined => {
  const vocabulary = project.config.vocabulary
  const plan = lifecycle(project)
  const milestone = plan.milestones.find((candidate) => candidate.node.id === spec.id)
  const [earlier] = milestone ? unmetBefore(plan, milestone) : []
  return !hasKind(vocabulary, "milestone", spec.kind)
    ? `${spec.id} is a ${spec.kind}: only a ${vocabulary.kinds.milestone.join(" or ")} is recorded as met`
    : earlier
    ? `${spec.id} cannot be met before ${earlier.node.id}, which is dated before it and is not met`
    : undefined
}

/**
 * `sdp gate`: evaluates one spec's gate scenarios against the current graph, and passes only when
 * every one of them passed. With `record`, a milestone whose gate passes is written down as met
 * today; one that is met already is closed, and nothing runs.
 */
export const gate = Effect.fn("gate")(function*(root: string, input: GateInput) {
  const project = yield* loadProject(root)
  yield* ensureReadable(project)
  const { milestone } = input
  const { vocabulary } = project.config
  if (!project.graph.node(milestone)) return yield* new UnknownNode({ id: milestone })
  const spec = project.specById.get(milestone)
  if (!spec?.scenarios.some((scenario) => isGate(scenario, spec, vocabulary))) {
    return yield* new Refused({
      reason: `${milestone} has no gate scenarios: gates are the scenarios of milestones and scenarios tagged @gate`
    })
  }
  if (isClosed(spec, vocabulary)) {
    const nothing = { passed: true, summary: summarize([]), gates: summarize([]), stale: {}, scenarios: [] }
    const report: GateReport = { ...nothing, milestone, met: metOn(vocabulary, spec) }
    return { complete: true, notes: [], data: report } satisfies Answer<GateReport>
  }
  const reason = input.record ? unrecordable(project, spec) : undefined
  if (reason !== undefined) return yield* new Refused({ reason })
  const ran = yield* execute(root, { targets: [milestone], onScenario: input.onScenario }, "gates")
  const met = input.record && ran.data.passed ? DateTime.formatIsoDate(yield* DateTime.now) : undefined
  if (met !== undefined) {
    const fs = yield* FileSystem.FileSystem
    const file = (yield* Path.Path).join(root, spec.file)
    const content = yield* fs.readFileString(file)
    const recorded = withTag(content, `@${vocabulary.attributes.met}=${met}`)
    if (recorded === undefined) return yield* new Refused({ reason: `${spec.file} has no tag line to record ${milestone} on` })
    yield* fs.writeFileString(file, recorded)
  }
  const report: GateReport = { ...ran.data, milestone, met }
  const notes = input.record && !ran.data.passed ? [...ran.notes, `${milestone} is not recorded as met: its gate does not pass`] : ran.notes
  return { ...ran, notes, data: report } satisfies Answer<GateReport>
})
