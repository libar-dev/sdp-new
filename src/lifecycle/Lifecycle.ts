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
import { Predicate } from "effect"
import type { GraphNode } from "../model/Graph.ts"
import type { Project } from "../graph/Build.ts"

// @sdp is ARCH-lifecycle

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
}

const structural = new Set(["phase", "iteration", "milestone", "scenario", "missing", "code"])

const order = (node: GraphNode) => {
  const value = Number(node.attrs.order)
  return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER
}

const byStart = (a: GraphNode, b: GraphNode) =>
  String(a.attrs.start ?? "").localeCompare(String(b.attrs.start ?? "")) || order(a) - order(b) || a.id.localeCompare(b.id)

export const lifecycle = (project: Project): LifecycleReport => {
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
  return { phases: phaseReports, unplanned, disciplines, iterations: orderedIterations }
}

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
    return "No phases defined. Declare `kind: phase` and `kind: iteration` nodes (see docs/delivery/plan.md for an example).\n"
  }
  out.push("PHASES")
  for (const phase of report.phases) {
    const its = phase.iterations.map((i) => i.node.id).join(" ") || "—"
    out.push(`  ${pad(phase.node.title, 14)} ${pad(its, 14)}`)
    for (const m of phase.milestones) {
      const v = String(m.attrs.verification ?? "none")
      const mark = v === "passing" ? "✔" : v === "failing" ? "✘" : "…"
      out.push(`    ◆ ${pad(m.id, 6)} ${pad(m.title, 30)} gate ${mark} ${v}`)
    }
  }
  out.push("", "ITERATIONS")
  for (const phase of report.phases) {
    for (const it of phase.iterations) {
      const dates = it.node.attrs.start ? ` ${String(it.node.attrs.start)}…${String(it.node.attrs.end ?? "")}` : ""
      const stages = Object.entries(it.stages).map(([s, n]) => `${s}:${n}`).join("  ")
      out.push(`  ${pad(it.node.id, 4)} ${pad(it.node.title, 22)}${pad(dates, 25)} ${it.items.length} item(s)  ${stages}`)
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
  return out.join("\n") + "\n"
}

const pad = (s: string, n: number) => s.length >= n ? `${s} ` : s + " ".repeat(n - s.length)
