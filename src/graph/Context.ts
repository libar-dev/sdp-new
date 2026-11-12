/**
 * A context bundle: everything an agent (or a new team member) needs to work
 * on one node, as a single Markdown document. It leads with the contract —
 * the node's rules with their state and reason, the names of its scenarios
 * with their status and the step definitions still to write — then the rest
 * of the spec as written, why it is not ready yet, what rests on it rule by rule,
 * its relationships, for an element the work on it, and the architecture,
 * quality requirements, decisions and code within reach of its links, the
 * code with its surface.
 */
import { Predicate } from "effect"
import { description, workOn } from "../arch/Architecture.ts"
import { featureContent, unmetCriteria } from "../check/Check.ts"
import { formatSource, type GraphEdge, type GraphNode } from "../model/Graph.ts"
import { attribute, criteria, hasKind, isDriver, isPlanKind, made } from "../model/Vocabulary.ts"
import type { Rule, Scenario } from "../parse/Gherkin.ts"
import type { Spec } from "../parse/Spec.ts"
import type { StepSignature } from "../parse/StepDefinitions.ts"
import { type Matcher, unmatchedSteps } from "../run/Match.ts"
import type { Project } from "./Build.ts"
import { ruleLabel } from "./Status.ts"

/** The step definitions of the workspace, so the bundle can show what is not automated yet before any run. */
export interface ContextSteps {
  readonly matcher: Matcher<StepSignature>
  /** Step definition files, relative to the workspace root. */
  readonly files: ReadonlyArray<string>
  /** Registrations in those files that could not be read or cannot match, one `file:line: message` each. */
  readonly problems: ReadonlyArray<string>
}

/**
 * Everything needed to work on one node, as one Markdown document: its contract, readiness, the rest of its spec, links, and the architecture, decisions and code in reach.
 *
 * @sdp is ARCH-reports
 */
