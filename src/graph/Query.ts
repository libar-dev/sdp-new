/**
 * SDPQ — a tiny path-pattern language over the system graph, shaped like
 * Cypher's ASCII art so agents can guess it, but written on one line so it
 * fits a shell argument:
 *
 *   requirement[maturity=ready] -realized-by-> element[significant]
 *   #DEC-0003 <-*- *                      everything pointing at a node
 *   element[significant] !-*- decision    significant elements with no decision
 *   element -depends-on+-> *              transitive closure
 *
 * Node selector: `kind`, `kind|kind`, `*`, `#ID` / `#ID|ID`, followed by any
 * number of `[cond, cond]` groups. Conditions: `key`, `!key`, `key=a|b`,
 * `key!=a`, `key~regex`, `key!~regex`, `key<v`, `key>=v` (numbers, dates, and
 * the maturity ladder compare in order).
 *
 * Edge step: `-rel->` (out), `<-rel-` (in), `-rel-` (either), `*` or empty for
 * any relation, `a|b` for alternatives, a trailing `+` for one-or-more hops.
 * Prefix `!` keeps nodes WITHOUT such a neighbour, `?` keeps nodes WITH one;
 * both filter without moving.
 */
import { Data, Predicate, Result } from "effect"
import type { Graph, GraphEdge, GraphNode } from "../model/Graph.ts"

// @sdp is ARCH-query-engine

export class QueryError extends Data.TaggedError("QueryError")<{
  readonly message: string
  readonly query: string
}> {}

type Op = "=" | "!=" | "~" | "!~" | "<" | ">" | "<=" | ">="

export interface Condition {
  readonly key: string
  readonly op: Op | "exists" | "missing"
  readonly values: ReadonlyArray<string>
  readonly regex?: RegExp | undefined
}

export interface NodeSelector {
  readonly kinds: ReadonlyArray<string> | "*"
  readonly ids: ReadonlyArray<string> | undefined
  readonly conditions: ReadonlyArray<Condition>
}

export interface EdgeStep {
  readonly direction: "out" | "in" | "both"
  readonly rels: ReadonlyArray<string> | "*"
  readonly transitive: boolean
  readonly mode: "move" | "exists" | "not-exists"
}

export interface Query {
  readonly source: string
  readonly start: NodeSelector
  readonly steps: ReadonlyArray<{ readonly edge: EdgeStep; readonly node: NodeSelector }>
}

export interface PathStep {
  readonly rel: string
  readonly direction: "out" | "in"
  readonly node: string
}

export interface QueryPath {
  readonly start: string
  readonly steps: ReadonlyArray<PathStep>
}

export interface QueryResult {
  readonly nodes: ReadonlyArray<GraphNode>
  readonly paths: ReadonlyArray<QueryPath>
  readonly truncated: boolean
}

export interface QueryOptions {
  /** Ordered value ladders for `<`/`>` on non-numeric attributes, e.g. `{ maturity: ["idea", ...] }`. */
  readonly orderings?: Readonly<Record<string, ReadonlyArray<string>>> | undefined
  readonly maxPaths?: number | undefined
  readonly maxDepth?: number | undefined
}

export const parseQuery = (source: string): Result.Result<Query, QueryError> => {
  const fail = (message: string) => Result.fail(new QueryError({ message, query: source }))
  const tokens = tokenize(source.trim())
  if (tokens === undefined) return fail("unbalanced brackets or quotes")
  if (tokens.length === 0) return fail("empty query")
  const start = parseNode(tokens[0]!)
  if (Result.isFailure(start)) return fail(start.failure)
  const steps: Array<{ edge: EdgeStep; node: NodeSelector }> = []
  for (let i = 1; i < tokens.length; i += 2) {
    const edge = parseEdge(tokens[i]!)
    if (Result.isFailure(edge)) return fail(edge.failure)
    const nodeToken = tokens[i + 1]
    const node = nodeToken === undefined ? Result.succeed(anyNode) : parseNode(nodeToken)
    if (Result.isFailure(node)) return fail(node.failure)
    steps.push({ edge: edge.success, node: node.success })
  }
  return Result.succeed({ source, start: start.success, steps })
}

