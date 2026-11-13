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
import { type Attrs, formatSource, type GraphNode } from "../../src/model/Graph.ts"
import type { RunResults } from "../../src/model/Results.ts"
import { loadMemoryProject } from "../../src/workspace/MemoryFileSystem.ts"

export interface World {
  /** In-memory workspace: relative path → content. */
  files: Map<string, string>
  /** The project built from `files`; reset whenever files change. */
  project: Project | undefined
  result: QueryResult | undefined
  queryError: string | undefined
  /** What the last parse, load, check or scan reported, as rows for `sdp reports:`. */
  reported: ReadonlyArray<Row> | undefined
  definitions: Array<{ expression: string; behaviour: string }>
  run: RunResults | undefined
  /** What the last step that produced something left to assert on: read it with `output`, `stdout` and `exitCode`. */
  outcome: Outcome | undefined
  /** A real directory on disk, for steps that run the CLI as a process. */
  directory: string | undefined
  lifecycle: LifecycleReport | undefined
  durationMs: number
  /** Anything else a step module needs to carry between its own steps. */
  scratch: Record<string, unknown>
}

export const newWorld = (): World => ({
  files: new Map(),
  project: undefined,
  result: undefined,
  queryError: undefined,
  reported: undefined,
  definitions: [],
  run: undefined,
  outcome: undefined,
  directory: undefined,
  lifecycle: undefined,
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
  world.reported = undefined
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
  readonly command?: { readonly line: string; readonly code: number; readonly state: string } | undefined
  /** Whether the scenario stated the exit code, and whether it asserted anything at all. */
  stated: boolean
  asserted: boolean
}

/**
 * Records what a step produced. A command's outcome must not go unseen: the next step that
 * produces something fails if nothing was asserted about it, and `output` fails until an exit
 * code other than 0 is stated.
 */
export const produce = (world: World, text: string, command?: { readonly line: string; readonly code: number; readonly stdout: string; readonly state?: string }) => {
  const previous = world.outcome
  if (previous?.command && !previous.asserted) {
    throw new Error(`nothing was asserted about \`${previous.command.line}\`, which exited with ${previous.command.code}: follow it with its exit code or its output`)
  }
  world.outcome = {
    text, stdout: command?.stdout ?? text,
    command: command ? { ...command, state: command.state ?? `Then the exit code is ${command.code}` } : undefined,
    stated: false, asserted: false
  }
}

const outcome = (world: World): Outcome => {
  assert.ok(world.outcome, "nothing has produced output yet")
  return world.outcome
}

const seen = (world: World): Outcome => {
  const last = outcome(world)
  if (last.command && last.command.code !== 0 && !last.stated) {
    throw new Error(`\`${last.command.line}\` exited with ${last.command.code}; state that first: ${last.command.state}\n${last.text}`)
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

export type Row = Readonly<Record<string, string>>
export type Table = ReadonlyArray<ReadonlyArray<string>>

/** A diagnostic as a row: its rule, severity and node, where it points (`at`, and the `line` alone), what it says and hints. */
export const reportRow = (d: Diagnostic): Row => ({
  rule: d.rule,
  severity: d.severity,
  node: d.node ?? "",
  at: formatSource(d.source),
  line: String(d.source?.line ?? ""),
  message: d.message,
  hint: d.hint ?? ""
})

/** Cells that hold prose match when the actual text contains them; every other cell must be equal. */
const prose: ReadonlySet<string> = new Set(["message", "hint"])

/**
 * Compares rows with a table whose header names the columns to check, so a scenario states only
 * what it is about. A table of its header alone expects no rows.
 */
export const assertRows = (
  what: string,
  actual: ReadonlyArray<Row>,
  table: Table | undefined,
  mode: "exactly" | "in order" | "including"
) => {
  assert.ok(table && table.length > 0, `expected a table of ${what}`)
  const columns = table[0]!.map((cell) => cell.trim())
  const unknown = actual.length > 0 ? columns.filter((column) => !actual.some((row) => column in row)) : []
  assert.deepEqual(unknown, [], `${what} have no such column; there are: ${Object.keys(actual[0] ?? {}).join(", ")}`)
  const expected = table.slice(1).map((cells): Row => Object.fromEntries(columns.map((column, i) => [column, cells[i] ?? ""])))
  const matches = (row: Row, want: Row) =>
    columns.every((column) => prose.has(column) ? (row[column] ?? "").includes(want[column]!) : (row[column] ?? "") === want[column])
  const render = (rows: ReadonlyArray<Row>) =>
    rows.length === 0 ? "  (none)" : rows.map((row) => `  | ${columns.map((column) => row[column] ?? "").join(" | ")} |`).join("\n")
  const fail = () => assert.fail(`${what} differ\nexpected (${mode}):\n${render(expected)}\nactual:\n${render(actual)}`)
  if (mode === "in order") {
    if (actual.length !== expected.length || !expected.every((want, i) => matches(actual[i]!, want))) fail()
    return
  }
  const remaining = [...actual]
  for (const want of expected) {
    const index = remaining.findIndex((row) => matches(row, want))
    if (index < 0) fail()
    remaining.splice(index, 1)
  }
  if (mode === "exactly" && remaining.length > 0) fail()
}

/** Strings as written, lists comma-separated, anything else as JSON. */
export const show = (value: unknown): string =>
  value === undefined ? "" : typeof value === "string" ? value : Array.isArray(value) ? value.map(show).join(", ") : JSON.stringify(value)

/** `key=value` pairs in the annotation syntax, values as JSON so types stay visible: `via="events" tier=1`. */
export const attrsText = (attrs: Attrs | undefined): string =>
  Object.entries(attrs ?? {}).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join(" ")

