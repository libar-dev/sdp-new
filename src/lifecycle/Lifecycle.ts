/**
 * The delivery lifecycle, RUP-style: phases split into iterations and closed
 * by milestones, with disciplines (business modeling, requirements, analysis &
 * design, implementation, test, deployment) active in every iteration at
 * varying intensity. All of it is plain graph data:
 *
 *   phase      nodes, ordered by an `order` attribute
 *   iteration  nodes linked to their phase (`phase: elaboration`)
 *   milestone  nodes linked to their phase; their scenarios are the gate
 *   work       any node linked to an iteration (`iteration: E2`)
 *
 * The discipline × iteration activity matrix is computed from that work, so
 * the familiar "hump chart" reflects the actual plan instead of a drawing.
 */
import { annotate } from "sdp/annotations"
import { Predicate } from "effect"
import type { GraphNode } from "../model/Graph.ts"
import type { Project } from "../graph/Build.ts"

export interface IterationReport {
  readonly node: GraphNode
  readonly items: ReadonlyArray<GraphNode>
  readonly stages: Readonly<Record<string, number>>
}

export interface PhaseReport {
  readonly node: GraphNode
  readonly iterations: ReadonlyArray<IterationReport>
  readonly milestones: ReadonlyArray<GraphNode>
}

export interface LifecycleReport {
  readonly phases: ReadonlyArray<PhaseReport>
  /** Work linked to no iteration. */
  readonly unplanned: ReadonlyArray<GraphNode>
  readonly disciplines: ReadonlyArray<{ readonly discipline: string; readonly activity: ReadonlyArray<number> }>
  readonly iterations: ReadonlyArray<GraphNode>
  /** The iteration whose start…end contains `today`, if any. */
  readonly current: GraphNode | undefined
  /**
   * The phase of the latest iteration that has started by `today` (so a gap between iterations
   * stays in the phase just worked on). Milestones of later phases are not due yet.
   */
  readonly currentPhase: GraphNode | undefined
  /** Whether the report was computed for a date; without one, every gate counts as due. */
  readonly dated: boolean
}

const structural = new Set(["phase", "iteration", "milestone", "scenario", "missing", "code"])

const order = (node: GraphNode) => {
  const value = Number(node.attrs.order)
  return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER
}

const byStart = (a: GraphNode, b: GraphNode) =>
  String(a.attrs.start ?? "").localeCompare(String(b.attrs.start ?? "")) || order(a) - order(b) || a.id.localeCompare(b.id)

/**
 * Phases, iterations, milestones and discipline activity computed from the plan in the graph.
 * `today` is an ISO date (YYYY-MM-DD); without it nothing is marked current.
 */
export const lifecycle = (project: Project, today?: string): LifecycleReport => {
  const { graph } = project
  const linked = (node: GraphNode, kind: string) =>
    graph.neighbours(node.id).map(({ other }) => graph.node(other)).filter((n): n is GraphNode => n?.kind === kind)

  const phases = graph.ofKind("phase").slice().sort((a, b) => order(a) - order(b) || a.id.localeCompare(b.id))
  const iterationNodes = graph.ofKind("iteration").slice().sort(byStart)
  const planned = new Set<string>()

  const iterationReport = (iteration: GraphNode): IterationReport => {
    const items = graph.in(iteration.id)
      .map((edge) => graph.node(edge.from))
      .filter((n): n is GraphNode => n !== undefined && !structural.has(n.kind))
    for (const item of items) planned.add(item.id)
    const stages: Record<string, number> = {}
    for (const item of items) {
      const stage = item.kind === "decision"
        ? `decision:${String(item.attrs.status)}`
        : Predicate.isString(item.attrs.stage)
        ? item.attrs.stage
        : item.kind
      stages[stage] = (stages[stage] ?? 0) + 1
    }
    return { node: iteration, items, stages }
  }

  const reports = new Map(iterationNodes.map((it) => [it.id, iterationReport(it)]))
  const phaseReports = phases.map((phase): PhaseReport => ({
    node: phase,
    iterations: iterationNodes.filter((it) => linked(it, "phase").some((p) => p.id === phase.id)).map((it) => reports.get(it.id)!),
    milestones: graph.ofKind("milestone").filter((m) => linked(m, "phase").some((p) => p.id === phase.id))
  }))
  const orderedIterations = phaseReports.flatMap((p) => p.iterations.map((i) => i.node))
  for (const it of iterationNodes) if (!orderedIterations.includes(it)) orderedIterations.push(it)

  const disciplines = Object.entries(project.config.disciplines).map(([discipline, kinds]) => ({
    discipline,
    activity: orderedIterations.map((it) => activity(project, discipline, kinds, reports.get(it.id)!.items))
  }))

  const unplanned = [...graph.nodes.values()].filter((n) =>
    Predicate.isString(n.attrs.maturity) && !planned.has(n.id) && !structural.has(n.kind)
  )
  const started = today === undefined
    ? []
    : orderedIterations.filter((it) => Predicate.isString(it.attrs.start) && it.attrs.start <= today)
  const current = started.find((it) => today! <= String(it.attrs.end ?? ""))
  const latest = current ?? started.at(-1)
  const currentPhase = latest && phaseReports.find((p) => p.iterations.some((i) => i.node.id === latest.id))?.node
  return {
    phases: phaseReports,
    unplanned,
    disciplines,
    iterations: orderedIterations,
    current,
    currentPhase,
    dated: today !== undefined
  }
}
annotate(lifecycle, { is: "ARCH-lifecycle" })