export const runQuery = (graph: Graph, query: Query, options: QueryOptions = {}): QueryResult => {
  const maxPaths = options.maxPaths ?? 10_000
  const maxDepth = options.maxDepth ?? 12
  const orderings = options.orderings ?? {}
  let truncated = false
  let paths: Array<{ readonly path: QueryPath; readonly end: string }> = startNodes(graph, query.start, orderings).map((
    node
  ) => ({ path: { start: node.id, steps: [] }, end: node.id }))

  for (const { edge, node } of query.steps) {
    const accept = (id: string) => {
      const candidate = graph.node(id)
      return candidate !== undefined && matchesNode(candidate, node, orderings)
    }
    if (edge.mode !== "move") {
      paths = paths.filter(({ end }) => {
        const found = reachable(graph, end, edge, maxDepth).some((hop) => accept(hop.node))
        return edge.mode === "exists" ? found : !found
      })
      continue
    }
    const next: Array<{ path: QueryPath; end: string }> = []
    const seen = new Set<string>()
    for (const { path, end } of paths) {
      for (const hop of reachable(graph, end, edge, maxDepth)) {
        if (!accept(hop.node)) continue
        const key = `${pathKey(path)}>${hop.rel}>${hop.node}`
        if (seen.has(key)) continue
        seen.add(key)
        if (next.length >= maxPaths) {
          truncated = true
          break
        }
        next.push({ path: { start: path.start, steps: [...path.steps, hop] }, end: hop.node })
      }
    }
    paths = next
  }

  const nodes: Array<GraphNode> = []
  const emitted = new Set<string>()
  for (const { end } of paths) {
    if (emitted.has(end)) continue
    emitted.add(end)
    nodes.push(graph.node(end)!)
  }
  return { nodes, paths: paths.map((p) => p.path), truncated }
}

/** Parse and run in one go; the convenient form for steps, the CLI and the MCP server. */
export const query = (graph: Graph, source: string, options?: QueryOptions): Result.Result<QueryResult, QueryError> =>
  Result.map(parseQuery(source), (q) => runQuery(graph, q, options))

export const formatPath = (path: QueryPath): string =>
  [path.start, ...path.steps.map((s) => s.direction === "out" ? ` -${s.rel}-> ${s.node}` : ` <-${s.rel}- ${s.node}`)].join("")

// ---------------------------------------------------------------------------

const anyNode: NodeSelector = { kinds: "*", ids: undefined, conditions: [] }

const tokenize = (source: string): Array<string> | undefined => {
  const tokens: Array<string> = []
  let current = ""
  let depth = 0
  let quote: string | undefined
  for (const ch of source) {
    if (quote) {
      current += ch
      if (ch === quote) quote = undefined
      continue
    }
    if (ch === "\"" || ch === "'") {
      quote = ch
      current += ch
    } else if (ch === "[") {
      depth++
      current += ch
    } else if (ch === "]") {
      depth--
      if (depth < 0) return undefined
      current += ch
    } else if (/\s/.test(ch) && depth === 0) {
      if (current) tokens.push(current)
      current = ""
    } else {
      current += ch
    }
  }
  if (quote || depth !== 0) return undefined
  if (current) tokens.push(current)
  return tokens
}

const parseEdge = (token: string): Result.Result<EdgeStep, string> => {
  let t = token
  let mode: EdgeStep["mode"] = "move"
  if (t.startsWith("!")) {
    mode = "not-exists"
    t = t.slice(1)
  } else if (t.startsWith("?")) {
    mode = "exists"
    t = t.slice(1)
  }
  let direction: EdgeStep["direction"]
  let inner: string
  if (t.startsWith("<-") && t.endsWith("-") && !t.endsWith("->") && t.length >= 3) {
    direction = "in"
    inner = t.slice(2, -1)
  } else if (t.startsWith("-") && t.endsWith("->") && t.length >= 3) {
    direction = "out"
    inner = t.slice(1, -2)
  } else if (t.startsWith("-") && t.endsWith("-") && t.length >= 2) {
    direction = "both"
    inner = t.slice(1, -1)
  } else {
    return Result.fail(`expected an edge like -rel->, <-rel- or -rel- but got "${token}"`)
  }
  const transitive = inner.endsWith("+")
  if (transitive) inner = inner.slice(0, -1)
  const rels = inner === "" || inner === "*" ? "*" as const : inner.split("|").filter(Boolean)
  return Result.succeed({ direction, rels, transitive, mode })
}

