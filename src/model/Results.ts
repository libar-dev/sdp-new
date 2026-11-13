/**
 * What `sdp run` records: the result of each scenario and the evidence it rests
 * on, as stored in the results file, and how scenario statuses roll up into a
 * spec's verification. Plain data: the runner writes it, the graph builder
 * reads it.
 *
 * @sdp is ARCH-graph
 */
import { Schema } from "effect"

export const StepStatus = Schema.Literals(["passed", "failed", "pending", "undefined", "ambiguous", "skipped"])
export type StepStatus = typeof StepStatus.Type

export const StepResult = Schema.Struct({
  keyword: Schema.String,
  text: Schema.String,
  line: Schema.Number,
  status: StepStatus,
  durationMs: Schema.Number,
  error: Schema.optional(Schema.String),
  /** `file:line` of the matching step definition. */
  definition: Schema.optional(Schema.String),
  /** Suggested step definition for undefined steps. */
  snippet: Schema.optional(Schema.String)
})
export type StepResult = typeof StepResult.Type

/** One example of a scenario; an example the run did not select is `skipped`, with no steps. */
export const ExampleResult = Schema.Struct({
  name: Schema.String,
  status: StepStatus,
  exampleLine: Schema.optional(Schema.Number),
  steps: Schema.Array(StepResult)
})
export type ExampleResult = typeof ExampleResult.Type

/**
 * Fingerprints of what a scenario ran against. A result is evidence only while
 * each fingerprint it recorded still matches the workspace: `verified` promises
 * that every scenario passed against exactly these inputs, nothing wider.
 */
export const Evidence = Schema.Struct({
  /**
   * The configuration file, the code, the step definitions, every workspace file they imported up
   * to the end of the run and the package.json files Node loaded those by: `RunResults.imports`
   * names those files under this fingerprint.
   */
  sources: Schema.String,
  /** The sdp version, the Node major version and the lockfile. */
  toolchain: Schema.String,
  /** The declared inputs: the files of `evidence.inputs` and the variables of `evidence.env`. */
  inputs: Schema.String,
  /**
   * The spec and feature files, the Markdown where specs live and the files that say what the names
   * code imports mean, recorded when a step read the graph (`project`).
   */
  specs: Schema.optional(Schema.String),
  /** What the graph showed a gate of the ordinary scenarios' results — each one's status, or why it no longer counts — recorded when the gate read the graph. */
  results: Schema.optional(Schema.String)
})
export type Evidence = typeof Evidence.Type

export const ScenarioResult = Schema.Struct({
  id: Schema.String,
  spec: Schema.String,
  name: Schema.String,
  file: Schema.String,
  line: Schema.Number,
  status: StepStatus,
  hash: Schema.String,
  evidence: Evidence,
  runAt: Schema.String,
  durationMs: Schema.Number,
  /** One per example: a plain scenario has one, an outline one per row of its Examples tables. */
  examples: Schema.Array(ExampleResult)
})
export type ScenarioResult = typeof ScenarioResult.Type

export const RunResults = Schema.Struct({
  version: Schema.Literal(4),
  /**
   * For each `evidence.sources` fingerprint of a stored result: the workspace files the step
   * definitions had imported, besides the step files, when the run that recorded it ended.
   */
  imports: Schema.Record(Schema.String, Schema.Array(Schema.String)),
  scenarios: Schema.Record(Schema.String, ScenarioResult)
})
export type RunResults = typeof RunResults.Type

const rank: Record<StepStatus, number> = { failed: 0, ambiguous: 1, undefined: 2, pending: 3, skipped: 4, passed: 5 }

/** The status that best summarizes a set: any failure wins, then ambiguity, missing automation, pending, ... */
export const worstStatus = (statuses: Iterable<StepStatus>): StepStatus => {
  let worst: StepStatus = "passed"
  let any = false
  for (const status of statuses) {
    any = true
    if (rank[status] < rank[worst]) worst = status
  }
  return any ? worst : "skipped"
}

/**
 * Verification of a spec, derived from its scenarios:
 * `none` (no scenarios) · `unrun` · `undefined` (no automation yet) · `partial` (partially automated) ·
 * `failing` · `passing`.
 */
export type Verification = "none" | "unrun" | "undefined" | "partial" | "failing" | "passing"

export const verificationOf = (statuses: ReadonlyArray<StepStatus | undefined>): Verification => {
  if (statuses.length === 0) return "none"
  if (statuses.some((s) => s === "failed" || s === "ambiguous")) return "failing"
  if (statuses.every((s) => s === "passed")) return "passing"
  if (statuses.every((s) => s === undefined)) return "unrun"
  if (statuses.every((s) => s === undefined || s === "undefined")) return "undefined"
  return "partial"
}

/**
 * What an example did when it does not pass: it failed, is ambiguous, is pending or has a step
 * without a definition. A live example that ends so fails the run that ran it.
 */
export const notPassing: ReadonlySet<StepStatus> = new Set(["failed", "ambiguous", "pending", "undefined"])
