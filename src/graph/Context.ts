/**
 * A context bundle: everything an agent (or a new team member) needs to work
 * on one node, as a single Markdown document. It leads with the contract —
 * the names of the node's scenarios with their status and the step
 * definitions still to write — then the spec itself, why it is not ready yet,
 * its relationships, the architecture, quality requirements and decisions in
 * reach, and the code linked to it. What is in reach is reached through
 * links: a prose mention is listed as a relationship but leads no further.
 */
import { annotate } from "sdp/annotations"
import { Predicate } from "effect"
import { description } from "../arch/Architecture.ts"
import { unmetCriteria } from "../check/Check.ts"
import { formatSource, type GraphNode } from "../model/Graph.ts"
import { attribute, criteria, hasKind, isDerived, isDriver, isMention, made, type Vocabulary } from "../model/Vocabulary.ts"
import type { Spec } from "../parse/Spec.ts"
import type { StepSignature } from "../parse/StepDefinitions.ts"
import { isActive } from "../run/Evidence.ts"
import { type Matcher, unmatchedSteps } from "../run/Match.ts"
import type { Project } from "./Build.ts"

/** The step definitions of the workspace, so the bundle can show what is not automated yet before any run. */
export interface ContextSteps {
  readonly matcher: Matcher<StepSignature>
  /** Step definition files, relative to the workspace root. */
  readonly files: ReadonlyArray<string>
  /** Registrations in those files that could not be read or cannot match, one `file:line: message` each. */
  readonly problems: ReadonlyArray<string>
}

