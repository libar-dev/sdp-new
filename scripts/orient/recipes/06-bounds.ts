/**
 * 6 bounds: what a change here must keep, which is not in any one feature — the decisions, with how
 * much rests on each, and why it exists (vision). Each is a spec to read before writing or changing one.
 */
import { at, clip, type Recipe, type Row, sameAsId } from "../lib.ts"

export default {
  title: "what binds a change: decisions, code rules, working rules, vision",
  asks: ["graph", "vocabulary"],
  legend: "decision id file:line rests=specs+rules on it · the choice · kind id file:line rules live/to come",
  rows: ({ graph, vocabulary }) => {
    const drivers = vocabulary.vocabulary.kinds["driver"] ?? []
    const rows: Array<Row> = []
    for (const kind of drivers) {
      for (const d of graph.ofKind(kind)) {
        rows.push({ rec: kind, id: d.id, at: at(d), rests: `rests=${graph.into(d.id, "decided-by").length}`, choice: clip(d.title, 110) })
      }
    }
    // The specs no user observes: kinds of work that are no feature and no element or pattern.
    const architectural = new Set([...(vocabulary.vocabulary.kinds["architectural"] ?? []), "feature", "epic"])
    const work = Object.values(vocabulary.vocabulary.disciplines).flat().filter((k) => !architectural.has(k))
    for (const kind of work) {
      for (const n of graph.ofKind(kind)) {
        const rules = graph.rulesOf(n.id)
        const coming = rules.filter((r) => r.attrs["toCome"] === true).length
        rows.push({
          rec: kind,
          id: n.id,
          at: at(n),
          rules: `rules=${rules.length - coming}/${coming}`,
          what: sameAsId(n.id, n.title) ? undefined : clip(n.title, 110)
        })
      }
    }
    return rows
  }
} satisfies Recipe
