/**
 * Graph serializations. JSONL and TSV are line-oriented on purpose: one fact
 * per line, so `grep`, `awk`, `jq -c` and `sort | uniq -c` work without any
 * sdp-specific tooling.
 *
 *   grep -P '^edge\t[^\t]*\tsupersedes\t' .sdp/graph.tsv
 *   jq -c 'select(.type=="node" and .attrs.maturity=="ready")' .sdp/graph.jsonl
 */
import type { Graph, GraphNode } from "../model/Graph.ts"
import { formatSource } from "../model/Graph.ts"

export const graphFormats = ["jsonl", "json", "tsv", "dot", "mermaid"] as const
export type GraphFormat = (typeof graphFormats)[number]

export const exportGraph = (graph: Graph, format: GraphFormat): string => {
  switch (format) {
    case "jsonl":
      return toJsonl(graph)
    case "json":
      return `${JSON.stringify(toJson(graph), null, 2)}\n`
    case "tsv":
      return toTsv(graph)
    case "dot":
      return toDot(graph)
    case "mermaid":
      return toMermaid(graph)
  }
}

export const nodeJson = (node: GraphNode) => ({
  id: node.id,
  kind: node.kind,
  title: node.title,
  source: formatSource(node.source) || undefined,
  attrs: node.attrs
})

/** The one status word worth showing in a listing: a decision's status, a spec's stage, or significance. */
export const statusCell = (n: GraphNode): string =>
  String((n.kind === "decision" ? n.attrs.status : undefined) ?? n.attrs.stage ?? n.attrs.status ?? (n.attrs.significant === true ? "significant" : ""))

export const toJson = (graph: Graph) => ({
  nodes: [...graph.nodes.values()].map(nodeJson),
  edges: graph.edges.map((e) => ({ from: e.from, rel: e.rel, to: e.to, attrs: e.attrs, source: formatSource(e.source) || undefined }))
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
    ...[...graph.nodes.values()].map((n) => ["node", n.id, n.kind, n.title, formatSource(n.source)].map(cell).join("\t")),
    ...graph.edges.map((e) => ["edge", e.from, e.rel, e.to, formatSource(e.source)].map(cell).join("\t"))
  ].join("\n") + "\n"

const shapes: Record<string, string> = {
  decision: "note",
  element: "box3d",
  pattern: "hexagon",
  scenario: "plaintext",
  code: "component",
  milestone: "diamond",
  missing: "octagon"
}

const toDot = (graph: Graph) => {
  const q = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`
  const lines = ["digraph sdp {", "  rankdir=LR;", "  node [fontname=\"Helvetica\", fontsize=10];", "  edge [fontname=\"Helvetica\", fontsize=9];"]
  for (const n of graph.nodes.values()) {
    const style = n.attrs.significant === true ? ", style=bold, penwidth=2" : ""
    lines.push(`  ${q(n.id)} [label=${q(`${n.id}\n${n.title}`)}, shape=${shapes[n.kind] ?? "ellipse"}${style}];`)
  }
  for (const e of graph.edges) lines.push(`  ${q(e.from)} -> ${q(e.to)} [label=${q(e.rel)}];`)
  lines.push("}")
  return lines.join("\n") + "\n"
}

const toMermaid = (graph: Graph) => {
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
  const open: Record<string, [string, string]> = {
    decision: ["[/", "/]"],
    pattern: ["{{", "}}"],
    milestone: ["{", "}"],
    scenario: ["([", "])"],
    code: ["[[", "]]"]
  }
  const lines = ["flowchart LR"]
  for (const n of graph.nodes.values()) {
    const [l, r] = open[n.kind] ?? ["[", "]"]
    lines.push(`  ${ref(n.id)}${l}"${label(n.id)}<br/><small>${label(n.title)}</small>"${r}`)
    if (n.attrs.significant === true) lines.push(`  style ${ref(n.id)} stroke-width:3px`)
  }
  for (const e of graph.edges) lines.push(`  ${ref(e.from)} -->|${label(e.rel)}| ${ref(e.to)}`)
  return lines.join("\n") + "\n"
}
