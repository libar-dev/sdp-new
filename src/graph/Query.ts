/**
 * SDPQ — a tiny path-pattern language over the system graph, shaped like
 * Cypher's ASCII art so agents can guess it, but written on one line so it
 * fits a shell argument:
 *
 *   requirement[maturity=ready] -realized-by-> element
 *   #DEC-0003 <-*- *                      everything pointing at a node
 *   element !-*- decision                 elements with no decision
 *   element -depends-on+-> *              transitive closure
 *
 * Node selector: `kind`, `kind|kind`, `*`, `#ID` / `#ID|ID`, followed by any
 * number of `[cond, cond]` groups. Conditions: `key`, `!key`, `key=a|b`,
 * `key!=a`, `key~regex`, `key!~regex`, `key<v`, `key>=v` (numbers, dates, and
 * the maturity and stage ladders compare in order). A bare `key` asks whether
 * it is set (not missing, null, false or empty); the others compare the value
 * itself. A key reads the node's own attribute and the targets of the node's
 * links of that relation, so `[iteration=E1]` and `-iteration-> #E1` agree.
 *
 * Edge step: `-rel->` (out), `<-rel-` (in), `-rel-` (either), `*` or empty for
 * any relation but a prose mention, `a|b` for alternatives (`*|mentions` adds
 * mentions), a trailing `+` for one-or-more hops.
 * Prefix `!` keeps nodes WITHOUT such a neighbour, `?` keeps nodes WITH one;
 * both filter without moving.
 */
import { annotate } from "sdp/annotations"
import { Data, Predicate, Result } from "effect"
import type { Graph, GraphEdge, GraphNode } from "../model/Graph.ts"
import {
  defaultVocabulary,
  isMention,
  made,
  type Vocabulary,
  vocabularyWords
} from "../model/Vocabulary.ts"
import type { Project } from "./Build.ts"

annotate(import.meta, { is: "ARCH-query-engine" })

