/**
 * The graph as plain data. A node and an edge are each one record with stable
 * field names (ask-the-graph), and `sdp graph` prints the state one record per
 * line, so grep, jq or a few lines of script answer what `sdp q` answers:
 *
 *   sdp graph | grep '"rel":"decided-by"'
 *   sdp graph | jq -r 'select(.type == "node" and .attrs.maturity == "ready") | .id'
 *
 * Every JSON answer of sdp is made of the same records; the state's hold less.
 */
import type { Graph, GraphEdge, GraphNode } from "../model/Graph.ts"
import { hasKind, isDerived, made, type Vocabulary } from "../model/Vocabulary.ts"
import { type EdgeRecord, type GraphRecord, type NodeRecord } from "../model/Records.ts"

export { EdgeRecord, GraphRecord, NodeRecord, SourceRef } from "../model/Records.ts"

export const nodeRecord = (node: GraphNode): NodeRecord => ({
  type: "node",
  id: node.id,
  kind: node.kind,
  title: node.title,
  file: node.source?.file ?? null,
  line: node.source?.line ?? null,
  attrs: node.attrs as NodeRecord["attrs"]
})

export const edgeRecord = (edge: GraphEdge): EdgeRecord => ({
  type: "edge",
  from: edge.from,
  rel: edge.rel,
  to: edge.to,
  declared: edge.sources ?? (edge.source ? [edge.source] : [])
})

/**
 * The facts sdp makes that the state keeps, by the kind of node; every fact an author wrote is kept.
 * A spec keeps the paragraph under its name; a rule and an example are each their one line, the
 * title, and keep only how far they have come; code keeps what its comment says it is for. The rest
 * is read where it is written: a reason, a step, the shape of an export, the counts the other
 * records already make.
 */
const specFacts: ReadonlyArray<string> = ["stage", "summary", made.tagsKey, "toCome"]

/** A map, so that a kind of the team's own such as `constructor` names nothing it does not hold. */
const stateFacts: ReadonlyMap<string, ReadonlyArray<string>> = new Map([
  [made.kinds.rule, ["stage", made.tagsKey, "toCome"]],
  [made.kinds.scenario, ["rule", "status", "staleBecause", made.tagsKey]],
  [made.kinds.code, ["doc"]]
])

/**
 * Whether sdp makes a fact on nodes of a kind. A fact of the same name an author writes on another
 * kind is the author's: a feature's `@doc=` is no code's comment, and stays.
 */
const madeOn = (kind: string, key: string): boolean =>
  isDerived(kind, key) || (kind === made.kinds.code && (made.codeAttributes as ReadonlyArray<string>).includes(key))

/** A node as the state holds it: what an author wrote of it, and the few facts sdp makes that the state keeps. */
export const stateRecord = (node: GraphNode): NodeRecord => {
  const keep = stateFacts.get(node.kind) ?? specFacts
  const attrs = Object.fromEntries(Object.entries(node.attrs).filter(([key]) => !madeOn(node.kind, key) || keep.includes(key)))
  return { ...nodeRecord(node), attrs: attrs as NodeRecord["attrs"] }
}

/**
 * Whether an edge only says where a node is written, which the records already say: a rule's id names
 * its spec, and an example's `spec` and `rule` say what it verifies by being written there. An example
 * that names another spec it verifies keeps that link.
 */
const contains = (vocabulary: Vocabulary, graph: Graph, edge: GraphEdge): boolean => {
  if (edge.rel === made.relations.rule) return true
  const from = edge.rel === vocabulary.relations.scenario ? graph.node(edge.from) : undefined
  return from?.kind === made.kinds.scenario && (edge.to === from.attrs.spec || edge.to === from.attrs.rule)
}

/**
 * One JSON value per line.
 * JSON escapes tabs and line breaks, so a record never spans two lines.
 */
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

/**
 * @sdp is ARCH-reports
 *
 * @remarks
 * The state: every spec, rule, example, element, pattern and anchored code, then every link an author
 * wrote and every import sdp derived from the code. What only says where a node is written is left to
 * the records; with a query, the routes it walks are kept whole.
 */
export const stateRecords = (graph: Graph, vocabulary: Vocabulary, routes = false): ReadonlyArray<GraphRecord> => [
  ...graph.nodes().map(stateRecord),
  ...graph.edges().filter((edge) => routes || !contains(vocabulary, graph, edge)).map(edgeRecord)
]

/**
 * The graph as a Mermaid flowchart; decisions, patterns, milestones, scenarios and code each have a
 * shape of their own. A node shows its title under its id, unless the title only repeats the id.
 */
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
    const title = n.title === n.id ? "" : `<br/><small>${label(n.title)}</small>`
    lines.push(`  ${ref(n.id)}${l}"${label(n.id)}${title}"${r}`)
  }
  for (const e of graph.edges()) lines.push(`  ${ref(e.from)} -->|${label(e.rel)}| ${ref(e.to)}`)
  return lines.join("\n") + "\n"
}
