/**
 * Running scenarios: `sdp run` and `sdp gate`.
 *
 * One run over a workspace selects scenarios and their examples, runs the
 * ordinary ones against the graph without results, commits their results,
 * then runs the gates (milestones and `@gate` examples) against a graph that
 * shows the ordinary results and no gate results. The gate of a milestone
 * that is met does not run again, and a workspace that cannot all be read as
 * written, or has a scenario outside a rule or under a question, does not run at all. Works on any
 * `FileSystem`, so executable specs run it in memory.
 *
 * @sdp is ARCH-application
 * @sdp plays PAT-answer
 */
import parseTagExpression from "@cucumber/tag-expressions"
import { posix } from "node:path"
import { DateTime, type Duration, Effect, FileSystem, Path, Result } from "effect"
import { check } from "../check/Check.ts"
import type { Project } from "../graph/Build.ts"
import { type Livable, livable, regressions } from "../graph/Status.ts"
import { lifecycle, unmetBefore } from "../lifecycle/Lifecycle.ts"
import { readTimeout } from "../model/Config.ts"
import { type Diagnostic, problemLine, type RuleId } from "../model/Diagnostic.ts"
import { tally } from "../model/Graph.ts"
import { type Evidence, notPassing, type RunResults, type ScenarioResult, type StepStatus, worstStatus } from "../model/Results.ts"
import { attribute, hasKind, made, metOn } from "../model/Vocabulary.ts"
import type { Pickle, Scenario } from "../parse/Gherkin.ts"
import { withTag } from "../parse/Gherkin.ts"
import type { Spec } from "../parse/Spec.ts"
import { builtinSteps } from "../run/Builtin.ts"
import { digest, fingerprint, isClosed, isGate } from "../run/Evidence.ts"
import { snippetModule } from "../run/Match.ts"
import { runScenarios, summarize } from "../run/Runner.ts"
import type { StepModule } from "../run/Steps.ts"
import { commitResults } from "../run/Store.ts"
import {
  type LoadedSteps,
  loadConfig,
  loadProject,
  loadSteps,
  loadWorkspace,
  readImports,
  SourcesChanged,
  whereLeads,
  type Workspace
} from "../workspace/Workspace.ts"
import { type Answer, unread } from "./Answer.ts"
import { InvalidTags, Refused, UnknownNode, UnknownTargets, UnreadableSpecs } from "./Errors.ts"

