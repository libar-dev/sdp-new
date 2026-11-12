/**
 * The delivery lifecycle. The milestone is the one concept it stands on: a
 * node whose scenarios are its gate and whose `met` records that the gate
 * passed. Where the project is follows from the files alone — the first
 * milestone that is not met — and the calendar only marks today and lateness.
 * All of it is plain graph data, read through the words of the workspace's
 * vocabulary profile:
 *
 *   iteration  nodes with a first and a last day, optionally in a phase
 *   phase      a name for a group of iterations, in the order of its first
 *   milestone  ends what it closes, a phase or an iteration, and with it the
 *              stretch of the timeline since the milestone before
 *   work       nodes linked to an iteration (`@iteration:E2`): its kind's
 *              discipline is planned there, and a link named for a
 *              discipline plans that one into iterations of its own
 *              (`@activity.implementation:C1 @activity.test:T1`)
 *
 * Plan facts are read as edges, which every link key yields whichever way it
 * is written. No other edge counts — a `[[E2]]` mention plans nothing — and a
 * node is counted once however many edges lead to the same iteration. The
 * discipline × iteration chart is the plan; stages and executed scenarios are
 * evidence and are reported apart from it.
 */
import { annotate } from "sdp/annotations"
import { Predicate } from "effect"
import { type GraphEdge, type GraphNode, tally } from "../model/Graph.ts"
import { activityRelation, attribute, hasKind, hasRelation, isPlanKind, made, metOn, type Vocabulary } from "../model/Vocabulary.ts"
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
}

export interface MilestoneReport {
  readonly node: GraphNode
  /** The phase or the iteration it closes, if it names one. */
  readonly closes: GraphNode | undefined
  /** The phase it closes, or that of the iteration it closes. */
  readonly phase: GraphNode | undefined
  /** The stretch of the timeline it ends: the iterations since the milestone before it. */
  readonly iterations: ReadonlyArray<GraphNode>
  /** The work planned into those iterations, each node once. */
  readonly work: ReadonlyArray<GraphNode>
  /** The last day of what it closes. */
  readonly planned: string | undefined
  /** The day it was recorded as met. */
  readonly met: string | undefined
  /** Its gate: each of its scenarios with the status of its last run. */
  readonly gate: ReadonlyArray<{ readonly name: string; readonly status: string }>
}

