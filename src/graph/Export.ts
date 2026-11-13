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

const madeFacts: ReadonlySet<string> = new Set([
  ...made.attributes,
  ...made.ruleAttributes,
  ...made.scenarioAttributes,
  ...made.codeAttributes
])

/** A node as the state holds it: what an author wrote of it, and the few facts sdp makes that the state keeps. */
export const stateRecord = (node: GraphNode): NodeRecord => {
  const keep = stateFacts.get(node.kind) ?? specFacts
  const attrs = Object.fromEntries(Object.entries(node.attrs).filter(([key]) => !madeFacts.has(key) || keep.includes(key)))
  return { ...nodeRecord(node), attrs }
}

/**
 * Whether an edge only says where a node is written, which the records already say: a rule's id names
 * its spec, and an example's `rule` its rule.
 */
const contains = (vocabulary: Vocabulary, graph: Graph, edge: GraphEdge): boolean =>
  edge.rel === made.relations.rule ||
  (edge.rel === vocabulary.relations.scenario && graph.node(edge.from)?.kind === made.kinds.scenario)

/**
 * The state: every spec, rule, example, element, pattern and anchored code, then every link an author
 * wrote and every import sdp derived from the code. What only says where a node is written is left to
 * the records; with a query, the routes it walks are kept whole.
 *
 * @sdp is ARCH-reports
 */
export const stateRecords = (graph: Graph, vocabulary: Vocabulary, routes = false): ReadonlyArray<GraphRecord> => [
  ...graph.nodes().map(stateRecord),
  ...graph.edges().filter((edge) => routes || !contains(vocabulary, graph, edge)).map(edgeRecord)
]

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
