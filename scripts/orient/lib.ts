/**
 * What a recipe is, what it is given, and the few helpers recipes share. A helper here is a join sdp
 * did not answer: each says which, as a finding about sdp's surfaces (FINDING: …).
 */
import type { Edge, Node, Surface } from "./sdp.ts"

export type { Edge, Node }

/** One cell of a row: undefined prints as "-" in text, and is left out of JSON. */
export type Cell = string | number | undefined

/**
 * One line of a section. `rec` comes first and says what the line is, so `grep '^tocome '` finds
 * them all; free text, if any, comes last, so `awk '{print $2}'` is always an id.
 */
export interface Row {
  readonly rec: string
  readonly [field: string]: Cell
}

export interface Recipe {
  /** One line: what the section shows. */
  readonly title: string
  /** The sdp surfaces it reads; the section cites them as the commands that print them. */
  readonly asks: ReadonlyArray<Surface>
  /** Other files it reads, which sdp serves no surface for; cited as well. */
  readonly reads?: (state: State) => ReadonlyArray<string>
  /** One line that says how to read a row, when its columns are not self-evident. */
  readonly legend?: string
  readonly rows: (state: State) => ReadonlyArray<Row>
}

/** The graph, indexed once. */
export interface Graph {
  readonly nodes: ReadonlyArray<Node>
  readonly edges: ReadonlyArray<Edge>
  readonly node: (id: string) => Node | undefined
  /** The edges from `id`, of `rel` when given. */
  readonly out: (id: string, rel?: string) => ReadonlyArray<Edge>
  /** The edges into `id`, of `rel` when given. */
  readonly into: (id: string, rel?: string) => ReadonlyArray<Edge>
  readonly ofKind: (kind: string) => ReadonlyArray<Node>
  /** The rules of a spec: the state names a rule's spec in its id, `spec#rule`, and draws no edge. */
  readonly rulesOf: (spec: string) => ReadonlyArray<Node>
  /** The examples of a rule, by their `rule`, or of a spec, by their id. */
  readonly examplesOf: (id: string) => ReadonlyArray<Node>
}

/** What a recipe is given: the surfaces it asked for, parsed; any other is undefined. */
export interface State {
  readonly root: string
  readonly graph: Graph
  readonly vocabulary: Vocabulary
  readonly lifecycle: Lifecycle
  /** Whether the rows print as JSON, where nothing is cut: a recipe may shorten free text for the eye only. */
  readonly json: boolean
  /** A file of the workspace, read as text. */
  readonly read: (file: string) => string
}

/** `sdp vocabulary --json`, the parts recipes read. */
export interface Vocabulary {
  readonly vocabulary: {
    readonly kinds: { readonly [role: string]: string | ReadonlyArray<string> }
    readonly relations: { readonly [role: string]: string | ReadonlyArray<string> }
    readonly maturity: ReadonlyArray<string>
    readonly disciplines: { readonly [discipline: string]: ReadonlyArray<string> }
  }
  readonly made: {
    readonly kinds: ReadonlyArray<string>
    readonly relations: ReadonlyArray<string>
    readonly tags: ReadonlyArray<string>
    readonly stages: ReadonlyArray<string>
  }
  readonly types: {
    readonly links: { readonly [rel: string]: { readonly from: ReadonlyArray<string>; readonly to: ReadonlyArray<string> } }
    readonly facts: { readonly [key: string]: { readonly value: string; readonly on: ReadonlyArray<string> } }
  }
}

/** `sdp lifecycle --json`, the parts recipes read. */
export interface Lifecycle {
  readonly calendar: { readonly today: string; readonly iteration: string | null }
  readonly position: { readonly milestone: string | null; readonly phase: string | null }
  readonly iterations: ReadonlyArray<string>
  readonly milestones: ReadonlyArray<{
    readonly id: string
    readonly title: string
    readonly closes: string | null
    readonly planned: string | null
    readonly gate: { readonly passed: number; readonly total: number; readonly unmet: ReadonlyArray<string> }
  }>
  readonly work: ReadonlyArray<{
    readonly id: string
    readonly items: ReadonlyArray<string>
    readonly attrs: { readonly start?: string; readonly end?: string }
    readonly evidence: { readonly stages: Record<string, number>; readonly scenarios: Record<string, number> }
  }>
  readonly unplanned: ReadonlyArray<string>
}

