/**
 * One `sdp run` over a workspace: select scenarios and their examples, run the
 * ordinary ones, store their results, then run the gates (milestones and
 * `@gate` examples) against a graph rebuilt with those fresh results. Records
 * that no longer apply (superseded, rejected, deprecated) do not run, and a
 * workspace whose scenarios cannot all be read does not run at all. Works on
 * any `FileSystem`, so executable specs run it in memory.
 */
import { annotate } from "../annotations.ts"
import parseTagExpression from "@cucumber/tag-expressions"
import { type Duration, Effect, Schema } from "effect"
import { isActive, isGate, type Project, staleCounts } from "../graph/Build.ts"
import { formatSource } from "../model/Graph.ts"
import type { Pickle, Scenario } from "../parse/Gherkin.ts"
import type { Spec } from "../parse/Spec.ts"
import { loadProject, writeResults } from "../workspace/Workspace.ts"
import type { RunResults, ScenarioResult } from "./Results.ts"
import { mergeResults, runScenarios } from "./Runner.ts"
import type { StepModule } from "./Steps.ts"

export interface Selection {
  /** Spec ids, scenario ids, files or directories; empty selects everything. */
  readonly targets?: ReadonlyArray<string> | undefined
  /** A Cucumber tag expression such as `@nfr and not @slow`, matched against each example's tags. */
  readonly tags?: string | undefined
}

/** The examples of a scenario a selection runs, or `undefined` when it selects none of them. */
export const selects = (selection: Selection) => {
  const targets = selection.targets ?? []
  const tags = selection.tags === undefined ? undefined : parseTagExpression(selection.tags)
  return (scenario: Scenario, spec: Spec): ReadonlyArray<Pickle> | undefined => {
    const targeted = targets.length === 0 ||
      targets.some((t) =>
        t === spec.id || t === scenario.id || spec.file === t || spec.file.startsWith(t.endsWith("/") ? t : `${t}/`)
      )
    if (!targeted) return undefined
    if (tags === undefined) return scenario.pickles
    const chosen = scenario.pickles.filter((pickle) => tags.evaluate([...pickle.tags]))
    return chosen.length > 0 ? chosen : undefined
  }
}

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

const unreadableRules: ReadonlySet<string> = new Set(["gherkin-syntax", "front-matter", "duplicate-id"])

/** Fails when Gherkin or front matter does not parse, or an id is declared twice, before anything runs. */
export const ensureReadable = (project: Project): Effect.Effect<void, UnreadableSpecs> => {
  const problems = project.diagnostics.filter((d) => d.severity === "error" && unreadableRules.has(d.rule))
  return problems.length === 0 ? Effect.void : Effect.fail(
    new UnreadableSpecs({
      problems: problems.map((d) => `${formatSource(d.source) || "?"} [${d.rule}] ${d.message.replace(/\s*\n\s*/g, " ")}`)
    })
  )
}

const unmatched = (project: Project, targets: ReadonlyArray<string>): ReadonlyArray<string> =>
  targets.filter((target) =>
    !project.specs.some((spec) =>
      spec.scenarios.some((scenario) => selects({ targets: [target] })(scenario, spec) !== undefined) || spec.id === target ||
      spec.file === target
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

/** One `sdp run`: ordinary scenarios first, their results stored, then the gates against the rebuilt graph. */
export const runWorkspace = Effect.fn("runWorkspace")(function*(root: string, options: {
  readonly modules: ReadonlyArray<StepModule<any>>
  /** Workspace files the step modules import (`loadSteps`): part of what the results are evidence about. */
  readonly imports?: ReadonlyArray<string> | undefined
  readonly selection?: Selection | undefined
  readonly timeout?: Duration.Input | undefined
  /** Scenarios run at once; `@serial` scenarios always run alone. */
  readonly concurrency?: number | undefined
  readonly onScenario?: ((result: ScenarioResult) => Effect.Effect<void>) | undefined
}) {
  const selected = selects(options.selection ?? {})
  // Whether a scenario is a gate is decided by the examples this run selected.
  const select = (gates: boolean) => (scenario: Scenario, spec: Spec) => {
    const chosen = isActive(spec) ? selected(scenario, spec) : undefined
    return chosen && isGate(scenario, spec, chosen) === gates ? chosen : undefined
  }
  const run = (project: Project, gates: boolean) =>
    runScenarios({
      project,
      modules: options.modules,
      select: select(gates),
      gates,
      timeout: options.timeout,
      concurrency: options.concurrency,
      onScenario: options.onScenario
    })
  const load = () => loadProject(root, { imports: options.imports })

  let project = yield* load()
  yield* ensureReadable(project)
  const unknown = unmatched(project, options.selection?.targets ?? [])
  if (unknown.length > 0) return yield* new UnknownTargets({ targets: unknown })
  const ordinary = yield* run(project, false)
  let results = mergeResults(project.results, ordinary, project)
  yield* writeResults(root, project.config, results)
  project = yield* load()
  const gates = yield* run(project, true)
  results = mergeResults(results, gates, project)
  yield* writeResults(root, project.config, results)
  return {
    scenarios: Object.values(ordinary.scenarios),
    gates: Object.values(gates.scenarios),
    results,
    stale: staleCounts(project, results)
  } satisfies WorkspaceRun
})
annotate(runWorkspace, { is: "ARCH-runner" })
