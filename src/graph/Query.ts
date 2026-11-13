/**
 * SDPQ — a tiny path-pattern language over the system graph, shaped like
 * Cypher's ASCII art so agents can guess it, but written on one line so it
 * fits a shell argument. Its syntax is `querySyntax` below, which
 * `sdp q --help` prints; what each part means is pinned by the scenarios of
 * the feature ask-the-graph, with its limits.
 *
 * A query is parsed completely before anything is evaluated. Evaluation keeps
 * a frontier of paths. It starts with one path per node matching the first
 * selector; each moving edge extends every path by the routes it opens and
 * keeps the extensions whose end matches the next selector; a `?` or `!`
 * filter keeps or drops whole paths without extending them. A path is the
 * nodes it visits and, between each two of them, the edge that was walked,
 * kept as it points. A `+` edge walks breadth-first and walks on from each
 * node once, so it adds one path per node it reaches — a shortest one. The
 * result is the distinct end nodes in the order they were first reached, and
 * the paths.
 *
 * A walk is taken only as far as it is needed: a filter's stops at the first
 * node it accepts, a step's stops once the step holds as many paths as the
 * limit allows, and a node is walked from once in a step however many paths
 * end at it.
 *
 * @sdp is ARCH-query-engine
 */
import { Predicate, Result, Schema } from "effect"
import * as CliError from "effect/cli/CliError"
import type { Graph, GraphEdge, GraphNode } from "../model/Graph.ts"
import { activityRelation, made, type Vocabulary, vocabularyWords } from "../model/Vocabulary.ts"
import type { Project } from "./Build.ts"

/** The syntax in a few lines, for `sdp q --help`, the MCP tool description and query errors. */
export const querySyntax = `query  := node (edge node)* [edge]
node   := (kind(|kind)* | * | #ID(|ID)*) ([cond(, cond)*])*
cond   := key | !key | key=v(|v)* | key!=v(|v)* | key~regex | key!~regex | key<v | key<=v | key>v | key>=v
edge   := [! | ?] (-rel-> | <-rel- | -rel-)        rel := (* | name(|name)* | nothing) [+]
notes
  key alone: set, i.e. not missing, null, false or empty; = and ~ compare the value, so key=false finds false
  < > compare numbers, dates, and maturity/stage along idea < draft < specified < ready < unrun < failing = in-progress < verified,
    values compare in any case; a value off the ladder ranks below every rung, and a question notes it with the closest rung
  a key also holds the targets of the node's links of that relation: [iteration=IT-beta] agrees with -iteration-> #IT-beta
  rel: * or nothing is any relation, a|b either, a trailing + one or more hops
  + reaches the start node too when a cycle leads back: #A -uses+-> #A asks whether A is on one
  ! keeps nodes WITHOUT such a neighbour, ? keeps nodes WITH one; neither moves
examples
  feature[maturity<ready]
  feature -realized-by-> element <-is- code
  rule !<-verifies- scenario
  milestone[!met]
  #use-postgres <-*- *
  scenario[!toCome][status=failed] -verifies-> *`

export class QueryError extends Schema.TaggedError<QueryError>()("QueryError", {
  message: Schema.String,
  query: Schema.String
}) {
  override get [CliError.userMessage]() {
    return `query error: ${this.message}`
  }
}

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
  /** Relation names; `*` among them stands for every relation. */
  readonly rels: ReadonlyArray<string>
  readonly transitive: boolean
  readonly mode: "move" | "exists" | "not-exists"
}

export interface Query {
  readonly source: string
  readonly start: NodeSelector
  readonly steps: ReadonlyArray<{ readonly edge: EdgeStep; readonly node: NodeSelector }>
}

/** An edge of the graph, as it points. */
export interface PathEdge {
  readonly from: string
  readonly rel: string
  readonly to: string
}

/**
 * A route that exists in the graph: the nodes it visits, in order, and the edge walked between
 * each two of them — `edges[i]` joins `nodes[i]` and `nodes[i + 1]`, in whichever direction it points.
 */
export interface QueryPath {
  readonly nodes: ReadonlyArray<string>
  readonly edges: ReadonlyArray<PathEdge>
}

