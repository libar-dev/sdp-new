/**
 * Architectural significance is curated, not inferred. Typically 10% or fewer
 * of a system's abstractions shape its architecture; the rest is design detail.
 * This module measures the curated set against that budget, checks that every
 * significant element earns its place (a rationale and a link to a decision or
 * quality requirement), and suggests candidates for humans to promote or demote.
 */
import { Predicate } from "effect"
import type { Graph, GraphEdge, GraphNode } from "../model/Graph.ts"
import type { Project } from "../graph/Build.ts"

// @sdp is ARCH-significance

export interface SignificanceReport {
  readonly significant: ReadonlyArray<GraphNode>
  /** Declared architecture nodes not (yet) marked significant. */
  readonly declared: ReadonlyArray<GraphNode>
  /** Abstractions counted in code by the inventory scan. */
  readonly inventory: number
  /** max(inventory, declared architecture nodes): the population significance is measured against. */
  readonly population: number
  readonly ratio: number
  readonly budget: number
  /** How many significant nodes the budget allows: max(1, floor(budget × population)). */
  readonly allowed: number
  readonly overBudget: boolean
  /** Significant nodes without a rationale. */
  readonly withoutRationale: ReadonlyArray<GraphNode>
  /** Significant nodes not linked to any decision or quality requirement. */
  readonly unjustified: ReadonlyArray<GraphNode>
}

export const isSignificant = (node: GraphNode): boolean =>
  node.attrs.significant === true || node.attrs.significant === "true" || node.attrs.significant === "yes"

export const isArchitectural = (project: Project, node: GraphNode): boolean =>
  project.config.architecture.kinds.includes(node.kind) || node.attrs.significant !== undefined

/** A node justifies significance when it is a decision or a quality (non-functional) requirement. */
export const isJustifier = (project: Project, node: GraphNode): boolean =>
  project.config.architecture.justifiedBy.includes(node.kind) ||
  ["quality", "non-functional", "nfr", "constraint"].includes(String(node.attrs.type ?? "").toLowerCase())

export const significance = (project: Project): SignificanceReport => {
  const { graph } = project
  const architectural = [...graph.nodes.values()].filter((node) => isArchitectural(project, node))
  const significant = architectural.filter(isSignificant)
  const declared = architectural.filter((node) => !isSignificant(node))
  const population = Math.max(project.inventory, architectural.length)
  const ratio = population === 0 ? 0 : significant.length / population
  const budget = project.config.architecture.significanceBudget
  // A percentage must not forbid small systems from naming their one significant element.
  const allowed = Math.max(1, Math.floor(budget * population))
  return {
    significant,
    declared,
    inventory: project.inventory,
    population,
    ratio,
    budget,
    allowed,
    overBudget: significant.length > allowed,
    withoutRationale: significant.filter((node) => !Predicate.isString(node.attrs.rationale) || node.attrs.rationale.trim() === ""),
    unjustified: significant.filter((node) => !justifiers(project, node).length)
  }
}

export const justifiers = (project: Project, node: GraphNode): ReadonlyArray<GraphNode> =>
  project.graph.neighbours(node.id)
    .map(({ other }) => project.graph.node(other))
    .filter((other): other is GraphNode => other !== undefined && isJustifier(project, other))

export interface Candidate {
  readonly node: GraphNode
  readonly score: number
  readonly reasons: ReadonlyArray<string>
}

/**
 * Ranks non-significant architecture nodes (and annotated code) by signals that
 * often indicate significance: links from decisions and quality requirements,
 * fan-in, and how many requirements depend on them. Suggestions only.
 */
export const rankCandidates = (project: Project, limit = 10): ReadonlyArray<Candidate> => {
  const { graph } = project
  const candidates: Array<Candidate> = []
  for (const node of graph.nodes.values()) {
    if (isSignificant(node)) continue
    if (!isArchitectural(project, node) && node.kind !== "code") continue
    const neighbours = graph.neighbours(node.id)
    const decisions = new Set<string>()
    const qualities = new Set<string>()
    const requirements = new Set<string>()
    for (const { other } of neighbours) {
      const o = graph.node(other)
      if (!o) continue
      if (o.kind === "decision") decisions.add(o.id)
      else if (isJustifier(project, o)) qualities.add(o.id)
      else if (Predicate.isString(o.attrs.maturity)) requirements.add(o.id)
    }
    const fanIn = graph.in(node.id).length
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

export interface ArchitectureView {
  readonly nodes: ReadonlyArray<GraphNode>
  readonly edges: ReadonlyArray<GraphEdge>
}

/**
 * The curated architecture: significant nodes, the patterns they instantiate,
 * and the decisions and quality requirements that justify them — and nothing
 * else. This is the view to hand to a person or an agent designing a change.
 */
export const architectureView = (project: Project, options: { readonly withJustifiers?: boolean } = {}): ArchitectureView => {
  const { graph } = project
  const keep = new Set<string>()
  for (const node of significance(project).significant) keep.add(node.id)
  for (const id of [...keep]) {
    for (const { other } of graph.neighbours(id)) {
      const o = graph.node(other)
      if (!o) continue
      if (o.kind === "pattern") keep.add(o.id)
      if (options.withJustifiers !== false && isJustifier(project, o)) keep.add(o.id)
    }
  }
  const sub: Graph = graph.subgraph(keep)
  return { nodes: [...sub.nodes.values()], edges: sub.edges }
}
