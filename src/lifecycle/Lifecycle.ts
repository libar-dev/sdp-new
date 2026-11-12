/**
 * The delivery lifecycle, RUP-style: phases split into iterations and closed
 * by milestones, with disciplines (business modeling, requirements, analysis &
 * design, implementation, test, deployment) active in every iteration at
 * varying intensity. All of it is plain graph data, read through the words
 * of the workspace's vocabulary profile (the kinds, the plan and phase
 * relations, `activity`, `order`, `start` and `end`):
 *
 *   phase      nodes, ordered by an `order` attribute
 *   iteration  nodes linked to their phase (`phase: PH-elaboration`)
 *   milestone  nodes linked to their phase; their scenarios are the gate
 *   work       nodes linked to an iteration (`iteration: E2`): its kind's
 *              discipline is planned there, and `activity:` plans any
 *              discipline into iterations of its own
 *              (`activity: { implementation: C1, test: [C1, T1] }`)
 *
 * Plan facts are read as edges, which every link key yields whichever way it
 * is written. No other edge counts — a `[[E2]]` mention plans nothing — and a
 * node is counted once however many edges lead to the same iteration. The
 * discipline × iteration chart is the plan; stages and executed scenarios are
 * evidence and are reported apart from it, and the calendar only says where
 * today is, never that a milestone was met.
 */
import { annotate } from "sdp/annotations"
import { Predicate } from "effect"
import { type GraphNode, tally } from "../model/Graph.ts"
import { activityRelation, attribute, hasKind, hasRelation, made, type Vocabulary } from "../model/Vocabulary.ts"
import type { Project } from "../graph/Build.ts"

export interface IterationReport {
  readonly node: GraphNode
  /** Work planned into the iteration, by a plan relation or by `activity:`; each node once. */
  readonly items: ReadonlyArray<GraphNode>
  /** Evidence: planned items by stage, which maturity and scenario results decide. */
  readonly stages: Readonly<Record<string, number>>
  /** Evidence: executed scenarios of the planned items, by status. */
  readonly scenarios: Readonly<Record<string, number>>
}

export interface PhaseReport {
  readonly node: GraphNode
  readonly iterations: ReadonlyArray<IterationReport>
  readonly milestones: ReadonlyArray<GraphNode>
}

export interface LifecycleReport {
  readonly phases: ReadonlyArray<PhaseReport>
  /** Nodes with a maturity that are planned into no iteration. */
  readonly unplanned: ReadonlyArray<GraphNode>
  /** Planned activity: for each discipline, the number of nodes with work planned in each iteration. */
  readonly disciplines: ReadonlyArray<{ readonly discipline: string; readonly activity: ReadonlyArray<number> }>
  /** Every iteration, in chart order: those of the phases first, then any without a phase. */
  readonly iterations: ReadonlyArray<GraphNode>
  /** The planned work and its evidence for each of `iterations`, in the same order. */
  readonly work: ReadonlyArray<IterationReport>
  /** The iteration whose start…end contains `today`, if any. */
  readonly current: GraphNode | undefined
  /**
   * The phase of the latest iteration that has started by `today` (so a gap between iterations
   * stays in the phase just worked on). Milestones of later phases are not due yet.
   */
  readonly currentPhase: GraphNode | undefined
  /** Whether the report was computed for a date; without one, every gate counts as due. */
  readonly dated: boolean
  /** The words the plan was read with, so the rendering can name them. */
  readonly vocabulary: Vocabulary
}

/** One discipline's work on a node, planned into an iteration. */
export interface PlannedActivity {
  readonly discipline: string
  readonly iteration: string
}

/** The plan's own nodes and the nodes sdp makes are not planned work. */
const isStructural = (vocabulary: Vocabulary, node: GraphNode) =>
  hasKind(vocabulary, "phase", node.kind) || hasKind(vocabulary, "iteration", node.kind) ||
  hasKind(vocabulary, "milestone", node.kind) || Object.values(made.kinds).some((kind) => kind === node.kind)