const conditionRe = /^(!)?([\w.:@-]+?)\s*(?:(!=|!~|<=|>=|=|~|<|>)\s*([\s\S]*))?$/

const parseNode = (token: string): Result.Result<NodeSelector, string> => {
  const bracket = token.indexOf("[")
  const head = bracket < 0 ? token : token.slice(0, bracket)
  const rest = bracket < 0 ? "" : token.slice(bracket)
  if (head.startsWith("-") || head.startsWith("<")) return Result.fail(`expected a node selector but got "${token}"`)
  let kinds: NodeSelector["kinds"] = "*"
  let ids: Array<string> | undefined
  if (head.startsWith("#")) ids = head.slice(1).split("|").filter(Boolean)
  else if (head !== "" && head !== "*") kinds = head.split("|").filter(Boolean)
  const conditions: Array<Condition> = []
  const groups = bracketGroups(rest)
  if (groups === undefined) return Result.fail(`could not parse filters in "${token}"`)
  for (const group of groups) {
    for (const part of splitTopLevel(group.slice(1, -1))) {
      const text = part.trim()
      if (!text) continue
      const m = conditionRe.exec(text)
      if (!m) return Result.fail(`invalid condition "${text}"`)
      const [, negate, key, op, raw] = m
      if (!op) {
        conditions.push({ key: key!, op: negate ? "missing" : "exists", values: [] })
        continue
      }
      if (negate) return Result.fail(`"!" only negates bare keys, got "${text}"`)
      const value = raw!.trim()
      if (op === "~" || op === "!~") {
        try {
          conditions.push({ key: key!, op, values: [value], regex: new RegExp(unquote(value), "i") })
        } catch {
          return Result.fail(`invalid regex in "${text}"`)
        }
      } else {
        const values = /^(["']).*\1$/.test(value) ? [unquote(value)] : value.split("|").map(unquote)
        conditions.push({ key: key!, op: op as Op, values })
      }
    }
  }
  return Result.succeed({ kinds, ids, conditions })
}

/** Split `[a][b=[x]]` into top-level groups, honouring quotes and nested brackets (regex classes). */
const bracketGroups = (text: string): Array<string> | undefined => {
  const groups: Array<string> = []
  let depth = 0
  let quote: string | undefined
  let current = ""
  for (const ch of text) {
    if (depth === 0 && ch !== "[") return undefined
    current += ch
    if (quote) {
      if (ch === quote) quote = undefined
    } else if (ch === "\"" || ch === "'") {
      quote = ch
    } else if (ch === "[") {
      depth++
    } else if (ch === "]" && --depth === 0) {
      groups.push(current)
      current = ""
    }
  }
  return depth === 0 && !quote ? groups : undefined
}

const splitTopLevel = (text: string): Array<string> => {
  const parts: Array<string> = []
  let current = ""
  let quote: string | undefined
  for (const ch of text) {
    if (quote) {
      if (ch === quote) quote = undefined
      current += ch
    } else if (ch === "\"" || ch === "'") {
      quote = ch
      current += ch
    } else if (ch === ",") {
      parts.push(current)
      current = ""
    } else current += ch
  }
  parts.push(current)
  return parts
}

const unquote = (value: string) => value.replace(/^(["'])([\s\S]*)\1$/, "$2")

const startNodes = (graph: Graph, selector: NodeSelector, orderings: Readonly<Record<string, ReadonlyArray<string>>>) => {
  const candidates = selector.ids
    ? selector.ids.flatMap((id) => {
      const node = graph.node(id)
      return node ? [node] : []
    })
    : [...graph.nodes.values()]
  return candidates.filter((node) => matchesNode(node, selector, orderings))
}

export const matchesNode = (
  node: GraphNode,
  selector: NodeSelector,
  orderings: Readonly<Record<string, ReadonlyArray<string>>> = {}
): boolean => {
  if (selector.ids && !selector.ids.includes(node.id)) return false
  if (selector.kinds !== "*" && !selector.kinds.includes(node.kind)) return false
  return selector.conditions.every((condition) => matchesCondition(node, condition, orderings))
}

const valueOf = (node: GraphNode, key: string): unknown => {
  switch (key) {
    case "id":
      return node.id
    case "kind":
      return node.kind
    case "title":
      return node.title
    case "source":
      return node.source ? `${node.source.file}:${node.source.line}` : undefined
  }
  if (key in node.attrs) return node.attrs[key]
  let value: unknown = node.attrs
  for (const part of key.split(".")) {
    if (!Predicate.isObject(value)) return undefined
    value = (value as Record<string, unknown>)[part]
  }
  return value
}

const present = (value: unknown) =>
  value !== undefined && value !== null && value !== false && value !== "" && !(Array.isArray(value) && value.length === 0)

const scalars = (value: unknown): ReadonlyArray<unknown> => Array.isArray(value) ? value : [value]

const matchesCondition = (
  node: GraphNode,
  condition: Condition,
  orderings: Readonly<Record<string, ReadonlyArray<string>>>
): boolean => {
  const value = valueOf(node, condition.key)
  switch (condition.op) {
    case "exists":
      return present(value)
    case "missing":
      return !present(value)
    case "=":
      return present(value) && scalars(value).some((v) => condition.values.some((c) => equals(v, c)))
    case "!=":
      return !(present(value) && scalars(value).some((v) => condition.values.some((c) => equals(v, c))))
    case "~":
      return present(value) && scalars(value).some((v) => condition.regex!.test(String(v)))
    case "!~":
      return !(present(value) && scalars(value).some((v) => condition.regex!.test(String(v))))
    default: {
      if (!present(value)) return false
      const ladder = orderings[condition.key]
      return scalars(value).some((v) => compare(v, condition.values[0]!, ladder, condition.op as Op))
    }
  }
}

const equals = (value: unknown, expected: string) =>
  Predicate.isString(value) ? value.toLowerCase() === expected.toLowerCase() : String(value) === expected

const compare = (value: unknown, expected: string, ladder: ReadonlyArray<string> | undefined, op: Op): boolean => {
  let diff: number
  const a = Number(value)
  const b = Number(expected)
  if (ladder && ladder.includes(String(value)) && ladder.includes(expected)) {
    diff = ladder.indexOf(String(value)) - ladder.indexOf(expected)
  } else if (value !== "" && expected !== "" && Number.isFinite(a) && Number.isFinite(b)) {
    diff = a - b
  } else {
    diff = String(value instanceof Date ? value.toISOString() : value).localeCompare(expected)
  }
  switch (op) {
    case "<":
      return diff < 0
    case "<=":
      return diff <= 0
    case ">":
      return diff > 0
    case ">=":
      return diff >= 0
    default:
      return false
  }
}

const relMatches = (edge: GraphEdge, rels: EdgeStep["rels"]) => rels === "*" || rels.includes(edge.rel)

const hops = (graph: Graph, id: string, step: EdgeStep): Array<PathStep> => {
  const result: Array<PathStep> = []
  if (step.direction !== "in") {
    for (const e of graph.out(id)) if (relMatches(e, step.rels)) result.push({ rel: e.rel, direction: "out", node: e.to })
  }
  if (step.direction !== "out") {
    for (const e of graph.in(id)) if (relMatches(e, step.rels)) result.push({ rel: e.rel, direction: "in", node: e.from })
  }
  return result
}

const reachable = (graph: Graph, from: string, step: EdgeStep, maxDepth: number): Array<PathStep> => {
  if (!step.transitive) return hops(graph, from, step)
  const result: Array<PathStep> = []
  const visited = new Set<string>([from])
  let frontier = [from]
  for (let depth = 0; depth < maxDepth && frontier.length > 0; depth++) {
    const next: Array<string> = []
    for (const id of frontier) {
      for (const hop of hops(graph, id, step)) {
        if (visited.has(hop.node)) continue
        visited.add(hop.node)
        result.push({ ...hop, rel: `${hop.rel}+` })
        next.push(hop.node)
      }
    }
    frontier = next
  }
  return result
}

const pathKey = (path: QueryPath) => [path.start, ...path.steps.map((s) => `${s.rel}>${s.node}`)].join(">")

/** The orderings every project uses: the maturity ladder and the derived stage ladder. */
export const projectOrderings = (maturity: ReadonlyArray<string>): Readonly<Record<string, ReadonlyArray<string>>> => ({
  maturity,
  stage: [...maturity, "in-progress", "verified"],
  verification: ["none", "unrun", "undefined", "pending", "failing", "passing"]
})
