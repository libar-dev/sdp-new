/**
 * Rule checks over a built project. Every diagnostic carries a rule id, a
 * `file:line`, and a hint phrased as an instruction, so humans and agents can
 * fix issues without reading this file.
 *
 * Maturity gates make declared maturity honest: a spec may claim a level only
 * when its content supports it.
 *
 *   idea       a title (anything goes; capture it before it is lost)
 *   draft      a description of the problem or intent
 *   specified  at least one scenario stating an outcome (`Then`)
 *   ready      no open questions, every scenario has an outcome, gherkin parses
 */
import { Predicate } from "effect"
import { type Diagnostic, sortDiagnostics } from "../model/Diagnostic.ts"
import type { GraphNode } from "../model/Graph.ts"
import type { Project } from "../graph/Build.ts"
import type { Spec } from "../parse/Spec.ts"
import { isJustifier, significance } from "../arch/Significance.ts"

// @sdp is ARCH-checker

export interface GateFailure {
  readonly level: string
  readonly reasons: ReadonlyArray<string>
}

const builtinLevels = ["idea", "draft", "specified", "ready"] as const

/** Why `spec` does not meet `level` (empty when it does). Custom levels have no gate. */
export const gateReasons = (spec: Spec, level: string): ReadonlyArray<string> => {
  const reasons: Array<string> = []
  const index = builtinLevels.indexOf(level as (typeof builtinLevels)[number])
  if (index >= 1 && spec.summary.trim() === "" && spec.body.replace(/^#.*$/gm, "").trim() === "") {
    reasons.push("no description: write a paragraph on the problem or intent")
  }
  if (index >= 2 && spec.scenarios.length === 0) {
    reasons.push("no scenarios: add a ```gherkin block with at least one Scenario")
  }
  if (index >= 2 && spec.scenarios.length > 0 && !spec.scenarios.some((s) => s.hasOutcome)) {
    reasons.push("no scenario states an outcome: add a Then step")
  }
  if (index >= 3) {
    const open = spec.openQuestions.filter((q) => !q.resolved)
    if (open.length > 0) reasons.push(`${open.length} open question(s), e.g. "${open[0]!.text}" (line ${open[0]!.line})`)
    const noOutcome = spec.scenarios.filter((s) => !s.hasOutcome)
    if (noOutcome.length > 0) reasons.push(`scenario "${noOutcome[0]!.name}" has no Then step`)
    const empty = spec.scenarios.filter((s) => s.steps.length === 0)
    if (empty.length > 0) reasons.push(`scenario "${empty[0]!.name}" has no steps`)
  }
  return reasons
}

/** The highest built-in level whose gate the spec passes. */
export const achievableMaturity = (spec: Spec): string => {
  let best: string = builtinLevels[0]
  for (const level of builtinLevels) {
    if (gateReasons(spec, level).length === 0) best = level
    else break
  }
  return best
}

const decisionStatuses = ["proposed", "accepted", "rejected", "deprecated", "superseded"]

export const check = (project: Project): ReadonlyArray<Diagnostic> => {
  const out: Array<Diagnostic> = [...project.diagnostics]
  const { graph, config } = project
  const at = (spec: Spec, line = 1) => ({ file: spec.file, line })

  for (const spec of project.specs) {
    const maturity = spec.attrs.maturity
    if (maturity === undefined) continue
    if (!Predicate.isString(maturity) || !config.maturity.includes(maturity)) {
      out.push({
        rule: "maturity-value",
        severity: "warning",
        message: `${spec.id}: unknown maturity "${String(maturity)}"`,
        node: spec.id,
        source: at(spec),
        hint: `use one of: ${config.maturity.join(", ")}`
      })
      continue
    }
    const reasons = gateReasons(spec, maturity)
    if (reasons.length > 0) {
      out.push({
        rule: "maturity-gate",
        severity: "error",
        message: `${spec.id} claims maturity "${maturity}" but ${reasons.join("; ")}`,
        node: spec.id,
        source: at(spec),
        hint: `fix the content or lower maturity to "${achievableMaturity(spec)}"`
      })
    } else {
      // Only worth mentioning once there is behaviour to look at; idea → draft is noise.
      const achievable = achievableMaturity(spec)
      if (
        config.maturity.indexOf(achievable) > config.maturity.indexOf(maturity) &&
        builtinLevels.indexOf(achievable as (typeof builtinLevels)[number]) >= 2
      ) {
        out.push({
          rule: "maturity-promotable",
          severity: "info",
          message: `${spec.id} meets the "${achievable}" gate but is marked "${maturity}"`,
          node: spec.id,
          source: at(spec),
          hint: `set maturity: ${achievable} if the team agrees`
        })
      }
    }
  }

  for (const node of graph.ofKind("decision")) {
    const spec = project.specById.get(node.id)
    const status = node.attrs.status
    if (!Predicate.isString(status) || !decisionStatuses.includes(status)) {
      out.push({
        rule: "decision-status",
        severity: "warning",
        message: `${node.id}: decision status should be one of ${decisionStatuses.join(", ")} (got ${String(status)})`,
        node: node.id,
        source: node.source,
        hint: "set `status:` in the front matter"
      })
    }
    for (const edge of graph.out(node.id).filter((e) => e.rel === "supersedes")) {
      const old = graph.node(edge.to)
      if (old && old.kind === "decision" && old.attrs.status !== "superseded") {
        out.push({
          rule: "decision-supersede",
          severity: "warning",
          message: `${node.id} supersedes ${old.id}, but ${old.id} has status ${String(old.attrs.status)}`,
          node: old.id,
          source: old.source,
          hint: `set status: superseded on ${old.id}`
        })
      }
    }
    if (status === "superseded" && !graph.in(node.id).some((e) => e.rel === "supersedes")) {
      out.push({
        rule: "decision-supersede",
        severity: "warning",
        message: `${node.id} is superseded but no decision supersedes it`,
        node: node.id,
        source: node.source,
        hint: "add `links: { supersedes: <old id> }` to the newer decision"
      })
    }
    if (status === "accepted" && spec && !spec.headings.some((h) => /decision|outcome/i.test(h)) && !node.attrs.decision) {
      out.push({
        rule: "decision-content",
        severity: "info",
        message: `${node.id} is accepted but has no "Decision" section`,
        node: node.id,
        source: node.source,
        hint: "state the decision under a `## Decision` heading"
      })
    }
  }

  const report = significance(project)
  for (const node of report.withoutRationale) {
    out.push({
      rule: "significance-rationale",
      severity: "error",
      message: `${node.id} is marked significant without a rationale`,
      node: node.id,
      source: node.source,
      hint: "add `rationale:` saying which qualities, risks or costs of change make it significant, or remove `significant`"
    })
  }
  for (const node of report.unjustified) {
    out.push({
      rule: "significance-justification",
      severity: "warning",
      message: `${node.id} is significant but not linked to any ${project.config.architecture.justifiedBy.join("/")} or quality requirement`,
      node: node.id,
      source: node.source,
      hint: "link the decision or quality attribute that makes it significant, or demote it"
    })
  }
  if (report.overBudget) {
    out.push({
      rule: "significance-budget",
      severity: config.architecture.enforceBudget ? "error" : "warning",
      message: `${report.significant.length} of ${report.population} abstractions (${pct(report.ratio)}) are marked significant; the ${
        pct(report.budget)
      } budget allows ${report.allowed}`,
      hint: "significance is curated: demote elements whose change would not affect qualities, risks or many teams (sdp arch)"
    })
  }
  const significantIds = new Set(report.significant.map((n) => n.id))
  for (const node of graph.nodes.values()) {
    if (node.kind !== "pattern" || significantIds.has(node.id)) continue
    const users = graph.neighbours(node.id).filter(({ other }) => significantIds.has(other))
    if (users.length === 0 && !graph.neighbours(node.id).some(({ other }) => isJustifierNode(project, graph.node(other)))) {
      out.push({
        rule: "pattern-unused",
        severity: "info",
        message: `pattern ${node.id} is not applied by any significant element`,
        node: node.id,
        source: node.source,
        hint: "link the elements that apply it (`instance-of`), or drop it from the curated architecture"
      })
    }
  }

  for (const spec of project.specs) {
    for (const scenario of spec.scenarios) {
      if (scenario.steps.length === 0) {
        out.push({
          rule: "scenario-empty",
          severity: "warning",
          message: `${scenario.id} has no steps`,
          node: scenario.id,
          source: { file: spec.file, line: scenario.line }
        })
      }
    }
  }
  return sortDiagnostics(out)
}

const isJustifierNode = (project: Project, node: GraphNode | undefined) => node !== undefined && isJustifier(project, node)

const pct = (ratio: number) => `${(ratio * 100).toFixed(1)}%`
