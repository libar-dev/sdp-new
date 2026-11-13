/**
 * The system graph: nodes with a free-form `kind`, edges with a free-form `rel`.
 *
 * Nothing here knows about requirements, decisions or architecture. Meaning
 * lives in conventions (kinds, attribute names, relation names) chosen by the
 * people writing specs, so the graph never forces a fixed vocabulary; the few
 * words sdp itself reads are its vocabulary profile (`Vocabulary.ts`).
 */

export interface SourceRef {
  readonly file: string
  readonly line: number
}

/** Attributes are JSON data: text, numbers, booleans, null, lists and maps of them. A graph accepts nothing else. */
export type Attrs = Readonly<Record<string, unknown>>

export interface GraphNode {
  readonly id: string
  readonly kind: string
  readonly title: string
  readonly attrs: Attrs
  readonly source?: SourceRef | undefined
}

/** One `(from, rel, to)` fact, however many declarations state it. A link has no attributes: what would qualify it belongs to one of its nodes. */
export interface GraphEdge {
  readonly from: string
  readonly rel: string
  readonly to: string
  /** Where it is first declared. */
  readonly source?: SourceRef | undefined
  /** Every declaration that states it, in order (`source` is the first). */
  readonly sources?: ReadonlyArray<SourceRef> | undefined
}

const edgeKey = (edge: Pick<GraphEdge, "from" | "rel" | "to">) => `${edge.from}\u0000${edge.rel}\u0000${edge.to}`

/** Merges the declarations of each `(from, rel, to)` into one edge that keeps every source, in first-declared order. */
const mergeEdges = (edges: Iterable<GraphEdge>): ReadonlyArray<GraphEdge> => {
  const merged = new Map<string, { readonly edge: GraphEdge; readonly sources: Array<SourceRef> }>()
  for (const edge of edges) {
    const key = edgeKey(edge)
    const existing = merged.get(key) ?? { edge, sources: [] }
    merged.set(key, existing)
    existing.sources.push(...edge.sources ?? (edge.source ? [edge.source] : []))
  }
  return [...merged.values()].map(({ edge, sources }) => ({
    from: edge.from,
    rel: edge.rel,
    to: edge.to,
    source: sources[0] ?? edge.source,
    sources
  }))
}

/**
 * The system graph: nodes and de-duplicated edges with in/out adjacency indexes. It owns its data:
 * nodes, edges and attribute trees are copied and frozen when it is built, so nothing a caller
 * holds can change it afterwards.
 *
 * @sdp is ARCH-graph
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
    this.#edges = Object.freeze(mergeEdges(edges).map(freezeEdge))
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

export const formatSource = (source: SourceRef | undefined): string => source ? `${source.file}:${source.line}` : ""

/**
 * A deep, frozen copy of JSON data. What is not JSON data — a Date, a Map, a function — would stay
 * shared with whoever passed it, so a graph refuses it.
 */
const frozen = (value: unknown): unknown => {
  if (Array.isArray(value)) return Object.freeze(value.map(frozen))
  if (typeof value === "function") throw new TypeError("an attribute is JSON data, not a function")
  if (typeof value !== "object" || value === null) return value
  const prototype: unknown = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`an attribute is JSON data, not a ${value.constructor.name}`)
  }
  // Not assigned key by key: `__proto__` is a key like any other.
  return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, frozen(item)])))
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
