/**
 * The architecture: every node of an architectural kind (elements and patterns
 * unless the vocabulary says otherwise). The graph is curated — what an
 * architect declares in a spec or anchors in code is, by that act, part of the
 * architecture — so sdp never computes, ranks, limits or suggests what belongs
 * in it. The view is the architecture with the decisions and quality
 * requirements that shaped it: those linked to it, and those linked to a
 * feature linked to it or to one of that feature's rules.
 */
import { annotate } from "sdp/annotations"
import type { GraphEdge, GraphNode } from "../model/Graph.ts"
import { attribute, hasKind, isDriver, made } from "../model/Vocabulary.ts"
import type { Project } from "../graph/Build.ts"

/**
 * How a driver reaches an architectural node through a feature linked to it: the nodes from the
 * architectural node, through the feature — and its rule, when the rule is what is linked — to the
 * driver, with the edge walked between each two of them.
 */
export interface Route {
  readonly nodes: ReadonlyArray<string>
  readonly edges: ReadonlyArray<GraphEdge>
}

export interface ArchitectureView {
  /** The architectural nodes, then the drivers that shaped them. */
  readonly nodes: ReadonlyArray<GraphNode>
  /** The links among them. */
  readonly edges: ReadonlyArray<GraphEdge>
  /** The drivers that shaped an architectural node through a feature, each by every route it takes. */
  readonly routes: ReadonlyArray<Route>
}

/**
 * Every architectural node and the decisions and quality requirements that shaped it — linked to
 * it, or to a feature linked to it or one of that feature's rules — and nothing else. This is the
 * view to hand to a person or an agent designing a change.
 */
export const architectureView = (project: Project): ArchitectureView => {
  const { graph } = project
  const vocabulary = project.config.vocabulary
  const architectural = (node: GraphNode) => hasKind(vocabulary, "architectural", node.kind)
  const driver = (node: GraphNode | undefined): node is GraphNode => node !== undefined && isDriver(vocabulary, node) && !architectural(node)
  const architecture = graph.nodes().filter(architectural)
  const keep = new Set(architecture.map((node) => node.id))
  const routes: Array<Route> = []
  for (const node of architecture) {
    for (const { edge: linked, other } of graph.neighbours(node.id)) {
      const o = graph.node(other)
      if (driver(o)) keep.add(o.id)
      if (!o || !hasKind(vocabulary, "feature", o.kind)) continue
      // The feature, then each of its rules: a driver linked to one of them is reached that way.
      const ways: Array<Route> = [
        { nodes: [node.id, o.id], edges: [linked] },
        ...graph.in(o.id).filter((edge) => edge.rel === made.relations.rule)
          .map((rule) => ({ nodes: [node.id, o.id, rule.from], edges: [linked, rule] }))
      ]
      for (const way of ways) {
        for (const { edge, other: shaping } of graph.neighbours(way.nodes.at(-1)!)) {
          const d = graph.node(shaping)
          if (!driver(d) || way.nodes.includes(d.id)) continue
          keep.add(d.id)
          routes.push({ nodes: [...way.nodes, d.id], edges: [...way.edges, edge] })
        }
      }
    }
  }
  const sub = graph.subgraph(keep)
  return { nodes: sub.nodes(), edges: sub.edges(), routes }
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
