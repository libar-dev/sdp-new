/**
 * 4 open: every question that waits on the owner — a rule tagged `@open`, its name the question —
 * with the maturity of the work it holds up, or `built` when it is about what is built. A spec still
 * to come is refined by answering these; none is answered by building.
 */
import { at, isOpen, maturity, type Recipe, specOf } from "../lib.ts"

export default {
  title: "questions that wait on the owner",
  asks: ["graph"],
  legend: "open spec maturity|built file:line question",
  rows: ({ graph }) =>
    graph
      .ofKind("rule")
      .filter(isOpen)
      .map((rule) => ({ rec: "open", spec: specOf(rule), maturity: maturity(graph, rule) ?? "built", at: at(rule), question: rule.title }))
} satisfies Recipe