export interface QueryResult {
  readonly nodes: ReadonlyArray<GraphNode>
  readonly paths: ReadonlyArray<QueryPath>
  /** A limit cut evaluation short: the nodes and paths may be only part of the answer. */
  readonly truncated: boolean
  /** Which limits cut it short, in words (empty when the result is complete). */
  readonly limits: ReadonlyArray<string>
}

/** Values in order, lowest rung first; the words of one rung rank equal. */
export type Ladder = ReadonlyArray<ReadonlyArray<string>>

export interface QueryOptions {
  /** Ladders for `<`/`>` on non-numeric attributes, by attribute: `maturity` → `[idea, draft, ...]`. */
  readonly orderings?: ReadonlyMap<string, Ladder> | undefined
  /** Paths kept per step (default 10 000); more mark the result `truncated`. */
  readonly maxPaths?: number | undefined
  /** Hops a `+` step follows (default 12); a longer reach marks the result `truncated`. */
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
  const context: Context = { graph, orderings: options.orderings ?? new Map() }
  const limits = new Set<string>()
  const hopLimit = `a + edge reaches further than ${maxDepth} hops`
  const pathLimit = `a step has more than ${maxPaths} paths`
  let paths: Array<QueryPath> = startNodes(context, query.start).map((node) => ({ nodes: [node.id], edges: [] }))

  for (const { edge, node } of query.steps) {
    const accept = (id: string) => {
      const candidate = graph.node(id)
      return candidate !== undefined && matchesNode(context, candidate, node)
    }
    if (edge.mode !== "move") {
      // A node's search depends on the step, not on the path to it, so each is walked once a step.
      const settled = new Map<string, { readonly found: boolean; readonly cut: boolean }>()
      paths = paths.filter((path) => {
        const id = endOf(path)
        let search = settled.get(id)
        if (search === undefined) {
          search = settles(context, id, edge, maxDepth, accept)
          settled.set(id, search)
        }
        // A neighbour found within the limit settles the filter; only a search cut short leaves it open.
        if (!search.found && search.cut) limits.add(hopLimit)
        return edge.mode === "exists" ? search.found : !search.found
      })
      continue
    }
    const next: Array<QueryPath> = []
    const seen = new Set<string>()
    /** Adds a path's extension by a route, unless it is there already; false when it is one too many. */
    const extend = (path: QueryPath, route: ReadonlyArray<Hop>): boolean => {
      const extended: QueryPath = {
        nodes: [...path.nodes, ...route.map((hop) => hop.node)],
        edges: [...path.edges, ...route.map((hop) => hop.edge)]
      }
      const key = pathKey(extended)
      if (seen.has(key)) return true
      seen.add(key)
      if (next.length >= maxPaths) {
        limits.add(pathLimit)
        return false
      }
      next.push(extended)
      return true
    }
    // The routes a walk accepted are kept for the paths still to come that end where it started, and
    // only for as long as one does.
    const ending = new Map<string, number>()
    for (const path of paths) ending.set(endOf(path), (ending.get(endOf(path)) ?? 0) + 1)
    const walked = new Map<string, { readonly routes: ReadonlyArray<ReadonlyArray<Hop>>; readonly cut: boolean }>()
    moving: for (const path of paths) {
      const id = endOf(path)
      const later = ending.get(id)! - 1
      ending.set(id, later)
      const known = walked.get(id)
      if (known !== undefined) {
        if (later === 0) walked.delete(id)
        if (known.cut) limits.add(hopLimit)
        for (const route of known.routes) if (!extend(path, route)) break moving
        continue
      }
      // The walk is taken only as far as the routes it opens are kept: the limit bounds the work too.
      const accepted: Array<ReadonlyArray<Hop>> = []
      const walk = routesFrom(context, id, edge, maxDepth)
      for (let found = walk.next(); ; found = walk.next()) {
        if (found.done) {
          if (found.value) limits.add(hopLimit)
          if (later > 0) walked.set(id, { routes: accepted, cut: found.value })
          break
        }
        if (!accept(found.value.at(-1)!.node)) continue
        if (later > 0) accepted.push(found.value)
        if (!extend(path, found.value)) break moving
      }
    }
    paths = next
  }

  const nodes: Array<GraphNode> = []
  const emitted = new Set<string>()
  for (const path of paths) {
    const end = endOf(path)
    if (emitted.has(end)) continue
    emitted.add(end)
    nodes.push(graph.node(end)!)
  }
  return { nodes, paths, truncated: limits.size > 0, limits: [...limits] }
}

