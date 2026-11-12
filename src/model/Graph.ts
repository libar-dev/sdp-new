/**
 * The system graph: nodes with a free-form `kind`, edges with a free-form `rel`.
 *
 * Nothing here knows about requirements, decisions or architecture. Meaning
 * lives in conventions (kinds, attribute names, relation names) chosen by the
 * people writing specs, so the graph never forces a fixed vocabulary.
 */

// @sdp is ARCH-graph

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

export interface GraphEdge {
  readonly from: string
  readonly rel: string
  readonly to: string
  readonly attrs?: Attrs | undefined
  readonly source?: SourceRef | undefined
}

export class Graph {
  readonly nodes: ReadonlyMap<string, GraphNode>
  readonly edges: ReadonlyArray<GraphEdge>
  readonly #out = new Map<string, Array<GraphEdge>>()
  readonly #in = new Map<string, Array<GraphEdge>>()

  constructor(nodes: Iterable<GraphNode>, edges: Iterable<GraphEdge>) {
    const byId = new Map<string, GraphNode>()
    for (const node of nodes) byId.set(node.id, node)
    this.nodes = byId
    const all: Array<GraphEdge> = []
    const seen = new Set<string>()
    for (const edge of edges) {
      const key = `${edge.from}\u0000${edge.rel}\u0000${edge.to}`
      if (seen.has(key)) continue
      seen.add(key)
      all.push(edge)
      push(this.#out, edge.from, edge)
      push(this.#in, edge.to, edge)
    }
    this.edges = all
  }

  node(id: string): GraphNode | undefined {
    return this.nodes.get(id)
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

  ofKind(...kinds: ReadonlyArray<string>): ReadonlyArray<GraphNode> {
    const wanted = new Set(kinds)
    return [...this.nodes.values()].filter((node) => wanted.has(node.kind))
  }

  kinds(): ReadonlyMap<string, number> {
    return countBy([...this.nodes.values()], (node) => node.kind)
  }

  relations(): ReadonlyMap<string, number> {
    return countBy(this.edges, (edge) => edge.rel)
  }

  /** The subgraph induced by `ids`: those nodes plus every edge whose both ends are in the set. */
  subgraph(ids: Iterable<string>): Graph {
    const keep = new Set(ids)
    return new Graph(
      [...keep].flatMap((id) => {
        const node = this.nodes.get(id)
        return node ? [node] : []
      }),
      this.edges.filter((edge) => keep.has(edge.from) && keep.has(edge.to))
    )
  }
}

export const formatSource = (source: SourceRef | undefined): string => source ? `${source.file}:${source.line}` : ""

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
