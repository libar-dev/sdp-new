/**
 * Reading the graph: one use case per question a person or an agent asks.
 * Each reads the workspace as it is now — files, never workspace code — and
 * returns an answer (Answer.ts) made of plain records (`graph/Export.ts`), or
 * fails with a typed error (Errors.ts). The command line and the MCP server
 * call these and nothing else, so they cannot disagree.
 */
import { annotate } from "sdp/annotations"
import { DateTime, Effect, Result } from "effect"
import { architectureView } from "../arch/Architecture.ts"
import { check as checkProject } from "../check/Check.ts"
import type { Project } from "../graph/Build.ts"
import { contextBundle } from "../graph/Context.ts"
import { type EdgeRecord, edgeRecord, type GraphRecord, graphRecords, mermaid, type NodeRecord, nodeRecord } from "../graph/Export.ts"
import { closest, parseQuery, projectQueryOptions, type QueryPath, runQuery, unknownWords } from "../graph/Query.ts"
import { statusSummary } from "../graph/Status.ts"
import { type LifecycleReport, lifecycle as lifecycleReport, renderLifecycle } from "../lifecycle/Lifecycle.ts"
import { atLeast, type Diagnostic, type RuleId, type Severity } from "../model/Diagnostic.ts"
import type { Graph } from "../model/Graph.ts"
import { hasKind, made, vocabularyJson } from "../model/Vocabulary.ts"
import { type ListedStep, listSteps, readSteps, snippetModule, stepProblems, unmatchedSteps } from "../run/Match.ts"
import { loadConfig, loadProject } from "../workspace/Workspace.ts"
import { type Answer, answer } from "./Answer.ts"
import { Refused, UnknownNode } from "./Errors.ts"

annotate(import.meta, { is: "ARCH-reports" })

/** The node with this id; the target of a dangling link is not one. */
const known = (project: Project, id: string) => {
  const declared = project.graph.nodes().filter((node) => node.kind !== made.kinds.missing)
  const node = declared.find((candidate) => candidate.id === id)
  return node ? Effect.succeed(node) : Effect.fail(new UnknownNode({ id, closest: closest(id, declared.map((n) => n.id)) }))
}

/** `sdp status`: counts of everything, on one screen. */
export const status = Effect.fn("status")(function*(root: string) {
  const project = yield* loadProject(root)
  return answer(project, statusSummary(project))
})

export interface QueryData {
  /** The distinct end nodes, in the order they were first reached. */
  readonly nodes: ReadonlyArray<NodeRecord>
  /** With `paths`: the routes that reached them. */
  readonly paths?: ReadonlyArray<QueryPath> | undefined
}

/** The graph a query runs on with its result; `missing` when a limit cut the evaluation short. */
const evaluate = Effect.fnUntraced(function*(project: Project, expression: string) {
  const parsed = parseQuery(expression)
  if (Result.isFailure(parsed)) return yield* parsed.failure
  const result = runQuery(project.graph, parsed.success, projectQueryOptions(project))
  return {
    result,
    about: { missing: result.limits.map((limit) => `cut short: ${limit}`), notes: unknownWords(project, parsed.success) }
  }
})

/** `sdp q`: the nodes a path pattern leads to. Words the workspace does not know are noted, not refused. */
export const query = Effect.fn("query")(function*(root: string, input: { readonly expression: string; readonly paths?: boolean | undefined }) {
  const project = yield* loadProject(root)
  const { about, result } = yield* evaluate(project, input.expression)
  const data: QueryData = { nodes: result.nodes.map(nodeRecord), paths: input.paths ? result.paths : undefined }
  return answer(project, data, about)
})

export interface ShowData {
  readonly node: NodeRecord
  /** Its outgoing and incoming edges. */
  readonly out: ReadonlyArray<EdgeRecord>
  readonly in: ReadonlyArray<EdgeRecord>
  /** The nodes at the other end of those edges. */
  readonly neighbours: ReadonlyArray<NodeRecord>
}

/** `sdp show`: one node with its attributes, its edges and the nodes they lead to. */
export const show = Effect.fn("show")(function*(root: string, input: { readonly id: string }) {
  const project = yield* loadProject(root)
  const node = yield* known(project, input.id)
  const { graph } = project
  const around = graph.subgraph(graph.neighbours(node.id).map(({ other }) => other).filter((other) => other !== node.id))
  const data: ShowData = {
    node: nodeRecord(node),
    out: graph.out(node.id).map(edgeRecord),
    in: graph.in(node.id).map(edgeRecord),
    neighbours: around.nodes().map(nodeRecord)
  }
  return answer(project, data)
})

