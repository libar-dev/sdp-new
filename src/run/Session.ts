/**
 * One `sdp run` over a workspace: select scenarios, run the ordinary ones,
 * store their results, then run the gates (milestones and `@gate` scenarios)
 * against a graph rebuilt with those fresh results. Records that no longer
 * apply (superseded, rejected, deprecated) do not run. Works on any
 * `FileSystem`, so executable specs run it in memory.
 */
import parseTagExpression from "@cucumber/tag-expressions"
import { type Duration, Effect, Schema } from "effect"
import { isActive, type Project } from "../graph/Build.ts"
import type { Scenario } from "../parse/Gherkin.ts"
import type { Spec } from "../parse/Spec.ts"
import { loadProject, writeResults } from "../workspace/Workspace.ts"
import type { RunResults, ScenarioResult } from "./Results.ts"
import { mergeResults, runScenarios } from "./Runner.ts"
import type { StepModule } from "./Steps.ts"

// @sdp is ARCH-runner

/** Gate scenarios run after all others: those of milestones and those tagged `@gate`. */
export const isGate = (scenario: Scenario, spec: Spec): boolean =>
  spec.kind === "milestone" || scenario.pickles.some((pickle) => pickle.tags.includes("@gate"))

export interface Selection {
  /** Spec ids, scenario ids, files or directories; empty selects everything. */
  readonly targets?: ReadonlyArray<string> | undefined
  /** A Cucumber tag expression such as `@nfr and not @slow`. */
  readonly tags?: string | undefined
}

export const selects = (selection: Selection) => {
  const targets = selection.targets ?? []
  const tags = selection.tags === undefined ? undefined : parseTagExpression(selection.tags)
  return (scenario: Scenario, spec: Spec): boolean =>
    (targets.length === 0 ||
      targets.some((t) =>
        t === spec.id || t === scenario.id || spec.file === t || spec.file.startsWith(t.endsWith("/") ? t : `${t}/`)
      )) &&
    (tags === undefined || scenario.pickles.some((pickle) => tags.evaluate([...pickle.tags])))
}

/** Targets that name no spec, scenario, file or directory — usually a typo that would select nothing. */
export class UnknownTargets extends Schema.TaggedError<UnknownTargets>()("UnknownTargets", {
  targets: Schema.Array(Schema.String)
}) {
  override get message() {
    return `nothing matches ${this.targets.join(", ")}: name a spec id, a scenario id, a file or a directory`
  }
}

const unmatched = (project: Project, targets: ReadonlyArray<string>): ReadonlyArray<string> =>
  targets.filter((target) =>
    !project.specs.some((spec) => spec.scenarios.some((scenario) => selects({ targets: [target] })(scenario, spec)) || spec.id === target || spec.file === target)
  )

export interface WorkspaceRun {
  readonly scenarios: ReadonlyArray<ScenarioResult>
  readonly gates: ReadonlyArray<ScenarioResult>
  /** Everything stored after the run, including results of scenarios that were not selected. */
  readonly results: RunResults
}

export const runWorkspace = Effect.fn("runWorkspace")(function*(root: string, options: {
  readonly modules: ReadonlyArray<StepModule<any>>
  readonly selection?: Selection | undefined
  readonly timeout?: Duration.Input | undefined
  /** Scenarios run at once; `@serial` scenarios always run alone. */
  readonly concurrency?: number | undefined
  readonly onScenario?: ((result: ScenarioResult) => Effect.Effect<void>) | undefined
}) {
  const selected = selects(options.selection ?? {})
  const filter = (gates: boolean) => (scenario: Scenario, spec: Spec) =>
    isActive(spec) && isGate(scenario, spec) === gates && selected(scenario, spec)
  const run = (project: Project, gates: boolean) =>
    runScenarios({
      project,
      modules: options.modules,
      filter: filter(gates),
      timeout: options.timeout,
      concurrency: options.concurrency,
      onScenario: options.onScenario
    })

  let project = yield* loadProject(root)
  const unknown = unmatched(project, options.selection?.targets ?? [])
  if (unknown.length > 0) return yield* new UnknownTargets({ targets: unknown })
  const ordinary = yield* run(project, false)
  let results = mergeResults(project.results, ordinary, project)
  yield* writeResults(root, project.config, results)
  project = yield* loadProject(root)
  const gates = yield* run(project, true)
  results = mergeResults(results, gates, project)
  yield* writeResults(root, project.config, results)
  return { scenarios: Object.values(ordinary.scenarios), gates: Object.values(gates.scenarios), results } satisfies WorkspaceRun
})