export interface LifecycleReport {
  /** Every milestone, in the order of the timeline: by the end of what it closes. */
  readonly milestones: ReadonlyArray<MilestoneReport>
  /** Where the project is: the first milestone that is not met. */
  readonly next: MilestoneReport | undefined
  /** The iterations after the last milestone: nothing closes them. */
  readonly unclosed: ReadonlyArray<GraphNode>
  /** The phases, in the order of their first iteration. */
  readonly phases: ReadonlyArray<PhaseReport>
  /** Nodes with a maturity that are planned into no iteration. */
  readonly unplanned: ReadonlyArray<GraphNode>
  /** Planned activity: for each discipline, the number of nodes with work planned in each iteration. */
  readonly disciplines: ReadonlyArray<{ readonly discipline: string; readonly activity: ReadonlyArray<number> }>
  /** Every iteration, in the order of the timeline: by its first day. */
  readonly iterations: ReadonlyArray<GraphNode>
  /** The planned work and its evidence for each of `iterations`, in the same order. */
  readonly work: ReadonlyArray<IterationReport>
  /** The day the report was computed for, if it was given one. */
  readonly today: string | undefined
  /** The iteration whose start…end contains `today`, if any. The calendar, not the project's position. */
  readonly current: GraphNode | undefined
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
  isPlanKind(vocabulary, node.kind) || Object.values(made.kinds).some((kind) => kind === node.kind)

/** Scenario statuses that mean it has not been executed (since its last change). */
const notExecuted = new Set(["unrun", "stale"])

const unique = <A>(values: Iterable<A>): Array<A> => [...new Set(values)]

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

/** The disciplines whose work on a node is planned by its own edges, `activity.implementation:C1`. */
export const plannedDisciplines = (project: Project, node: GraphNode): ReadonlyMap<string, GraphEdge> => {
  const prefix = activityRelation(project.config.vocabulary, "")
  return new Map(project.graph.out(node.id).filter((edge) => edge.rel.startsWith(prefix)).map((edge) => [edge.rel.slice(prefix.length), edge]))
}

/**
 * The discipline work planned on a node. A discipline with an edge of its own is planned into the
 * iterations those edges name; every other discipline whose kinds include the node's kind is
 * planned into the iterations of its plan relations.
 */
export const plannedActivity = (project: Project, node: GraphNode): ReadonlyArray<PlannedActivity> => {
  const vocabulary = project.config.vocabulary
  const declared = plannedDisciplines(project, node)
  const home = planIterations(project, node)
  return [...vocabulary.disciplines].flatMap(([discipline, kinds]) => {
    const iterations = declared.has(discipline)
      ? iterationsBy(project, node, (rel) => rel === activityRelation(vocabulary, discipline))
      : kinds.includes(node.kind)
      ? home
      : []
    return iterations.map((iteration) => ({ discipline, iteration }))
  })
}

/**
 * Milestones with the stretch of the timeline each ends, phases, iterations and planned discipline
 * activity, with the evidence for the planned work. `today` is an ISO date (YYYY-MM-DD); without
 * it nothing is marked current or late.
 */
export const lifecycle = (project: Project, today?: string): LifecycleReport => {
  const { graph } = project
  const vocabulary = project.config.vocabulary
  const { end, start } = vocabulary.attributes
  const day = (node: GraphNode | undefined, key: string) => {
    const value = node && attribute(node, key)
    return Predicate.isString(value) ? value : undefined
  }
  const target = (node: GraphNode, role: "phase" | "closes") =>
    graph.out(node.id).flatMap((edge) => hasRelation(vocabulary, role, edge.rel) ? [graph.node(edge.to)] : []).find(Predicate.isNotUndefined)

  const iterations = graph.ofKind(vocabulary.kinds.iteration).slice()
    .sort((a, b) => (day(a, start) ?? "").localeCompare(day(b, start) ?? "") || a.id.localeCompare(b.id))
  const position = new Map(iterations.map((iteration, index) => [iteration.id, index]))
  const phaseOf = (iteration: GraphNode) => {
    const phase = target(iteration, "phase")
    return phase && hasKind(vocabulary, "phase", phase.kind) ? phase : undefined
  }

  // Every node's plan, once: the iterations it is planned into and its discipline activity.
  const itemsOf = new Map<string, Set<GraphNode>>(iterations.map((it) => [it.id, new Set()]))
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

  /** The scenarios of a node, in the order they are written, with the status of their last run. */
  const scenariosOf = (node: GraphNode) =>
    graph.in(node.id)
      .flatMap((edge) => edge.rel === vocabulary.relations.scenario ? [graph.node(edge.from)] : [])
      .filter((scenario): scenario is GraphNode => scenario?.kind === made.kinds.scenario)
      .sort((a, b) => (a.source?.line ?? 0) - (b.source?.line ?? 0))
      .map((scenario) => ({ name: scenario.title, status: String(scenario.attrs.status) }))

  const iterationReport = (iteration: GraphNode): IterationReport => {
    const items = [...itemsOf.get(iteration.id)!]
    const statuses = items.flatMap(scenariosOf).map((scenario) => scenario.status).filter((status) => !notExecuted.has(status))
    return {
      node: iteration,
      items,
      // Counted the way every report counts stages: each node that has one.
      stages: tally(items.flatMap((item) => Predicate.isString(item.attrs.stage) ? [item.attrs.stage] : [])),
      scenarios: tally(statuses)
    }
  }
  const work = iterations.map(iterationReport)

  const phases = graph.ofKind(vocabulary.kinds.phase)
    .map((node): PhaseReport => ({ node, iterations: work.filter((it) => phaseOf(it.node)?.id === node.id) }))
    .sort((a, b) => firstOf(a, position) - firstOf(b, position) || a.node.id.localeCompare(b.node.id))

  // A milestone ends the timeline at the last iteration of what it closes; one that closes
  // nothing on the timeline comes after the others, beyond the last iteration.
  const beyond = iterations.length
  const closing = graph.ofKind(vocabulary.kinds.milestone).map((node) => {
    const closes = target(node, "closes")
    const iteration = closes && position.has(closes.id) ? closes : undefined
    const closed = phases.find((phase) => phase.node.id === closes?.id)
    const last = iteration ?? closed?.iterations.at(-1)?.node
    return {
      node,
      closes,
      phase: iteration ? phaseOf(iteration) : closed?.node,
      at: last ? position.get(last.id)! : beyond,
      // Where an iteration and its phase end on the same day, the iteration's milestone comes first.
      rank: iteration ? 0 : 1
    }
  }).sort((a, b) => a.at - b.at || a.rank - b.rank || a.node.id.localeCompare(b.node.id))

  let covered = -1
  const milestones = closing.map(({ at, closes, node, phase }): MilestoneReport => {
    const stretch = at < beyond ? iterations.slice(covered + 1, at + 1) : []
    if (at < beyond) covered = Math.max(covered, at)
    return {
      node,
      closes,
      phase,
      iterations: stretch,
      work: unique(stretch.flatMap((iteration) => [...itemsOf.get(iteration.id)!])),
      planned: day(iterations[at], end),
      met: metOn(vocabulary, node),
      gate: scenariosOf(node)
    }
  })

  const disciplines = [...vocabulary.disciplines.keys()].map((discipline) => ({
    discipline,
    activity: iterations.map((it) => activityIn.get(discipline)?.get(it.id)?.size ?? 0)
  }))
  const unplanned = graph.nodes().filter((n) =>
    Predicate.isString(n.attrs.maturity) && !planned.has(n.id) && !isStructural(vocabulary, n)
  )
  const current = iterations.find((it) => {
    const first = day(it, start)
    const last = day(it, end)
    return today !== undefined && first !== undefined && last !== undefined && first <= today && today <= last
  })
  return {
    milestones,
    next: milestones.find((milestone) => milestone.met === undefined),
    unclosed: iterations.slice(covered + 1),
    phases,
    unplanned,
    disciplines,
    iterations,
    work,
    today,
    current,
    vocabulary
  }
}
annotate(lifecycle, { is: "ARCH-lifecycle" })

/**
 * The milestones dated before this one that are not met. The timeline says they come first; of
 * milestones without a date, or with the same one, it says nothing.
 */
export const unmetBefore = (report: LifecycleReport, milestone: MilestoneReport): ReadonlyArray<MilestoneReport> =>
  report.milestones.filter((other) =>
    other.met === undefined && other.planned !== undefined && milestone.planned !== undefined && other.planned < milestone.planned
  )

/** Where a phase begins on the timeline; one without iterations comes last. */
const firstOf = (phase: PhaseReport, position: ReadonlyMap<string, number>) => {
  const [first] = phase.iterations
  return first ? position.get(first.node.id)! : position.size
}

const shades = [" ", "░", "▒", "▓", "█"]

const counts = (record: Readonly<Record<string, number>>) =>
  Object.entries(record).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([key, n]) => `${key}:${n}`).join(" ")