/** Scenario statuses that mean it has not been executed (since its last change). */
const notExecuted = new Set(["unrun", "stale"])

const unique = <A>(values: Iterable<A>): Array<A> => [...new Set(values)]

/**
 * `activity:` as written: each discipline with the values given for it (one iteration id or a
 * list). Undefined when the node has no `activity`, or when it is not a mapping.
 */
export const declaredActivity = (
  vocabulary: Vocabulary,
  attrs: Readonly<Record<string, unknown>>
): ReadonlyMap<string, ReadonlyArray<unknown>> | undefined => {
  const value = attribute({ attrs }, vocabulary.attributes.activity)
  if (!Predicate.isObject(value) || Array.isArray(value)) return undefined
  return new Map(Object.entries(value).map(([discipline, its]) => [discipline, Array.isArray(its) ? its : its == null ? [] : [its]]))
}

/** The iterations an edge relation leads to from `node`, each once. */
const iterationsBy = (project: Project, node: GraphNode, matches: (rel: string) => boolean): ReadonlyArray<string> => {
  const { graph } = project
  const vocabulary = project.config.vocabulary
  return unique(
    graph.out(node.id)
      .filter((edge) => matches(edge.rel) && hasKind(vocabulary, "iteration", graph.node(edge.to)?.kind ?? ""))
      .map((edge) => edge.to)
  )
}

/** The iterations a node is planned into through the plan relations, each once. */
export const planIterations = (project: Project, node: GraphNode): ReadonlyArray<string> =>
  iterationsBy(project, node, (rel) => hasRelation(project.config.vocabulary, "plan", rel))

/**
 * The discipline work planned on a node. A discipline its `activity:` names is planned into the
 * iterations named there (an empty list plans none); every other discipline whose kinds include
 * the node's kind is planned into the iterations of its plan relations.
 */
export const plannedActivity = (project: Project, node: GraphNode): ReadonlyArray<PlannedActivity> => {
  const vocabulary = project.config.vocabulary
  const declared = declaredActivity(vocabulary, node.attrs)
  const home = planIterations(project, node)
  return [...vocabulary.disciplines].flatMap(([discipline, kinds]) => {
    const iterations = declared?.has(discipline)
      ? iterationsBy(project, node, (rel) => rel === activityRelation(vocabulary, discipline))
      : kinds.includes(node.kind)
      ? home
      : []
    return iterations.map((iteration) => ({ discipline, iteration }))
  })
}

/**
 * Phases, iterations, milestones and planned discipline activity, with the evidence for the
 * planned work. `today` is an ISO date (YYYY-MM-DD); without it nothing is marked current.
 */
