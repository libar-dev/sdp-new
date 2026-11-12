import { annotate } from "sdp/annotations"
import { Predicate } from "effect"
import { check } from "../check/Check.ts"
import { type Graph, type GraphNode, tally } from "../model/Graph.ts"
import { notPassing, type ScenarioResult } from "../model/Results.ts"
import { attribute, hasKind, made, metOn } from "../model/Vocabulary.ts"
import type { Scenario } from "../parse/Gherkin.ts"
import { isClosed, isGate } from "../run/Evidence.ts"
import type { Project } from "./Build.ts"
import { stageLadder } from "./Query.ts"

/** Counts by word, the words of `order` first and in that order: a report reads along its ladder, as JSON too. */
const counted = (values: ReadonlyArray<unknown>, order: ReadonlyArray<string> = []): Readonly<Record<string, number>> => {
  const counts = tally(values.map(String))
  const words = [...order.filter((word) => Object.hasOwn(counts, word)), ...Object.keys(counts).filter((word) => !order.includes(word))]
  return Object.fromEntries(words.map((word) => [word, counts[word]!]))
}

const resultOrder = ["passed", "failed", "pending", "undefined", "unrun", "stale"]

const isOpen = (rule: GraphNode) => {
  const tags = rule.attrs.tags
  return Array.isArray(tags) && tags.includes(made.tags.open)
}

/**
 * Where a rule stands: a question still `open`, a rule `still to come`, an implemented rule with
 * `no example`, or what the examples of an implemented rule verify.
 */
export const ruleState = (rule: GraphNode): string =>
  isOpen(rule) ? "open" : rule.attrs.toCome === true ? "still to come" : rule.attrs.scenarios === 0 ? "no example" : String(rule.attrs.verification)

/** A rule's state as the context shows it: for a rule still to come, also the maturity it is at and what its examples did. */
export const ruleLabel = (rule: GraphNode): string => {
  const state = ruleState(rule)
  if (state !== "still to come") return state
  const at = Predicate.isString(rule.attrs.stage) ? ` at ${rule.attrs.stage}` : ""
  return `${state}${at}, ${rule.attrs.scenarios === 0 ? "no example" : String(rule.attrs.verification)}`
}

/**
 * The examples of implemented work this run ran that did not pass: what fails it. The graph says
 * which examples are implemented work; each is judged by the result this run recorded, so neither a
 * result another run wrote since nor one that went stale while it ran stands in for it.
 */
export const regressions = (graph: Graph, ran: ReadonlyArray<ScenarioResult>): ReadonlyArray<string> =>
  ran.flatMap((result) => graph.node(result.id)?.attrs.toCome === true || !notPassing.has(result.status) ? [] : [result.id])

/** Work still to come that every example of it shows built: what a run points out, to be declared implemented. */
export interface Implementable {
  /** The spec or the rule. */
  readonly id: string
  /** Where its maturity is declared, or would be: its tag, else its keyword line. */
  readonly file: string
  readonly line: number
}

/**
 * The work still to come that can be declared implemented after a run that ran `ran`: a spec or a
 * rule still to come whose every example passed on current evidence, at least one of them in this
 * run, with no rule or example open and no rule without an example. A spec that qualifies is named
 * alone; otherwise each rule that does.
 */
