import { annotate } from "sdp/annotations"
import { Predicate } from "effect"
import { check } from "../check/Check.ts"
import { tally } from "../model/Graph.ts"
import { hasKind, made } from "../model/Vocabulary.ts"
import { isGate } from "../run/Evidence.ts"
import type { Project } from "./Build.ts"

/** One-screen summary of the delivery state, shared by `sdp status` and the MCP server. */
export const statusSummary = (project: Project) => {
  const { graph } = project
  const vocabulary = project.config.vocabulary
  const gates = new Set(project.specs.flatMap((spec) => spec.scenarios.filter((s) => isGate(s, spec, vocabulary)).map((s) => s.id)))
  const scenarios = graph.ofKind([made.kinds.scenario])
  const strings = (values: ReadonlyArray<unknown>) => tally(values.map(String))
  return {
    nodes: graph.nodes().length,
    edges: graph.edges().length,
    specFiles: project.specs.length,
    kinds: Object.fromEntries(graph.kinds()),
    relations: Object.fromEntries(graph.relations()),
    /** Counted the way every report counts stages: each node that has one. */
    stages: tally(graph.nodes().flatMap((n) => Predicate.isString(n.attrs.stage) ? [n.attrs.stage] : [])),
    decisions: strings(graph.ofKind(vocabulary.kinds.decision).map((n) => n.attrs.status)),
    scenarios: strings(scenarios.filter((n) => !gates.has(n.id)).map((n) => n.attrs.status)),
    /** Gate scenarios (of milestones, or tagged @gate), which may be unmet without anything being broken. */
    gates: strings(scenarios.filter((n) => gates.has(n.id)).map((n) => n.attrs.status)),
    /** Stored results that no longer count, by what changed since they ran. */
    stale: strings(scenarios.filter((n) => n.attrs.staleBecause !== undefined).map((n) => n.attrs.staleBecause)),
    /** Nodes of an architectural kind: the architecture. */
    architecture: graph.nodes().filter((n) => hasKind(vocabulary, "architectural", n.kind)).length,
    diagnostics: tally(check(project).map((d) => d.severity))
  }
}
annotate(statusSummary, { is: "ARCH-reports" })
