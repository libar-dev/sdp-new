/**
 * The programmatic API: the use cases the command line and the MCP server
 * call, with the shapes they print, run on the files on disk and answered with
 * Promises:
 *
 *   import { query } from "sdp"
 *   const found = await query(".", { expression: "feature[maturity<ready]" })
 *   found.complete    // false when the answer may miss something; found.notes say why
 *   found.data.nodes  // the records `sdp graph` prints
 *
 * A use case that fails rejects with its error, an `AppError` that `describe`
 * words as one line. Programs written with Effect import the same use cases
 * from "sdp/effect" instead, and choose the file system they run on. Step
 * modules import "sdp/steps" and annotated code "sdp/annotations": those load
 * nothing of this.
 */
import * as NodeServices from "@effect/platform-node/NodeServices"
import { Effect, type FileSystem, type Path } from "effect"
import * as Api from "./effect.ts"

export { annotate } from "./annotations.ts"
export type { Declaration, Id, IdOf, Ids, Links } from "./annotations.ts"
export type {
  AppError,
  Answer,
  ArchitectureData,
  CreateInput,
  DiagnosticRecord,
  EdgeRecord,
  GateReport,
  GraphRecord,
  NodeRecord,
  QueryData,
  QueryPath,
  RunReport,
  ScenarioResult,
  ShowData
} from "./effect.ts"
export { describe, isAppError } from "./effect.ts"

/** Runs a use case on the files on disk; aborting `signal` interrupts it, and the promise rejects. */
const runOnDisk = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>, signal?: AbortSignal) =>
  Effect.runPromise(effect.pipe(Effect.provide(NodeServices.layer)), { signal })

/** A use case of "sdp/effect" as a function that runs it on the files on disk. */
const onDisk = <Args extends ReadonlyArray<unknown>, A, E>(
  useCase: (...args: Args) => Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>
) =>
(...args: Args): Promise<A> => runOnDisk(useCase(...args))

export const architecture = onDisk(Api.architecture)
export const check = onDisk(Api.check)
export const context = onDisk(Api.context)
export const create = onDisk(Api.create)
export const diagram = onDisk(Api.diagram)
export const graph = onDisk(Api.graph)
export const init = onDisk(Api.init)
export const lifecycle = onDisk(Api.lifecycle)
export const lifecycleChart = onDisk(Api.lifecycleChart)
export const query = onDisk(Api.query)
export const show = onDisk(Api.show)
export const snippets = onDisk(Api.snippets)
export const status = onDisk(Api.status)
export const steps = onDisk(Api.steps)
export const types = onDisk(Api.types)
export const vocabulary = onDisk(Api.vocabulary)

/**
 * Called with each scenario's result as it is known, in order, and whether the scenario is an
 * example of work still to come; the run waits for what it returns.
 */
export type OnScenario = (result: Api.ScenarioResult, toCome: boolean) => void | PromiseLike<void>

const reporting = (onScenario: OnScenario | undefined) =>
  onScenario && ((result: Api.ScenarioResult, toCome: boolean) => Effect.promise(async () => onScenario(result, toCome)))

export interface RunInput extends Omit<Api.RunInput, "onScenario"> {
  readonly onScenario?: OnScenario | undefined
  /** Aborting it stops the run: the running step's own signal aborts, and the promise rejects. */
  readonly signal?: AbortSignal | undefined
}

export interface GateInput extends Omit<Api.GateInput, "onScenario"> {
  readonly onScenario?: OnScenario | undefined
  /** Aborting it stops the gate: the running step's own signal aborts, and the promise rejects. */
  readonly signal?: AbortSignal | undefined
}

/** `sdp run`: executes the selected scenarios and records their results. */
export const run = (root: string, { onScenario, signal, ...input }: RunInput = {}) =>
  runOnDisk(Api.run(root, { ...input, onScenario: reporting(onScenario) }), signal)

/** `sdp gate`: evaluates one milestone's gate scenarios against the current graph. */
export const gate = (root: string, { onScenario, signal, ...input }: GateInput) =>
  runOnDisk(Api.gate(root, { ...input, onScenario: reporting(onScenario) }), signal)
