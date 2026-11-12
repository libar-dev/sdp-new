/**
 * A context bundle: everything an agent (or a new team member) needs to work
 * on one node, as a single Markdown document — the spec itself, why it is not
 * ready yet, its relationships, scenario status with the step definitions still
 * to write, the curated architecture, quality requirements and decisions in
 * reach, and the code locations already linked to it. Architecture nobody
 * marked significant appears only as a direct relationship.
 */
import { annotate } from "sdp/annotations"
import { Predicate } from "effect"
import { architectureView, isDriver, isSignificant } from "../arch/Architecture.ts"
import { gateReasons } from "../check/Check.ts"
import { formatSource, type GraphNode } from "../model/Graph.ts"
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
}

/** Everything needed to work on one node, as one Markdown document: spec, links, readiness, scenarios, curated architecture, decisions, code. */
export const contextBundle = (project: Project, id: string, depth = 2, steps?: ContextSteps): string | undefined => {
  const { graph } = project
  const node = graph.node(id)
  if (!node) return undefined
  const spec = project.specById.get(id)
  const out: Array<string> = []
  const describe = (n: GraphNode) => `${n.id} — ${n.title} (${n.kind}${statusOf(n)}) ${formatSource(n.source)}`.trimEnd()

  out.push(`# ${node.id} — ${node.title}`, "")
  out.push(`kind: ${node.kind}${statusOf(node)}  ·  source: ${formatSource(node.source) || "n/a"}`, "")
  const attrs = Object.entries(node.attrs).filter(([k]) => !["summary", "file", "title"].includes(k))
  if (attrs.length > 0) {
    out.push("```yaml", ...attrs.map(([k, v]) => `${k}: ${JSON.stringify(v)}`), "```", "")
  }
  if (spec) out.push(...notReady(project, spec))
  if (spec) out.push("## Specification", "", spec.body.trim(), "")

  const outgoing = graph.out(id).filter((e) => e.rel !== "verifies")
  const incoming = graph.in(id).filter((e) => e.rel !== "verifies")
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

  if (spec && spec.scenarios.length > 0) {
    out.push(`## Scenarios (${spec.scenarios.length})`, "")
    for (const s of spec.scenarios) {
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
        ""
      )
    }
  }

  // Curated context within reach: significant nodes, the patterns of the curated view, decisions.
  const reach = neighbourhood(project, id, depth)
  const curated = new Set(architectureView(project).nodes.map((n) => n.id))
  const significant = reach.filter((n) => isSignificant(n) && n.id !== id)
  // Decisions that no longer apply (superseded, rejected, deprecated) are not context for new work.
  const decisions = reach.filter((n) => n.kind === "decision" && n.id !== id && isActive(n))
  const patterns = reach.filter((n) => n.kind === "pattern" && n.id !== id && curated.has(n.id) && !isSignificant(n))
  const qualities = reach.filter((n) => n.id !== id && n.kind !== "decision" && isDriver(project, n))
  if (significant.length > 0) {
    out.push(`## Significant architecture within ${depth} hops`, "")
    for (const n of significant) {
      out.push(`- ${describe(n)}${Predicate.isString(n.attrs.rationale) ? `\n  rationale: ${n.attrs.rationale}` : ""}`)
    }
    out.push("")
  }
  if (patterns.length > 0) out.push("## Patterns", "", ...patterns.map((n) => `- ${describe(n)}`), "")
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
  const code = reach.filter((n) => n.kind === "code")
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

/** Why a spec below `ready` is not ready: the ready gate's reasons, or that its content already meets it. */
const notReady = (project: Project, spec: Spec): ReadonlyArray<string> => {
  const { maturity: ladder } = project.config
  const maturity = spec.attrs.maturity
  if (!Predicate.isString(maturity) || !ladder.includes("ready") || ladder.indexOf(maturity) < 0) return []
  if (ladder.indexOf(maturity) >= ladder.indexOf("ready")) return []
  const reasons = gateReasons(spec, "ready")
  return [
    "## Not ready yet",
    "",
    ...(reasons.length > 0
      ? [`Maturity is ${maturity}; for ready:`, ...reasons.map((reason) => `- ${reason}`)]
      : [`Maturity is ${maturity}, but the content already meets the ready gate: set \`maturity: ready\` if the team agrees.`]),
    ""
  ]
}

/** What a quality requirement measures: the outcome steps of each of its scenarios. */
const measures = (spec: Spec | undefined): ReadonlyArray<string> =>
  (spec?.scenarios ?? []).flatMap((scenario) => {
    const outcomes = (scenario.pickles[0]?.steps ?? []).filter((step) => step.type === "Outcome").map((step) => step.text)
    return outcomes.length > 0 ? [outcomes.join("; ")] : []
  })

/** What was decided: a `decision` attribute, else the `## Decision` (or Outcome) section, else the summary. */
const decisionText = (node: GraphNode, spec: Spec | undefined): string | undefined => {
  if (Predicate.isString(node.attrs.decision)) return node.attrs.decision
  const section = spec ? sectionText(spec.body, /^(decision|outcome)\b/i) : ""
  if (section) return section.length > 280 ? `${section.slice(0, 279).trimEnd()}…` : section
  return Predicate.isString(node.attrs.summary) ? node.attrs.summary : undefined
}

/** The prose under the first heading matching `heading`, up to the next heading of that level or above. */
const sectionText = (body: string, heading: RegExp): string => {
  const lines = body.split("\n")
  const start = lines.findIndex((line) => {
    const m = /^(#{1,6})\s+(.*)$/.exec(line)
    return m !== null && heading.test(m[2]!.trim())
  })
  if (start < 0) return ""
  const level = /^#+/.exec(lines[start]!)![0].length
  const text: Array<string> = []
  let fenced = false
  for (const line of lines.slice(start + 1)) {
    const m = /^(#{1,6})\s/.exec(line)
    if (!fenced && m && m[1]!.length <= level) break
    if (/^\s*(`{3,}|~{3,})/.test(line)) fenced = !fenced
    else if (!fenced) text.push(line.trim())
  }
  return text.join(" ").replace(/\s+/g, " ").trim()
}

const statusOf = (node: GraphNode) => {
  const parts = [
    node.attrs.maturity !== undefined ? `maturity: ${String(node.attrs.maturity)}` : undefined,
    node.attrs.stage !== undefined && node.attrs.stage !== node.attrs.maturity ? `stage: ${String(node.attrs.stage)}` : undefined,
    node.kind === "decision" && node.attrs.status !== undefined ? `status: ${String(node.attrs.status)}` : undefined,
    node.attrs.significant === true ? "significant" : undefined
  ].filter(Predicate.isString)
  return parts.length > 0 ? `, ${parts.join(", ")}` : ""
}

/** Nodes within `depth` hops in either direction, skipping scenario fan-out. */
export const neighbourhood = (project: Project, id: string, depth: number): ReadonlyArray<GraphNode> => {
  const { graph } = project
  const seen = new Set([id])
  let frontier = [id]
  // Stops when nothing new is reachable, so any depth (even Infinity) terminates.
  for (let d = 0; d < depth && frontier.length > 0; d++) {
    const next: Array<string> = []
    for (const current of frontier) {
      for (const { other } of graph.neighbours(current)) {
        if (seen.has(other)) continue
        seen.add(other)
        if (graph.node(other)?.kind !== "scenario") next.push(other)
      }
    }
    frontier = next
  }
  return [...seen].flatMap((n) => {
    const node = graph.node(n)
    return node ? [node] : []
  })
}