export interface Selection {
  /** Spec ids, scenario ids, files or directories; empty selects everything. */
  readonly targets?: ReadonlyArray<string> | undefined
  /** A Cucumber tag expression such as `@checkout and not @slow`, matched against each example's tags. */
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
 * What sdp check rejects in which examples a spec holds to account: a scenario outside a rule, one
 * under a question, and the retired rung, which would make live examples still to come.
 */
const undeclared: ReadonlySet<RuleId> = new Set(["scenario-outside-rule", "question-example", "retired-maturity"])

/**
 * Fails before anything runs when part of the workspace was not read as written, a scenario is
 * outside a rule, an open question has examples, or a spec declares the retired rung: a result of
 * such a workspace would be evidence about what sdp check rejects.
 */
export const ensureReadable = (project: Project): Effect.Effect<void, UnreadableSpecs> => {
  const problems = [
    ...unread(project).filter((diagnostic) => diagnostic.severity === "error"),
    ...check(project).filter((diagnostic) => undeclared.has(diagnostic.rule))
  ]
  return problems.length === 0 ? Effect.void : Effect.fail(new UnreadableSpecs({ problems: problems.map(problemLine) }))
}

/** Whether a target names a spec's file or a directory it is in, however it is written: `./specs/cart.feature`, or `.` for the root. */
const targetsFile = (target: string, spec: Spec) => {
  const file = posix.normalize(target)
  return file === "." || file === "./" || spec.file === file || spec.file.startsWith(file.endsWith("/") ? file : `${file}/`)
}

const targetsScenario = (target: string, scenario: Scenario, spec: Spec) =>
  target === spec.id || target === scenario.id || targetsFile(target, spec)

const unmatched = (project: Project, targets: ReadonlyArray<string>): ReadonlyArray<string> =>
  targets.filter((target) =>
    !project.specs.some((spec) =>
      spec.id === target || targetsFile(target, spec) || spec.scenarios.some((scenario) => targetsScenario(target, scenario, spec))
    )
  )

/**
 * What the graph shows, when a run ends, of a result the run recorded that it shows no more: why it
 * went stale, the status another run recorded since, or neither when its scenario is gone.
 */
export interface Lapse {
  readonly staleBecause?: string
  readonly status?: string
}

export interface WorkspaceRun {
  readonly scenarios: ReadonlyArray<ScenarioResult>
  readonly gates: ReadonlyArray<ScenarioResult>
  /** Everything stored after the run, including results of scenarios that were not selected. */
  readonly results: RunResults
  /** Stored results that no longer count, by what changed since they ran (scenarios the run did not run). */
  readonly stale: Readonly<Record<string, number>>
  /** Results this run recorded that no longer count, by what changed while it ran. */
  readonly wentStale: Readonly<Record<string, number>>
  /** The results this run recorded that the graph shows no more when it ends: they count for nothing. */
  readonly lapsed: ReadonlyMap<string, Lapse>
  /** The scenarios this run ran that are examples of work still to come: whatever they did fails no run. */
  readonly toCome: ReadonlySet<string>
  /** The live examples this run ran that did not pass, by the results it recorded, a gate's rows that are no gate included: they fail the run. */
  readonly regressions: ReadonlyArray<string>
  /** Work still to come whose every example passes, some of them in this run: it can be made live. */
  readonly livable: ReadonlyArray<Livable>
  /** What sdp could not read of the graphs the run's scenarios ran against or it ended on: it could change what they found. */
  readonly unread: ReadonlyArray<Diagnostic>
}

/**
 * One `sdp run`: ordinary scenarios first, their results committed, then the gates against a graph
 * that shows them. A process imports step modules once, so a run whose step files or their imports
 * changed after that, or that finds a step file it did not load, fails before it records a batch:
 * its results would be about code that did not run.
 */
export const runWorkspace = Effect.fn("runWorkspace")(function*(root: string, options: {
  readonly modules: ReadonlyArray<StepModule<any>>
  /**
   * The step modules as this process loaded them (`loadSteps`): the workspace files they imported
   * are part of what the results are evidence about, and are asked for again after each batch, for
   * files a handler imported while it ran.
   */
  readonly loaded?: Pick<LoadedSteps, "imports" | "changed" | "added"> | undefined
  readonly selection?: Selection | undefined
  /** How long a step may take; the workspace's `timeout` when not given. */
  readonly timeout?: Duration.Input | undefined
  /** Scenarios run at once; `@serial` scenarios always run alone. */
  readonly concurrency?: number | undefined
  /** Called with each result as it is known, and whether the scenario is an example of work still to come. */
  readonly onScenario?: ((result: ScenarioResult, toCome: boolean) => Effect.Effect<void>) | undefined
}) {
  const selected = yield* selects(options.selection ?? {})
  const imports = options.loaded?.imports ?? (() => [])
  const asLoaded = Effect.fnUntraced(function*(workspace: Workspace, sources: Workspace["sources"] = workspace.sources) {
    const { files, links } = options.loaded?.changed(sources) ?? { files: [], links: [] }
    const added = options.loaded?.added(workspace.project.steps.files) ?? []
    if (files.length === 0 && links.length === 0 && added.length === 0) return
    // Where each link leads now, to say so.
    const now = yield* whereLeads(root, links)
    return yield* new SourcesChanged({ files, links: links.map((file) => ({ file, now: now.get(file) })), added })
  })

  // Ordinary scenarios see no results at all, so none of them can depend on another's outcome.
  const before = yield* loadWorkspace(root, { results: "none", imports: imports() })
  yield* ensureReadable(before.project)
  yield* asLoaded(before)
  const unknown = unmatched(before.project, options.selection?.targets ?? [])
  if (unknown.length > 0) return yield* new UnknownTargets({ targets: unknown })
  const { config } = before.project
  // Whether an example is a gate is decided by its own tags and spec, and it runs as one only if it
  // is: an outline that is partly gates runs its other selected rows with the ordinary scenarios.
  const select = (gates: boolean) => (scenario: Scenario, spec: Spec) => {
    const chosen = isClosed(spec, config.vocabulary) ? undefined : selected(scenario, spec)
    if (chosen === undefined || chosen.length === 0) {
      return chosen && isGate(scenario, spec, config.vocabulary, chosen) === gates ? chosen : undefined
    }
    const rows = chosen.filter((pickle) => isGate(scenario, spec, config.vocabulary, [pickle]) === gates)
    return rows.length > 0 ? rows : undefined
  }
  // Their results are one result, recorded and reported with the gates.
  const partlyGates = new Set(before.project.specs.flatMap((spec) =>
    spec.scenarios.flatMap((scenario) => select(false)(scenario, spec) && select(true)(scenario, spec) ? [scenario.id] : [])
  ))
  const scenarios = new Map(before.project.specs.flatMap((spec) => spec.scenarios.map((scenario) => [scenario.id, { spec, scenario }] as const)))
  const gone = Object.values(before.stored?.scenarios ?? {}).filter((result) => !scenarios.has(result.id))
  const toCome = (graph: Project["graph"], id: string) => graph.node(id)?.attrs.toCome === true
  const { onScenario } = options
  /**
   * Commits one batch as evidence about the sources it ran against: those read before it started
   * and every file a handler imported while it ran — all of them still as this process loaded them.
   */
  const commit = Effect.fnUntraced(function*(
    batch: ReadonlyArray<ScenarioResult>,
    ranAgainst: Workspace,
    complete: (result: ScenarioResult) => ScenarioResult = (result) => result
  ) {
    const known = new Set(ranAgainst.sources.map((file) => file.path))
    const late = yield* readImports(root, imports().filter((file) => !known.has(file)))
    const files = [...ranAgainst.sources, ...late]
    // A batch with no result records nothing that could rest on what this process did not load.
    if (batch.length > 0) yield* asLoaded(ranAgainst, files)
    const sources = late.length === 0 ? ranAgainst.now.sources : fingerprint(files)
    const executed = batch.map((result) => complete({ ...result, evidence: { ...result.evidence, sources } }))
    return { sources, executed, results: yield* commitResults(root, config, { executed, gone, imports: imports() }) }
  })
  const run = (workspace: Workspace, gates: boolean, complete: (result: ScenarioResult) => ScenarioResult | undefined) =>
    runScenarios({
      project: workspace.project,
      modules: options.modules,
      against: workspace.now,
      select: select(gates),
      gates,
      timeout: options.timeout ?? config.timeout,
      concurrency: options.concurrency,
      onScenario: onScenario && ((result) => {
        const whole = complete(result)
        return whole ? onScenario(whole, toCome(workspace.project.graph, whole.id)) : Effect.void
      })
    })

  const ranFirst = yield* run(before, false, (result) => partlyGates.has(result.id) ? undefined : result)
  const ordinary = yield* commit(ranFirst.filter((result) => !partlyGates.has(result.id)), before)
  const rows = new Map(
    ranFirst.filter((result) => partlyGates.has(result.id)).map((result) =>
      [result.id, { ...result, evidence: { ...result.evidence, sources: ordinary.sources } }]
    )
  )
  // The gate rows of an outline that is partly gates, with the rows that ran as ordinary examples.
  const whole = (result: ScenarioResult): ScenarioResult => {
    const ordinaryRows = rows.get(result.id)
    const written = scenarios.get(result.id)
    if (ordinaryRows === undefined || written === undefined) return result
    const { scenario, spec } = written
    const examples = result.examples.map((example, index) => {
      const pickle = scenario.pickles[index]
      return pickle === undefined || isGate(scenario, spec, config.vocabulary, [pickle]) ? example : ordinaryRows.examples[index] ?? example
    })
    return {
      ...result,
      status: worstStatus(examples.map((example) => example.status)),
      evidence: joined(result.evidence, ordinaryRows.evidence),
      durationMs: result.durationMs + ordinaryRows.durationMs,
      examples
    }
  }
  // Gates see what the ordinary results say, the fresh ones included, and never the results of gates.
  const after = yield* loadWorkspace(root, { results: "ordinary", imports: imports() })
  const gates = yield* commit(yield* run(after, true, whole), after, whole)
  const { project } = yield* loadWorkspace(root)
  const { graph } = project
  const executed = [...ordinary.executed, ...gates.executed]
  const recorded = new Set(executed.map((result) => result.id))
  const lapsed = new Map(executed.flatMap((result): ReadonlyArray<readonly [string, Lapse]> => {
    const node = graph.node(result.id)
    if (node === undefined) return [[result.id, {}]]
    const staleBecause = attribute(node, "staleBecause")
    const status = String(attribute(node, "status"))
    return typeof staleBecause === "string" ? [[result.id, { staleBecause }]] : status === result.status ? [] : [[result.id, { status }]]
  }))
  const staleBecause = (own: boolean) =>
    tally(graph.ofKind([made.kinds.scenario]).flatMap((node) => {
      const reason = attribute(node, "staleBecause")
      return typeof reason === "string" && recorded.has(node.id) === own ? [reason] : []
    }))
  const ran = new Set(ordinary.executed.map((result) => result.id))
  // Which examples are live is read from the graph the run ran against; whether one
  // fails the run, from the result this run recorded for it.
  const ranAgainst = before.project.graph
  // An outline that is partly gates is recorded with the gates, and each of its rows that is no
  // gate is judged as an ordinary example all the same.
  const ordinaryRows = gates.executed.filter((result) => {
    const written = scenarios.get(result.id)
    if (written === undefined || toCome(ranAgainst, result.id)) return false
    const { scenario, spec } = written
    return result.examples.some((example, index) => {
      const pickle = scenario.pickles[index]
      return pickle !== undefined && !isGate(scenario, spec, config.vocabulary, [pickle]) && notPassing.has(example.status)
    })
  })
  return {
    scenarios: ordinary.executed,
    gates: gates.executed,
    results: gates.results,
    stale: staleBecause(false),
    wentStale: staleBecause(true),
    lapsed,
    toCome: new Set([...ran].filter((id) => toCome(ranAgainst, id))),
    regressions: [...regressions(ranAgainst, ordinary.executed), ...ordinaryRows.map((result) => result.id)],
    livable: livable(project, ran),
    unread: [...new Map([before.project, after.project, project].flatMap(unread).map((diagnostic) => [problemLine(diagnostic), diagnostic])).values()]
  } satisfies WorkspaceRun
})

/**
 * The evidence of an outline whose ordinary rows ran before its gate rows: what both ran against.
 * Where the two differ — a row changed a file, say — the result ran against no one workspace, and
 * records a fingerprint of both, which matches none: it never counts.
 */
const joined = (gates: Evidence, ordinary: Evidence): Evidence => {
  const both = (a: string, b: string) => a === b ? a : digest([a, b])
  const specs = gates.specs === undefined || ordinary.specs === undefined
    ? gates.specs ?? ordinary.specs
    : both(gates.specs, ordinary.specs)
  return {
    ...gates,
    sources: both(gates.sources, ordinary.sources),
    toolchain: both(gates.toolchain, ordinary.toolchain),
    inputs: both(gates.inputs, ordinary.inputs),
    ...(specs === undefined ? {} : { specs })
  }
}

export interface RunInput {
  /** Spec ids, scenario ids, files or directories, relative to the workspace root; none runs everything. */
  readonly targets?: ReadonlyArray<string> | undefined
  readonly tags?: string | undefined
  /** Also suggest one step definition module for the undefined steps. */
  readonly snippets?: boolean | undefined
  readonly concurrency?: number | undefined
  /** How long a step may take, e.g. `"90 seconds"` or `Duration.minutes(2)`; the workspace's `timeout` when not given. */
  readonly timeout?: Duration.Input | undefined
  /** Called with each scenario's result as it is known, in order, and whether it is an example of work still to come. */
  readonly onScenario?: ((result: ScenarioResult, toCome: boolean) => Effect.Effect<void>) | undefined
}

export interface RunReport {
  /**
   * What the command exits by. `sdp run`: no ordinary live example that it ran fails,
   * is ambiguous, is pending or has a step without a definition — work still to come fails no run,
   * and an unmet gate is information. `sdp gate`: there are gate scenarios and every one of them passed.
   */
  readonly passed: boolean
  /** The ordinary live scenarios by status. */
  readonly summary: Readonly<Record<StepStatus, number>>
  /** The ordinary scenarios of work still to come by status: none of them fails the run. */
  readonly toCome: Readonly<Record<StepStatus, number>>
  /** The gate scenarios by status. */
  readonly gates: Readonly<Record<StepStatus, number>>
  /** Stored results of scenarios this run did not run that no longer count, by what changed. */
  readonly stale: Readonly<Record<string, number>>
  /** Results this run recorded that no longer count, by what changed while it ran. */
  readonly wentStale: Readonly<Record<string, number>>
  /** Every result of this run: the ordinary scenarios, then the gates. */
  readonly scenarios: ReadonlyArray<ScenarioResult>
  /** A step definition module for the undefined steps, when asked for and there are any. */
  readonly snippets?: string | undefined
}

/** Imports the step modules and runs the selection, with its answer; `enforce` says which scenarios decide `passed`. */
const execute = Effect.fnUntraced(function*(root: string, input: RunInput, enforce: "scenarios" | "gates") {
  const { concurrency = 1 } = input
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    return yield* new Refused({ reason: `--concurrency ${concurrency}: the number of scenarios to run at once is 1 or more` })
  }
  const timeout = input.timeout === undefined ? undefined : readTimeout(input.timeout)
  if (timeout !== undefined && Result.isFailure(timeout)) return yield* new Refused({ reason: `the timeout ${timeout.failure}` })
  const config = yield* loadConfig(root)
  const steps = yield* loadSteps(root, config)
  const run = yield* runWorkspace(root, {
    modules: [builtinSteps, ...steps.modules],
    loaded: steps,
    selection: { targets: input.targets, tags: input.tags },
    concurrency: input.concurrency,
    timeout: timeout?.success,
    onScenario: input.onScenario
  })
  const summary = summarize(run.scenarios.filter((result) => !run.toCome.has(result.id)))
  const gates = summarize(run.gates)
  const scenarios = [...run.scenarios, ...run.gates]
  const suggested = scenarios.flatMap((result) => result.examples.flatMap((example) => example.steps.flatMap((step) => step.snippet ? [step.snippet] : [])))
  // A gate passes only on results that still count when it ends.
  const holds = (result: ScenarioResult) => result.status === "passed" && !run.lapsed.has(result.id)
  const report: RunReport = {
    passed: enforce === "gates" ? run.gates.length > 0 && run.gates.every(holds) : run.regressions.length === 0,
    summary,
    toCome: summarize(run.scenarios.filter((result) => run.toCome.has(result.id))),
    gates,
    stale: run.stale,
    wentStale: run.wentStale,
    scenarios,
    snippets: input.snippets && suggested.length > 0 ? snippetModule(suggested, steps.files) : undefined
  }
  const gated = new Set(run.gates.map((result) => result.id))
  const lapsedWhy = ({ staleBecause, status }: Lapse) =>
    staleBecause !== undefined
      ? `went stale while the gate ran (${staleBecause})`
      : status !== undefined
      ? `another run has since recorded it as ${status}`
      : "is no longer in the workspace"
  const notes = [
    ...steps.empty.map((file) => `${file} defines no steps: export the module, e.g. \`export default defineSteps(…)\``),
    ...(enforce === "gates" ? run.gates : []).flatMap((result) => {
      const shown = result.status === "passed" ? run.lapsed.get(result.id) : undefined
      return shown === undefined ? [] : [`${result.id} passed, and ${lapsedWhy(shown)}: a gate passes only on results that still count`]
    }),
    ...(enforce === "gates" ? [] : run.regressions.filter((id) => gated.has(id))).map((id) =>
      `${id} is recorded with the gates, and an example of it that is no gate did not pass: it fails the run`
    ),
    ...run.livable.map(({ delete: written, file, id, keep }) =>
      `${id} is still to come, and every example of it passes: make it live, delete ${
        written.map(({ line, maturity }) => `${maturity} at ${file}:${line}`).join(" and ")
      }${keep.length > 0 ? `, and write it above the rules still to come at ${file}:${keep.join(", ")}` : ""}`
    )
  ]
  // Nothing runs on a workspace sdp check rejects; what else sdp did not read leaves the answer incomplete.
  const missing = run.unread.map((diagnostic) => `not read: ${problemLine(diagnostic)}`)
  return { run, answer: { complete: missing.length === 0, notes: [...missing, ...notes], data: report } satisfies Answer<RunReport> }
})

