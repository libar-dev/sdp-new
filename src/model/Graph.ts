/**
 * The system graph: nodes with a free-form `kind`, edges with a free-form `rel`.
 *
 * Nothing here knows about requirements, decisions or architecture. Meaning
 * lives in conventions (kinds, attribute names, relation names) chosen by the
 * people writing specs, so the graph never forces a fixed vocabulary; the few
 * words sdp itself reads are its vocabulary profile (`Vocabulary.ts`).
 */
import { annotate } from "sdp/annotations"

export interface SourceRef {
  readonly file: string
  readonly line: number
}

export type Attrs = Readonly<Record<string, unknown>>

export interface GraphNode {
  readonly id: string
  readonly kind: string
  readonly title: string
  readonly attrs: Attrs
  readonly source?: SourceRef | undefined
}

/** One `(from, rel, to)` fact, however many declarations state it. */
export interface GraphEdge {
  readonly from: string
  readonly rel: string
  readonly to: string
  /** The union of the attributes its declarations give it. */
  readonly attrs?: Attrs | undefined
  /** Where it is first declared. */
  readonly source?: SourceRef | undefined
  /** Every declaration that states it, in order (`source` is the first). */
  readonly sources?: ReadonlyArray<SourceRef> | undefined
}

/** Two declarations of one edge that give an attribute different values; the first value is kept. */
export interface EdgeConflict {
  readonly edge: GraphEdge
  readonly key: string
  readonly kept: { readonly value: unknown; readonly source: SourceRef | undefined }
  readonly dropped: { readonly value: unknown; readonly source: SourceRef | undefined }
}

const edgeKey = (edge: Pick<GraphEdge, "from" | "rel" | "to">) => `${edge.from}\u0000${edge.rel}\u0000${edge.to}`

/**
 * Merges the declarations of each `(from, rel, to)` into one edge that keeps every source and the
 * union of their attributes, in first-declared order. Disagreeing attributes are returned as conflicts.
 */
export const mergeEdges = (
  edges: Iterable<GraphEdge>
): { readonly edges: ReadonlyArray<GraphEdge>; readonly conflicts: ReadonlyArray<EdgeConflict> } => {
  const merged = new Map<string, { edge: GraphEdge; attrs: Record<string, unknown>; at: Map<string, SourceRef | undefined>; sources: Array<SourceRef> }>()
  const conflicts: Array<EdgeConflict> = []
  for (const edge of edges) {
    const key = edgeKey(edge)
    const declared = edge.sources ?? (edge.source ? [edge.source] : [])
    const existing = merged.get(key)
    if (!existing) {
      const attrs: Record<string, unknown> = { ...edge.attrs }
      merged.set(key, { edge, attrs, at: new Map(Object.keys(attrs).map((k) => [k, edge.source])), sources: [...declared] })
      continue
    }
    existing.sources.push(...declared)
    for (const [k, value] of Object.entries(edge.attrs ?? {})) {
      if (!Object.hasOwn(existing.attrs, k)) {
        existing.attrs[k] = value
        existing.at.set(k, edge.source)
      } else if (JSON.stringify(existing.attrs[k]) !== JSON.stringify(value)) {
        conflicts.push({
          edge: existing.edge,
          key: k,
          kept: { value: existing.attrs[k], source: existing.at.get(k) },
          dropped: { value, source: edge.source }
        })
      }
    }
  }
  return {
    edges: [...merged.values()].map(({ attrs, edge, sources }) => ({
      from: edge.from,
      rel: edge.rel,
      to: edge.to,
      attrs: Object.keys(attrs).length > 0 ? attrs : undefined,
      source: sources[0] ?? edge.source,
      sources
    })),
    conflicts
  }
}

/**
 * The system graph: nodes and de-duplicated edges with in/out adjacency indexes. It owns its data:
 * nodes, edges and attribute trees are copied and frozen when it is built, so nothing a caller
 * holds can change it afterwards.
 */
export class Graph {
  readonly #nodes = new Map<string, GraphNode>()
  readonly #nodeList: ReadonlyArray<GraphNode>
  readonly #edges: ReadonlyArray<GraphEdge>
  readonly #out = new Map<string, Array<GraphEdge>>()
  readonly #in = new Map<string, Array<GraphEdge>>()

