/**
 * The programmatic API: load a workspace, build and query its graph, run its
 * scenarios. Step modules import "sdp/steps" and annotated code
 * "sdp/annotations" instead: those load nothing of this.
 */
export { annotate } from "./annotations.ts"
export type { Declaration, Id, IdOf, Ids, Links } from "./annotations.ts"
export { buildProject } from "./graph/Build.ts"
export type { Project, SourceFile } from "./graph/Build.ts"
export { parseQuery, query, runQuery } from "./graph/Query.ts"
export { check } from "./check/Check.ts"
export { architectureSummary, architectureView, rankCandidates } from "./arch/Architecture.ts"
export { lifecycle } from "./lifecycle/Lifecycle.ts"
export { contextBundle } from "./graph/Context.ts"
export { exportGraph } from "./graph/Export.ts"
export { runWorkspace } from "./run/Session.ts"
export { listSteps, makeMatcher, snippetModule, stepDefinitions, unmatchedSteps } from "./run/Match.ts"
export type { Matcher, UnmatchedStep } from "./run/Match.ts"
export { findWorkspaceRoot, loadProject, loadSteps } from "./workspace/Workspace.ts"
export { layerMemory, memoryRoot } from "./workspace/MemoryFileSystem.ts"
export { Graph } from "./model/Graph.ts"
export type { GraphEdge, GraphNode } from "./model/Graph.ts"
