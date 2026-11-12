/**
 * The architecture: every node of an architectural kind (elements and patterns
 * unless the vocabulary says otherwise). The graph is curated — what an
 * architect declares in a spec or anchors in code is, by that act, part of the
 * architecture — so sdp never computes, ranks, limits or suggests what belongs
 * in it. It shows the architecture with the decisions and quality requirements
 * linked to it.
 */
import { annotate } from "sdp/annotations"
import { formatSource, type GraphEdge, type GraphNode } from "../model/Graph.ts"
import { hasKind, isDriver, isMention } from "../model/Vocabulary.ts"
import type { Project } from "../graph/Build.ts"
import { nodeJson } from "../graph/Export.ts"

export interface ArchitectureView {
  /** The architectural nodes, then the drivers linked to them. */
  readonly nodes: ReadonlyArray<GraphNode>
  readonly edges: ReadonlyArray<GraphEdge>
}

/**
 * Every architectural node and the decisions and quality requirements linked to it — and nothing
 * else. A prose mention links nothing, so it pulls nothing in. This is the view to hand to a person
 * or an agent designing a change.
 */
export const architectureView = (project: Project): ArchitectureView => {
  const { graph } = project
  const vocabulary = project.config.vocabulary
  const architecture = graph.nodes().filter((node) => hasKind(vocabulary, "architectural", node.kind))
  const keep = new Set(architecture.map((node) => node.id))
  for (const node of architecture) {
    for (const { edge, other } of graph.neighbours(node.id)) {
      const o = graph.node(other)
      if (o && !isMention(vocabulary, edge) && isDriver(vocabulary, o)) keep.add(o.id)
    }
  }
  const sub = graph.subgraph(keep)
  return { nodes: sub.nodes(), edges: sub.edges().filter((edge) => !isMention(vocabulary, edge)) }
}
annotate(architectureView, { is: "ARCH-architecture-view" })

/**
 * The view as text: each architectural node with what its spec says it is for and its links;
 * the decisions and quality requirements appear as the nodes it links to.
 */
export const renderArchitecture = (project: Project): string => {
  const { graph } = project
  const vocabulary = project.config.vocabulary
  const view = architectureView(project)
  const architecture = view.nodes.filter((node) => hasKind(vocabulary, "architectural", node.kind))
  const title = (id: string) => graph.node(id)?.title ?? ""
  const lines = [`Architecture: ${architecture.length} node(s) of the kinds ${vocabulary.kinds.architectural.join(", ")}`]
  for (const node of architecture) {
    lines.push("", `${node.id} — ${node.title} (${node.kind})  ${formatSource(node.source)}`.trimEnd())
    if (typeof node.attrs.summary === "string") lines.push(`  ${node.attrs.summary}`)
    for (const edge of view.edges.filter((e) => e.from === node.id)) lines.push(`  ${node.id} -${edge.rel}-> ${edge.to}  ${title(edge.to)}`)
    for (const edge of view.edges.filter((e) => e.to === node.id)) lines.push(`  ${node.id} <-${edge.rel}- ${edge.from}  ${title(edge.from)}`)
  }
  return lines.join("\n") + "\n"
}

/** The view as JSON — one shape for `sdp arch --format json` and the MCP tool. */
export const architectureJson = (project: Project) => {
  const view = architectureView(project)
  return {
    nodes: view.nodes.map(nodeJson),
    edges: view.edges.map((e) => ({ from: e.from, rel: e.rel, to: e.to }))
  }
}
