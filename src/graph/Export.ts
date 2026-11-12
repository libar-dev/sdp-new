/**
 * The graph as plain data. A node and an edge are each one record with stable
 * field names (ask-the-graph), and `sdp graph` prints one record per line,
 * so grep, jq or a few lines of script answer what `sdp q` answers:
 *
 *   sdp graph | grep '"rel":"decided-by"'
 *   sdp graph | jq -r 'select(.type == "node" and .attrs.maturity == "ready") | .id'
 *
 * Every JSON answer of sdp is made of the same records.
 */
import { annotate } from "sdp/annotations"
import type { Attrs, Graph, GraphEdge, GraphNode, SourceRef } from "../model/Graph.ts"
import { hasKind, made, type Vocabulary } from "../model/Vocabulary.ts"

export interface NodeRecord {
  readonly type: "node"
  readonly id: string
  readonly kind: string
  readonly title: string
  /** Where the node is declared; `null` for a node nothing declares — the target of a dangling link. */
  readonly file: string | null
  readonly line: number | null
  /** Every attribute, written or derived. */
  readonly attrs: Attrs
}

export interface EdgeRecord {
  readonly type: "edge"
  readonly from: string
  readonly rel: string
  readonly to: string
  /** The attributes its declarations give it; empty when they give none. */
  readonly attrs: Attrs
  /** Every declaration that states the edge, in the order they were read. */
  readonly declared: ReadonlyArray<SourceRef>
}

export type GraphRecord = NodeRecord | EdgeRecord

export const nodeRecord = (node: GraphNode): NodeRecord => ({
  type: "node",
  id: node.id,
  kind: node.kind,
  title: node.title,
  file: node.source?.file ?? null,
  line: node.source?.line ?? null,
  attrs: node.attrs
})

export const edgeRecord = (edge: GraphEdge): EdgeRecord => ({
  type: "edge",
  from: edge.from,
  rel: edge.rel,
  to: edge.to,
  attrs: edge.attrs ?? {},
  declared: edge.sources ?? (edge.source ? [edge.source] : [])
})

/** The whole graph as records: every node, then every edge. */
export const graphRecords = (graph: Graph): ReadonlyArray<GraphRecord> => [
  ...graph.nodes().map(nodeRecord),
  ...graph.edges().map(edgeRecord)
]
annotate(graphRecords, { is: "ARCH-reports" })

/** One JSON value per line. JSON escapes tabs and line breaks, so a record never spans two lines. */
export const jsonLines = (records: ReadonlyArray<unknown>): string => records.map((record) => `${JSON.stringify(record)}\n`).join("")

/** How the diagram draws a node: by the role its kind plays, else by the kind sdp made it. */
const shapeOf = (vocabulary: Vocabulary, kind: string): readonly [string, string] =>
  hasKind(vocabulary, "decision", kind)
    ? ["[/", "/]"]
    : hasKind(vocabulary, "pattern", kind)
    ? ["{{", "}}"]
    : hasKind(vocabulary, "milestone", kind)
    ? ["{", "}"]
    : kind === made.kinds.scenario
    ? ["([", "])"]
    : kind === made.kinds.code
    ? ["[[", "]]"]
    : ["[", "]"]

/** The graph as a Mermaid flowchart; decisions, patterns, milestones, scenarios and code each have a shape of their own. */
export const mermaid = (graph: Graph, vocabulary: Vocabulary): string => {
  const ids = new Map<string, string>()
  const ref = (id: string) => {
    let short = ids.get(id)
    if (!short) {
      short = `n${ids.size}`
      ids.set(id, short)
    }
    return short
  }
  const label = (s: string) => s.replace(/"/g, "#quot;")
  const lines = ["flowchart LR"]
  for (const n of graph.nodes()) {
    const [l, r] = shapeOf(vocabulary, n.kind)
    lines.push(`  ${ref(n.id)}${l}"${label(n.id)}<br/><small>${label(n.title)}</small>"${r}`)
  }
  for (const e of graph.edges()) lines.push(`  ${ref(e.from)} -->|${label(e.rel)}| ${ref(e.to)}`)
  return lines.join("\n") + "\n"
}
