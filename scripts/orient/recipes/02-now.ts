/**
 * 2 now: where the project is — the milestone it is at and what its gate still lacks, the iteration
 * of today, what each iteration holds, and any live rule that fails. What to build next starts here.
 */
import { at, type Recipe, type Row, specOf } from "../lib.ts"

export default {
  title: "where the project is: milestone, gate, iterations",
  asks: ["lifecycle", "graph"],
  legend: "ms id gate due at · gate status file:line example · iter id(*today) days items stages examples at",
  rows: ({ lifecycle: l, graph }) => {
    const rows: Array<Row> = []
    for (const ms of l.milestones) {
      const node = graph.node(ms.id)
      const met = node?.attrs["met"] as string | undefined
      const here = ms.id === l.position.milestone ? "▶" : ""
      rows.push({ rec: "ms", id: `${here}${ms.id}`, gate: `${ms.gate.passed}/${ms.gate.total}`, due: met === undefined ? ms.planned ?? undefined : `met ${met}`, at: node && at(node) })
      // FINDING: the gate's unmet examples come back as titles; finding each one's file:line and status
      // is a join on the title among the milestone's own scenarios.
      for (const title of ms.gate.unmet) {
        const scenario = graph.examplesOf(ms.id).find((s) => s.title === title)
        rows.push({ rec: "gate", status: (scenario?.attrs["status"] as string | undefined) ?? "unrun", at: scenario && at(scenario), example: title })
      }
    }
    const today = l.calendar.iteration
    for (const it of l.work) {
      const node = graph.node(it.id)
      const days = it.attrs.start === undefined ? undefined : `${it.attrs.start}…${it.attrs.end ?? ""}`
      const counts = (o: Record<string, number>) => Object.entries(o).map(([k, n]) => `${k} ${n}`).join(", ") || undefined
      rows.push({
        rec: "iter",
        id: `${it.id}${it.id === today ? "*" : ""}`,
        days,
        items: it.items.length,
        stages: counts(it.evidence.stages),
        examples: counts(it.evidence.scenarios),
        at: node && at(node)
      })
    }
    // Live rules that fail, but for a milestone's own, which are its gate above.
    const milestones = new Set(l.milestones.map((m) => m.id))
    for (const rule of graph.ofKind("rule")) {
      if (rule.attrs["stage"] === "failing" && rule.attrs["toCome"] !== true && !milestones.has(specOf(rule))) {
        rows.push({ rec: "failing", id: rule.id, at: at(rule) })
      }
    }
    return rows
  }
} satisfies Recipe
