/**
 * Graph serializations. JSONL and TSV are line-oriented on purpose: one fact
 * per line, so `grep`, `awk`, `jq -c` and `sort | uniq -c` work without any
 * sdp-specific tooling.
 *
 *   grep -P '^edge\t[^\t]*\tsupersedes\t' .sdp/graph.tsv
 *   jq -c 'select(.type=="node" and .attrs.maturity=="ready")' .sdp/graph.jsonl
 */
import { annotate } from "sdp/annotations"
import type { Graph, GraphNode } from "../model/Graph.ts"
import { formatSource } from "../model/Graph.ts"
import { attribute, hasKind, made, type Vocabulary } from "../model/Vocabulary.ts"

export const graphFormats = ["jsonl", "json", "tsv", "dot", "mermaid"] as const
export type GraphFormat = (typeof graphFormats)[number]

/**
 * Serializes the graph as JSON, JSONL, TSV, DOT or Mermaid; the line-oriented formats hold one fact
 * per line. The diagrams draw the kinds that play a role in `vocabulary` with a shape of their own.
 */
export const exportGraph = (graph: Graph, format: GraphFormat, vocabulary: Vocabulary): string => {
  switch (format) {
    case "jsonl":
      return toJsonl(graph)
    case "json":
      return `${JSON.stringify(toJson(graph), null, 2)}\n`
    case "tsv":
      return toTsv(graph)
    case "dot":
      return toDot(graph, vocabulary)
    case "mermaid":
      return toMermaid(graph, vocabulary)
  }
}
annotate(exportGraph, { is: "ARCH-reports" })

export const nodeJson = (node: GraphNode) => ({
  id: node.id,
  kind: node.kind,
  title: node.title,
  source: formatSource(node.source) || undefined,
  attrs: node.attrs
})

/** The one status word worth showing in a listing: a decision's status, else a node's stage or its status. */
export const statusCell = (vocabulary: Vocabulary, n: GraphNode): string =>
  String(
    (hasKind(vocabulary, "decision", n.kind) ? attribute(n, "status") : undefined) ?? attribute(n, "stage") ??
      attribute(n, "status") ?? ""
  )

export const toJson = (graph: Graph) => ({
  nodes: graph.nodes().map(nodeJson),
  edges: graph.edges().map((e) => ({ from: e.from, rel: e.rel, to: e.to, attrs: e.attrs, source: formatSource(e.source) || undefined }))
})

const toJsonl = (graph: Graph) => {
  const json = toJson(graph)
  return [
    ...json.nodes.map((n) => JSON.stringify({ type: "node", ...n })),
    ...json.edges.map((e) => JSON.stringify({ type: "edge", ...e }))
  ].join("\n") + "\n"
}

const cell = (value: string) => value.replace(/[\t\n\r]+/g, " ")

const toTsv = (graph: Graph) =>
  [
    ...graph.nodes().map((n) => ["node", n.id, n.kind, n.title, formatSource(n.source)].map(cell).join("\t")),
    ...graph.edges().map((e) => ["edge", e.from, e.rel, e.to, formatSource(e.source)].map(cell).join("\t"))
  ].join("\n") + "\n"

/** How a diagram draws a node: by the role its kind plays, else by the kind sdp made it. */
const shapeOf = <S>(vocabulary: Vocabulary, kind: string, shapes: {
  readonly decision: S
  readonly architectural: S
  readonly pattern: S
  readonly milestone: S
  readonly scenario: S
  readonly code: S
  readonly missing: S
  readonly other: S
}): S =>
  hasKind(vocabulary, "decision", kind)
    ? shapes.decision
    : hasKind(vocabulary, "pattern", kind)
    ? shapes.pattern
    : hasKind(vocabulary, "milestone", kind)
    ? shapes.milestone
    : hasKind(vocabulary, "architectural", kind)
    ? shapes.architectural
    : kind === made.kinds.scenario
    ? shapes.scenario
    : kind === made.kinds.code
    ? shapes.code
    : kind === made.kinds.missing
    ? shapes.missing
    : shapes.other

const dotShapes = {
  decision: "note",
  architectural: "box3d",
  pattern: "hexagon",
  scenario: "plaintext",
  code: "component",
  milestone: "diamond",
  missing: "octagon",
  other: "ellipse"
}

const toDot = (graph: Graph, vocabulary: Vocabulary) => {
  const q = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`
  const lines = ["digraph sdp {", "  rankdir=LR;", "  node [fontname=\"Helvetica\", fontsize=10];", "  edge [fontname=\"Helvetica\", fontsize=9];"]
  for (const n of graph.nodes()) {
    lines.push(`  ${q(n.id)} [label=${q(`${n.id}\n${n.title}`)}, shape=${shapeOf(vocabulary, n.kind, dotShapes)}];`)
  }
  for (const e of graph.edges()) lines.push(`  ${q(e.from)} -> ${q(e.to)} [label=${q(e.rel)}];`)
  lines.push("}")
  return lines.join("\n") + "\n"
}

const mermaidShapes: Parameters<typeof shapeOf<readonly [string, string]>>[2] = {
  decision: ["[/", "/]"],
  architectural: ["[", "]"],
  pattern: ["{{", "}}"],
  milestone: ["{", "}"],
  scenario: ["([", "])"],
  code: ["[[", "]]"],
  missing: ["[", "]"],
  other: ["[", "]"]
}

const toMermaid = (graph: Graph, vocabulary: Vocabulary) => {
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
    const [l, r] = shapeOf(vocabulary, n.kind, mermaidShapes)
    lines.push(`  ${ref(n.id)}${l}"${label(n.id)}<br/><small>${label(n.title)}</small>"${r}`)
  }
  for (const e of graph.edges()) lines.push(`  ${ref(e.from)} -->|${label(e.rel)}| ${ref(e.to)}`)
  return lines.join("\n") + "\n"
}
