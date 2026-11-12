import { annotate } from "sdp/annotations"
import { Predicate } from "effect"
import { check } from "../check/Check.ts"
import { tally } from "../model/Graph.ts"
import { hasKind, made } from "../model/Vocabulary.ts"
import { isGate } from "../run/Evidence.ts"
import type { Project } from "./Build.ts"
import { stageLadder } from "./Query.ts"

/** Counts by word, the words of `order` first and in that order: a report reads along its ladder, as JSON too. */
const counted = (values: ReadonlyArray<unknown>, order: ReadonlyArray<string> = []): Readonly<Record<string, number>> => {
  const counts = tally(values.map(String))
  const words = [...order.filter((word) => Object.hasOwn(counts, word)), ...Object.keys(counts).filter((word) => !order.includes(word))]
  return Object.fromEntries(words.map((word) => [word, counts[word]!]))
}

const resultOrder = ["passed", "failed", "pending", "undefined", "unrun", "stale"]

/** One-screen summary of the delivery state: what `sdp status` and the MCP tool answer with. */
export const statusSummary = (project: Project) => {
  const { graph } = project
  const vocabulary = project.config.vocabulary
  const gates = new Set(project.specs.flatMap((spec) => spec.scenarios.filter((s) => isGate(s, spec, vocabulary)).map((s) => s.id)))
  const scenarios = graph.ofKind([made.kinds.scenario])
  return {
    nodes: graph.nodes().length,
    edges: graph.edges().length,
    specFiles: project.specs.length,
    kinds: Object.fromEntries(graph.kinds()),
    relations: Object.fromEntries(graph.relations()),
    /** Counted the way every report counts stages: each node that has one. */
    stages: counted(graph.nodes().flatMap((n) => Predicate.isString(n.attrs.stage) ? [n.attrs.stage] : []), stageLadder(vocabulary).flat()),
    decisions: counted(graph.ofKind(vocabulary.kinds.decision).map((n) => n.attrs.status)),
    scenarios: counted(scenarios.filter((n) => !gates.has(n.id)).map((n) => n.attrs.status), resultOrder),
    /** Gate scenarios (of milestones, or tagged @gate), which may be unmet without anything being broken. */
    gates: counted(scenarios.filter((n) => gates.has(n.id)).map((n) => n.attrs.status), resultOrder),
    /** Stored results that no longer count, by what changed since they ran. */
    stale: counted(scenarios.filter((n) => n.attrs.staleBecause !== undefined).map((n) => n.attrs.staleBecause)),
    /** Nodes of an architectural kind: the architecture. */
    architecture: graph.nodes().filter((n) => hasKind(vocabulary, "architectural", n.kind)).length,
    diagnostics: counted(check(project).map((d) => d.severity), ["error", "warning", "info"])
  }
}
annotate(statusSummary, { is: "ARCH-reports" })

export type StatusSummary = ReturnType<typeof statusSummary>
