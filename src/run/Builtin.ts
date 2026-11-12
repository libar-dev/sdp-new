/**
 * Built-in steps that assert against the project graph itself. They turn
 * architecture rules, decision guards and lifecycle milestone gates into
 * ordinary scenarios — the same format as every other specification.
 *
 *   Then the query "element !-*- decision" returns no results
 *   Then there are no error diagnostics
 */
import { annotate } from "sdp/annotations"
import { Result } from "effect"
import { check } from "../check/Check.ts"
import type { Project } from "../graph/Build.ts"
import { parseQuery, projectQueryOptions, type Query, runQuery, unknownWords } from "../graph/Query.ts"
import { isRuleId, problemLine, rules, type Severity, unreadRules } from "../model/Diagnostic.ts"
import { formatSource, type GraphNode } from "../model/Graph.ts"
import { attribute, made } from "../model/Vocabulary.ts"
import { defineSteps, type StepContext } from "./Steps.ts"

annotate(import.meta, { is: "ARCH-runner" })

type Asserting = Pick<StepContext<unknown, ReadonlyArray<unknown>>, "project" | "scenario">

/** Attributes a node has only through results; `status` is one on scenarios, while decisions and risks declare theirs. */
const resultAttributes: ReadonlySet<string> = new Set(made.resultAttributes)
const isResult = (key: string, onScenario: boolean) => resultAttributes.has(key) || (key === "status" && onScenario)

/** When a result was recorded is shown to no scenario, a gate included: what it found would change with every run. */
const unseen = (attribute: string, key: string) => {
  if (key !== made.recordedAt) return
  throw new Error(`${attribute} is when a result was recorded, which no scenario sees: assert on status, which says whether the result counts`)
}

/** An ordinary scenario sees the graph without results, so asserting on them could only mislead: such a scenario is a gate. */
const gatesOnly = ({ scenario }: Asserting, attribute: string) => {
  if (scenario.gate) return
  throw new Error(
    `${attribute} is derived from scenario results, and an ordinary scenario sees none; a scenario that asserts on delivery state is a gate: tag it @gate or put it in a milestone`
  )
}

/**
 * The result-derived attributes a query's conditions name. `status` is one wherever the selector
 * can match a scenario: by its id, by its kind, or by `*`, which matches every kind.
 */
const resultsRead = (project: Project, query: Query): ReadonlyArray<string> =>
  [query.start, ...query.steps.map((step) => step.node)].flatMap((selector) => {
    const onScenario = selector.ids
      ? selector.ids.some((id) => project.graph.node(id)?.kind === made.kinds.scenario)
      : selector.kinds === "*" || selector.kinds.includes(made.kinds.scenario)
    return selector.conditions.map((condition) => condition.key).filter((key) => isResult(key, onScenario))
  })

/**
 * Runs a query for an assertion, which must not pass for the wrong reason: a word the workspace
 * does not know is a typo until it is declared, a graph that was not fully read or a result cut
 * short by a limit could be proved wrong by what is missing, and an ordinary scenario cannot see
 * the results a condition names.
 */
const run = (context: Asserting, source: string): ReadonlyArray<GraphNode> => {
  const { project } = context
  const parsed = parseQuery(source)
  if (Result.isFailure(parsed)) throw new Error(`invalid query: ${parsed.failure.message}`)
  for (const attribute of resultsRead(project, parsed.success)) {
    unseen(`${attribute} in query "${source}"`, attribute)
    gatesOnly(context, `${attribute} in query "${source}"`)
  }
  const unread = project.diagnostics.filter((diagnostic) => unreadRules.has(diagnostic.rule))
  if (unread.length > 0) {
    throw new Error(
      `query "${source}" was asked of a graph that could not be fully read, so its result proves nothing; fix: ${
        unread.map(problemLine).join("; ")
      }`
    )
  }
  const unknown = unknownWords(project, parsed.success)
  if (unknown.length > 0) {
    throw new Error(
      `query "${source}" names what this workspace does not know, so it proves nothing: ${
        unknown.join("; ")
      }. Fix the word, or declare one that is meant under vocabulary.words in the configuration`
    )
  }
  const result = runQuery(project.graph, parsed.success, projectQueryOptions(project))
  if (result.truncated) {
    throw new Error(
      `query "${source}" was cut short (${result.limits.join("; ")}), so its result is incomplete and proves nothing; narrow the query`
    )
  }
  return result.nodes
}

