/**
 * Evidence: what a stored result ran against, and whether it still counts. A
 * result records fingerprints of its inputs and is shown only while every one
 * of them still matches the workspace; otherwise it is stale, with the reason.
 *
 * Results are layered so that nothing reads its own layer: sources → ordinary
 * scenarios → gates. An ordinary scenario runs against the graph without any
 * results; a gate against the ordinary results and never gate results; every
 * other reader (status, queries, context) sees all results that still count.
 */
import { annotate } from "sdp/annotations"
import { createHash } from "node:crypto"
import type { EvidenceView, Settled, SourceFile } from "../graph/Build.ts"
import type { RunResults, ScenarioResult } from "../model/Results.ts"
import { hasKind, isInactiveStatus, type Vocabulary } from "../model/Vocabulary.ts"
import type { Pickle, Scenario } from "../parse/Gherkin.ts"
import type { Spec } from "../parse/Spec.ts"

annotate(import.meta, { is: "ARCH-runner" })

/** Records that no longer apply keep their text but stop guarding anything. */
export const isActive = (spec: { readonly attrs: Readonly<Record<string, unknown>> }, vocabulary: Vocabulary): boolean =>
  !isInactiveStatus(vocabulary, spec.attrs.status)

/**
 * Gate scenarios run after all others: those of milestones and those tagged `@gate` — in a run that
 * selects some examples, those of the selected examples.
 */
export const isGate = (
  scenario: Scenario,
  spec: Spec,
  vocabulary: Vocabulary,
  pickles: ReadonlyArray<Pickle> = scenario.pickles
): boolean => hasKind(vocabulary, "milestone", spec.kind) || pickles.some((pickle) => pickle.tags.includes("@gate"))

/** The workspace as it is now, to compare with what each stored result recorded. */
export interface Fingerprints {
  /**
   * The `evidence.sources` stored results recorded that still match: the configuration file, the
   * code files, the step definition files and the workspace files their run had imported.
   */
  readonly sources: ReadonlySet<string>
  /** The sdp version, the Node major version and the lockfile. */
  readonly toolchain: string
  /** The files of `evidence.inputs` and the variables of `evidence.env`. */
  readonly inputs: string
  /** The spec and feature files and the id declarations: what a step that reads the graph sees. */
  readonly specs: string
}

/** What a run records with each result: the fingerprints of what it ran against. */
export interface Snapshot extends Omit<Fingerprints, "sources"> {
  /** The sources with the workspace files this run's step definitions imported. */
  readonly sources: string
  /** What the graph shows a gate of the ordinary scenarios' results. */
  readonly results: string
}

export const digest = (parts: ReadonlyArray<string>): string => {
  const hash = createHash("sha1")
  for (const part of parts) hash.update(part).update("\0")
  return hash.digest("hex").slice(0, 12)
}

/** Content fingerprint of a set of files, whatever order they come in; a file listed twice counts once. */
export const fingerprint = (files: ReadonlyArray<SourceFile>): string => {
  const byPath = new Map(files.map((file) => [file.path, file.content]))
  return digest([...byPath.keys()].sort().flatMap((path) => [path, byPath.get(path)!]))
}

/** Why a stored result no longer counts as evidence: what changed since it ran. */
export type Staleness =
  | "scenario-changed"
  | "code-changed"
  | "toolchain-changed"
  | "inputs-changed"
  | "specs-changed"
  | "results-changed"

/**
 * Compares what a result recorded with the workspace now, and with what the ordinary results say
 * now; `undefined` while the result still counts.
 */
export const staleness = (
  result: ScenarioResult,
  scenario: Scenario,
  now: Fingerprints,
  ordinary: string
): Staleness | undefined =>
  result.hash !== scenario.hash
    ? "scenario-changed"
    : !now.sources.has(result.evidence.sources)
    ? "code-changed"
    : result.evidence.toolchain !== now.toolchain
    ? "toolchain-changed"
    : result.evidence.inputs !== now.inputs
    ? "inputs-changed"
    : result.evidence.specs !== undefined && result.evidence.specs !== now.specs
    ? "specs-changed"
    : result.evidence.results !== undefined && result.evidence.results !== ordinary
    ? "results-changed"
    : undefined

/** Which results a view of the graph shows: only those of ordinary scenarios (what a gate sees), or all of them. */
export type Layer = "ordinary" | "all"

export interface LayeredResults extends EvidenceView {
  /** Fingerprint of what the ordinary results say: what a gate that reads the graph records as `evidence.results`. */
  readonly ordinary: string
}

const unrun: Settled = { status: undefined, stale: undefined, lastRun: undefined }

/**
 * The stored results as one view of the graph shows them, settled against the workspace as it is
 * now. The ordinary results are settled first — they depend on no results — and fingerprinted for
 * the gates, which may have read them. A gate reads no more of a result than that fingerprint
 * covers: its status, or why it no longer counts. When and how it ran is for the other readers.
 */
export const evidenceView = (results: RunResults | undefined, now: Fingerprints, layer: Layer, vocabulary: Vocabulary) =>
  (specs: ReadonlyArray<Spec>): LayeredResults => {
    const gates = new Set(
      specs.flatMap((spec) => spec.scenarios.filter((scenario) => isGate(scenario, spec, vocabulary)).map((scenario) => scenario.id))
    )
    const settle = (scenario: Scenario, ordinary: string): Settled => {
      const result = results?.scenarios[scenario.id]
      if (!result) return unrun
      const stale = staleness(result, scenario, now, ordinary)
      return { status: stale ? undefined : result.status, stale, lastRun: layer === "all" ? result.runAt : undefined }
    }
    const ordinaryScenarios = specs.flatMap((spec) => spec.scenarios).filter((scenario) => !gates.has(scenario.id))
    const ordinary = digest(ordinaryScenarios.map((scenario) => {
      const { stale, status } = settle(scenario, "")
      return `${scenario.id}=${status ?? stale ?? "unrun"}`
    }))
    return {
      ordinary,
      results: layer === "all" ? results : undefined,
      settle: (scenario) => layer === "all" || !gates.has(scenario.id) ? settle(scenario, ordinary) : unrun
    }
  }
