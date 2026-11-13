/**
 * Reading the graph: one use case per question a person or an agent asks.
 * Each reads the workspace as it is now — files, never workspace code — and
 * returns an answer (Answer.ts) made of plain records (`graph/Export.ts`), or
 * fails with a typed error (Errors.ts). The command line and the MCP server
 * call these and nothing else, so they cannot disagree.
 *
 * @sdp is ARCH-application
 * @sdp plays PAT-answer
 */
import { DateTime, Effect, Result } from "effect"
import { architectureView, workOn } from "../arch/Architecture.ts"
import { check as checkProject, compareWithBase } from "../check/Check.ts"
import type { Project } from "../graph/Build.ts"
import { contextBundle } from "../graph/Context.ts"
import { type EdgeRecord, edgeRecord, type GraphRecord, graphRecords, mermaid, type NodeRecord, nodeRecord } from "../graph/Export.ts"
import { closest, parseQuery, projectQueryOptions, type QueryPath, runQuery, unknownWords } from "../graph/Query.ts"
import { statusSummary } from "../graph/Status.ts"
import { type LifecycleReport, lifecycle as lifecycleReport, renderLifecycle } from "../lifecycle/Lifecycle.ts"
import { atLeast, type Diagnostic, type RuleId, type Severity, sortDiagnostics } from "../model/Diagnostic.ts"
import { Graph } from "../model/Graph.ts"
import { hasKind, made, vocabularyJson } from "../model/Vocabulary.ts"
import { builtinSteps } from "../run/Builtin.ts"
import { type ListedStep, listSteps, readSteps, snippetModule, stepProblems, unmatchedSteps } from "../run/Match.ts"
import { type BaseRead, noBase, Revisions } from "../workspace/Revisions.ts"
import { loadConfig, loadProject } from "../workspace/Workspace.ts"
import { type Answer, answer } from "./Answer.ts"
import { Refused, UnknownNode } from "./Errors.ts"

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

/** A query's result, and what to say about it: the limits that cut it short and the words the workspace does not know. */
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
  const others = new Set(graph.neighbours(node.id).map(({ other }) => other).filter((other) => other !== node.id))
  const data: ShowData = {
    node: nodeRecord(node),
    out: graph.out(node.id).map(edgeRecord),
    in: graph.in(node.id).map(edgeRecord),
    neighbours: graph.nodes().filter((other) => others.has(other.id)).map(nodeRecord)
  }
  return answer(project, data)
})

/** A step listing or matching is complete only when every registration in the step files was read. */
const stepsMissing = (project: Project) => stepProblems(project).map((problem) => `not read: ${problem}`)

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
  const missing = matched ? stepsMissing(project) : []
  return answer(project, contextBundle(project, node, depth, readSteps(project, builtinSteps.definitions)), { missing })
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

/**
 * What a comparison with the base found, and a note on what it compared with. Without a base it
 * compared nothing, and with a file of the base it could not read it compared less: either may
 * have missed a test turned off, so the answer is incomplete.
 */
const comparedWith = (project: Project, read: BaseRead) => {
  if ("none" in read) {
    return {
      diagnostics: [],
      missing: [`not compared: no live test was compared with a base: ${read.none}; name one with --base, or waive the comparison with --base ${noBase}`],
      notes: []
    }
  }
  const { diagnostics, missing } = compareWithBase(project, read.found)
  return {
    diagnostics,
    missing: [...read.found.missing, ...missing],
    notes: [`live tests compared with the base ${read.found.commit} (${read.found.command})`]
  }
}

/**
 * `sdp check`: every diagnostic at least as severe as `severity` (default: all of them), those of
 * the comparison of live tests with the base revision included: `base`, where HEAD meets it, else
 * the configuration's, else the default branch. A note says what was compared; an answer that
 * compared nothing is incomplete, unless the base is `none`, which waives the comparison.
 */
export const check = Effect.fn("check")(function*(root: string, input: { readonly severity?: Severity | undefined; readonly base?: string | undefined } = {}) {
  const project = yield* loadProject(root)
  const revisions = yield* Revisions
  const named = input.base ?? project.config.base
  const waived = { diagnostics: [], missing: [], notes: [`no live test was compared with a base: the comparison is waived (${input.base === undefined ? `base: ${noBase}` : `--base ${noBase}`})`] }
  const { diagnostics, missing, notes } = named === noBase ? waived : comparedWith(project, yield* revisions.base(root, named))
  const found = sortDiagnostics([...checkProject(project), ...diagnostics])
    .filter((diagnostic) => atLeast(diagnostic.severity, input.severity ?? "info"))
  return answer(project, found.map(diagnosticRecord), { missing, notes })
})

