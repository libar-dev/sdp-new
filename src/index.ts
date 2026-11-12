/**
 * The programmatic API: the use cases the command line and the MCP server
 * call, with the shapes they print. Each takes the workspace root and returns
 * an Effect that needs a `FileSystem` and a `Path` (`NodeServices.layer` from
 * `@effect/platform-node`):
 *
 *   import { query } from "sdp"
 *   const found = await Effect.runPromise(query(".", { expression: "feature[maturity<ready]" }).pipe(Effect.provide(NodeServices.layer)))
 *   found.complete    // false when the answer may miss something; found.notes say why
 *   found.data.nodes  // the records `sdp graph` prints
 *
 * Step modules import "sdp/steps" and annotated code "sdp/annotations"
 * instead: those load nothing of this.
 */
export { annotate } from "./annotations.ts"
export type { Declaration, Id, IdOf, Ids, Links } from "./annotations.ts"
export type { Answer } from "./app/Answer.ts"
export { create, init, types } from "./app/Authoring.ts"
export { type AppError, describe } from "./app/Errors.ts"
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
export type { GateReport, RunReport } from "./app/Running.ts"
export type { EdgeRecord, GraphRecord, NodeRecord } from "./graph/Export.ts"
export type { QueryPath } from "./graph/Query.ts"