export const indexGraph = (records: ReadonlyArray<Node | Edge>): Graph => {
  const nodes = records.filter((r): r is Node => r.type === "node")
  const edges = records.filter((r): r is Edge => r.type === "edge")
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const group = (key: (e: Edge) => string) => {
    const map = new Map<string, Array<Edge>>()
    for (const e of edges) map.set(key(e), [...(map.get(key(e)) ?? []), e])
    return map
  }
  const from = group((e) => e.from)
  const to = group((e) => e.to)
  const kinds = new Map<string, Array<Node>>()
  for (const n of nodes) kinds.set(n.kind, [...(kinds.get(n.kind) ?? []), n])
  const under = new Map<string, Array<Node>>()
  const add = (key: string, n: Node) => under.set(key, [...(under.get(key) ?? []), n])
  for (const n of nodes) {
    if (n.kind === "rule") add(`rules:${specOf(n)}`, n)
    if (n.kind !== "scenario") continue
    add(`examples:${specOf(n)}`, n)
    if (typeof n.attrs["rule"] === "string") add(`examples:${n.attrs["rule"]}`, n)
  }
  return {
    nodes,
    edges,
    node: (id) => byId.get(id),
    out: (id, rel) => (from.get(id) ?? []).filter((e) => rel === undefined || e.rel === rel),
    into: (id, rel) => (to.get(id) ?? []).filter((e) => rel === undefined || e.rel === rel),
    ofKind: (kind) => kinds.get(kind) ?? [],
    rulesOf: (spec) => under.get(`rules:${spec}`) ?? [],
    examplesOf: (id) => under.get(`examples:${id}`) ?? []
  }
}

/** Where a node is written, as `file:line`, which an editor and grep both open. */
export const at = (node: { readonly file: string | null; readonly line: number | null }): string =>
  node.file === null ? "-" : `${node.file}:${node.line ?? 1}`

export const tags = (node: Node): ReadonlyArray<string> => (node.attrs["tags"] as ReadonlyArray<string> | undefined) ?? []

export const isOpen = (node: Node): boolean => tags(node).includes("@open")

export const toCome = (node: Node): boolean => node.attrs["toCome"] === true

/**
 * The maturity work still to come is at: the one it declares, or else the one it has from its spec,
 * which `attrs.stage` already carries, for the stage of work still to come is its maturity. Live
 * work has none. No join: a rule that declares none is not looked up through its spec.
 */
export const maturity = (_graph: Graph, node: Node): string | undefined =>
  (node.attrs["maturity"] as string | undefined) ?? (toCome(node) ? (node.attrs["stage"] as string | undefined) : undefined)

/** The spec a rule or scenario belongs to: its id before `#`. */
export function specOf(node: Node): string {
  return node.id.split("#")[0] ?? node.id
}

/** The examples of a spec or rule, counted by status: `failed 2, undefined 4`. */
export const examples = (graph: Graph, id: string): string | undefined => {
  const counts = new Map<string, number>()
  for (const example of graph.examplesOf(id)) {
    const status = (example.attrs["status"] as string | undefined) ?? "unrun"
    counts.set(status, (counts.get(status) ?? 0) + 1)
  }
  return counts.size === 0 ? undefined : [...counts].sort().map(([s, n]) => `${s} ${n}`).join(", ")
}

/** A text cut at a word to at most `max` characters, marked where it was cut. */
export const clip = (text: string | undefined, max: number): string | undefined => {
  if (text === undefined || text.length <= max) return text
  const cut = text.slice(0, max).replace(/[\s,:;(`]+\S*$/, "")
  return `${cut}…`
}

/** The first sentence of a text, at most `max` characters. */
export const sentence = (text: string | undefined, max = 110): string | undefined => {
  if (text === undefined) return undefined
  const first = text.split(/(?<=\.)\s/)[0] ?? text
  return first.length <= max ? first : `${first.slice(0, max - 1)}…`
}

/**
 * Whether a title says nothing its id does not: the id is the title, slugged and maybe cut.
 * Such a title is left out, so a record holds nothing its id already says.
 */
export const sameAsId = (id: string, title: string): boolean => {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
  const own = (id.split("#").at(-1) ?? id).toLowerCase()
  return slug.startsWith(own) && slug.length - own.length < 12
}