/** How far a context bundle may reach: beyond a handful of hops it is the whole graph. */
const maxDepth = 6

/** `sdp context`: everything needed to work on one node, as one Markdown document. */
export const context = Effect.fn("context")(function*(root: string, input: { readonly id: string; readonly depth?: number | undefined }) {
  const depth = input.depth ?? 2
  if (!Number.isInteger(depth) || depth < 1 || depth > maxDepth) {
    return yield* new Refused({ reason: `depth must be a whole number from 1 to ${maxDepth}, not ${depth}` })
  }
  const project = yield* loadProject(root)
  const node = yield* known(project, input.id)
  // The bundle matches the steps of the node's scenarios: a registration that was not read may define one of them.
  const matched = (project.specById.get(node.id)?.scenarios.length ?? 0) > 0
  const missing = matched ? stepProblems(project).map((problem) => `not read: ${problem}`) : []
  return answer(project, contextBundle(project, node, depth, readSteps(project)), { missing })
})

export interface DiagnosticRecord {
  readonly rule: RuleId
  readonly severity: Severity
  readonly message: string
  /** The node it is about, when it is about one. */
  readonly node: string | null
  readonly file: string | null
  readonly line: number | null
  /** What to do about it. */
  readonly hint: string | null
}

const diagnosticRecord = (diagnostic: Diagnostic): DiagnosticRecord => ({
  rule: diagnostic.rule,
  severity: diagnostic.severity,
  message: diagnostic.message,
  node: diagnostic.node ?? null,
  file: diagnostic.source?.file ?? null,
  line: diagnostic.source?.line ?? null,
  hint: diagnostic.hint ?? null
})

/** `sdp check`: every diagnostic at least as severe as `severity` (default: all of them). */
export const check = Effect.fn("check")(function*(root: string, input: { readonly severity?: Severity | undefined } = {}) {
  const project = yield* loadProject(root)
  const found = checkProject(project).filter((diagnostic) => atLeast(diagnostic.severity, input.severity ?? "info"))
  return answer(project, found.map(diagnosticRecord))
})

/** A step listing or matching is complete only when every registration in the step files was read. */
const stepsMissing = (project: Project) => stepProblems(project).map((problem) => `not read: ${problem}`)

/** `sdp steps`: the step definitions a run would know, read from the step files without running them. */
export const steps = Effect.fn("steps")(function*(root: string, input: { readonly text?: string | undefined } = {}) {
  const project = yield* loadProject(root, { withResults: false })
  const data: ReadonlyArray<ListedStep> = listSteps(project, input.text)
  return answer(project, data, { missing: stepsMissing(project) })
})

/** The steps of one spec that no definition matches yet, or more than one, with a module that defines the undefined ones. */
export const snippets = Effect.fn("snippets")(function*(root: string, input: { readonly id: string }) {
  const project = yield* loadProject(root, { withResults: false })
  const { id } = yield* known(project, input.id)
  const spec = project.specById.get(id)
  if (!spec || spec.scenarios.length === 0) return answer(project, `${id} has no scenarios`)
  const { files, matcher } = readSteps(project)
  const unmatched = unmatchedSteps(project, matcher, (_, s) => s.id === id)
  const where = files.length > 0 ? `step files: ${files.join(", ")}` : "no step files yet"
  const about = { missing: stepsMissing(project) }
  if (unmatched.length === 0) return answer(project, `every step of ${id} has exactly one definition (${where})`, about)
  const lines = unmatched.map((step) =>
    `- ${step.status}: ${step.keyword} ${step.text} — ${step.file}:${step.line}${step.definitions ? `; matches ${step.definitions.join(", ")}` : ""}`
  )
  const suggested = unmatched.flatMap((step) => step.snippet ? [step.snippet] : [])
  const document = [
    `${id}: ${unmatched.length} step(s) without exactly one definition (${where})`,
    ...lines,
    ...(suggested.length > 0 ? ["", "```ts", snippetModule(suggested, files).trimEnd(), "```"] : [])
  ].join("\n")
  return answer(project, document, about)
})

