/**
 * The curated architecture. Which elements and patterns are architecturally
 * significant is the architect's decision, recorded as `significant: true`
 * (with a `rationale` saying why). sdp never computes, limits or checks
 * significance. It shows the curated set together with the patterns it applies
 * and the decisions and quality requirements around it, and can suggest
 * candidates for an architect to consider.
 */
import { Predicate } from "effect"
import type { GraphEdge, GraphNode } from "../model/Graph.ts"
import type { Project } from "../graph/Build.ts"
import { nodeJson } from "../graph/Export.ts"

// @sdp is ARCH-architecture-view

export const isSignificant = (node: GraphNode): boolean =>
  node.attrs.significant === true || node.attrs.significant === "true" || node.attrs.significant === "yes"

/** Nodes of an architectural kind (elements, patterns, ...) or carrying a `significant` attribute. */
export const isArchitectural = (project: Project, node: GraphNode): boolean =>
  project.config.architecture.kinds.includes(node.kind) || node.attrs.significant !== undefined

/** Architectural drivers: decisions and quality (non-functional) requirements. */
export const isDriver = (project: Project, node: GraphNode): boolean =>
  project.config.architecture.drivers.includes(node.kind) ||
  ["quality", "non-functional", "nfr", "constraint"].includes(String(node.attrs.type ?? "").toLowerCase())

export interface ArchitectureSummary {
  /** Marked significant by an architect. */
  readonly significant: ReadonlyArray<GraphNode>
  /** Declared architectural nodes that are not marked significant. */
  readonly declared: ReadonlyArray<GraphNode>
}

export const architectureSummary = (project: Project): ArchitectureSummary => {
  const architectural = [...project.graph.nodes.values()].filter((node) => isArchitectural(project, node))
  return { significant: architectural.filter(isSignificant), declared: architectural.filter((node) => !isSignificant(node)) }
}

export interface Candidate {
  readonly node: GraphNode
  readonly score: number
  readonly reasons: ReadonlyArray<string>
}

/**
 * Ranks non-significant architectural nodes (and annotated code) by signals an
 * architect may find worth a look: links from decisions and quality
 * requirements, requirements depending on them, and fan-in. Suggestions only.
 */
export const rankCandidates = (project: Project, limit = 10): ReadonlyArray<Candidate> => {
  const { graph } = project
  const candidates: Array<Candidate> = []
  for (const node of graph.nodes.values()) {
    if (isSignificant(node)) continue
    if (!isArchitectural(project, node) && node.kind !== "code") continue
    const decisions = new Set<string>()
    const qualities = new Set<string>()
    const requirements = new Set<string>()
    for (const { edge, other } of graph.neighbours(node.id)) {
      const o = graph.node(other)
      if (!o || !isDesignLink(edge, o)) continue
      if (o.kind === "decision") decisions.add(o.id)
      else if (isDriver(project, o)) qualities.add(o.id)
      else if (Predicate.isString(o.attrs.maturity)) requirements.add(o.id)
    }
    const fanIn = graph.in(node.id).filter((edge) => {
      const from = graph.node(edge.from)
      return from !== undefined && isDesignLink(edge, from)
    }).length
    const score = decisions.size * 3 + qualities.size * 3 + requirements.size * 2 + fanIn
    if (score === 0) continue
    const reasons = [
      decisions.size > 0 ? `${decisions.size} decision(s): ${[...decisions].join(", ")}` : undefined,
      qualities.size > 0 ? `${qualities.size} quality requirement(s): ${[...qualities].join(", ")}` : undefined,
      requirements.size > 0 ? `${requirements.size} requirement(s) depend on it` : undefined,
      fanIn > 0 ? `fan-in ${fanIn}` : undefined
    ].filter(Predicate.isString)
    candidates.push({ node, score, reasons })
  }
  return candidates.sort((a, b) => b.score - a.score || a.node.id.localeCompare(b.node.id)).slice(0, limit)
}

/**
 * Links that say something about the design. Scenarios verifying a spec, prose
 * mentions and code anchors only show that something is specified, talked about
 * or implemented — writing more of them must not make an element look central.
 */
const isDesignLink = (edge: GraphEdge, other: GraphNode) =>
  edge.rel !== "verifies" && edge.rel !== "mentions" && other.kind !== "scenario" && other.kind !== "code"

export interface ArchitectureView {
  readonly nodes: ReadonlyArray<GraphNode>
  readonly edges: ReadonlyArray<GraphEdge>
}

/**
 * Significant nodes, the patterns they apply, and the decisions and quality
 * requirements linked to them — and nothing else. This is the view to hand to
 * a person or an agent designing a change.
 */
export const architectureView = (project: Project): ArchitectureView => {
  const { graph } = project
  const keep = new Set(architectureSummary(project).significant.map((node) => node.id))
  for (const id of [...keep]) {
    for (const { other } of graph.neighbours(id)) {
      const o = graph.node(other)
      if (o && (o.kind === "pattern" || isDriver(project, o))) keep.add(o.id)
    }
  }
  const sub = graph.subgraph(keep)
  return { nodes: [...sub.nodes.values()], edges: sub.edges }
}

/** The curated view as JSON — one shape for `sdp arch --format json` and the MCP tool. */
export const architectureJson = (project: Project) => {
  const summary = architectureSummary(project)
  const view = architectureView(project)
  return {
    significant: summary.significant.map((n) => n.id),
    declared: summary.declared.map((n) => n.id),
    nodes: view.nodes.map(nodeJson),
    edges: view.edges.map((e) => ({ from: e.from, rel: e.rel, to: e.to }))
  }
}
