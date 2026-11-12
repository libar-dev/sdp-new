/**
 * The world shared by every step module of sdp's own specifications. All
 * `*.steps.ts` files here pass `newWorld` to `defineSteps`, so they share one
 * world per scenario: a file written by one module's step is visible to the
 * next module's step.
 *
 * Most scenarios build a small workspace in `files` and run the real pipeline
 * (FileSystem → parse → graph → check/query/run) against it in memory.
 */
import { Effect } from "effect"
import { strict as assert } from "node:assert"
import type { Project } from "../../src/graph/Build.ts"
import type { QueryResult } from "../../src/graph/Query.ts"
import type { LifecycleReport } from "../../src/lifecycle/Lifecycle.ts"
import type { Diagnostic } from "../../src/model/Diagnostic.ts"
import type { Graph, GraphNode } from "../../src/model/Graph.ts"
import type { RunResults } from "../../src/model/Results.ts"
import { loadMemoryProject } from "../../src/workspace/MemoryFileSystem.ts"

export interface World {
  /** In-memory workspace: relative path → content. */
  files: Map<string, string>
  /** The project built from `files`; reset whenever files change. */
  project: Project | undefined
  result: QueryResult | undefined
  queryError: string | undefined
  diagnostics: ReadonlyArray<Diagnostic> | undefined
  definitions: Array<{ expression: string; behaviour: string }>
  run: RunResults | undefined
  /** Text produced by the last step that renders something (context, export, MCP, CLI). */
  output: string
  /** Exit code of the last CLI invocation, when a step runs one. */
  exitCode: number | undefined
  /** A real directory on disk, for steps that run the CLI as a process. */
  directory: string | undefined
  lifecycle: LifecycleReport | undefined
  graph: Graph | undefined
  durationMs: number
  /** Anything else a step module needs to carry between its own steps. */
  scratch: Record<string, unknown>
}

export const newWorld = (): World => ({
  files: new Map(),
  project: undefined,
  result: undefined,
  queryError: undefined,
  diagnostics: undefined,
  definitions: [],
  run: undefined,
  output: "",
  exitCode: undefined,
  directory: undefined,
  lifecycle: undefined,
  graph: undefined,
  durationMs: 0,
  scratch: {}
})

/** The project for the current files, built once and cached until files change. */
export const load = (world: World) =>
  Effect.gen(function*() {
    if (!world.project) world.project = yield* loadMemoryProject(world.files)
    return world.project
  })

export const reload = (world: World) => {
  world.project = undefined
  world.diagnostics = undefined
  return load(world)
}

export const setFile = (world: World, path: string, content: string) => {
  world.files.set(path, content)
  world.project = undefined
}

/** "A, B, C" → sorted ids; "nothing" → []. */
export const ids = (list: string) => list.split(",").map((s) => s.trim()).filter((s) => s && s !== "nothing").sort()

export const node = (project: Project, id: string): GraphNode => {
  const found = project.graph.node(id)
  assert.ok(found, `no node ${id}; nodes are: ${[...project.graph.nodes.keys()].join(", ")}`)
  return found
}