/** Everything needed to work on one node, as one Markdown document: readiness, the scenarios, the spec, links, curated architecture, decisions, code. */
export const contextBundle = (project: Project, node: GraphNode, depth = 2, steps?: ContextSteps): string => {
  const { graph } = project
  const vocabulary = project.config.vocabulary
  const { id } = node
  const spec = project.specById.get(id)
  const out: Array<string> = []
  const statusOf = (n: GraphNode) => describeStatus(vocabulary, n)
  const describe = (n: GraphNode) => `${n.id} — ${n.title} (${n.kind}${statusOf(n)}) ${formatSource(n.source)}`.trimEnd()

  out.push(`# ${node.id} — ${node.title}`, "")
  out.push(`kind: ${node.kind}${statusOf(node)}  ·  source: ${formatSource(node.source) || "n/a"}`, "")
  const attrs = Object.entries(node.attrs).filter(([k]) => !["summary", "file", "title"].includes(k))
  if (attrs.length > 0) {
    out.push("```yaml", ...attrs.map(([k, v]) => `${k}: ${JSON.stringify(v)}`), "```", "")
  }
  if (spec) out.push(...notReady(project, spec))

  // The contract first: a scenario's name is the rule it pins, so the names with their status are the reference page.
  if (spec && spec.scenarios.length > 0) {
    out.push(`## Scenarios (${spec.scenarios.length})`, "")
    let rule: string | undefined
    for (const s of spec.scenarios) {
      if (s.rule !== undefined && s.rule !== rule) out.push("", `### ${s.rule}`)
      rule = s.rule
      const status = graph.node(s.id)?.attrs.status ?? "unrun"
      out.push(`- [${String(status)}] ${s.name} — ${spec.file}:${s.line}`)
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
    out.push("")
    if (steps) {
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

  if (spec) out.push("## Specification", "", spec.body.trim(), "")

  const outgoing = graph.out(id).filter((e) => e.rel !== vocabulary.relations.scenario)
  const incoming = graph.in(id).filter((e) => e.rel !== vocabulary.relations.scenario)
  if (outgoing.length + incoming.length > 0) {
    out.push("## Relationships", "")
    // A node that several links lead to says what it is once.
    const said = new Set<string>()
    const words = (other: GraphNode | undefined) => {
      if (!other || said.has(other.id)) return []
      said.add(other.id)
      return ownWords(other)
    }
    for (const e of outgoing) {
      const other = graph.node(e.to)
      out.push(`- ${node.id} -${e.rel}-> ${other ? describe(other) : e.to}`, ...words(other))
    }
    for (const e of incoming) {
      const other = graph.node(e.from)
      out.push(`- ${node.id} <-${e.rel}- ${other ? describe(other) : e.from}`, ...words(other))
    }
    out.push("")
  }

  // Context within reach: the architecture, quality requirements and decisions.
  const reach = neighbourhood(project, id, depth).filter((n) => n.id !== id)
  const isDecision = (n: GraphNode) => hasKind(vocabulary, "decision", n.kind)
  const architecture = reach.filter((n) => hasKind(vocabulary, "architectural", n.kind))
  // Decisions that no longer apply (superseded, rejected, deprecated) are not context for new work.
  const decisions = reach.filter((n) => isDecision(n) && isActive(n, vocabulary))
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
      for (const measure of measures(project.specById.get(n.id))) out.push(`  measure: ${measure}`)
    }
    out.push("")
  }
  if (decisions.length > 0) {
    out.push("## Decisions in reach", "")
    for (const n of decisions) {
      const decided = decisionText(n, project.specById.get(n.id))
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
    }
    out.push("")
  }
  return out.join("\n")
}
annotate(contextBundle, { is: "ARCH-reports" })

/**
 * What a node declared inside another spec says about itself. It has no text of its own to open, so
 * its text attributes are all there is: a glossary term's `definition`, an iteration's dates.
 */
const ownWords = (node: GraphNode): ReadonlyArray<string> =>
  attribute(node, "declaredIn") === undefined
    ? []
    : Object.entries(node.attrs)
      .filter(([key, value]) => Predicate.isString(value) && !isDerived(node.kind, key))
      .map(([key, value]) => `  ${key}: ${String(value)}`)

/** Why a spec below `ready` is not ready: what the criteria of ready still miss, or that its content already meets them. */
const notReady = (project: Project, spec: Spec): ReadonlyArray<string> => {
  const { maturity: ladder } = project.config.vocabulary
  const { ready } = criteria
  const maturity = spec.attrs.maturity
  if (!Predicate.isString(maturity) || !ladder.includes(ready) || ladder.indexOf(maturity) < 0) return []
  if (ladder.indexOf(maturity) >= ladder.indexOf(ready)) return []
  const reasons = unmetCriteria(spec, ready)
  return [
    "## Not ready yet",
    "",
    ...(reasons.length > 0
      ? [`Maturity is ${maturity}; for ready:`, ...reasons.map((reason) => `- ${reason}`)]
      : [`Maturity is ${maturity}, but the content already meets the criteria of ${ready}: set \`maturity: ${ready}\` if the team agrees.`]),
    ""
  ]
}

/** What a quality requirement measures: the outcome steps of each of its scenarios. */
const measures = (spec: Spec | undefined): ReadonlyArray<string> =>
  (spec?.scenarios ?? []).flatMap((scenario) => {
    const outcomes = (scenario.pickles[0]?.steps ?? []).filter((step) => step.type === "Outcome").map((step) => step.text)
    return outcomes.length > 0 ? [outcomes.join("; ")] : []
  })

/** What was decided: the `## Decision` (or Outcome) section, else the summary. */
const decisionText = (node: GraphNode, spec: Spec | undefined): string | undefined => {
  const section = spec?.sections.find((s) => /^(decision|outcome)\b/i.test(s.heading))?.text ?? ""
  if (section) return section.length > 280 ? `${section.slice(0, 279).trimEnd()}…` : section
  return Predicate.isString(node.attrs.summary) ? node.attrs.summary : undefined
}

const describeStatus = (vocabulary: Vocabulary, node: GraphNode) => {
  const maturity = attribute(node, "maturity")
  const stage = attribute(node, "stage")
  const status = attribute(node, "status")
  const parts = [
    maturity !== undefined ? `maturity: ${String(maturity)}` : undefined,
    stage !== undefined && stage !== maturity ? `stage: ${String(stage)}` : undefined,
    hasKind(vocabulary, "decision", node.kind) && status !== undefined ? `status: ${String(status)}` : undefined
  ].filter(Predicate.isString)
  return parts.length > 0 ? `, ${parts.join(", ")}` : ""
}

/** Nodes within `depth` hops in either direction along links (never prose mentions), skipping scenario fan-out. */
export const neighbourhood = (project: Project, id: string, depth: number): ReadonlyArray<GraphNode> => {
  const { graph } = project
  const vocabulary = project.config.vocabulary
  const seen = new Set([id])
  let frontier = [id]
  // Stops when nothing new is reachable, so any depth (even Infinity) terminates.
  for (let d = 0; d < depth && frontier.length > 0; d++) {
    const next: Array<string> = []
    for (const current of frontier) {
      for (const { edge, other } of graph.neighbours(current)) {
        if (seen.has(other) || isMention(vocabulary, edge)) continue
        seen.add(other)
        if (graph.node(other)?.kind !== made.kinds.scenario) next.push(other)
      }
    }
    frontier = next
  }
  return [...seen].flatMap((n) => {
    const node = graph.node(n)
    return node ? [node] : []
  })
}
