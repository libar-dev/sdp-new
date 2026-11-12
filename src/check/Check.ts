/**
 * Rule checks over a built project. Every diagnostic carries a rule id, a
 * `file:line`, and a hint phrased as an instruction, so humans and agents can
 * fix issues without reading this file. Architectural significance is never
 * checked: it is the architect's call.
 *
 * Maturity gates make declared maturity honest: a spec may claim a level only
 * when its content supports it.
 *
 *   idea       a title (anything goes; capture it before it is lost)
 *   draft      a description of the problem or intent
 *   specified  at least one scenario stating an outcome (`Then`)
 *   ready      no open questions, every scenario has an outcome, gherkin parses
 */
import { annotate } from "sdp/annotations"
import { Predicate } from "effect"
import type { Config } from "../model/Config.ts"
import { type Diagnostic, sortDiagnostics } from "../model/Diagnostic.ts"
import type { Project } from "../graph/Build.ts"
import { idsDeclaration } from "../graph/Types.ts"
import { declaredActivity } from "../lifecycle/Lifecycle.ts"
import type { Spec } from "../parse/Spec.ts"

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

/** How lines of `sdp new` templates begin that ask the author to write something in their place. */
const placeholderLines = [
  "One sentence capturing the idea.",
  "Who needs what, and why.",
  "Which quality matters, for whom, and why.",
  "What forces are at play?",
  "1. **Option A** — pros / cons",
  "We will …",
  "What becomes easier or harder.",
  "Responsibility in one or two sentences.",
  "The problem this pattern solves and how",
  "What must be true to pass this milestone."
]
const placeholderQuestion = "What is still unknown?"
/** Template scenarios name their parts in angle brackets: `Given <context>`. */
const placeholderStep = /^<[^<>]+>$/

/** Template text still in a spec, with its line: prose, the open question, scenario names and steps. */
export const templatePlaceholders = (spec: Spec): ReadonlyArray<{ readonly text: string; readonly line: number }> => {
  const found: Array<{ text: string; line: number }> = []
  let fence: string | undefined
  spec.body.split("\n").forEach((raw, index) => {
    const text = raw.trim()
    const opens = /^(`{3,}|~{3,})/.exec(text)?.[1]
    if (fence === undefined && opens) fence = opens
    else if (fence !== undefined && text.startsWith(fence)) fence = undefined
    else if (fence === undefined) {
      const placeholder = placeholderLines.find((p) => text.startsWith(p))
      if (placeholder) found.push({ text: placeholder, line: spec.bodyLine + index })
    }
  })
  for (const question of spec.openQuestions) if (question.text === placeholderQuestion) found.push(question)
  for (const scenario of spec.scenarios) {
    if (placeholderStep.test(scenario.name)) found.push({ text: `Scenario: ${scenario.name}`, line: scenario.line })
    for (const step of scenario.steps) if (placeholderStep.test(step.text)) found.push({ text: `${step.keyword} ${step.text}`, line: step.line })
  }
  return found.sort((a, b) => a.line - b.line)
}

/**
 * Attributes whose values name lifecycle nodes, with the kind they must name: the configured plan
 * relations name iterations, the phase relations phases. Anything else is a typo or a missing plan entry.
 */
const planKeys = (config: Config): ReadonlyArray<readonly [string, string]> => [
  ...config.planRelations.map((key) => [key, "iteration"] as const),
  ...config.phaseRelations.map((key) => [key, "phase"] as const)
]

/** Every rule check over a built project, as diagnostics with `file:line` and a hint; significance is never checked. */
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

  for (const spec of project.specs) {
    const placeholders = templatePlaceholders(spec)
    if (placeholders.length > 0) {
      const [first] = placeholders
      out.push({
        rule: "template-placeholder",
        severity: "warning",
        message: `${spec.id} still has template text: "${first!.text}"${placeholders.length > 1 ? ` (and ${placeholders.length - 1} more)` : ""}`,
        node: spec.id,
        source: at(spec, first!.line),
        hint: "replace the template's text with your own, or delete it"
      })
    }
    const owners = [
      { id: spec.id, attrs: spec.attrs, line: (key: string) => spec.attrLines[key] ?? 1 },
      ...spec.inlineNodes.map((inline) => ({ id: inline.id, attrs: inline.attrs, line: () => inline.line }))
    ]
    for (const owner of owners) {
      const planReference = (key: string, value: unknown, kind: string) => {
        const known = graph.ofKind(kind).map((n) => n.id)
        out.push({
          rule: "plan-reference",
          severity: "warning",
          message: `${owner.id}: ${key} "${String(value)}" names no ${kind}`,
          node: owner.id,
          source: at(spec, owner.line(key.split(".")[0]!)),
          hint: known.length > 0
            ? `use one of the declared ${kind} ids: ${known.join(", ")}`
            : `declare the ${kind} in a plan (sdp new plan) or remove \`${key}: ${String(value)}\``
        })
      }
      for (const [key, kind] of planKeys(config)) {
        const values = [owner.attrs[key]].flat().filter(Predicate.isString)
        for (const value of values.filter((v) => graph.node(v)?.kind !== kind)) planReference(key, value, kind)
      }
      if (owner.attrs.activity === undefined) continue
      const activity = declaredActivity(owner.attrs)
      if (activity === undefined) {
        out.push({
          rule: "plan-reference",
          severity: "warning",
          message: `${owner.id}: activity should map disciplines to iterations`,
          node: owner.id,
          source: at(spec, owner.line("activity")),
          hint: "write `activity: { implementation: C1, test: [C1, T1] }`"
        })
        continue
      }
      for (const [discipline, values] of activity) {
        if (!Object.hasOwn(config.disciplines, discipline)) {
          out.push({
            rule: "plan-reference",
            severity: "warning",
            message: `${owner.id}: activity names "${discipline}", which is not a discipline`,
            node: owner.id,
            source: at(spec, owner.line("activity")),
            hint: `use one of: ${Object.keys(config.disciplines).join(", ")}, or add it under lifecycle.disciplines in the configuration`
          })
        }
        for (const value of values.filter((v) => !Predicate.isString(v) || graph.node(v)?.kind !== "iteration")) {
          planReference(`activity.${discipline}`, value, "iteration")
        }
      }
    }
  }

  if (project.types !== undefined && project.types !== idsDeclaration(project)) {
    out.push({
      rule: "types-stale",
      severity: "warning",
      message: `${project.config.types} no longer matches the graph, so annotate() may accept removed ids or reject new ones`,
      source: { file: project.config.types, line: 1 },
      hint: "run `sdp types` to regenerate it"
    })
  }

  for (const spec of project.specs) {
    for (const scenario of spec.scenarios) {
      if (scenario.steps.length === 0) {
        out.push({
          rule: "scenario-empty",
          severity: "warning",
          message: `${scenario.id} has no steps`,
          node: scenario.id,
          source: { file: spec.file, line: scenario.line },
          hint: "write its Given/When/Then steps or delete the scenario"
        })
      }
    }
  }
  return sortDiagnostics(out)
}
annotate(check, { is: "ARCH-checker" })