const activity = (project: Project, discipline: string, kinds: ReadonlyArray<string>, items: ReadonlyArray<GraphNode>) => {
  const { graph } = project
  let total = items.filter((n) => kinds.includes(n.kind)).length
  if (discipline === "implementation") {
    total += items.filter((n) => n.attrs.stage === "in-progress" || n.attrs.stage === "verified").length
  }
  if (discipline === "test") {
    for (const item of items) {
      total += graph.in(item.id).filter((e) => {
        const status = graph.node(e.from)?.attrs.status
        return e.rel === "verifies" && (status === "passed" || status === "failed" || status === "pending")
      }).length
    }
  }
  return total
}

const shades = [" ", "░", "▒", "▓", "█"]

/** Renders the lifecycle as text: phases, iterations, milestone gates and the discipline activity chart. */
export const renderLifecycle = (report: LifecycleReport): string => {
  const out: Array<string> = []
  if (report.phases.length === 0) {
    return `${emptyPlanHint}\n`
  }
  const currentIndex = report.phases.findIndex((p) => p.node.id === report.currentPhase?.id)
  out.push("PHASES")
  report.phases.forEach((phase, index) => {
    const its = phase.iterations.map((i) => i.node.id === report.current?.id ? `${i.node.id}*` : i.node.id).join(" ") || "—"
    const now = index === currentIndex ? "◀ now" : ""
    out.push(`  ${pad(phase.node.title, 14)} ${pad(its, 14)}${now}`)
    // Undated reports treat every gate as due; before the plan starts, none is.
    const due = !report.dated || index <= currentIndex
    for (const m of phase.milestones) {
      const v = String(m.attrs.verification ?? "none")
      const mark = !due ? "·" : v === "passing" ? "✔" : v === "failing" ? "✘" : "…"
      out.push(`    ◆ ${pad(m.id, 6)} ${pad(m.title, 31)} gate ${mark} ${due ? v : `not due (${v})`}`)
    }
  })
  out.push("", "ITERATIONS")
  for (const phase of report.phases) {
    for (const it of phase.iterations) {
      const dates = it.node.attrs.start ? ` ${String(it.node.attrs.start)}…${String(it.node.attrs.end ?? "")}` : ""
      const stages = Object.entries(it.stages).map(([s, n]) => `${s}:${n}`).join("  ")
      const id = it.node.id === report.current?.id ? `${it.node.id}*` : it.node.id
      out.push(`  ${pad(id, 4)} ${pad(it.node.title, 28)}${pad(dates, 25)} ${it.items.length} item(s)  ${stages}`)
    }
  }
  if (report.unplanned.length > 0) {
    out.push(`  (unplanned: ${report.unplanned.map((n) => n.id).join(", ")})`)
  }
  out.push("", "DISCIPLINE ACTIVITY (relative per discipline)")
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
  return out.join("\n") + "\n"
}

/** What `sdp lifecycle` says before there is a plan: how to write one, inline. */
export const emptyPlanHint = `No phases defined yet. \`sdp new plan "Delivery plan"\` writes a plan with the four phases and an
iteration in each, or declare phases and iterations in any spec's front matter:

  nodes:
    - { id: elaboration, kind: phase, title: Elaboration, order: 2 }
    - { id: E1, kind: iteration, title: Architecture baseline, phase: elaboration, start: "2026-11-16", end: "2026-11-27" }

Then plan work with \`iteration: E1\` on a spec, and close each phase with a milestone
(\`sdp new milestone "Architecture baseline"\`, \`phase: elaboration\`) whose scenarios are its gate.`

const pad = (s: string, n: number) => s.length >= n ? `${s} ` : s + " ".repeat(n - s.length)