export const contextBundle = (project: Project, node: GraphNode, depth = 2, steps?: ContextSteps): string => {
  const { graph } = project
  const vocabulary = project.config.vocabulary
  const { id } = node
  const spec = project.specById.get(id)
  const out: Array<string> = []
  const statusOf = describeStatus
  // A node without a title of its own, as an element declared by its code, is named by its id alone.
  const named = (n: GraphNode) => n.title === n.id ? n.id : `${n.id} — ${n.title}`
  const describe = (n: GraphNode) => `${named(n)} (${n.kind}${statusOf(n)}) ${formatSource(n.source)}`.trimEnd()

  out.push(`# ${named(node)}`, "")
  out.push(`kind: ${node.kind}${statusOf(node)}  ·  source: ${formatSource(node.source) || "n/a"}`, "")
  const attrs = Object.entries(node.attrs).filter(([k]) => !["summary", "file", "title"].includes(k))
  if (attrs.length > 0) out.push(`attributes: ${attrs.map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(" ")}`, "")
  if (spec) out.push(...notReady(project, spec))

  // The contract first: each rule with its state, what it rests on and why it holds, then its
  // examples with their status. Scenarios outside a rule come where they are written.
  if (spec && spec.scenarios.length + spec.rules.length > 0) {
    const open = spec.openQuestions.length
    const counts = [`${spec.rules.length} rule(s)`, `${spec.scenarios.length} scenario(s)`, ...(open > 0 ? [`${open} open`] : [])]
    out.push("## Contract", "", counts.join(", "), "")
    const scenarioLines = (s: Scenario) => {
      const status = graph.node(s.id)?.attrs.status ?? "unrun"
      out.push(`- [${s.tags.includes(made.tags.open) ? "open" : String(status)}] ${s.name} — ${spec.file}:${s.line}`)
      // What only a run knows (failures, pending steps) comes from fresh results; what is not
      // automated yet comes from matching the current step definitions, so it needs no run.
      const result = project.results?.scenarios[s.id]
      const shown = new Set<string>()
      if (result && result.hash === s.hash && graph.node(s.id)?.attrs.status !== "stale") {
        for (const step of result.examples.flatMap((example) => example.steps)) {
          const executed = step.status === "failed" || step.status === "pending"
          if (!executed && (steps || step.status === "passed" || step.status === "skipped")) continue
          if (shown.has(step.text)) continue
          shown.add(step.text)
          const definedAt = executed && step.definition ? ` (defined at ${step.definition})` : ""
          out.push(`  - ${step.status}: ${step.keyword} ${step.text}${step.error ? ` — ${step.error.split("\n")[0]}` : ""}${definedAt}`)
          if (step.snippet) out.push(`    suggested: \`${step.snippet}\``)
        }
      }
      if (steps) {
        for (const step of unmatchedSteps(project, steps.matcher, (scenario) => scenario.id === s.id)) {
          if (shown.has(step.text)) continue
          shown.add(step.text)
          out.push(
            `  - ${step.status}: ${step.keyword} ${step.text}${step.definitions ? ` — matches ${step.definitions.join(", ")}` : ""}`
          )
          if (step.snippet) out.push(`    suggested: \`${step.snippet}\``)
        }
      }
    }
    const written: ReadonlyArray<Rule | Scenario> = [...spec.rules, ...spec.scenarios.filter((s) => s.rule === undefined)]
    for (const element of [...written].sort((a, b) => a.line - b.line)) {
      if ("pickles" in element) {
        scenarioLines(element)
        continue
      }
      const rests = graph.out(element.id).filter((e) => e.rel !== made.relations.rule).map((e) => ` · ${e.rel} ${e.to}`).join("")
      if (out.at(-1) !== "") out.push("")
      out.push(`### ${element.name}`, `[${ruleLabel(graph.node(element.id)!)}] — ${spec.file}:${element.line}${rests}`, "")
      if (element.description) out.push(element.description, "")
      spec.scenarios.filter((s) => s.rule === element.id).forEach(scenarioLines)
    }
    out.push("")
    if (steps && spec.scenarios.length > 0) {
      out.push(
        "## Step definitions",
        "",
        steps.files.length > 0
          ? `Step files: ${steps.files.join(", ")}. Modules that pass the same world factory share one world per scenario.`
          : `No step files yet (the \`steps\` globs: ${project.config.steps.join(", ")}).`,
        `\`sdp run ${id} --snippets\` prints one module with every suggested definition.`,
        ...(steps.problems.length > 0
          ? ["", "Not read from the step files, so a step shown as undefined may be defined there:", ...steps.problems.map((p) => `- ${p}`)]
          : []),
        ""
      )
    }
  }

  const written = spec ? specification(spec) : ""
  if (written !== "") out.push("## Specification", "", written, "")

  // A scenario and a rule are the contract above, not relationships.
  const structural = (e: GraphEdge) => e.rel === vocabulary.relations.scenario || e.rel === made.relations.rule
  const outgoing = graph.out(id).filter((e) => !structural(e))
  const madeNodes: ReadonlyArray<string> = [made.kinds.rule, made.kinds.scenario]
  const resting = graph.in(id).filter((e) => !structural(e) && madeNodes.includes(graph.node(e.from)?.kind ?? ""))
  const incoming = graph.in(id).filter((e) => !structural(e) && !resting.includes(e))
  // What rests on this node rule by rule: the rules and scenarios of other specs that link to it.
  if (resting.length > 0) {
    out.push("## Rules that rest on this", "")
    for (const e of resting) {
      const from = graph.node(e.from)!
      const state = from.kind === made.kinds.rule ? from.attrs.verification : from.attrs.status
      out.push(`- [${String(state)}] ${from.title} (${e.rel}) — ${String(from.attrs.spec)} ${formatSource(from.source)}`)
    }
    out.push("")
  }
  if (outgoing.length + incoming.length > 0) {
    out.push("## Relationships", "")
    for (const e of outgoing) {
      const other = graph.node(e.to)
      out.push(`- ${node.id} -${e.rel}-> ${other ? describe(other) : e.to}`)
    }
    for (const e of incoming) {
      const other = graph.node(e.from)
      out.push(`- ${node.id} <-${e.rel}- ${other ? describe(other) : e.from}`)
    }
    out.push("")
  }

  // The work on an element or a pattern: what is built on it, then what is still to come, ready first.
  if (hasKind(vocabulary, "architectural", node.kind)) {
    const { implemented, toCome } = workOn(project, node)
    const stage = (n: GraphNode) => Predicate.isString(n.attrs.stage) ? ` (${n.attrs.stage})` : ""
    if (implemented.length + toCome.length > 0) {
      out.push(
        "## Work",
        "",
        ...implemented.map((n) => `- implemented: ${n.id} — ${n.title}`),
        ...toCome.map((n) => `- still to come: ${n.id}${stage(n)} — ${n.title}`),
        ""
      )
    }
  }

  // Context within reach: the architecture, quality requirements and decisions.
  const reach = neighbourhood(project, id, depth).filter((n) => n.id !== id)
  const isDecision = (n: GraphNode) => hasKind(vocabulary, "decision", n.kind)
  const architecture = reach.filter((n) => hasKind(vocabulary, "architectural", n.kind))
  const decisions = reach.filter(isDecision)
  const qualities = reach.filter((n) => !isDecision(n) && isDriver(vocabulary, n))
  if (architecture.length > 0) {
    out.push(`## Architecture within ${depth} hops`, "")
    for (const n of architecture) out.push(`- ${describe(n)}`, ...description(project, n).map((line) => `  ${line}`))
    out.push("")
  }
  if (qualities.length > 0) {
    out.push("## Quality requirements in reach", "")
    for (const n of qualities) {
      out.push(`- ${describe(n)}`)
      for (const measure of measures(project, n)) out.push(`  measure: ${measure}`)
    }
    out.push("")
  }
  if (decisions.length > 0) {
    out.push("## Decisions in reach", "")
    for (const n of decisions) {
      // The whole of it: what was chosen over what, and why, is the one thing a decision holds.
      const decided = (project.specById.get(n.id)?.description ?? []).map((paragraph) => paragraph.text).join(" ")
      out.push(`- ${describe(n)}${decided ? `\n  ${decided}` : ""}`)
    }
    out.push("")
  }
  const code = reach.filter((n) => n.kind === made.kinds.code)
  if (code.length > 0) {
    out.push("## Code", "")
    for (const n of code) {
      const links = graph.out(n.id).map((e) => `${e.rel} ${e.to}`).join(", ")
      const symbol = Predicate.isString(n.attrs.symbol) ? ` ${n.attrs.symbol}` : ""
      out.push(`- ${formatSource(n.source)}${symbol}${links ? ` — ${links}` : ""}`)
      // Its surface: the shape of the declaration, or what the file exports.
      for (const shape of [n.attrs.shape, n.attrs.exports].flat()) if (Predicate.isString(shape)) out.push(`  ${shape}`)
    }
    out.push("")
  }
  return out.join("\n")
}

