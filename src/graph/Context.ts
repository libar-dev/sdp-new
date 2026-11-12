/**
 * A context bundle: everything an agent (or a new team member) needs to work
 * on one node, as a single Markdown document — the spec itself, its
 * relationships, scenario status, the curated architecture and decisions in
 * reach, and the code locations already linked to it. Architecture nobody
 * marked significant appears only as a direct relationship.
 */
import { Predicate } from "effect"
import { architectureView, isSignificant } from "../arch/Architecture.ts"
import { formatSource, type GraphNode } from "../model/Graph.ts"
import { isActive, type Project } from "./Build.ts"

export const contextBundle = (project: Project, id: string, depth = 2): string | undefined => {
  const { graph } = project
  const node = graph.node(id)
  if (!node) return undefined
  const spec = project.specById.get(id)
  const out: Array<string> = []
  const describe = (n: GraphNode) => `${n.id} — ${n.title} (${n.kind}${statusOf(n)}) ${formatSource(n.source)}`.trimEnd()

  out.push(`# ${node.id} — ${node.title}`, "")
  out.push(`kind: ${node.kind}${statusOf(node)}  ·  source: ${formatSource(node.source) || "n/a"}`, "")
  const attrs = Object.entries(node.attrs).filter(([k]) => !["summary", "file", "title"].includes(k))
  if (attrs.length > 0) {
    out.push("```yaml", ...attrs.map(([k, v]) => `${k}: ${JSON.stringify(v)}`), "```", "")
  }
  if (spec) out.push("## Specification", "", spec.body.trim(), "")

  const outgoing = graph.out(id).filter((e) => e.rel !== "verifies")
  const incoming = graph.in(id).filter((e) => e.rel !== "verifies")
  if (outgoing.length + incoming.length > 0) {
    out.push("## Relationships", "")
    for (const e of outgoing) {
      const other = graph.node(e.to)
      out.push(`- ${node.id} -${e.rel}-> ${other ? describe(other) : e.to}`)
    }
    for (const e of incoming) {
      const other = graph.node(e.from)
      out.push(`- ${node.id} <-${e.rel}- ${other ? describe(other) : e.from}`)
    }
    out.push("")
  }

  if (spec && spec.scenarios.length > 0) {
    out.push(`## Scenarios (${spec.scenarios.length})`, "")
    for (const s of spec.scenarios) {
      const status = graph.node(s.id)?.attrs.status ?? "unrun"
      out.push(`- [${String(status)}] ${s.name} — ${spec.file}:${s.line}`)
      const result = project.results?.scenarios[s.id]
      if (result && result.hash === s.hash) {
        for (const pickle of result.pickles) {
          for (const step of pickle.steps.filter((st) => st.status !== "passed" && st.status !== "skipped")) {
            out.push(`  - ${step.status}: ${step.keyword} ${step.text}${step.error ? ` — ${step.error.split("\n")[0]}` : ""}`)
            if (step.snippet) out.push(`    suggested: \`${step.snippet}\``)
          }
        }
      }
    }
    out.push("")
  }

  // Curated context within reach: significant nodes, the patterns of the curated view, decisions.
  const reach = neighbourhood(project, id, depth)
  const curated = new Set(architectureView(project).nodes.map((n) => n.id))
  const significant = reach.filter((n) => isSignificant(n) && n.id !== id)
  // Decisions that no longer apply (superseded, rejected, deprecated) are not context for new work.
  const decisions = reach.filter((n) => n.kind === "decision" && n.id !== id && isActive(n))
  const patterns = reach.filter((n) => n.kind === "pattern" && n.id !== id && curated.has(n.id) && !isSignificant(n))
  if (significant.length > 0) {
    out.push(`## Significant architecture within ${depth} hops`, "")
    for (const n of significant) {
      out.push(`- ${describe(n)}${Predicate.isString(n.attrs.rationale) ? `\n  rationale: ${n.attrs.rationale}` : ""}`)
    }
    out.push("")
  }
  if (patterns.length > 0) out.push("## Patterns", "", ...patterns.map((n) => `- ${describe(n)}`), "")
  if (decisions.length > 0) {
    out.push("## Decisions in reach", "")
    for (const n of decisions) out.push(`- ${describe(n)}${n.attrs.summary ? `\n  ${String(n.attrs.summary)}` : ""}`)
    out.push("")
  }
  const code = reach.filter((n) => n.kind === "code")
  if (code.length > 0) out.push("## Code", "", ...code.map((n) => `- ${n.title} — ${formatSource(n.source)}`), "")
  return out.join("\n")
}

const statusOf = (node: GraphNode) => {
  const parts = [
    node.attrs.maturity !== undefined ? `maturity: ${String(node.attrs.maturity)}` : undefined,
    node.attrs.stage !== undefined && node.attrs.stage !== node.attrs.maturity ? `stage: ${String(node.attrs.stage)}` : undefined,
    node.kind === "decision" && node.attrs.status !== undefined ? `status: ${String(node.attrs.status)}` : undefined,
    node.attrs.significant === true ? "significant" : undefined
  ].filter(Predicate.isString)
  return parts.length > 0 ? `, ${parts.join(", ")}` : ""
}

/** Nodes within `depth` hops in either direction, skipping scenario fan-out. */
export const neighbourhood = (project: Project, id: string, depth: number): ReadonlyArray<GraphNode> => {
  const { graph } = project
  const seen = new Set([id])
  let frontier = [id]
  for (let d = 0; d < depth; d++) {
    const next: Array<string> = []
    for (const current of frontier) {
      for (const { other } of graph.neighbours(current)) {
        if (seen.has(other)) continue
        seen.add(other)
        if (graph.node(other)?.kind !== "scenario") next.push(other)
      }
    }
    frontier = next
  }
  return [...seen].flatMap((n) => {
    const node = graph.node(n)
    return node ? [node] : []
  })
}
