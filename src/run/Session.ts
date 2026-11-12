/**
 * One `sdp run` over a workspace: select scenarios and their examples, run the
 * ordinary ones against the graph without results, commit their results, then
 * run the gates (milestones and `@gate` examples) against a graph that shows
 * the ordinary results and no gate results. Records that no longer apply
 * (superseded, rejected, deprecated) do not run, and a workspace whose
 * scenarios cannot all be read does not run at all. Works on any `FileSystem`,
 * so executable specs run it in memory.
 */
import { annotate } from "sdp/annotations"
import parseTagExpression from "@cucumber/tag-expressions"
import { type Duration, Effect, Schema } from "effect"
import type { Project } from "../graph/Build.ts"
import { formatSource } from "../model/Graph.ts"
import type { RunResults, ScenarioResult } from "../model/Results.ts"
import type { Pickle, Scenario } from "../parse/Gherkin.ts"
import type { Spec } from "../parse/Spec.ts"
import { loadWorkspace, readFiles, type Workspace } from "../workspace/Workspace.ts"
import { fingerprint, isActive, isGate, staleCounts } from "./Evidence.ts"
import { runScenarios } from "./Runner.ts"
import type { StepModule } from "./Steps.ts"
import { commitResults } from "./Store.ts"

export interface Selection {
  /** Spec ids, scenario ids, files or directories; empty selects everything. */
  readonly targets?: ReadonlyArray<string> | undefined
  /** A Cucumber tag expression such as `@nfr and not @slow`, matched against each example's tags. */
  readonly tags?: string | undefined
}

/** A `--tags` filter that is not a Cucumber tag expression. */
export class InvalidTags extends Schema.TaggedError<InvalidTags>()("InvalidTags", {
  tags: Schema.String,
  problem: Schema.String
}) {
  override get message() {
    return `invalid --tags ${JSON.stringify(this.tags)}: ${this.problem}; write a tag expression such as "@nfr and not @slow"`
  }
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

/** Targets that name no spec, scenario, file or directory — usually a typo that would select nothing. */
export class UnknownTargets extends Schema.TaggedError<UnknownTargets>()("UnknownTargets", {
  targets: Schema.Array(Schema.String)
}) {
  override get message() {
    return `nothing matches ${this.targets.join(", ")}: name a spec id, a scenario id, a file or a directory`
  }
}

/** Problems that leave scenarios unread or their ids ambiguous, so no run could be complete or recorded truthfully. */
export class UnreadableSpecs extends Schema.TaggedError<UnreadableSpecs>()("UnreadableSpecs", {
  /** One line each: `file:line [rule] message`. */
  problems: Schema.Array(Schema.String)
}) {
  override get message() {
    return [
      `cannot run: ${this.problems.length} problem(s) leave scenarios unread or their ids ambiguous; fix them first (sdp check)`,
      ...this.problems.map((problem) => `  ${problem}`)
    ].join("\n")
  }
}

const unreadableRules: ReadonlySet<string> = new Set(["gherkin-syntax", "front-matter", "missing-id", "duplicate-id"])

/** Fails when Gherkin or front matter does not parse, a spec has no id, or an id is declared twice, before anything runs. */
export const ensureReadable = (project: Project): Effect.Effect<void, UnreadableSpecs> => {
  const problems = project.diagnostics.filter((d) => d.severity === "error" && unreadableRules.has(d.rule))
  return problems.length === 0 ? Effect.void : Effect.fail(
    new UnreadableSpecs({
      problems: problems.map((d) => `${formatSource(d.source) || "?"} [${d.rule}] ${d.message.replace(/\s*\n\s*/g, " ")}`)
    })
  )
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
  const select = (gates: boolean) => (scenario: Scenario, spec: Spec) => {
    const chosen = isActive(spec) ? selected(scenario, spec) : undefined
    return chosen && isGate(scenario, spec, chosen) === gates ? chosen : undefined
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
      select: select(gates),
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
    stale: staleCounts(after.project.specs, gates.results, { ...after.now, sources: gates.sources })
  } satisfies WorkspaceRun
})
annotate(runWorkspace, { is: "ARCH-runner" })