const severities: Record<string, Severity> = { error: "error", errors: "error", warning: "warning", warnings: "warning", info: "info" }

const list = (nodes: ReadonlyArray<GraphNode>, max = 10) =>
  nodes.slice(0, max).map((n) => `  - ${n.id} (${n.kind}) ${formatSource(n.source)}`).join("\n") +
  (nodes.length > max ? `\n  … and ${nodes.length - max} more` : "")

const expectCount = (context: Asserting, source: string, ok: (n: number) => boolean, expected: string) => {
  const nodes = run(context, source)
  if (!ok(nodes.length)) {
    throw new Error(`query "${source}" returned ${nodes.length} result(s), expected ${expected}${nodes.length ? `:\n${list(nodes)}` : ""}`)
  }
}

export const builtinSteps = defineSteps(() => ({}), ({ Then }) => {
  Then("the query {string} returns no results", ({ args: [q], ...context }) => expectCount(context, q, (n) => n === 0, "none"))

  Then("the query {string} returns {int} result(s)", ({ args: [q, n], ...context }) => expectCount(context, q, (c) => c === n, `${n}`))

  Then(
    "the query {string} returns at least {int} result(s)",
    ({ args: [q, n], ...context }) => expectCount(context, q, (c) => c >= n, `at least ${n}`)
  )

  Then(
    "the query {string} returns at most {int} result(s)",
    ({ args: [q, n], ...context }) => expectCount(context, q, (c) => c <= n, `at most ${n}`)
  )

  Then("the query {string} returns:", ({ args: [q], table, ...context }) => {
    const actual = run(context, q).map((n) => n.id).sort()
    const rows = (table ?? []).map((row) => row[0]!)
    const expected = (rows[0] === "id" ? rows.slice(1) : rows).sort()
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`query "${q}" returned [${actual.join(", ")}], expected [${expected.join(", ")}]`)
    }
  })

  Then("every node matching {string} also matches {string}", ({ args: [a, b], ...context }) => {
    const allowed = new Set(run(context, b).map((n) => n.id))
    const offenders = run(context, a).filter((n) => !allowed.has(n.id))
    if (offenders.length > 0) throw new Error(`${offenders.length} node(s) match "${a}" but not "${b}":\n${list(offenders)}`)
  })

  Then("there are no {word} diagnostics", ({ args: [severity], project }) => {
    const wanted = severities[severity]
    if (!wanted) throw new Error(`unknown severity "${severity}"; use error, warning or info`)
    const found = check(project).filter((d) => d.severity === wanted)
    if (found.length > 0) {
      throw new Error(
        `${found.length} ${wanted} diagnostic(s):\n${found.slice(0, 10).map((d) => `  - [${d.rule}] ${d.message} ${formatSource(d.source)}`).join("\n")}`
      )
    }
  })

  Then("there are no diagnostics for rule {string}", ({ args: [rule], project }) => {
    if (!isRuleId(rule)) throw new Error(`unknown rule "${rule}"; rules: ${Object.keys(rules).join(", ")}`)
    const found = check(project).filter((d) => d.rule === rule)
    if (found.length > 0) throw new Error(found.map((d) => `  - ${d.message} ${formatSource(d.source)}`).join("\n"))
  })

  Then("the node {string} has {word} {string}", ({ args: [id, key, value], ...context }) => {
    const node = context.project.graph.node(id)
    if (!node || node.kind === made.kinds.missing) throw new Error(`no node ${id}`)
    unseen(`${id}.${key}`, key)
    if (isResult(key, node.kind === made.kinds.scenario)) gatesOnly(context, `${id}.${key}`)
    const actual = key === "kind" ? node.kind : key === "title" ? node.title : attribute(node, key)
    if (String(actual) !== value) throw new Error(`${id}.${key} is ${JSON.stringify(actual)}, expected ${JSON.stringify(value)}`)
  })
})
