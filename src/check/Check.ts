/**
 * Rule checks over a built project. Every diagnostic carries a rule id, a
 * `file:line`, and a hint phrased as an instruction, so humans and agents can
 * fix issues without reading this file. What belongs in the architecture is
 * never checked: declaring it is the architect's call.
 *
 * Maturity criteria make declared maturity honest: a node may claim a level only
 * when its content supports it. They run on every node that declares maturity —
 * an inline or code-declared node has no content beyond its title, so it can
 * claim no more than the first level.
 *
 *   idea       a title (anything goes; capture it before it is lost)
 *   draft      a description of the problem or intent
 *   specified  at least one scenario stating an outcome (`Then`)
 *   ready      no open questions, every scenario has an outcome, gherkin parses
 */
import { annotate } from "sdp/annotations"
import { Predicate } from "effect"
import { type Diagnostic, diagnostic, sortDiagnostics } from "../model/Diagnostic.ts"
import type { GraphNode, SourceRef } from "../model/Graph.ts"
import {
  attribute,
  criteria,
  hasKind,
  hasRelation,
  isPlanKind,
  type KindRole,
  made,
  type RelationRole
} from "../model/Vocabulary.ts"
import type { Project } from "../graph/Build.ts"
import { idsDeclaration } from "../graph/Types.ts"
import { declaredActivity } from "../lifecycle/Lifecycle.ts"
import type { OpenQuestion } from "../parse/Markdown.ts"
import type { Scenario } from "../parse/Gherkin.ts"
import type { Spec } from "../parse/Spec.ts"

const builtinLevels: ReadonlyArray<string> = Object.values(criteria)

/** What the maturity criteria look at: a spec has all of it, an inline or code-declared node none. */
interface Content {
  readonly summary: string
  readonly body: string
  readonly scenarios: ReadonlyArray<Scenario>
  readonly openQuestions: ReadonlyArray<OpenQuestion>
}

const noContent: Content = { summary: "", body: "", scenarios: [], openQuestions: [] }

/** Why `content` does not meet `level` (empty when it does). Custom levels have no criteria. */
export const unmetCriteria = (content: Content, level: string): ReadonlyArray<string> => {
  const reasons: Array<string> = []
  const index = builtinLevels.indexOf(level)
  if (index >= 1 && content.summary === "") {
    reasons.push("no description: write a paragraph on the problem or intent")
  }
  if (index >= 2 && content.scenarios.length === 0) {
    reasons.push("no scenarios: add a ```gherkin block with at least one Scenario")
  }
  if (index >= 2 && content.scenarios.length > 0 && !content.scenarios.some((s) => s.hasOutcome)) {
    reasons.push("no scenario states an outcome: add a Then step")
  }
  if (index >= 3) {
    const open = content.openQuestions.filter((q) => !q.resolved)
    if (open.length > 0) reasons.push(`${open.length} open question(s), e.g. "${open[0]!.text}" (line ${open[0]!.line})`)
    const noOutcome = content.scenarios.filter((s) => !s.hasOutcome)
    if (noOutcome.length > 0) reasons.push(`scenario "${noOutcome[0]!.name}" has no Then step`)
  }
  return reasons
}

/** The highest built-in level whose criteria the content meets. */
const achievableMaturity = (content: Content): string => {
  let best: string = builtinLevels[0]!
  for (const level of builtinLevels) {
    if (unmetCriteria(content, level).length === 0) best = level
    else break
  }
  return best
}

/** How lines of `sdp new` templates begin that ask the author to write something in their place. */
const placeholderLines = [
  "One sentence capturing the idea.",
  "Who needs what, and why.",
  "Which quality matters, for whom, and why.",
  "Not <what a reasonable person would have chosen>, because <why>.",
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
  for (const prose of spec.prose) {
    const placeholder = placeholderLines.find((p) => prose.text.startsWith(p))
    if (placeholder) found.push({ text: placeholder, line: prose.line })
  }
  for (const question of spec.openQuestions) if (question.text === placeholderQuestion) found.push(question)
  for (const scenario of spec.scenarios) {
    if (placeholderStep.test(scenario.name)) found.push({ text: `Scenario: ${scenario.name}`, line: scenario.line })
    for (const step of scenario.steps) if (placeholderStep.test(step.text)) found.push({ text: `${step.keyword} ${step.text}`, line: step.line })
  }
  return found.sort((a, b) => a.line - b.line)
}