export const lifecycle = (project: Project, today?: string): LifecycleReport => {
  const { graph } = project
  const vocabulary = project.config.vocabulary
  const { end, order: orderKey, start } = vocabulary.attributes
  const order = (node: GraphNode) => {
    const value = Number(attribute(node, orderKey))
    return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER
  }
  const startOf = (node: GraphNode) => attribute(node, start)
  const byStart = (a: GraphNode, b: GraphNode) =>
    String(startOf(a) ?? "").localeCompare(String(startOf(b) ?? "")) || order(a) - order(b) || a.id.localeCompare(b.id)
  const inPhase = (node: GraphNode, phase: GraphNode) =>
    graph.out(node.id).some((edge) => hasRelation(vocabulary, "phase", edge.rel) && edge.to === phase.id)

  const phases = graph.ofKind(vocabulary.kinds.phase).slice().sort((a, b) => order(a) - order(b) || a.id.localeCompare(b.id))
  const iterationNodes = graph.ofKind(vocabulary.kinds.iteration).slice().sort(byStart)

  // Every node's plan, once: the iterations it is planned into and its discipline activity.
  const itemsOf = new Map<string, Set<GraphNode>>(iterationNodes.map((it) => [it.id, new Set()]))
  const activityIn = new Map<string, Map<string, Set<string>>>()
  const planned = new Set<string>()
  for (const node of graph.nodes()) {
    if (isStructural(vocabulary, node)) continue
    const activity = plannedActivity(project, node)
    for (const iteration of [...planIterations(project, node), ...activity.map((a) => a.iteration)]) {
      itemsOf.get(iteration)?.add(node)
      planned.add(node.id)
    }
    for (const { discipline, iteration } of activity) {
      const byIteration = activityIn.get(discipline) ?? new Map<string, Set<string>>()
      activityIn.set(discipline, byIteration)
      byIteration.set(iteration, (byIteration.get(iteration) ?? new Set()).add(node.id))
    }
  }

  const iterationReport = (iteration: GraphNode): IterationReport => {
    const items = [...itemsOf.get(iteration.id)!]
    const statuses: Array<string> = []
    for (const item of items) {
      for (const edge of graph.in(item.id)) {
        const scenario = graph.node(edge.from)
        const status = scenario?.attrs.status
        if (edge.rel !== vocabulary.relations.scenario || scenario?.kind !== made.kinds.scenario) continue
        if (Predicate.isString(status) && !notExecuted.has(status)) statuses.push(status)
      }
    }
    return {
      node: iteration,
      items,
      // Counted the way every report counts stages: each node that has one.
      stages: tally(items.flatMap((item) => Predicate.isString(item.attrs.stage) ? [item.attrs.stage] : [])),
      scenarios: tally(statuses)
    }
  }

  const reports = new Map(iterationNodes.map((it) => [it.id, iterationReport(it)]))
  const phaseReports = phases.map((phase): PhaseReport => ({
    node: phase,
    iterations: iterationNodes.filter((it) => inPhase(it, phase)).map((it) => reports.get(it.id)!),
    milestones: graph.ofKind(vocabulary.kinds.milestone).filter((m) => inPhase(m, phase))
  }))
  const orderedIterations = unique(phaseReports.flatMap((p) => p.iterations.map((i) => i.node)))
  for (const it of iterationNodes) if (!orderedIterations.includes(it)) orderedIterations.push(it)

  const disciplines = [...vocabulary.disciplines.keys()].map((discipline) => ({
    discipline,
    activity: orderedIterations.map((it) => activityIn.get(discipline)?.get(it.id)?.size ?? 0)
  }))

  const unplanned = graph.nodes().filter((n) =>
    Predicate.isString(n.attrs.maturity) && !planned.has(n.id) && !isStructural(vocabulary, n)
  )
  const started = today === undefined
    ? []
    : orderedIterations.filter((it) => {
      const begins = startOf(it)
      return Predicate.isString(begins) && begins <= today
    })
  const current = started.find((it) => today! <= String(attribute(it, end) ?? ""))
  const latest = current ?? started.at(-1)
  const currentPhase = latest && phaseReports.find((p) => p.iterations.some((i) => i.node.id === latest.id))?.node
  return {
    phases: phaseReports,
    unplanned,
    disciplines,
    iterations: orderedIterations,
    work: orderedIterations.map((it) => reports.get(it.id)!),
    current,
    currentPhase,
    dated: today !== undefined,
    vocabulary
  }
}
annotate(lifecycle, { is: "ARCH-lifecycle" })

const shades = [" ", "░", "▒", "▓", "█"]

const counts = (record: Readonly<Record<string, number>>) =>
  Object.entries(record).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([key, n]) => `${key}:${n}`).join(" ")

/**
 * Renders the lifecycle as text: phases with their milestone gates, the work planned into each
 * iteration, the planned discipline activity chart, and — apart from the plan — the evidence.
 */
