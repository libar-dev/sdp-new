import { Predicate } from "effect"
import { check, maturityTags } from "../check/Check.ts"
import { type Graph, type GraphNode, tally } from "../model/Graph.ts"
import { notPassing, type ScenarioResult } from "../model/Results.ts"
import { attribute, hasKind, made, metOn } from "../model/Vocabulary.ts"
import type { Rule, Scenario } from "../parse/Gherkin.ts"
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
 * Where a rule stands: a question still `open`, a rule `still to come`, a live rule with
 * `no example`, or what the examples of a live rule verify.
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
 * The live examples this run ran that did not pass: what fails it. The graph says which examples
 * are live; each is judged by the result this run recorded, so neither a result another run wrote
 * since nor one that went stale while it ran stands in for it.
 */
export const regressions = (graph: Graph, ran: ReadonlyArray<ScenarioResult>): ReadonlyArray<string> =>
  ran.flatMap((result) => graph.node(result.id)?.attrs.toCome === true || !notPassing.has(result.status) ? [] : [result.id])

/** Where a maturity is written: the tags as written, at their line. */
export interface Written {
  readonly maturity: string
  readonly line: number
}

/** Work still to come that every example of it shows built: what a run points out, and how it becomes live. */
export interface Livable {
  /** The spec or the rule. */
  readonly id: string
  readonly file: string
  /** The maturities to delete: its own, and its feature's while its feature is still to come. */
  readonly delete: ReadonlyArray<Written>
  /** The lines of the rules still to come that keep the feature's maturity once it is deleted, by declaring it themselves. */
  readonly keep: ReadonlyArray<number>
}

/**
 * The work still to come that can be made live after a run that ran `ran`: a spec or a rule still to
 * come whose every example passed on current evidence, at least one of them in this run, with no
 * rule open and no rule without an example. A spec that qualifies is named with each of its rules
 * that declares a maturity of its own, which deleting the spec's would leave still to come;
 * otherwise each rule that qualifies is named. A rule is live only once its feature is, so a rule
 * of a feature still to come takes the feature's maturity with it, and the feature's other rules
 * still to come declare it instead.
 */
export const livable = (project: Project, ran: ReadonlySet<string>): ReadonlyArray<Livable> => {
  const { graph } = project
  const passed = (scenarios: ReadonlyArray<Scenario>) =>
    scenarios.length > 0 &&
    scenarios.every((scenario) => graph.node(scenario.id)?.attrs.status === "passed") &&
    scenarios.some((scenario) => ran.has(scenario.id))
  return project.specs.flatMap((spec): ReadonlyArray<Livable> => {
    const examples = (rule?: string) => spec.scenarios.filter((scenario) => rule === undefined || scenario.rule === rule)
    const rules = spec.rules.map((rule) => ({ rule, node: graph.node(rule.id) })).filter((rule) => rule.node !== undefined)
    const declared = attribute(spec, "maturity")
    const feature: ReadonlyArray<Written> = declared === undefined ? [] : [{ maturity: maturityTags(declared), line: spec.attrLines.maturity ?? 1 }]
    const own = (rule: Rule): ReadonlyArray<Written> => {
      const maturity = attribute(rule, "maturity")
      return maturity === undefined ? [] : [{ maturity: maturityTags(maturity), line: rule.attrLines.maturity ?? rule.line }]
    }
    const whole = graph.node(spec.id)?.attrs.toCome === true && passed(examples()) &&
      rules.every(({ node, rule }) => !isOpen(node!) && examples(rule.id).length > 0)
    if (whole) {
      return [
        { id: spec.id, file: spec.file, delete: feature, keep: [] },
        ...rules.flatMap(({ node, rule }) => node!.attrs.toCome === true && own(rule).length > 0 ? [{ id: rule.id, file: spec.file, delete: own(rule), keep: [] }] : [])
      ]
    }
    const ready = rules.filter(({ node, rule }) => node!.attrs.toCome === true && !isOpen(node!) && passed(examples(rule.id)))
    const named = new Set(ready.map(({ rule }) => rule.id))
    // The rules that would be live with their feature but are not built: they keep its maturity by declaring it.
    const keep = rules.filter(({ node, rule }) => !named.has(rule.id) && !isOpen(node!) && own(rule).length === 0).map(({ rule }) => rule.line)
    return ready.map(({ rule }) => ({ id: rule.id, file: spec.file, delete: [...feature, ...own(rule)], keep: feature.length > 0 ? keep : [] }))
  })
}

/** Counts of everything in the graph, each by the word it is counted under. */
export interface StatusSummary {
  readonly nodes: number
  readonly edges: number
  readonly specFiles: number
  readonly kinds: Readonly<Record<string, number>>
  readonly relations: Readonly<Record<string, number>>
  /** Counted the way every report counts stages: each node that has one. Rules are counted apart. */
  readonly stages: Readonly<Record<string, number>>
  /** Rules by where they stand: what the examples of a live one verify, or that it has none, is still to come or is open. */
  readonly rules: Readonly<Record<string, number>>
  /** The live examples: one that failed is a regression. */
  readonly scenarios: Readonly<Record<string, number>>
  /** The examples of work still to come, apart: whatever they did is no regression. */
  readonly toCome: Readonly<Record<string, number>>
  /** Gate scenarios (of milestones, or tagged @gate), which may be unmet without anything being broken. */
  readonly gates: Readonly<Record<string, number>>
  /** Milestones by whether they are recorded as met; the first open one is where the project is. */
  readonly milestones: Readonly<Record<string, number>>
  /** Stored results that no longer count, by what changed since they ran. */
  readonly stale: Readonly<Record<string, number>>
  /** Nodes of an architectural kind: the architecture. */
  readonly architecture: number
  readonly diagnostics: Readonly<Record<string, number>>
}

/**
 * One-screen summary of the delivery state: what `sdp status` and the MCP tool answer with.
 *
 * @sdp is ARCH-reports
 */
export const statusSummary = (project: Project): StatusSummary => {
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
    stages: counted(
      graph.nodes().flatMap((n) => n.kind !== made.kinds.rule && Predicate.isString(n.attrs.stage) ? [n.attrs.stage] : []),
      stageLadder(vocabulary).flat()
    ),
    rules: counted(graph.ofKind([made.kinds.rule]).map(ruleState), ["passing", "failing", "partial", "undefined", "unrun", "no example", "still to come", "open"]),
    scenarios: counted(scenarios.filter((n) => !gates.has(n.id) && n.attrs.toCome !== true).map((n) => n.attrs.status), resultOrder),
    toCome: counted(scenarios.filter((n) => !gates.has(n.id) && n.attrs.toCome === true).map((n) => n.attrs.status), resultOrder),
    gates: counted(scenarios.filter((n) => gates.has(n.id)).map((n) => n.attrs.status), resultOrder),
    milestones: counted(milestones.map((n) => metOn(vocabulary, n) === undefined ? "open" : "met"), ["met", "open"]),
    stale: counted(scenarios.filter((n) => n.attrs.staleBecause !== undefined).map((n) => n.attrs.staleBecause)),
    architecture: graph.nodes().filter((n) => hasKind(vocabulary, "architectural", n.kind)).length,
    diagnostics: counted(check(project).map((d) => d.severity), ["error", "warning", "info"])
  }
}