export const implementable = (project: Project, ran: ReadonlySet<string>): ReadonlyArray<Implementable> => {
  const { graph } = project
  const passed = (scenarios: ReadonlyArray<Scenario>) =>
    scenarios.length > 0 &&
    scenarios.every((scenario) => !scenario.tags.includes(made.tags.open) && graph.node(scenario.id)?.attrs.status === "passed") &&
    scenarios.some((scenario) => ran.has(scenario.id))
  return project.specs.flatMap((spec): ReadonlyArray<Implementable> => {
    const examples = (rule?: string) => spec.scenarios.filter((scenario) => rule === undefined || scenario.rule === rule)
    const rules = spec.rules.map((rule) => ({ rule, node: graph.node(rule.id) })).filter((rule) => rule.node !== undefined)
    const whole = graph.node(spec.id)?.attrs.toCome === true && passed(examples()) &&
      rules.every(({ node, rule }) => !isOpen(node!) && examples(rule.id).length > 0)
    if (whole) return [{ id: spec.id, file: spec.file, line: spec.attrLines.maturity ?? 1 }]
    return rules.flatMap(({ node, rule }) =>
      node!.attrs.toCome === true && !isOpen(node!) && passed(examples(rule.id))
        ? [{ id: rule.id, file: spec.file, line: attribute(rule, "maturity") === undefined ? rule.line : rule.attrLines.maturity ?? rule.line }]
        : []
    )
  })
}

/** One-screen summary of the delivery state: what `sdp status` and the MCP tool answer with. */
export const statusSummary = (project: Project) => {
  const { graph } = project
  const vocabulary = project.config.vocabulary
  const gates = new Set(project.specs.flatMap((spec) => spec.scenarios.filter((s) => isGate(s, spec, vocabulary)).map((s) => s.id)))
  // The gate of a milestone that is met is closed: it is counted with the milestones, not with the gates.
  const closed = new Set(project.specs.filter((spec) => isClosed(spec, vocabulary)).flatMap((spec) => spec.scenarios.map((s) => s.id)))
  const scenarios = graph.ofKind([made.kinds.scenario]).filter((n) => !closed.has(n.id))
  const milestones = graph.ofKind(vocabulary.kinds.milestone)
  return {
    nodes: graph.nodes().length,
    edges: graph.edges().length,
    specFiles: project.specs.length,
    kinds: Object.fromEntries(graph.kinds()),
    relations: Object.fromEntries(graph.relations()),
    /** Counted the way every report counts stages: each node that has one. Rules are counted apart. */
    stages: counted(
      graph.nodes().flatMap((n) => n.kind !== made.kinds.rule && Predicate.isString(n.attrs.stage) ? [n.attrs.stage] : []),
      stageLadder(vocabulary).flat()
    ),
    /** Rules by where they stand: what the examples of an implemented one verify, or that it has none, is still to come or is open. */
    rules: counted(graph.ofKind([made.kinds.rule]).map(ruleState), ["passing", "failing", "partial", "undefined", "unrun", "no example", "still to come", "open"]),
    /** The examples of implemented work: one that failed is a regression. */
    scenarios: counted(scenarios.filter((n) => !gates.has(n.id) && n.attrs.toCome !== true).map((n) => n.attrs.status), resultOrder),
    /** The examples of work still to come, apart: whatever they did is no regression. */
    toCome: counted(scenarios.filter((n) => !gates.has(n.id) && n.attrs.toCome === true).map((n) => n.attrs.status), resultOrder),
    /** Gate scenarios (of milestones, or tagged @gate), which may be unmet without anything being broken. */
    gates: counted(scenarios.filter((n) => gates.has(n.id)).map((n) => n.attrs.status), resultOrder),
    /** Milestones by whether they are recorded as met; the first open one is where the project is. */
    milestones: counted(milestones.map((n) => metOn(vocabulary, n) === undefined ? "open" : "met"), ["met", "open"]),
    /** Stored results that no longer count, by what changed since they ran. */
    stale: counted(scenarios.filter((n) => n.attrs.staleBecause !== undefined).map((n) => n.attrs.staleBecause)),
    /** Nodes of an architectural kind: the architecture. */
    architecture: graph.nodes().filter((n) => hasKind(vocabulary, "architectural", n.kind)).length,
    diagnostics: counted(check(project).map((d) => d.severity), ["error", "warning", "info"])
  }
}
annotate(statusSummary, { is: "ARCH-reports" })

export type StatusSummary = ReturnType<typeof statusSummary>