/** `sdp steps`: the step definitions a run would know, read from the step files without running them. */
export const steps = Effect.fn("steps")(function*(root: string, input: { readonly text?: string | undefined } = {}) {
  const project = yield* loadProject(root, { withResults: false })
  const data: ReadonlyArray<ListedStep> = listSteps(project, builtinSteps.definitions, input.text)
  // The listing is read from the step files alone: a spec that was not read takes nothing from it.
  const notes = stepsMissing(project)
  return { complete: notes.length === 0, notes, data } satisfies Answer<typeof data>
})

/** The steps of one spec that no definition matches yet, or more than one, with a module that defines the undefined ones. */
export const snippets = Effect.fn("snippets")(function*(root: string, input: { readonly id: string }) {
  const project = yield* loadProject(root, { withResults: false })
  const { id } = yield* known(project, input.id)
  const spec = project.specById.get(id)
  if (!spec || spec.scenarios.length === 0) return answer(project, `${id} has no scenarios`)
  const { files, matcher } = readSteps(project, builtinSteps.definitions)
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

/** A decision or a quality requirement in the view. */
export interface DriverRecord extends NodeRecord {
  /**
   * How it shaped an architectural node through a feature linked to that node, as `sdp q --paths`
   * gives a route: from the node, through the feature and the rule that is linked, if it is one, to
   * this driver. A link to the node itself is one of `edges`.
   */
  readonly through: ReadonlyArray<QueryPath>
}

/** The work on an architectural node: what is live on it, and what is still to come, ready first. */
export interface WorkRecord {
  readonly node: string
  readonly live: ReadonlyArray<NodeRecord>
  readonly toCome: ReadonlyArray<NodeRecord>
}

export interface ArchitectureData {
  /** The kinds whose nodes are the architecture in this workspace. */
  readonly kinds: ReadonlyArray<string>
  /** The relation by which code is an element or a pattern; any other link from code applies or uses one. */
  readonly anchor: string
  /** Every node of one of those kinds. */
  readonly architecture: ReadonlyArray<NodeRecord>
  /** The decisions and quality requirements that shaped them. */
  readonly drivers: ReadonlyArray<DriverRecord>
  /**
   * The code linked to them, each with what its own comment says of it (`attrs.doc`) and its shape
   * (`attrs.shape`) or a file's exports (`attrs.exports`).
   */
  readonly anchors: ReadonlyArray<NodeRecord>
  /** The links among all of these. */
  readonly edges: ReadonlyArray<EdgeRecord>
  /** The work on each of them. */
  readonly work: ReadonlyArray<WorkRecord>
}

/** `sdp arch`: every element and pattern architects declared, with what shaped them and the code that is them. */
export const architecture = Effect.fn("architecture")(function*(root: string) {
  const project = yield* loadProject(root)
  const { graph } = project
  const { vocabulary } = project.config
  const view = architectureView(project)
  const architectural = (kind: string) => hasKind(vocabulary, "architectural", kind)
  const architecture = view.nodes.filter((node) => architectural(node.kind))
  const anchored = architecture.flatMap((node) => graph.in(node.id).filter((edge) => graph.node(edge.from)?.kind === made.kinds.code))
  const code = new Set(anchored.map((edge) => edge.from))
  const data: ArchitectureData = {
    kinds: vocabulary.kinds.architectural,
    anchor: vocabulary.relations.anchor,
    architecture: architecture.map(nodeRecord),
    drivers: view.nodes.filter((node) => !architectural(node.kind)).map((node) => ({
      ...nodeRecord(node),
      through: view.routes.filter((route) => route.nodes.at(-1) === node.id)
        .map((route) => ({ nodes: route.nodes, edges: route.edges.map(({ from, rel, to }) => ({ from, rel, to })) }))
    })),
    anchors: graph.nodes().filter((node) => code.has(node.id)).map(nodeRecord),
    edges: [...view.edges, ...anchored].map(edgeRecord),
    work: architecture.map((node) => {
      const { live, toCome } = workOn(project, node)
      return { node: node.id, live: live.map(nodeRecord), toCome: toCome.map(nodeRecord) }
    })
  }
  return answer(project, data)
})

const today = Effect.map(DateTime.now, DateTime.formatIsoDate)

/** The lifecycle report as plain data: ids refer to the records in `milestones`, `phases` and `work`. */
const lifecycleData = (report: LifecycleReport) => ({
  /**
   * Where the project is: the first milestone on the timeline that is not met, or else the only one
   * not met, and its phase. The files say it, not the date.
   */
  position: { milestone: report.next?.node.id ?? null, phase: report.next?.phase?.id ?? null },
  /** Where today falls. It decides nothing. */
  calendar: { today: report.today ?? null, iteration: report.current?.id ?? null },
  /** In the order of the timeline: each with the iterations since the milestone before it and the work planned into them. */
  milestones: report.milestones.map((milestone) => ({
    ...nodeRecord(milestone.node),
    closes: milestone.closes?.id ?? null,
    phase: milestone.phase?.id ?? null,
    iterations: milestone.iterations.map((iteration) => iteration.id),
    work: milestone.work.map((item) => item.id),
    /** The last day of what it closes. */
    planned: milestone.planned ?? null,
    met: milestone.met ?? null,
    /** As last run, while it is not met; once met, `null`: a closed gate is no longer asked. */
    gate: milestone.gate === undefined ? null : {
      passed: milestone.gate.filter((scenario) => scenario.status === "passed").length,
      total: milestone.gate.length,
      unmet: milestone.gate.filter((scenario) => scenario.status !== "passed").map((scenario) => scenario.name)
    }
  })),
  phases: report.phases.map((phase) => ({ ...nodeRecord(phase.node), iterations: phase.iterations.map((iteration) => iteration.node.id) })),
  /** Planned activity per discipline, one number per iteration in `iterations` order. */
  disciplines: Object.fromEntries(report.disciplines.map((discipline) => [discipline.discipline, discipline.activity])),
  iterations: report.iterations.map((iteration) => iteration.id),
  /** Per iteration: the planned work, and the evidence apart from it. */
  work: report.work.map((iteration) => ({
    ...nodeRecord(iteration.node),
    items: iteration.items.map((item) => item.id),
    evidence: { stages: iteration.stages, scenarios: iteration.scenarios }
  })),
  /** The iterations no milestone closes. */
  unclosed: report.unclosed.map((iteration) => iteration.id),
  unplanned: report.unplanned.map((node) => node.id)
})

/** `sdp lifecycle --json`: milestones, phases, iterations, planned activity and the evidence, as data. */
export const lifecycle = Effect.fn("lifecycle")(function*(root: string) {
  const project = yield* loadProject(root)
  return answer(project, lifecycleData(lifecycleReport(project, yield* today)))
})

/** `sdp lifecycle`: the same as a chart to read. */
export const lifecycleChart = Effect.fn("lifecycleChart")(function*(root: string) {
  const project = yield* loadProject(root)
  return answer(project, renderLifecycle(lifecycleReport(project, yield* today)))
})

export type VocabularyData = ReturnType<typeof vocabularyJson>

/** `sdp vocabulary`: the words sdp interprets, as the workspace configures them, and those it makes itself. Only the configuration is read. */
export const vocabulary = Effect.fn("vocabulary")(function*(root: string) {
  const data: VocabularyData = vocabularyJson((yield* loadConfig(root)).vocabulary)
  return { complete: true, notes: [], data } satisfies Answer<VocabularyData>
})

/** The whole graph, or with `select` the part along the paths a query matches: their nodes and the edges they walk. */
const selected = Effect.fnUntraced(function*(project: Project, select: string | undefined) {
  if (select === undefined) return { graph: project.graph, about: {} }
  const { about, result } = yield* evaluate(project, select)
  const nodes = new Set(result.paths.flatMap((path) => path.nodes))
  const walked = new Set(result.paths.flatMap((path) =>
    path.edges.flatMap((step) => project.graph.out(step.from).filter((edge) => edge.rel === step.rel && edge.to === step.to))
  ))
  const graph = new Graph(project.graph.nodes().filter((node) => nodes.has(node.id)), walked)
  return { graph, about }
})

/** `sdp graph`: the graph as records, every node and then every edge. */
export const graph = Effect.fn("graph")(function*(root: string, input: { readonly select?: string | undefined } = {}) {
  const project = yield* loadProject(root)
  const { about, graph } = yield* selected(project, input.select)
  const data: ReadonlyArray<GraphRecord> = graphRecords(graph)
  return answer(project, data, about)
})

/** The architecture view as a graph to draw: its nodes and links, and the features and rules its drivers came through. */
const architectureGraph = (project: Project): Graph => {
  const { edges, nodes, routes } = architectureView(project)
  const through = routes.flatMap((route) => route.nodes).flatMap((id) => project.graph.node(id) ?? [])
  return new Graph([...nodes, ...through], [...edges, ...routes.flatMap((route) => route.edges)])
}

/** `sdp graph --mermaid`, `sdp arch --mermaid`: that graph, or the architecture, as a Mermaid flowchart. */
export const diagram = Effect.fn("diagram")(function*(root: string, input: { readonly select?: string | undefined } | "architecture" = {}) {
  const project = yield* loadProject(root)
  const { about, graph } = input === "architecture"
    ? { about: {}, graph: architectureGraph(project) }
    : yield* selected(project, input.select)
  return answer(project, mermaid(graph, project.config.vocabulary), about)
})