export const renderLifecycle = (report: LifecycleReport): string => {
  const out: Array<string> = []
  if (report.phases.length === 0) {
    return `${emptyPlanHint}\n`
  }
  const currentIndex = report.phases.findIndex((p) => p.node.id === report.currentPhase?.id)
  const label = (it: GraphNode) => it.id === report.current?.id ? `${it.id}*` : it.id
  out.push("PHASES  (◀ now and * are where today falls; a milestone is met only when its gate passes)")
  report.phases.forEach((phase, index) => {
    const its = phase.iterations.map((i) => label(i.node)).join(" ") || "—"
    const now = index === currentIndex ? "◀ now" : ""
    out.push(`  ${pad(phase.node.title, 14)} ${pad(its, 14)}${now}`)
    // Undated reports treat every gate as due; before the plan starts, none is.
    const due = !report.dated || index <= currentIndex
    for (const m of phase.milestones) {
      const v = String(m.attrs.verification ?? "none")
      const mark = !due ? "·" : v === "passing" ? "✔" : v === "failing" ? "✘" : "…"
      // The calendar has moved past the phase; that does not make its milestone met.
      const overdue = index < currentIndex && v !== "passing" ? "  overdue: its phase is over, the gate is not met" : ""
      out.push(`    ◆ ${pad(m.id, 6)} ${pad(m.title, 31)} gate ${mark} ${due ? v : `not due (${v})`}${overdue}`)
    }
  })
  out.push("", "PLANNED WORK  (nodes planned into each iteration, by kind)")
  for (const it of report.work) {
    const { end, start } = report.vocabulary.attributes
    const begins = attribute(it.node, start)
    const dates = begins ? ` ${String(begins)}…${String(attribute(it.node, end) ?? "")}` : ""
    const kinds = tally(it.items.map((item) => item.kind))
    out.push(`  ${pad(label(it.node), 4)} ${pad(it.node.title, 28)}${pad(dates, 25)} ${it.items.length} item(s)  ${counts(kinds)}`)
  }
  if (report.unplanned.length > 0) {
    out.push(`  (unplanned: ${report.unplanned.map((n) => n.id).join(", ")})`)
  }
  out.push("", "DISCIPLINE ACTIVITY  (planned; relative per discipline)")
  out.push(`  ${pad("", 18)} ${report.iterations.map((i) => pad(i.id, 4)).join("")}`)
  for (const { activity, discipline } of report.disciplines) {
    const max = Math.max(...activity, 0)
    const cells = activity.map((a) => {
      const level = max === 0 || a === 0 ? 0 : Math.max(1, Math.round((a / max) * (shades.length - 1)))
      return pad(shades[level]!.repeat(3), 4)
    })
    out.push(`  ${pad(discipline, 18)} ${cells.join("")}`)
  }
  out.push(`  ${pad("", 18)} ${shades.slice(1).join(" ")}  more work in an iteration, relative to the discipline's busiest; blank: none`)
  out.push("", "EVIDENCE  (not the plan: stages of the planned work, and its scenarios as last run)")
  for (const it of report.work) {
    const scenarios = counts(it.scenarios)
    const evidence = [counts(it.stages), scenarios && `scenarios ${scenarios}`].filter(Boolean).join("  ")
    out.push(`  ${pad(label(it.node), 4)} ${evidence || "—"}`)
  }
  return out.join("\n") + "\n"
}

/** What `sdp lifecycle` says before there is a plan: how to write one, inline. */
export const emptyPlanHint = `No phases defined yet. \`sdp new plan "Delivery plan"\` writes a plan with the four phases and an
iteration in each, or declare phases and iterations in any spec's front matter:

  nodes:
    - { id: PH-elaboration, kind: phase, title: Elaboration, order: 2 }
    - { id: E1, kind: iteration, title: Architecture baseline, phase: PH-elaboration, start: "2026-11-16", end: "2026-11-27" }

Then plan work with \`iteration: E1\` on a spec — and other disciplines' work on it with
\`activity: { implementation: C1, test: [C1, T1] }\` — and close each phase with a milestone
(\`sdp new milestone "Architecture baseline"\`, \`phase: PH-elaboration\`) whose scenarios are its gate.`

const pad = (s: string, n: number) => s.length >= n ? `${s} ` : s + " ".repeat(n - s.length)