/** Parse and run in one go; the convenient form for steps, the CLI and the MCP server. */
export const query = (graph: Graph, source: string, options?: QueryOptions): Result.Result<QueryResult, QueryError> =>
  Result.map(parseQuery(source), (q) => runQuery(graph, q, options))

/** A path on one line, each edge drawn as it points: `A -uses-> B <-uses- C`. */
export const formatPath = (path: QueryPath): string =>
  path.nodes.map((node, index) => {
    const edge = path.edges[index - 1]
    if (edge === undefined) return node
    return edge.from === path.nodes[index - 1] && edge.to === node ? ` -${edge.rel}-> ${node}` : ` <-${edge.rel}- ${node}`
  }).join("")

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
  const rels = inner === "" ? [anyRelation] : inner.split("|").filter(Boolean)
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

/** What evaluation reads besides the query: the graph and the ladders. */
interface Context {
  readonly graph: Graph
  readonly orderings: ReadonlyMap<string, Ladder>
}

/** In an edge step, every relation. */
const anyRelation = "*"

const startNodes = (context: Context, selector: NodeSelector) => {
  const { graph } = context
  const candidates = selector.ids
    ? selector.ids.flatMap((id) => {
      const node = graph.node(id)
      return node ? [node] : []
    })
    : graph.nodes()
  return candidates.filter((node) => matchesNode(context, node, selector))
}

const matchesNode = (context: Context, node: GraphNode, selector: NodeSelector): boolean => {
  if (selector.ids && !selector.ids.includes(node.id)) return false
  if (selector.kinds !== "*" && !selector.kinds.includes(node.kind)) return false
  return selector.conditions.every((condition) => matchesCondition(context, node, condition))
}

/** A node's own data at `key`, or at the dotted path `a.b`; nothing inherited from a prototype. */
const ownValue = (node: GraphNode, key: string): unknown => {
  if (Object.hasOwn(node.attrs, key)) return node.attrs[key]
  let value: unknown = node.attrs
  for (const part of key.split(".")) {
    if (!Predicate.isObject(value) || !Object.hasOwn(value, part)) return undefined
    value = (value as Record<string, unknown>)[part]
  }
  return value
}

/**
 * What `key` holds for a node: `id`, `kind`, `title` and `source` are keys like any attribute, and
 * the key of a link holds the link's targets, so a link reads the same whichever way it was
 * written. A key is one or the other: the builder lets no link share a name with an attribute.
 */
const valueOf = (context: Context, node: GraphNode, key: string): unknown => {
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
  const linked = context.graph.out(node.id).filter((edge) => edge.rel === key).map((edge) => edge.to)
  return linked.length === 0 ? ownValue(node, key) : linked.length === 1 ? linked[0] : linked
}

/** What `[key]` asks: is the key set? Missing, null, false, empty text and empty lists are not. */
const isSet = (value: unknown) =>
  value !== undefined && value !== null && value !== false && value !== "" && !(Array.isArray(value) && value.length === 0)

/** The values a condition compares: a list's elements, or the value itself; null and missing have none. */
const scalars = (value: unknown): ReadonlyArray<unknown> =>
  (Array.isArray(value) ? value : [value]).filter((v) => v !== undefined && v !== null)

const matchesCondition = (context: Context, node: GraphNode, condition: Condition): boolean => {
  const value = valueOf(context, node, condition.key)
  // Existence is a flag test; equality and regexes see the value itself, so false, 0 and "" can be asked for.
  switch (condition.op) {
    case "exists":
      return isSet(value)
    case "missing":
      return !isSet(value)
    case "=":
      return scalars(value).some((v) => condition.values.some((c) => equals(v, c)))
    case "!=":
      return !scalars(value).some((v) => condition.values.some((c) => equals(v, c)))
    case "~":
      return scalars(value).some((v) => condition.regex!.test(String(v)))
    case "!~":
      return !scalars(value).some((v) => condition.regex!.test(String(v)))
    default: {
      const ladder = context.orderings.get(condition.key)
      return scalars(value).filter(isSet).some((v) => compare(v, condition.values[0]!, ladder, condition.op as Op))
    }
  }
}