/** The syntax in a few lines, for `sdp q --help`, the MCP tool description and query errors. */
export const querySyntax = `node (edge node)*
  node  kind | kind|kind | * | #ID | #ID|ID, then [cond, ...]
  cond  key | !key | key=a|b | key!=a | key~regex | key!~regex | key<v | key>=v
        key alone: set, i.e. not missing, null, false or empty; = and ~ compare the value, so key=false finds false
        < > compare numbers, dates, and maturity/stage along idea < draft < specified < ready < failing = in-progress < verified
        a key also holds the targets of the node's links of that relation: [iteration=E1] agrees with -iteration-> #E1
  edge  -rel-> | <-rel- | -rel-   rel: * or empty for any but mentions, a|b alternatives (*|mentions for all), trailing + for one or more hops
        prefix ! keeps nodes WITHOUT such a neighbour, ? keeps nodes WITH one; neither moves
examples
  requirement[maturity<ready]
  requirement -realized-by-> element
  element !-*- decision
  element -decided-by-> decision[status=proposed]
  #DEC-0002 <-*- *
  scenario[status=failed] -verifies-> *`

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
  /** Relation names; `*` among them stands for every relation but the mention relation. */
  readonly rels: ReadonlyArray<string>
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
  /** The words the engine interprets: the mention relation, which `*` skips. */
  readonly vocabulary?: Vocabulary | undefined
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
  const context: Context = {
    graph,
    orderings: options.orderings ?? new Map(),
    vocabulary: options.vocabulary ?? defaultVocabulary
  }
  const limits = new Set<string>()
  const hopLimit = `a + edge reaches further than ${maxDepth} hops`
  const pathLimit = `a step has more than ${maxPaths} paths`
  let paths: Array<{ readonly path: QueryPath; readonly end: string }> = startNodes(context, query.start).map((
    node
  ) => ({ path: { start: node.id, steps: [] }, end: node.id }))

  for (const { edge, node } of query.steps) {
    const accept = (id: string) => {
      const candidate = graph.node(id)
      return candidate !== undefined && matchesNode(context, candidate, node)
    }
    if (edge.mode !== "move") {
      paths = paths.filter(({ end }) => {
        const reached = reachable(context, end, edge, maxDepth)
        const found = reached.hops.some((hop) => accept(hop.node))
        // A neighbour found within the limit settles the filter; only a search cut short leaves it open.
        if (!found && reached.cut) limits.add(hopLimit)
        return edge.mode === "exists" ? found : !found
      })
      continue
    }
    const next: Array<{ path: QueryPath; end: string }> = []
    const seen = new Set<string>()
    for (const { path, end } of paths) {
      const reached = reachable(context, end, edge, maxDepth)
      if (reached.cut) limits.add(hopLimit)
      for (const hop of reached.hops) {
        if (!accept(hop.node)) continue
        const key = `${pathKey(path)}>${hop.rel}>${hop.node}`
        if (seen.has(key)) continue
        seen.add(key)
        if (next.length >= maxPaths) {
          limits.add(pathLimit)
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
  return { nodes, paths: paths.map((p) => p.path), truncated: limits.size > 0, limits: [...limits] }
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

/** What evaluation reads besides the query: the graph, the ladders and the interpreted words. */
interface Context {
  readonly graph: Graph
  readonly orderings: ReadonlyMap<string, Ladder>
  readonly vocabulary: Vocabulary
}

/** In an edge step, every relation but the mention relation. */
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
 * a key also holds the targets of the node's links of that relation, so a link reads the same
 * whichever way it was written.
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
  const { graph, vocabulary } = context
  const own = ownValue(node, key)
  const linked = graph.out(node.id).filter((edge) => edge.rel === key && !isMention(vocabulary, edge)).map((edge) => edge.to)
  if (linked.length === 0) return own
  // A link written with attributes (`{ to: E1, ... }`) is its target here.
  const values = [...new Set([...scalars(own).filter((v) => !Predicate.isObject(v)), ...linked])]
  return values.length === 1 ? values[0] : values
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
const rung = (ladder: Ladder, value: string) => ladder.findIndex((words) => words.includes(value))

const compare = (value: unknown, expected: string, ladder: Ladder | undefined, op: Op): boolean => {
  let diff: number
  const a = Number(value)
  const b = Number(expected)
  if (ladder && rung(ladder, String(value)) >= 0 && rung(ladder, expected) >= 0) {
    diff = rung(ladder, String(value)) - rung(ladder, expected)
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

/** `*` follows links, never prose mentions; a mention is followed only where the query names it. */
const relMatches = (vocabulary: Vocabulary, edge: GraphEdge, rels: EdgeStep["rels"]) =>
  rels.includes(edge.rel) || (rels.includes(anyRelation) && !isMention(vocabulary, edge))

const hops = (context: Context, id: string, step: EdgeStep): Array<PathStep> => {
  const { graph, vocabulary } = context
  const result: Array<PathStep> = []
  if (step.direction !== "in") {
    for (const e of graph.out(id)) if (relMatches(vocabulary, e, step.rels)) result.push({ rel: e.rel, direction: "out", node: e.to })
  }
  if (step.direction !== "out") {
    for (const e of graph.in(id)) if (relMatches(vocabulary, e, step.rels)) result.push({ rel: e.rel, direction: "in", node: e.from })
  }
  return result
}

/** Hops for one edge step; `cut` when a transitive step stopped at `maxDepth` with nodes left to visit. */
const reachable = (
  context: Context,
  from: string,
  step: EdgeStep,
  maxDepth: number
): { readonly hops: ReadonlyArray<PathStep>; readonly cut: boolean } => {
  if (!step.transitive) return { hops: hops(context, from, step), cut: false }
  const result: Array<PathStep> = []
  const visited = new Set<string>([from])
  let frontier = [from]
  for (let depth = 0; depth < maxDepth && frontier.length > 0; depth++) {
    const next: Array<string> = []
    for (const id of frontier) {
      for (const hop of hops(context, id, step)) {
        if (visited.has(hop.node)) continue
        visited.add(hop.node)
        result.push({ ...hop, rel: `${hop.rel}+` })
        next.push(hop.node)
      }
    }
    frontier = next
  }
  const cut = frontier.some((id) => hops(context, id, step).some((hop) => !visited.has(hop.node)))
  return { hops: result, cut }
}

const pathKey = (path: QueryPath) => [path.start, ...path.steps.map((s) => `${s.rel}>${s.node}`)].join(">")

/**
 * The stage ladder: the maturity levels, then `failing` and `in-progress` as one rung — a failing
 * spec is no further along than one being automated — then `verified`.
 */
export const stageLadder = (vocabulary: Vocabulary): Ladder => [
  ...maturityLadder(vocabulary),
  [made.stages.failing, made.stages.inProgress],
  [made.stages.verified]
]

const maturityLadder = (vocabulary: Vocabulary): Ladder => vocabulary.maturity.map((level) => [level])

/** The orderings every project uses: the maturity ladder, the stage ladder and the verification ladder. */
export const projectOrderings = (vocabulary: Vocabulary): ReadonlyMap<string, Ladder> =>
  new Map([
    ["maturity", maturityLadder(vocabulary)],
    ["stage", stageLadder(vocabulary)],
    ["verification", ["none", "unrun", "undefined", "partial", "failing", "passing"].map((value) => [value])]
  ])

/** How a project's graph is queried: with its ladders and its vocabulary. */
export const projectQueryOptions = (project: Project): QueryOptions => ({
  orderings: projectOrderings(project.config.vocabulary),
  vocabulary: project.config.vocabulary
})

/** Query a project's graph with its maturity and stage ladders. */
export const queryProject = (project: Project, source: string): Result.Result<QueryResult, QueryError> =>
  query(project.graph, source, projectQueryOptions(project))

/**
 * Kinds and relations a query names that nothing in the project uses — almost
 * always a typo, and a typo in a negative assertion would otherwise pass. The
 * kinds and relations sdp makes, and those the vocabulary names, count as known.
 */
export const unknownNames = (project: Project, parsed: Query): { readonly kinds: ReadonlyArray<string>; readonly relations: ReadonlyArray<string> } => {
  const { config, graph } = project
  const words = vocabularyWords(config.vocabulary)
  const knownKinds = new Set([...graph.kinds().keys(), ...Object.values(made.kinds), ...Object.keys(config.ids), ...words.kinds])
  const knownRelations = new Set([...graph.relations().keys(), ...words.relations, anyRelation])
  const selectors = [parsed.start, ...parsed.steps.map((step) => step.node)]
  const kinds = selectors.flatMap((selector) => selector.kinds === "*" ? [] : selector.kinds).filter((kind) => !knownKinds.has(kind))
  const relations = parsed.steps.flatMap((step) => step.edge.rels).filter((rel) => !knownRelations.has(rel))
  return { kinds: [...new Set(kinds)], relations: [...new Set(relations)] }
}

/**
 * Why a query that matched nothing may have: it names a kind or relation nothing in the project
 * uses, listed with those in use. Undefined when every name is in use (or the query is invalid).
 */
export const unusedNamesNote = (project: Project, source: string): string | undefined => {
  const parsed = parseQuery(source)
  if (Result.isFailure(parsed)) return undefined
  const { kinds, relations } = unknownNames(project, parsed.success)
  const notes = [
    kinds.length > 0 ? `no kind ${kinds.join(", ")}; kinds in use: ${[...project.graph.kinds().keys()].sort().join(", ")}` : undefined,
    relations.length > 0
      ? `no relation ${relations.join(", ")}; relations in use: ${[...project.graph.relations().keys()].sort().join(", ")}`
      : undefined
  ].filter(Predicate.isString)
  return notes.length > 0 ? notes.join("\n") : undefined
}
