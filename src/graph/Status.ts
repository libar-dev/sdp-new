import { annotate } from "../annotations.ts"
import { architectureSummary } from "../arch/Architecture.ts"
import { check } from "../check/Check.ts"
import { isGate, type Project } from "./Build.ts"

const tally = (values: ReadonlyArray<unknown>) => {
  const counts: Record<string, number> = {}
  for (const v of values) counts[String(v)] = (counts[String(v)] ?? 0) + 1
  return counts
}

/** One-screen summary of the delivery state, shared by `sdp status` and the MCP server. */
export const statusSummary = (project: Project) => {
  const { graph } = project
  const architecture = architectureSummary(project)
  const gates = new Set(project.specs.flatMap((spec) => spec.scenarios.filter((s) => isGate(s, spec)).map((s) => s.id)))
  const scenarios = graph.ofKind("scenario")
  return {
    nodes: graph.nodes.size,
    edges: graph.edges.length,
    specFiles: project.specs.length,
    kinds: Object.fromEntries(graph.kinds()),
    relations: Object.fromEntries(graph.relations()),
    stages: tally([...graph.nodes.values()].filter((n) => n.attrs.maturity !== undefined).map((n) => n.attrs.stage)),
    decisions: tally(graph.ofKind("decision").map((n) => n.attrs.status)),
    scenarios: tally(scenarios.filter((n) => !gates.has(n.id)).map((n) => n.attrs.status)),
    /** Gate scenarios (of milestones, or tagged @gate), which may be unmet without anything being broken. */
    gates: tally(scenarios.filter((n) => gates.has(n.id)).map((n) => n.attrs.status)),
    /** Stored results that no longer count, by what changed since they ran. */
    stale: tally(scenarios.filter((n) => n.attrs.staleBecause !== undefined).map((n) => n.attrs.staleBecause)),
    architecture: {
      significant: architecture.significant.length,
      declared: architecture.declared.length
    },
    diagnostics: tally(check(project).map((d) => d.severity))
  }
}
annotate(statusSummary, { is: "ARCH-reports" })