const equals = (value: unknown, expected: string) => String(value).toLowerCase() === expected.toLowerCase()

/** A value's rung on a ladder, or -1 when it is not on it. */
const rung = (ladder: Ladder, value: string) => ladder.findIndex((words) => words.some((word) => equals(word, value)))

/**
 * Two values in order: along the attribute's ladder, where a value off it is below every rung, so a
 * question for what has not come far enough finds it; else as numbers, else as text.
 */
const compare = (value: unknown, expected: string, ladder: Ladder | undefined, op: Op): boolean => {
  let diff: number
  const a = Number(value)
  const b = Number(expected)
  const [have, want] = ladder ? [rung(ladder, String(value)), rung(ladder, expected)] : [-1, -1]
  if (have >= 0 || want >= 0) {
    diff = have - want
  } else if (value !== "" && expected !== "" && Number.isFinite(a) && Number.isFinite(b)) {
    diff = a - b
  } else {
    diff = String(value).localeCompare(expected)
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

const relMatches = (edge: GraphEdge, rels: EdgeStep["rels"]) => rels.includes(edge.rel) || rels.includes(anyRelation)

/** One edge walked from a node, to `node` at its other end. */
interface Hop {
  readonly edge: PathEdge
  readonly node: string
}

const hops = (context: Context, id: string, step: EdgeStep): Array<Hop> => {
  const { graph } = context
  const result: Array<Hop> = []
  const walk = (edge: GraphEdge, node: string) => {
    if (relMatches(edge, step.rels)) result.push({ edge: { from: edge.from, rel: edge.rel, to: edge.to }, node })
  }
  if (step.direction !== "in") for (const edge of graph.out(id)) walk(edge, edge.to)
  if (step.direction !== "out") for (const edge of graph.in(id)) walk(edge, edge.from)
  return result
}

/**
 * The routes one edge step opens from a node, each as it is found, and at the end whether the walk
 * was cut short; a caller that has what it needs stops taking them, and the walk goes no further. A
 * plain step has one route per matching edge. A `+` step has one per node it reaches, a shortest
 * one, found breadth-first: a node is walked on from once, and the start is reached when a cycle
 * leads back to it. A two-way walk never goes back along the edge it just took, so it reaches the
 * start only where two of its branches meet, or a second link to the start does, and the shortest
 * such cycle is known only once the walk is over: it comes last. Cut short when the walk stopped at
 * `maxDepth` with nodes left to reach, or the only cycle it closed is longer than that: two branches
 * can meet beyond the bound.
 */
function* routesFrom(context: Context, from: string, step: EdgeStep, maxDepth: number): Generator<ReadonlyArray<Hop>, boolean> {
  if (!step.transitive) {
    for (const hop of hops(context, from, step)) yield [hop]
    return false
  }
  const routes = new Map<string, ReadonlyArray<Hop>>()
  const twoWay = step.direction === "both"
  const onward = (route: ReadonlyArray<Hop>, hop: Hop) => !twoWay || route.length === 0 || !sameEdge(route.at(-1)!.edge, hop.edge)
  /** The cycle through the start a two-way hop closes: back to it, or to a node of another branch and back the way that came. */
  const closing = (route: ReadonlyArray<Hop>, hop: Hop): ReadonlyArray<Hop> | undefined => {
    if (!twoWay) return undefined
    const extended = [...route, hop]
    if (hop.node === from) return extended
    const met = routes.get(hop.node)
    return met === undefined || sameEdge(met[0]!.edge, extended[0]!.edge) ? undefined : [...extended, ...backTo(from, met)]
  }
  let cycle: ReadonlyArray<Hop> | undefined
  let beyond = false
  let frontier: Array<{ readonly id: string; readonly route: ReadonlyArray<Hop> }> = [{ id: from, route: [] }]
  for (let depth = 0; depth < maxDepth && frontier.length > 0; depth++) {
    const next: typeof frontier = []
    for (const { id, route } of frontier) {
      for (const hop of hops(context, id, step)) {
        if (!onward(route, hop)) continue
        const closed = closing(route, hop)
        if (closed !== undefined && closed.length > maxDepth) beyond = true
        else if (closed !== undefined && (cycle === undefined || closed.length < cycle.length)) cycle = closed
        if (closed !== undefined || routes.has(hop.node)) continue
        const extended = [...route, hop]
        routes.set(hop.node, extended)
        yield extended
        // The start was walked on from in the first round.
        if (hop.node !== from) next.push({ id: hop.node, route: extended })
      }
    }
    frontier = next
  }
  if (cycle !== undefined) {
    routes.set(from, cycle)
    yield cycle
  }
  return (cycle === undefined && beyond) || frontier.some(({ id, route }) =>
    hops(context, id, step).some((hop) => onward(route, hop) && (!routes.has(hop.node) || (cycle === undefined && closing(route, hop) !== undefined)))
  )
}

/** Whether a walk from a node reaches one the step accepts, taken no further than the first it reaches; if not, whether it was cut short. */
const settles = (
  context: Context,
  from: string,
  step: EdgeStep,
  maxDepth: number,
  accept: (id: string) => boolean
): { readonly found: boolean; readonly cut: boolean } => {
  const walk = routesFrom(context, from, step, maxDepth)
  for (let found = walk.next(); ; found = walk.next()) {
    if (found.done) return { found: false, cut: found.value }
    if (accept(found.value.at(-1)!.node)) return { found: true, cut: false }
  }
}

const sameEdge = (a: PathEdge, b: PathEdge) => a.from === b.from && a.rel === b.rel && a.to === b.to

/** A route walked back from its end to `start`, over the same edges. */
const backTo = (start: string, route: ReadonlyArray<Hop>): ReadonlyArray<Hop> =>
  route.map((hop, index) => ({ edge: hop.edge, node: index === 0 ? start : route[index - 1]!.node })).reverse()

const endOf = (path: QueryPath): string => path.nodes.at(-1)!

/** Two paths are the same route when they visit the same nodes over the same edges. */
const pathKey = (path: QueryPath) =>
  [path.nodes.join("\u0000"), ...path.edges.map((edge) => `${edge.from}\u0000${edge.rel}\u0000${edge.to}`)].join("\u0001")

/**
 * The stage ladder: the maturities of work still to come, then live work that has not run, then
 * `failing` and `in-progress` as one rung — a failing spec is no further along than one being
 * automated — then `verified`.
 */
export const stageLadder = (vocabulary: Vocabulary): Ladder => [
  ...maturityLadder(vocabulary),
  [made.stages.unrun],
  [made.stages.failing, made.stages.inProgress],
  [made.stages.verified]
]

const maturityLadder = (vocabulary: Vocabulary): Ladder => vocabulary.maturity.map((level) => [level])

/** The orderings every project uses: the maturity ladder and the stage ladder. */
export const projectOrderings = (vocabulary: Vocabulary): ReadonlyMap<string, Ladder> =>
  new Map([
    ["maturity", maturityLadder(vocabulary)],
    ["stage", stageLadder(vocabulary)]
  ])

/** How a project's graph is queried: with its ladders. */
export const projectQueryOptions = (project: Project): QueryOptions => ({ orderings: projectOrderings(project.config.vocabulary) })

/** Query a project's graph with its maturity and stage ladders. */
export const queryProject = (project: Project, source: string): Result.Result<QueryResult, QueryError> =>
  query(project.graph, source, projectQueryOptions(project))

/** Keys every node answers to, whatever it declares: what it is, and the maturity sdp reads on any kind. */
const universalKeys = ["id", "kind", "title", "source", "maturity"]

/**
 * What a query names that the workspace does not know, one line each with the closest word it does
 * know: an id no node has, a kind or relation it neither uses, makes nor names in its vocabulary, an
 * attribute that no node its selector could match carries, a maturity or a stage off its ladder, a
 * tag compared without its `@`. Almost always a typo — and a typo in an assertion that there is none of something would pass. Empty when
 * every word is known.
 */
export const unknownWords = (project: Project, parsed: Query): ReadonlyArray<string> => {
  const { config, graph } = project
  const vocabulary = config.vocabulary
  const words = vocabularyWords(vocabulary)
  const declared = graph.nodes().filter((node) => node.kind !== made.kinds.missing)
  const ids = new Set(declared.map((node) => node.id))
  const kinds = new Set([...graph.kinds().keys(), ...Object.values(made.kinds), ...Object.keys(config.ids), ...words.kinds])
  const relations = new Set([
    ...graph.relations().keys(),
    ...words.relations,
    ...Object.values(made.relations),
    ...words.disciplines.map((discipline) => activityRelation(vocabulary, discipline))
  ])
  const everywhere = new Set([...universalKeys, ...made.attributes, ...made.scenarioAttributes, ...words.attributes, ...relations])
  const found: Array<string> = []
  const unknown = (what: string, word: string, known: Iterable<string>) => {
    found.push(unknownWord(what, word, known))
  }
  for (const selector of [parsed.start, ...parsed.steps.map((step) => step.node)]) {
    const unknownIds = (selector.ids ?? []).filter((id) => !ids.has(id))
    const unknownKinds = selector.kinds === "*" ? [] : selector.kinds.filter((kind) => !kinds.has(kind))
    for (const id of unknownIds) unknown("no node has the id", id, ids)
    for (const kind of unknownKinds) unknown("no kind", kind, kinds)
    // The attributes of an unknown id or kind are unknown for the same reason: one line is enough.
    if (unknownIds.length + unknownKinds.length > 0) continue
    const candidates = declared.filter((node) =>
      selector.ids ? selector.ids.includes(node.id) : selector.kinds === "*" || selector.kinds.includes(node.kind)
    )
    const carried = new Set([...everywhere, ...candidates.flatMap((node) => Object.keys(node.attrs))])
    const selected = selector.ids ? `#${selector.ids.join("|")}` : selector.kinds === "*" ? "*" : selector.kinds.join("|")
    for (const { key } of selector.conditions) {
      if (!carried.has(key) && !carried.has(key.split(".")[0]!)) unknown(`${selected} has no attribute`, key, carried)
    }
  }
  for (const rel of parsed.steps.flatMap((step) => step.edge.rels)) {
    if (rel !== anyRelation && !relations.has(rel)) unknown("no relation", rel, relations)
  }
  return [...new Set([...found, ...offLadderWords(project, parsed), ...untaggedWords(parsed)])]
}

/** A word outside a query's maturity or stage ladder, with the nearest rung when there is one. */
export const offLadderWords = (project: Project, parsed: Query): ReadonlyArray<string> => {
  const orderings = projectOrderings(project.config.vocabulary)
  return [...new Set(
    [parsed.start, ...parsed.steps.map((step) => step.node)].flatMap((selector) =>
      selector.conditions.flatMap(({ key, op, values }) => {
        const ladder = orderings.get(key)
        if (ladder === undefined || op === "~" || op === "!~" || op === "exists" || op === "missing") return []
        return values.filter((value) => rung(ladder, value) < 0).map((value) => unknownWord(`no ${key}`, value, ladder.flat()))
      })
    )
  )]
}

const unknownWord = (what: string, word: string, known: Iterable<string>): string => {
  const nearest = closest(word, known)
  return `${what} ${word}${nearest === undefined ? "" : `; closest: ${nearest}`}`
}

/**
 * The words a query compares `tags` with, by `=` or `!=`, without their `@`, one line each saying
 * how the tag is written: `tags` holds each tag as written, so such a word matches none.
 */
export const untaggedWords = (parsed: Query): ReadonlyArray<string> =>
  [...new Set(
    [parsed.start, ...parsed.steps.map((step) => step.node)].flatMap((selector) =>
      selector.conditions.flatMap(({ key, op, values }) =>
        key !== made.tagsKey || (op !== "=" && op !== "!=")
          ? []
          : values.filter((value) => !value.startsWith("@")).map((value) => `no tag ${value}; a tag is written with its @, as @${value}`)
      )
    )
  )]

/** The known word nearest to `word` by edit distance, if any is near enough to be what was meant. */
export const closest = (word: string, known: Iterable<string>): string | undefined => {
  let best: string | undefined
  let bestDistance = Math.max(2, Math.ceil(word.length / 2)) + 1
  for (const candidate of [...known].sort()) {
    const distance = editDistance(word.toLowerCase(), candidate.toLowerCase())
    if (distance < bestDistance) {
      best = candidate
      bestDistance = distance
    }
  }
  return best
}

const editDistance = (a: string, b: string): number => {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const current = [i]
    for (let j = 1; j <= b.length; j++) {
      current.push(Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1)))
    }
    previous = current
  }
  return previous[b.length]!
}