/** The relations whose targets must be lifecycle nodes, with the kind role they must play. */
const planRelations: ReadonlyArray<readonly [RelationRole, KindRole]> = [["plan", "iteration"], ["phase", "phase"]]

/** Every rule check over a built project, as diagnostics with `file:line` and a hint. */
export const check = (project: Project): ReadonlyArray<Diagnostic> => {
  const out: Array<Diagnostic> = [...project.diagnostics]
  const { graph } = project
  const vocabulary = project.config.vocabulary
  const at = (spec: Spec, line = 1) => ({ file: spec.file, line })
  /** Where an attribute of `node` is written: its line in a spec's front matter, else the node's own line. */
  const written = (node: GraphNode, key: string): SourceRef | undefined => {
    const spec = project.specById.get(node.id)
    return spec ? at(spec, spec.attrLines[key] ?? 1) : node.source
  }
  const authored = graph.nodes().filter((node) =>
    node.kind !== made.kinds.scenario && node.kind !== made.kinds.code && node.kind !== made.kinds.missing
  )

  for (const node of graph.nodes()) {
    const maturity = attribute(node, "maturity")
    if (maturity === undefined) continue
    const spec = project.specById.get(node.id)
    const source = spec ? at(spec) : node.source
    if (!Predicate.isString(maturity) || !vocabulary.maturity.includes(maturity)) {
      out.push(diagnostic("maturity-value", {
        message: `${node.id}: unknown maturity "${String(maturity)}"`,
        node: node.id,
        source,
        hint: `use one of: ${vocabulary.maturity.join(", ")}`
      }))
      continue
    }
    const content = spec ?? noContent
    const reasons = unmetCriteria(content, maturity)
    if (reasons.length > 0) {
      out.push(diagnostic("maturity-criteria", {
        message: `${node.id} claims maturity "${maturity}" but ${reasons.join("; ")}`,
        node: node.id,
        source,
        hint: spec
          ? `fix the content or lower maturity to "${achievableMaturity(content)}"`
          : `give it a spec file of its own for content beyond a title, or lower maturity to "${achievableMaturity(content)}"`
      }))
    } else {
      // Only worth mentioning once there is behaviour to look at; idea → draft is noise.
      const achievable = achievableMaturity(content)
      if (
        vocabulary.maturity.indexOf(achievable) > vocabulary.maturity.indexOf(maturity) &&
        builtinLevels.indexOf(achievable) >= builtinLevels.indexOf(criteria.specified)
      ) {
        out.push(diagnostic("maturity-promotable", {
          message: `${node.id} meets the criteria of "${achievable}" but is marked "${maturity}"`,
          node: node.id,
          source,
          hint: `set maturity: ${achievable} if the team agrees`
        }))
      }
    }
  }

  // A decision says what was chosen over what, and why. Anything more has a place of its own.
  for (const node of graph.ofKind(vocabulary.kinds.decision)) {
    const spec = project.specById.get(node.id)
    // The title is a heading too; a section is any heading below it.
    const section = spec?.sections.find((heading) => heading.level > 1)
    const [scenario] = spec?.scenarios ?? []
    if (!spec || (!section && !scenario)) continue
    const has = [section && `a section ("${section.heading}")`, scenario && `a scenario ("${scenario.name}")`].filter(Boolean).join(" and ")
    out.push(diagnostic("decision-shape", {
      message: `${node.id} has ${has}: a decision is a title and one to three sentences`,
      node: node.id,
      source: at(spec, Math.min(section?.line ?? Infinity, scenario?.line ?? Infinity)),
      hint: "a rule is a scenario on what it constrains, which links here with `decided-by`; a cost is a risk; what is undecided is an open question on the spec it blocks"
    }))
  }

  for (const spec of project.specs) {
    const placeholders = templatePlaceholders(spec)
    if (placeholders.length === 0) continue
    const [first] = placeholders
    out.push(diagnostic("template-placeholder", {
      message: `${spec.id} still has template text: "${first!.text}"${placeholders.length > 1 ? ` (and ${placeholders.length - 1} more)` : ""}`,
      node: spec.id,
      source: at(spec, first!.line),
      hint: "replace the template's text with your own, or delete it"
    }))
  }

  // Plans: what a plan or phase relation names must be an iteration or a phase (a target that does
  // not exist at all is a dangling link), and `activity:` must map disciplines to iterations.
  for (const node of authored) {
    const planReference = (rel: string, target: string, role: KindRole, key: string) => {
      const known = graph.ofKind(vocabulary.kinds[role]).map((n) => n.id)
      const what = vocabulary.kinds[role][0] ?? role
      out.push(diagnostic("plan-reference", {
        message: `${node.id}: ${rel} "${target}" names no ${what}`,
        node: node.id,
        source: written(node, key),
        hint: known.length > 0
          ? `use one of the declared ${what} ids: ${known.join(", ")}`
          : `declare the ${what} in a plan (sdp new plan) or remove \`${rel}: ${target}\``
      }))
    }
    const activityKey = vocabulary.attributes.activity
    for (const edge of graph.out(node.id)) {
      const target = graph.node(edge.to)
      if (!target || target.kind === made.kinds.missing) continue
      for (const [relation, role] of planRelations) {
        if (vocabulary.relations[relation].includes(edge.rel) && !hasKind(vocabulary, role, target.kind)) {
          planReference(edge.rel, edge.to, role, edge.rel)
        }
      }
      if (edge.rel.startsWith(`${activityKey}.`) && !hasKind(vocabulary, "iteration", target.kind)) {
        planReference(edge.rel, edge.to, "iteration", activityKey)
      }
    }
    // An `iteration:` plans the work of the node's kind's discipline; a kind in no discipline has none.
    const planned = graph.out(node.id).find((edge) =>
      hasRelation(vocabulary, "plan", edge.rel) && hasKind(vocabulary, "iteration", graph.node(edge.to)?.kind ?? "")
    )
    const disciplined = [...vocabulary.disciplines.values()].some((kinds) => kinds.includes(node.kind))
    if (planned && !disciplined && !isPlanKind(vocabulary, node.kind)) {
      out.push(diagnostic("plan-reference", {
        message: `${node.id}: kind ${node.kind} belongs to no discipline, so its iteration plans no discipline's work`,
        node: node.id,
        source: planned.source,
        hint: `plan the work with \`${activityKey}: { <discipline>: <iteration> }\`, or add ${node.kind} to a discipline under vocabulary.disciplines`
      }))
    }
    if (attribute(node, activityKey) === undefined) continue
    const activity = declaredActivity(vocabulary, node.attrs)
    if (activity === undefined) {
      out.push(diagnostic("plan-reference", {
        message: `${node.id}: ${activityKey} should map disciplines to iterations`,
        node: node.id,
        source: written(node, activityKey),
        hint: `write \`${activityKey}: { implementation: C1, test: [C1, T1] }\``
      }))
      continue
    }
    for (const discipline of activity.keys()) {
      if (vocabulary.disciplines.has(discipline)) continue
      out.push(diagnostic("plan-reference", {
        message: `${node.id}: ${activityKey} names "${discipline}", which is not a discipline`,
        node: node.id,
        source: written(node, activityKey),
        hint: `use one of: ${[...vocabulary.disciplines.keys()].join(", ")}, or add it under vocabulary.disciplines in the configuration`
      }))
    }
  }

  if (project.types !== undefined && project.types !== idsDeclaration(project)) {
    out.push(diagnostic("types-stale", {
      message: `${project.config.types} no longer matches the graph, so annotate() may accept removed ids or reject new ones`,
      source: { file: project.config.types, line: 1 },
      hint: "run `sdp types` to regenerate it"
    }))
  }

  for (const spec of project.specs) {
    for (const scenario of spec.scenarios) {
      if (scenario.steps.length === 0) {
        out.push(diagnostic("scenario-empty", {
          message: `${scenario.id} has no steps`,
          node: scenario.id,
          source: { file: spec.file, line: scenario.line },
          hint: "write its Given/When/Then steps or delete the scenario"
        }))
      }
    }
  }
  return sortDiagnostics(out)
}
annotate(check, { is: "ARCH-checker" })