  constructor(nodes: Iterable<GraphNode>, edges: Iterable<GraphEdge>) {
    for (const node of nodes) this.#nodes.set(node.id, freezeNode(node))
    this.#nodeList = Object.freeze([...this.#nodes.values()])
    this.#edges = Object.freeze(mergeEdges(edges).edges.map(freezeEdge))
    for (const edge of this.#edges) {
      push(this.#out, edge.from, edge)
      push(this.#in, edge.to, edge)
    }
    for (const list of [...this.#out.values(), ...this.#in.values()]) Object.freeze(list)
  }

  /** Every node, in the order they were declared. */
  nodes(): ReadonlyArray<GraphNode> {
    return this.#nodeList
  }

  /** Every edge, once per `(from, rel, to)`. */
  edges(): ReadonlyArray<GraphEdge> {
    return this.#edges
  }

  node(id: string): GraphNode | undefined {
    return this.#nodes.get(id)
  }

  out(id: string): ReadonlyArray<GraphEdge> {
    return this.#out.get(id) ?? []
  }

  in(id: string): ReadonlyArray<GraphEdge> {
    return this.#in.get(id) ?? []
  }

  /** Neighbours in either direction, with the direction the edge points relative to `id`. */
  neighbours(id: string): ReadonlyArray<{ readonly edge: GraphEdge; readonly direction: "out" | "in"; readonly other: string }> {
    return [
      ...this.out(id).map((edge) => ({ edge, direction: "out" as const, other: edge.to })),
      ...this.in(id).map((edge) => ({ edge, direction: "in" as const, other: edge.from }))
    ]
  }

  ofKind(kinds: ReadonlyArray<string>): ReadonlyArray<GraphNode> {
    const wanted = new Set(kinds)
    return this.#nodeList.filter((node) => wanted.has(node.kind))
  }

  kinds(): ReadonlyMap<string, number> {
    return countBy(this.#nodeList, (node) => node.kind)
  }

  relations(): ReadonlyMap<string, number> {
    return countBy(this.#edges, (edge) => edge.rel)
  }

  /** The subgraph induced by `ids`: those nodes plus every edge whose both ends are in the set. */
  subgraph(ids: Iterable<string>): Graph {
    const keep = new Set(ids)
    return new Graph(
      [...keep].flatMap((id) => {
        const node = this.#nodes.get(id)
        return node ? [node] : []
      }),
      this.#edges.filter((edge) => keep.has(edge.from) && keep.has(edge.to))
    )
  }
}
annotate(Graph, { is: "ARCH-graph", "instance-of": "PAT-derived-index" })

export const formatSource = (source: SourceRef | undefined): string => source ? `${source.file}:${source.line}` : ""

/** A deep, frozen copy of plain data: objects and arrays are copied, anything else is kept as it is. */
const frozen = (value: unknown): unknown => {
  if (Array.isArray(value)) return Object.freeze(value.map(frozen))
  if (value !== null && typeof value === "object" && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)) {
    const copy: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) copy[key] = frozen(item)
    return Object.freeze(copy)
  }
  return value
}

const freezeSource = (source: SourceRef | undefined) => source && Object.freeze({ file: source.file, line: source.line })

const freezeNode = (node: GraphNode): GraphNode =>
  Object.freeze({
    id: node.id,
    kind: node.kind,
    title: node.title,
    attrs: frozen(node.attrs) as Attrs,
    source: freezeSource(node.source)
  })

const freezeEdge = (edge: GraphEdge): GraphEdge =>
  Object.freeze({
    from: edge.from,
    rel: edge.rel,
    to: edge.to,
    attrs: edge.attrs && (frozen(edge.attrs) as Attrs),
    source: freezeSource(edge.source),
    sources: edge.sources && Object.freeze(edge.sources.map((s) => freezeSource(s)!))
  })

/**
 * Counts values into a record without a prototype, so an author's word such as `constructor` is
 * just another key. JSON and `Object.entries` read it like any record.
 */
export const tally = (values: Iterable<string>): Readonly<Record<string, number>> => {
  const counts: Record<string, number> = Object.create(null)
  for (const value of values) counts[value] = (Object.hasOwn(counts, value) ? counts[value]! : 0) + 1
  return counts
}

const push = <K, V>(map: Map<K, Array<V>>, key: K, value: V) => {
  const list = map.get(key)
  if (list) list.push(value)
  else map.set(key, [value])
}

const countBy = <A>(items: Iterable<A>, key: (a: A) => string): ReadonlyMap<string, number> => {
  const counts = new Map<string, number>()
  for (const item of items) {
    const k = key(item)
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  return new Map([...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])))
}