export interface ArchitectureData {
  /** The kinds whose nodes are the architecture in this workspace. */
  readonly kinds: ReadonlyArray<string>
  /** Every node of one of those kinds. */
  readonly architecture: ReadonlyArray<NodeRecord>
  /** The decisions and quality requirements linked to them. */
  readonly drivers: ReadonlyArray<NodeRecord>
  /** The links among all of these; prose mentions are not links. */
  readonly edges: ReadonlyArray<EdgeRecord>
}

/** `sdp arch`: every element and pattern architects declared, with what shaped them. */
export const architecture = Effect.fn("architecture")(function*(root: string) {
  const project = yield* loadProject(root)
  const view = architectureView(project)
  const architectural = (kind: string) => hasKind(project.config.vocabulary, "architectural", kind)
  const data: ArchitectureData = {
    kinds: project.config.vocabulary.kinds.architectural,
    architecture: view.nodes.filter((node) => architectural(node.kind)).map(nodeRecord),
    drivers: view.nodes.filter((node) => !architectural(node.kind)).map(nodeRecord),
    edges: view.edges.map(edgeRecord)
  }
  return answer(project, data)
})

const today = Effect.map(DateTime.now, DateTime.formatIsoDate)

/** The lifecycle report as plain data: ids refer to the records in `phases` and `work`. */
const lifecycleData = (report: LifecycleReport) => ({
  phases: report.phases.map((phase) => ({
    ...nodeRecord(phase.node),
    milestones: phase.milestones.map(nodeRecord),
    iterations: phase.iterations.map((iteration) => iteration.node.id)
  })),
  /** Planned activity per discipline, one number per iteration in `iterations` order. */
  disciplines: Object.fromEntries(report.disciplines.map((discipline) => [discipline.discipline, discipline.activity])),
  iterations: report.iterations.map((iteration) => iteration.id),
  /** Per iteration, also those in no phase: the planned work, and the evidence apart from it. */
  work: report.work.map((iteration) => ({
    ...nodeRecord(iteration.node),
    items: iteration.items.map((item) => item.id),
    evidence: { stages: iteration.stages, scenarios: iteration.scenarios }
  })),
  current: report.current?.id ?? null,
  currentPhase: report.currentPhase?.id ?? null,
  unplanned: report.unplanned.map((node) => node.id)
})

/** `sdp lifecycle --json`: phases, iterations, milestones, planned activity and the evidence, as data. */
export const lifecycle = Effect.fn("lifecycle")(function*(root: string) {
  const project = yield* loadProject(root)
  return answer(project, lifecycleData(lifecycleReport(project, yield* today)))
})

/** `sdp lifecycle`: the same as a chart to read. */
export const lifecycleChart = Effect.fn("lifecycleChart")(function*(root: string) {
  const project = yield* loadProject(root)
  return answer(project, renderLifecycle(lifecycleReport(project, yield* today)))
})

/** `sdp vocabulary`: the words sdp interprets, as the workspace configures them. Only the configuration is read. */
export const vocabulary = Effect.fn("vocabulary")(function*(root: string) {
  const data = vocabularyJson((yield* loadConfig(root)).vocabulary)
  return { complete: true, notes: [], data } satisfies Answer<typeof data>
})

/** The whole graph, or with `select` the part along the paths a query matches. */
const selected = Effect.fnUntraced(function*(project: Project, select: string | undefined) {
  if (select === undefined) return { graph: project.graph, about: {} }
  const { about, result } = yield* evaluate(project, select)
  const graph: Graph = project.graph.subgraph(result.paths.flatMap((path) => path.nodes))
  return { graph, about }
})

/** `sdp graph`: the graph as records, every node and then every edge. */
export const graph = Effect.fn("graph")(function*(root: string, input: { readonly select?: string | undefined } = {}) {
  const project = yield* loadProject(root)
  const { about, graph } = yield* selected(project, input.select)
  const data: ReadonlyArray<GraphRecord> = graphRecords(graph)
  return answer(project, data, about)
})

/** `sdp graph --mermaid`, `sdp arch --mermaid`: that graph, or the architecture, as a Mermaid flowchart. */
export const diagram = Effect.fn("diagram")(function*(root: string, input: { readonly select?: string | undefined } | "architecture" = {}) {
  const project = yield* loadProject(root)
  const { about, graph } = input === "architecture"
    ? { about: {}, graph: project.graph.subgraph(architectureView(project).nodes.map((node) => node.id)) }
    : yield* selected(project, input.select)
  return answer(project, mermaid(graph, project.config.vocabulary), about)
})
