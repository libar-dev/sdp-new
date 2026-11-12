/**
 * The architecture: every node of an architectural kind (elements and patterns
 * unless the vocabulary says otherwise). The graph is curated — what an
 * architect declares in a spec or anchors in code is, by that act, part of the
 * architecture — so sdp never computes, ranks, limits or suggests what belongs
 * in it. The view is the architecture with the decisions and quality
 * requirements linked to it.
 */
import { annotate } from "sdp/annotations"
import type { GraphEdge, GraphNode } from "../model/Graph.ts"
import { attribute, hasKind, isDriver, isMention } from "../model/Vocabulary.ts"
import type { Project } from "../graph/Build.ts"

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
 * What an architectural node says it is for: the first paragraph of its spec. One declared
 * without a description is described by the code anchored to it, in that code's own words.
 */
export const description = (project: Project, node: GraphNode): ReadonlyArray<string> => {
  const { graph } = project
  const summary = attribute(node, "summary")
  if (typeof summary === "string" && summary !== "") return [summary]
  return graph.in(node.id)
    .filter((edge) => edge.rel === project.config.vocabulary.relations.anchor)
    .flatMap((edge) => {
      const doc = graph.node(edge.from)?.attrs.doc
      return typeof doc === "string" ? [doc] : []
    })
}
