/**
 * 3 to-come: all work still to come, at every maturity, and nothing built. Every line is a spec;
 * none of it is code yet. A spec still to come is a line with its maturity; a live spec with rules
 * still to come says `live` and lists those rules by line; a rule planned on its own has a line of
 * its own. Its route to code is the elements its spec is realized by (→), where it names any.
 * Open questions are section 4's and are not repeated here. An epic has no line: it is plan, says no
 * status, and each line it groups says `epic <id>`.
 */
import { at, examples, type Graph, isOpen, maturity, type Node, type Recipe, type Row, sameAsId, specOf, toCome } from "../lib.ts"

const LADDER = ["ready", "specified", "draft", "idea"]

/**
 * What links a spec to the rest of the plan and to code, one short phrase each. `rules` are its rules
 * still to come: a decision one of them, or the spec, rests on binds the work; one on a live rule of
 * it binds only that rule.
 */
const links = (graph: Graph, spec: Node, rules: ReadonlyArray<Node>): Array<string> => {
  const to = (rel: string) => graph.out(spec.id, rel).map((e) => e.to)
  const out: Array<string> = []
  const route = to("realized-by")
  if (route.length > 0) out.push(`→ ${route.join(",")}`)
  for (const id of to("depends-on")) out.push(`needs ${id}`)
  // A decision the spec or any of its rules rests on: what a change here must keep.
  const decided = new Set([...to("decided-by"), ...rules.flatMap((r) => graph.out(r.id, "decided-by").map((d) => d.to))])
  if (decided.size > 0) out.push(`decided-by ${[...decided].join(",")}`)
  const epics = new Set([spec, ...rules].flatMap((n) => graph.into(n.id, "includes").map((e) => e.from)))
  for (const epic of epics) out.push(`epic ${epic}`)
  for (const id of to("replaces")) out.push(`replaces ${id}`)
  return out
}

export default {
  title: "work still to come, every maturity: specs, not code",
  asks: ["graph", "lifecycle"],
  legend: "tocome kind id maturity|live plan file:line what · rules n=rules still to come · ex=its examples as last run · → elements it is realized by",
  rows: ({ graph, lifecycle }) => {
    const plan = (id: string) => graph.out(id, "iteration")[0]?.to
    const order = (id: string | undefined) => (id === undefined ? 99 : lifecycle.iterations.indexOf(id))
    // Planned work first, in the order of its iterations; then by maturity, ready first; live specs last.
    const rows: Array<{ readonly row: Row; readonly sort: ReadonlyArray<number | string> }> = []
    const row = (node: Node, maturityOrLive: string, what: ReadonlyArray<string>) => {
      const iteration = plan(node.id)
      const title = sameAsId(node.id, node.title) ? [] : [`“${node.title}”`]
      rows.push({
        row: { rec: "tocome", kind: node.kind, id: node.id, maturity: maturityOrLive, plan: iteration, at: at(node), what: [...title, ...what].join(" · ") || undefined },
        sort: [order(iteration), maturityOrLive === "live" ? 9 : LADDER.indexOf(maturityOrLive), node.id]
      })
    }

    // Rules still to come, by the spec they belong to; a planned rule is a line of its own.
    const rulesToCome = new Map<string, Array<Node>>()
    for (const rule of graph.ofKind("rule")) {
      if (rule.attrs["toCome"] !== true || isOpen(rule)) continue
      if (plan(rule.id) !== undefined) row(rule, maturity(graph, rule) ?? "-", [`in ${graph.node(specOf(rule))?.attrs["toCome"] ? "" : "live "}${specOf(rule)}`, ...links(graph, rule, [])])
      else rulesToCome.set(specOf(rule), [...(rulesToCome.get(specOf(rule)) ?? []), rule])
    }

    for (const spec of graph.nodes) {
      if (["rule", "scenario", "code"].includes(spec.kind)) continue
      const rules = rulesToCome.get(spec.id) ?? []
      if (spec.attrs["toCome"] === true) {
        const n = graph.rulesOf(spec.id).filter(toCome).length
        const ex = examples(graph, spec.id)
        const open = graph.rulesOf(spec.id).filter(isOpen).length
        row(spec, (spec.attrs["maturity"] as string | undefined) ?? "-", [
          ...(n ? [`rules ${n}`] : []),
          ...(ex === undefined ? [] : [`ex ${ex}`]),
          ...(open ? [`open ${open}`] : []),
          ...links(graph, spec, rules)
        ])
      } else if (rules.length > 0) {
        // A live spec: its rules still to come, as `maturity :line :line`, read in the file at those lines.
        const byMaturity = new Map<string, Array<number>>()
        for (const r of rules) byMaturity.set(maturity(graph, r) ?? "-", [...(byMaturity.get(maturity(graph, r) ?? "-") ?? []), r.line ?? 0])
        const lines = [...byMaturity].map(([m, ls]) => `${m} ${ls.map((l) => `:${l}`).join(" ")}`).join("; ")
        row(spec, "live", [`rules ${rules.length}: ${lines}`, ...links(graph, spec, rules)])
      }
    }
    const compare = (a: ReadonlyArray<number | string>, b: ReadonlyArray<number | string>) => {
      for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i]! < b[i]! ? -1 : 1
      return 0
    }
    return rows.sort((a, b) => compare(a.sort, b.sort)).map((r) => r.row)
  }
} satisfies Recipe