/** `sdp run`: executes the selected scenarios and records their results. An unmet gate does not fail it. */
export const run = Effect.fn("run")(function*(root: string, input: RunInput = {}) {
  return (yield* execute(root, input, "scenarios")).answer
})

export interface GateInput {
  /** The milestone whose gate to evaluate — or any spec with scenarios tagged `@gate`. */
  readonly milestone: string
  /** When the gate passes, write `@met=<today>` on the milestone's tag line. */
  readonly record?: boolean | undefined
  readonly timeout?: RunInput["timeout"]
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
 * Writes `@met=<today>` on a milestone whose gate scenarios all passed, as the workspace is now: none
 * of their results may have lapsed by the end of the run, and read again, whole, the milestone must
 * still be recordable, its gate must be the scenarios that ran, none of them edited, and every one
 * of them must still pass, or an edit made while the gate ran would be closed without having run.
 */
const recordMet = Effect.fnUntraced(function*(root: string, milestone: string, ran: Pick<WorkspaceRun, "gates" | "lapsed">) {
  const project = yield* loadProject(root)
  const missing = unread(project)
  if (missing.length > 0) {
    return yield* new Refused({
      reason: `${milestone} is not recorded as met: sdp could not read the whole graph as it is now (${missing.map(problemLine).join("; ")})`
    })
  }
  const spec = project.specById.get(milestone)
  if (!spec) return yield* new Refused({ reason: `${milestone} is not recorded as met: it is no longer in the workspace` })
  const reason = unrecordable(project, spec)
  if (reason !== undefined) return yield* new Refused({ reason })
  const { vocabulary } = project.config
  const gate = spec.scenarios.filter((scenario) => isGate(scenario, spec, vocabulary))
  const hashes = new Map(ran.gates.map((result) => [result.id, result.hash]))
  const same = gate.length === hashes.size && gate.every((scenario) => hashes.get(scenario.id) === scenario.hash) &&
    !ran.gates.some((result) => ran.lapsed.has(result.id))
  const unmet = gate.flatMap((scenario) => {
    const status = project.graph.node(scenario.id)?.attrs.status
    return status !== "passed" ? [`${scenario.id} (${String(status)})`] : []
  })
  const fs = yield* FileSystem.FileSystem
  const file = (yield* Path.Path).join(root, spec.file)
  const content = yield* fs.readFileString(file)
  if (!same || unmet.length > 0 || content !== spec.body) {
    return yield* new Refused({
      reason: `${milestone} is not recorded as met: its gate changed while it ran${
        gate.length === 0 ? ", and has no scenario now" : unmet.length > 0 ? `, and ${unmet.join(", ")} does not pass as it is now` : ""
      }; run sdp gate ${milestone} --record again`
    })
  }
  const met = DateTime.formatIsoDate(yield* DateTime.now)
  const recorded = withTag(content, `@${vocabulary.attributes.met}=${met}`)
  if (recorded === undefined) return yield* new Refused({ reason: `${spec.file} has no tag line to record ${milestone} on` })
  yield* fs.writeFileString(file, recorded)
  return met
})

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
  // Closed first: the closing commit may move its last gate scenario to the spec that owns the rule.
  if (spec && isClosed(spec, vocabulary)) {
    const nothing = { passed: true, summary: summarize([]), toCome: summarize([]), gates: summarize([]), stale: {}, wentStale: {}, scenarios: [] }
    const report: GateReport = { ...nothing, milestone, met: metOn(vocabulary, spec) }
    return { complete: true, notes: [], data: report } satisfies Answer<GateReport>
  }
  if (!spec?.scenarios.some((scenario) => isGate(scenario, spec, vocabulary))) {
    return yield* new Refused({
      reason: `${milestone} has no gate scenarios: gates are the scenarios of milestones and scenarios tagged @gate`
    })
  }
  const reason = input.record ? unrecordable(project, spec) : undefined
  if (reason !== undefined) return yield* new Refused({ reason })
  const { answer: ran, run } = yield* execute(root, { targets: [milestone], timeout: input.timeout, onScenario: input.onScenario }, "gates")
  // What sdp did not read could change whether the gate holds. One whose scenarios all passed and
  // does not pass changed while it ran, and recording it says how it is now.
  const passing = run.gates.length > 0 && run.gates.every((result) => result.status === "passed")
  const met = input.record && passing && ran.complete ? yield* recordMet(root, milestone, run) : undefined
  const report: GateReport = { ...ran.data, milestone, met }
  const unrecorded = !input.record || met !== undefined
    ? []
    : [`${milestone} is not recorded as met: ${
      ran.data.passed ? "sdp could not read the whole graph, and what it did not read could change whether its gate holds" : "its gate does not pass"
    }`]
  return { ...ran, notes: [...ran.notes, ...unrecorded], data: report } satisfies Answer<GateReport>
})
