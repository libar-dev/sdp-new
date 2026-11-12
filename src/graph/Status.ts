import { architectureSummary } from "../arch/Architecture.ts"
import { check } from "../check/Check.ts"
import type { Project } from "./Build.ts"

const tally = (values: ReadonlyArray<unknown>) => {
  const counts: Record<string, number> = {}
  for (const v of values) counts[String(v)] = (counts[String(v)] ?? 0) + 1
  return counts
}

/** One-screen summary of the delivery state, shared by `sdp status` and the MCP server. */
export const statusSummary = (project: Project) => {
  const { graph } = project
  const architecture = architectureSummary(project)
  return {
    nodes: graph.nodes.size,
    edges: graph.edges.length,
    specFiles: project.specs.length,
    kinds: Object.fromEntries(graph.kinds()),
    relations: Object.fromEntries(graph.relations()),
    stages: tally([...graph.nodes.values()].filter((n) => n.attrs.maturity !== undefined).map((n) => n.attrs.stage)),
    decisions: tally(graph.ofKind("decision").map((n) => n.attrs.status)),
    scenarios: tally(graph.ofKind("scenario").map((n) => n.attrs.status)),
    architecture: {
      significant: architecture.significant.length,
      declared: architecture.declared.length
    },
    diagnostics: tally(check(project).map((d) => d.severity))
  }
}
