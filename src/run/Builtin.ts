/**
 * Built-in steps that assert against the project graph itself. They turn
 * architecture rules, decision guards and lifecycle milestone gates into
 * ordinary scenarios — the same format as every other specification.
 *
 *   Then the query "element !-*- decision" returns no results
 *   Then there are no error diagnostics
 */
import { Result } from "effect"
import { check } from "../check/Check.ts"
import type { Project } from "../graph/Build.ts"
import { parseQuery, projectQueryOptions, runQuery, unknownNames } from "../graph/Query.ts"
import { isRuleId, rules, type Severity } from "../model/Diagnostic.ts"
import { formatSource, type GraphNode } from "../model/Graph.ts"
import { defineSteps } from "./Steps.ts"

/**
 * Runs a query, refusing names nothing uses — a typo must not make an assertion pass vacuously —
 * and results cut short by a limit: what lies beyond the limit could prove the assertion wrong.
 */
const run = (project: Project, source: string): ReadonlyArray<GraphNode> => {
  const parsed = parseQuery(source)
  if (Result.isFailure(parsed)) throw new Error(`invalid query: ${parsed.failure.message}`)
  const unknown = unknownNames(project, parsed.success)
  if (unknown.kinds.length > 0) {
    throw new Error(
      `query "${source}" names kind ${unknown.kinds.join(", ")}, which no node has; kinds in use: ${[...project.graph.kinds().keys()].join(", ")}`
    )
  }
  if (unknown.relations.length > 0) {
    throw new Error(
      `query "${source}" names relation ${unknown.relations.join(", ")}, which no edge has; relations in use: ${
        [...project.graph.relations().keys()].join(", ")
      }`
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

const expectCount = (project: Project, source: string, ok: (n: number) => boolean, expected: string) => {
  const nodes = run(project, source)
  if (!ok(nodes.length)) {
    throw new Error(`query "${source}" returned ${nodes.length} result(s), expected ${expected}${nodes.length ? `:\n${list(nodes)}` : ""}`)
  }
}

export const builtinSteps = defineSteps(() => ({}), ({ Then }) => {
  Then("the query {string} returns no results", ({ args: [q], project }) => expectCount(project, q, (n) => n === 0, "none"))

  Then("the query {string} returns {int} result(s)", ({ args: [q, n], project }) => expectCount(project, q, (c) => c === n, `${n}`))

  Then(
    "the query {string} returns at least {int} result(s)",
    ({ args: [q, n], project }) => expectCount(project, q, (c) => c >= n, `at least ${n}`)
  )

  Then(
    "the query {string} returns at most {int} result(s)",
    ({ args: [q, n], project }) => expectCount(project, q, (c) => c <= n, `at most ${n}`)
  )

  Then("the query {string} returns:", ({ args: [q], project, table }) => {
    const actual = run(project, q).map((n) => n.id).sort()
    const rows = (table ?? []).map((row) => row[0]!)
    const expected = (rows[0] === "id" ? rows.slice(1) : rows).sort()
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`query "${q}" returned [${actual.join(", ")}], expected [${expected.join(", ")}]`)
    }
  })

  Then("every node matching {string} also matches {string}", ({ args: [a, b], project }) => {
    const allowed = new Set(run(project, b).map((n) => n.id))
    const offenders = run(project, a).filter((n) => !allowed.has(n.id))
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

  Then("the node {string} has {word} {string}", ({ args: [id, key, value], project }) => {
    const node = project.graph.node(id)
    if (!node) throw new Error(`no node ${id}`)
    const actual = key === "kind" ? node.kind : key === "title" ? node.title : node.attrs[key]
    if (String(actual) !== value) throw new Error(`${id}.${key} is ${JSON.stringify(actual)}, expected ${JSON.stringify(value)}`)
  })
}, { name: "sdp/builtin" })