/** Whole days from one ISO date to another; negative when the second is earlier. */
const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000)

const gateMarks: Readonly<Record<string, string>> = { passed: "✔", failed: "✘" }

/**
 * Renders the lifecycle as text: the milestones with the stretch of the timeline each ends, the
 * work planned into each iteration, the planned discipline activity chart, and — apart from the
 * plan — the evidence.
 */
export const renderLifecycle = (report: LifecycleReport): string => {
  const { current, milestones, next, today } = report
  if (report.iterations.length === 0 && milestones.length === 0) return `${emptyPlanHint}\n`
  const out: Array<string> = []
  const label = (it: GraphNode) => it.id === current?.id ? `${it.id}*` : it.id
  const position = next === undefined
    ? milestones.length > 0 ? "every milestone is met" : undefined
    : `project ${next.phase ? `in ${next.phase.title}` : `at ${next.node.id}`}`
  const calendar = today === undefined ? undefined : current ? `calendar in ${current.id}` : "no iteration today"
  const heading = [today, position, calendar].filter(Predicate.isNotUndefined).join(" · ")

  /** How a milestone stands: when it was met and how far from its date, or how much of its gate passes and how late it is. */
  const standing = (milestone: MilestoneReport) => {
    const { gate, met, planned } = milestone
    if (met !== undefined) {
      const off = planned === undefined ? 0 : daysBetween(planned, met)
      return `met ${met}${off === 0 ? "" : ` (${off > 0 ? "+" : ""}${off}d)`}`
    }
    const passed = gate.filter((scenario) => scenario.status === "passed").length
    const late = today !== undefined && planned !== undefined ? daysBetween(planned, today) : 0
    return `${gate.length === 0 ? "no gate" : `${passed}/${gate.length}`}${late > 0 ? `  late ${late}d` : ""}`
  }
  const rows = [
    ...milestones.map((milestone) => ({
      milestone,
      mark: milestone.met !== undefined ? "✔" : milestone === next ? "▶" : " ",
      cells: [
        milestone.node.id,
        milestone.node.title,
        milestone.phase?.title ?? "",
        milestone.iterations.map(label).join(" "),
        milestone.planned ?? "",
        standing(milestone)
      ]
    })),
    ...stretches(report).map(({ iterations, phase }) => ({
      milestone: undefined,
      mark: " ",
      cells: ["—", "no milestone", phase?.title ?? "", iterations.map(label).join(" "), "", ""]
    }))
  ]
  const widths = rows[0]!.cells.map((_, column) => Math.max(...rows.map((row) => row.cells[column]!.length)))
  out.push(`MILESTONES${heading ? `  (${heading})` : ""}`)
  for (const { cells, mark, milestone } of rows) {
    out.push(`  ${mark} ${cells.map((cell, column) => pad(cell, widths[column]! + 1)).join(" ").trimEnd()}`)
    if (milestone === undefined || milestone !== next) continue
    for (const { name, status } of milestone.gate) {
      out.push(`        ${gateMarks[status] ?? "…"} ${name}${Object.hasOwn(gateMarks, status) ? "" : `  (${status})`}`)
    }
  }
  out.push("  ✔ met · ▶ next to be met, with its gate as last run · n/m of its gate passes · * today · the date is the end of what it closes")

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

/** The iterations no milestone closes, in runs that share a phase. */
const stretches = (report: LifecycleReport) => {
  const phaseOf = (iteration: GraphNode) => report.phases.find((phase) => phase.iterations.some((it) => it.node.id === iteration.id))?.node
  const runs: Array<{ readonly phase: GraphNode | undefined; readonly iterations: Array<GraphNode> }> = []
  for (const iteration of report.unclosed) {
    const phase = phaseOf(iteration)
    const run = runs.at(-1)
    if (run && run.phase?.id === phase?.id) run.iterations.push(iteration)
    else runs.push({ phase, iterations: [iteration] })
  }
  return runs
}

/** What `sdp lifecycle` says before there is a plan: how to write one. */
export const emptyPlanHint = `No plan yet. A phase and an iteration are files of their own:
\`sdp new phase "Elaboration"\`, then \`sdp new iteration "Architecture baseline" --id E1\`, which writes

  @id=E1 @kind=iteration @start=2026-11-16 @end=2026-11-29
  Feature: Architecture baseline

with \`@phase:PH-elaboration\` to put it in its phase. Plan work on the work itself — \`@iteration:E1\`
on a spec, and other disciplines' work with \`@activity.implementation:C1 @activity.test:T1\` — and end
a stretch of the timeline with a milestone (\`sdp new milestone "Architecture baseline"\`,
\`@closes:E1\`) whose scenarios are its gate.`

const pad = (s: string, n: number) => s.length >= n ? `${s} ` : s + " ".repeat(n - s.length)
