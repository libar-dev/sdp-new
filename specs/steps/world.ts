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
  /** What the last step that produced something left to assert on: read it with `output`, `stdout` and `exitCode`. */
  outcome: Outcome | undefined
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
  outcome: undefined,
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

/** What a step produced; for a command, how it ended and whether the scenario has looked at that yet. */
interface Outcome {
  /** Everything it printed: for a command, stdout and then stderr. */
  readonly text: string
  /** What a command hands to the next one in a pipe; anything else hands on its text. */
  readonly stdout: string
  readonly command?: { readonly line: string; readonly code: number } | undefined
  /** Whether the scenario stated the exit code, and whether it asserted anything at all. */
  stated: boolean
  asserted: boolean
}

/**
 * Records what a step produced. A command's outcome must not go unseen: the next step that
 * produces something fails if nothing was asserted about it, and `output` fails until an exit
 * code other than 0 is stated.
 */
export const produce = (world: World, text: string, command?: { readonly line: string; readonly code: number; readonly stdout: string }) => {
  const previous = world.outcome
  if (previous?.command && !previous.asserted) {
    throw new Error(`nothing was asserted about \`${previous.command.line}\`, which exited with ${previous.command.code}: follow it with its exit code or its output`)
  }
  world.outcome = { text, stdout: command?.stdout ?? text, command, stated: false, asserted: false }
}

const outcome = (world: World): Outcome => {
  assert.ok(world.outcome, "nothing has produced output yet")
  return world.outcome
}

const seen = (world: World): Outcome => {
  const last = outcome(world)
  if (last.command && last.command.code !== 0 && !last.stated) {
    throw new Error(`\`${last.command.line}\` exited with ${last.command.code}; state that first: Then the exit code is ${last.command.code}\n${last.text}`)
  }
  last.asserted = true
  return last
}

/** The text to assert on. After a command that failed, its exit code is stated first. */
export const output = (world: World): string => seen(world).text

export const stdout = (world: World): string => seen(world).stdout

/** The exit code of the last command, which the scenario now states. */
export const exitCode = (world: World): number => {
  const last = outcome(world)
  assert.ok(last.command, "the last step ran no command")
  last.stated = true
  last.asserted = true
  return last.command.code
}

/** A command run for what it leaves behind is asserted on by looking at that. */
export const settled = (world: World): void => {
  if (world.outcome) seen(world)
}

/** "A, B, C" → sorted ids; "nothing" → []. */
export const ids = (list: string) => list.split(",").map((s) => s.trim()).filter((s) => s && s !== "nothing").sort()

export const node = (project: Project, id: string): GraphNode => {
  const found = project.graph.node(id)
  assert.ok(found, `no node ${id}; nodes are: ${project.graph.nodes().map((n) => n.id).join(", ")}`)
  return found
}
