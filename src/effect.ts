/**
 * The programmatic API as Effects, for programs written with Effect: the use
 * cases the command line and the MCP server call, with the shapes they print.
 * Each takes the workspace root and returns an Effect that needs a `FileSystem`
 * and a `Path` — `NodeServices.layer` from `@effect/platform-node` for the files
 * on disk, or a layer of the program's own:
 *
 *   import { query } from "sdp/effect"
 *   const found = yield* query(".", { expression: "feature[maturity<ready]" })
 *
 * Programs that do not use Effect import the same use cases from "sdp", which
 * answer with Promises.
 */
export { annotate } from "./annotations.ts"
export type { Declaration, Id, IdOf, Ids, Links } from "./annotations.ts"
export type { Answer } from "./app/Answer.ts"
export { create, init, types } from "./app/Authoring.ts"
export type { CreateInput } from "./app/Authoring.ts"
export { type AppError, describe, isAppError } from "./app/Errors.ts"
export {
  architecture,
  check,
  context,
  diagram,
  graph,
  lifecycle,
  lifecycleChart,
  query,
  show,
  snippets,
  status,
  steps,
  vocabulary
} from "./app/Reading.ts"
export type { ArchitectureData, DiagnosticRecord, QueryData, ShowData } from "./app/Reading.ts"
export { gate, run } from "./app/Running.ts"
export type { GateInput, GateReport, RunInput, RunReport } from "./app/Running.ts"
export type { EdgeRecord, GraphRecord, NodeRecord } from "./graph/Export.ts"
export type { QueryPath } from "./graph/Query.ts"
export type { ScenarioResult } from "./model/Results.ts"