/** Why a spec below `ready` is not ready: what the criteria of ready still miss, or that its content already meets them. */
const notReady = (project: Project, spec: Spec): ReadonlyArray<string> => {
  const { maturity: ladder } = project.config.vocabulary
  const { ready } = criteria
  const maturity = spec.attrs.maturity
  if (!Predicate.isString(maturity) || !ladder.includes(ready) || ladder.indexOf(maturity) < 0) return []
  if (ladder.indexOf(maturity) >= ladder.indexOf(ready)) return []
  const reasons = unmetCriteria(featureContent(spec, project.config.vocabulary, ready), ready)
  return [
    "## Not ready yet",
    "",
    ...(reasons.length > 0
      ? [`Maturity is ${maturity}; for ready:`, ...reasons.map((reason) => `- ${reason}`)]
      : [`Maturity is ${maturity}, but the content already meets the criteria of ${ready}: write \`@maturity=${ready}\` if the team agrees.`]),
    ""
  ]
}

const blockStart = /^\s*(@|(Scenario|Scenario Outline|Scenario Template|Example|Background|Rule):)/

/**
 * The spec as written, without what the contract shows: its tag lines and name, and each rule's
 * tags, name and reason. What is left is its intent, its backgrounds and its examples.
 */
const specification = (spec: Spec): string => {
  const lines = spec.body.split(/\r?\n/)
  const shown = new Set<number>()
  const feature = lines.findIndex((line) => /^\s*Feature:/.test(line))
  for (let index = 0; index <= feature; index++) shown.add(index)
  for (const rule of spec.rules) {
    let first = rule.line - 1
    while (first > 0 && lines[first - 1]!.trimStart().startsWith("@")) first--
    let end = rule.line
    while (end < lines.length && !blockStart.test(lines[end]!)) end++
    for (let index = first; index < end; index++) shown.add(index)
  }
  const kept = lines.filter((line, index) => !shown.has(index) && !(line.trim() === "" && lines[index - 1]?.trim() === ""))
  const indent = Math.min(...kept.filter((line) => line.trim() !== "").map((line) => line.length - line.trimStart().length))
  return kept.map((line) => line.slice(indent).trimEnd()).join("\n").trim()
}

/**
 * What a quality requirement measures: the outcome steps of each of its scenarios. A rule's are
 * its own examples in the spec it is a rule of, never its siblings'.
 */
const measures = (project: Project, node: GraphNode): ReadonlyArray<string> => {
  const rule = node.kind === made.kinds.rule
  const spec = project.specById.get(rule ? String(node.attrs.spec) : node.id)
  return (spec?.scenarios ?? []).filter((scenario) => !rule || scenario.rule === node.id).flatMap((scenario) => {
    const outcomes = (scenario.pickles[0]?.steps ?? []).filter((step) => step.type === "Outcome").map((step) => step.text)
    return outcomes.length > 0 ? [outcomes.join("; ")] : []
  })
}

const describeStatus = (node: GraphNode) => {
  const maturity = attribute(node, "maturity")
  const stage = attribute(node, "stage")
  const parts = [
    maturity !== undefined ? `maturity: ${String(maturity)}` : undefined,
    stage !== undefined && stage !== maturity ? `stage: ${String(stage)}` : undefined
  ].filter(Predicate.isString)
  return parts.length > 0 ? `, ${parts.join(", ")}` : ""
}

/**
 * Nodes within `depth` hops in either direction along links. Reach ends at a scenario and at the
 * plan's own nodes: what shares an iteration with a node is not its context.
 */
const neighbourhood = (project: Project, id: string, depth: number): ReadonlyArray<GraphNode> => {
  const { graph } = project
  const vocabulary = project.config.vocabulary
  const seen = new Set([id])
  let frontier = [id]
  // Stops when nothing new is reachable, so any depth (even Infinity) terminates.
  for (let d = 0; d < depth && frontier.length > 0; d++) {
    const next: Array<string> = []
    for (const current of frontier) {
      for (const { other } of graph.neighbours(current)) {
        if (seen.has(other)) continue
        seen.add(other)
        const kind = graph.node(other)?.kind ?? ""
        if (kind !== made.kinds.scenario && !isPlanKind(vocabulary, kind)) next.push(other)
      }
    }
    frontier = next
  }
  return [...seen].flatMap((n) => {
    const node = graph.node(n)
    return node ? [node] : []
  })
}
