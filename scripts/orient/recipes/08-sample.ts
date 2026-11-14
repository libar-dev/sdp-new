/**
 * 8 sample — HARD-CODED for now: a few features still to come, each walked from its spec to the code
 * it will change, as the annotations of b0574ca/573ff73 let the graph do. One block per feature:
 * its rules (the requirements), the decisions it rests on, its epic, then each element it is
 * realized by — what the element is for, the code that is it, the patterns it applies, what it
 * imports, and the other features already realized by it (where its existing behavior is specified).
 * The route is `feature -realized-by-> element <-is- code`; every line points to file:line.
 */
import { at, clip, examples, maturity, type Recipe, type Row, sentence, toCome } from "../lib.ts"

/** The features walked: one that changes the vocabulary and the checker, one that adds a command. */
const SAMPLE = ["keep-a-vocabulary", "list-the-open-questions"]

export default {
  title: "work still to come, walked to the code it will change (hard-coded)",
  asks: ["graph"],
  legend: "rec hop id file:line what · hop: the link walked from the feature, `  ` under an element",
  rows: ({ graph, json }) => {
    const cut = (text: string | undefined, max: number) => (json ? text : clip(text, max))
    const rows: Array<Row> = []
    for (const id of SAMPLE) {
      const feature = graph.node(id)
      if (!feature) {
        rows.push({ rec: "missing", hop: "-", id, at: "-", what: "no such node in this workspace" })
        continue
      }
      const rules = graph.rulesOf(id)
      rows.push({
        rec: "feature",
        hop: "start",
        id,
        at: at(feature),
        what: `${maturity(graph, feature) ?? "live"} · ${rules.length} rules · ex ${examples(graph, id) ?? "none"} · ${feature.title}`
      })
      for (const rule of rules) {
        const open = ((rule.attrs["tags"] as ReadonlyArray<string> | undefined) ?? []).includes("@open")
        rows.push({
          rec: open ? "open" : "rule",
          hop: "<-rule-of-",
          id: rule.id.split("#")[1],
          at: at(rule),
          what: `${open ? "question" : toCome(rule) ? maturity(graph, rule) ?? "to come" : "live"} · ${cut(rule.title, 100)}`
        })
      }
      const decisions = new Set([id, ...rules.map((r) => r.id)].flatMap((from) => graph.out(from, "decided-by").map((e) => e.to)))
      for (const decision of decisions) {
        const node = graph.node(decision)
        rows.push({ rec: "decision", hop: "-decided-by->", id: decision, at: node ? at(node) : "-", what: cut(node?.title, 100) })
      }
      for (const epic of graph.into(id, "includes").map((e) => e.from)) {
        const siblings = graph.out(epic, "includes").map((e) => e.to).filter((to) => to !== id)
        rows.push({ rec: "epic", hop: "<-includes-", id: epic, at: at(graph.node(epic)!), what: `with ${siblings.join(", ") || "nothing else"}` })
      }
      for (const element of graph.out(id, "realized-by").map((e) => e.to)) {
        const node = graph.node(element)
        const code = graph.into(element, "is").map((e) => graph.node(e.from)).filter((n) => n !== undefined)
        const purpose = code.map((c) => c.attrs["doc"] as string | undefined).find((doc) => doc)
        rows.push({ rec: "element", hop: "-realized-by->", id: element, at: node ? at(node) : "-", what: cut(sentence(purpose, 140), 140) ?? "(no doc comment says what it is for)" })
        for (const c of code) {
          rows.push({ rec: "code", hop: "  <-is-", id: c.id.replace(/^code:/, ""), at: at(c), what: cut(sentence(c.attrs["doc"] as string | undefined, 90), 90) })
        }
        const patterns = graph.out(element, "applies").map((e) => e.to)
        if (patterns.length > 0) rows.push({ rec: "applies", hop: "  -applies->", id: patterns.join(","), at: "-", what: "read the pattern's declaration before writing code of its kind" })
        const imports = graph.out(element, "imports").map((e) => e.to)
        rows.push({ rec: "imports", hop: "  -imports->", id: imports.join(",") || "-", at: "-", what: "derived from the code: what a change here may reach" })
        const also = graph.into(element, "realized-by").map((e) => graph.node(e.from)).filter((n) => n !== undefined && n.id !== id)
        const live = also.filter((n) => !toCome(n!)).map((n) => n!.id)
        const coming = also.filter((n) => toCome(n!)).map((n) => n!.id)
        rows.push({ rec: "also", hop: "  <-realized-by-", id: live.join(",") || "-", at: "-", what: `live specs of its behavior today${coming.length > 0 ? ` · also to come: ${coming.join(",")}` : ""}` })
      }
    }
    return rows
  }
} satisfies Recipe
