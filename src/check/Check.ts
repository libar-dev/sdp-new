/**
 * Rule checks over a built project. Every diagnostic carries a rule id, a
 * `file:line`, and a hint phrased as an instruction, so humans and agents can
 * fix issues without reading this file. What belongs in the architecture is
 * never checked: declaring it is the architect's call.
 *
 * A maturity is the team's judgement of how far work still to come has come, so
 * neither its value nor the content behind it is checked. What is checked is
 * what is live — a Feature or a Rule that declares no maturity: a live rule has
 * an example.
 */
import { Predicate } from "effect"
import { type Diagnostic, diagnostic, sortDiagnostics } from "../model/Diagnostic.ts"
import type { GraphNode, SourceRef } from "../model/Graph.ts"
import {
  attribute,
  dayOf,
  hasKind,
  hasRelation,
  isPlanKind,
  type KindRole,
  made,
  type RelationRole,
  type Vocabulary,
  wordFor
} from "../model/Vocabulary.ts"
import { type Project, workOf } from "../graph/Build.ts"
import { lifecycle, plannedDisciplines, unmetBefore, workKind } from "../lifecycle/Lifecycle.ts"
import { codeNodeId } from "../parse/Annotations.ts"
import type { Rule } from "../parse/Gherkin.ts"
import { type Spec, suiteId } from "../parse/Spec.ts"

const isOpen = (rule: Rule) => rule.tags.includes(made.tags.open)

/** A spec whose rules are a test suite: not a decision, which holds none, nor the plan, whose scenarios are gates. */
const isSuite = (spec: Spec, vocabulary: Vocabulary) => !hasKind(vocabulary, "decision", spec.kind) && !isPlanKind(vocabulary, spec.kind)

/** The tags that declare a maturity, as written: `@maturity=ready`, or each value of one written twice. */
export const maturityTags = (maturity: unknown): string => [maturity].flat().map((value) => `@maturity=${String(value)}`).join(" ")

/** What `sdp new` writes for the author to replace. A decision starts as its shape, what it was chosen over, why and at what cost: */
export const decisionPlaceholder = "Not <what a reasonable person would have chosen>, because <why>, at the cost of <what is accepted with it>."
/** and template scenarios name their parts in angle brackets: `Given <context>`. */
const placeholderStep = /^<[^<>]+>$/

/** Template text still in a spec, with its line: its description, rule and scenario names and steps. */
const templatePlaceholders = (spec: Spec): ReadonlyArray<{ readonly text: string; readonly line: number }> => {
  const found: Array<{ text: string; line: number }> = []
  for (const paragraph of spec.description) {
    if (paragraph.text.startsWith(decisionPlaceholder)) found.push({ text: decisionPlaceholder, line: paragraph.line })
  }
  for (const rule of spec.rules) {
    if (placeholderStep.test(rule.name)) found.push({ text: `Rule: ${rule.name}`, line: rule.line })
  }
  for (const scenario of spec.scenarios) {
    if (placeholderStep.test(scenario.name)) found.push({ text: `Scenario: ${scenario.name}`, line: scenario.line })
    for (const step of scenario.steps) if (placeholderStep.test(step.text)) found.push({ text: `${step.keyword} ${step.text}`, line: step.line })
  }
  return found.sort((a, b) => a.line - b.line)
}

/** The relations whose targets must be nodes of the plan, with the kind roles one of which they must play. */
const planRelations: ReadonlyArray<readonly [RelationRole, ReadonlyArray<KindRole>]> = [
  ["plan", ["iteration"]],
  ["phase", ["phase"]],
  ["closes", ["phase", "iteration"]]
]

/**
 * Every rule check over a built project, as diagnostics with `file:line` and a hint.
 *
 * @sdp is ARCH-checker
 */
export const check = (project: Project): ReadonlyArray<Diagnostic> => {
  const out: Array<Diagnostic> = [...project.diagnostics]
  const { graph } = project
  const vocabulary = project.config.vocabulary
  const at = (spec: Spec, line = 1) => ({ file: spec.file, line })
  /** Where an attribute of `node` is written: the line of its tag in a spec, else the node's own line. */
  const writtenAt = (node: GraphNode, key: string): SourceRef | undefined => {
    const spec = project.specById.get(node.id)
    return spec ? at(spec, spec.attrLines[key] ?? 1) : node.source
  }
  const authored = graph.nodes().filter((node) =>
    node.kind !== made.kinds.scenario && node.kind !== made.kinds.code && node.kind !== made.kinds.missing
  )

  // A live rule is a test, so it has an example: without one, what is built is not tested.
  for (const spec of project.specs) {
    if (spec.id === suiteId(spec.file) || !isSuite(spec, vocabulary)) continue
    const work = workOf(spec)
    for (const rule of spec.rules) {
      if (work.rule(rule).toCome || spec.scenarios.some((scenario) => scenario.rule === rule.id)) continue
      out.push(diagnostic("untested-rule", {
        message: `${rule.id} is live, so it needs an example`,
        node: rule.id,
        source: at(spec, rule.line),
        hint: "write a Scenario under it; while it is still to come, declare a maturity above `Rule:`, such as @maturity=draft"
      }))
    }
  }

  // A question is still to come, whatever maturity it would have: examples under it would be switched off with it.
  for (const spec of project.specs) {
    for (const rule of spec.rules.filter(isOpen)) {
      const [example, ...more] = spec.scenarios.filter((scenario) => scenario.rule === rule.id)
      if (example === undefined) continue
      out.push(diagnostic("question-example", {
        message: `${rule.id} is an open question, so it has no examples: "${example.name}"${more.length > 0 ? ` and ${more.length} more` : ""} would not hold the run to anything`,
        node: rule.id,
        source: at(spec, example.line),
        hint: "answer it — name the rule after what was chosen and delete @open — or move the examples under the rule they show"
      }))
    }
  }

  // A rule still to come names the live rule it replaces, which stays live until the change that
  // builds the replacement deletes it with the link. So no two rules can replace each other.
  for (const edge of graph.edges().filter((candidate) => hasRelation(vocabulary, "replaces", candidate.rel))) {
    const from = graph.node(edge.from)
    const to = graph.node(edge.to)
    // A target that does not exist is a dangling link.
    if (!from || !to || to.kind === made.kinds.missing) continue
    const problem = from.kind !== made.kinds.rule
      ? `${edge.from} is a ${from.kind}: only a rule replaces another`
      : to.kind !== made.kinds.rule
      ? `${edge.to} is a ${to.kind}, not a rule`
      : edge.from === edge.to
      ? `${edge.from} cannot replace itself`
      : from.attrs.toCome !== true
      ? `${edge.from} is live, so what it replaced is gone: the change that builds a replacement deletes the rule it replaces and this link`
      : to.attrs.toCome === true
      ? `${edge.to} is still to come, so nothing built is replaced`
      : undefined
    if (problem === undefined) continue
    out.push(diagnostic("replacement", {
      message: `${edge.from} -${edge.rel}-> ${edge.to}: ${problem}`,
      node: edge.from,
      source: edge.source,
      hint: `a rule still to come names the live rule it replaces: @${edge.rel}:<feature>#<rule>`
    }))
  }

  // A decision says what was chosen over what, why, and the cost accepted with it. Anything more has a place of its own.
  for (const node of graph.ofKind(vocabulary.kinds.decision)) {
    const spec = project.specById.get(node.id)
    const [rule] = spec?.rules ?? []
    const [scenario] = spec?.scenarios ?? []
    if (!spec || (!rule && !scenario)) continue
    const has = [rule && `a rule ("${rule.name}")`, scenario && `a scenario ("${scenario.name}")`].filter(Boolean).join(" and ")
    out.push(diagnostic("decision-shape", {
      message: `${node.id} has ${has}: a decision is a title and one to three sentences`,
      node: node.id,
      source: at(spec, Math.min(rule?.line ?? Infinity, scenario?.line ?? Infinity)),
      hint: `a rule it imposes belongs on the spec it constrains, tagged \`@decided-by:${node.id}\`; the cost it accepts is one of its sentences; what is undecided is a Rule tagged \`@open\` on the spec it blocks`
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

  // An iteration's days place it on the timeline; anything else written there places nothing.
  for (const node of graph.ofKind(vocabulary.kinds.iteration)) {
    for (const key of [vocabulary.attributes.start, vocabulary.attributes.end]) {
      const written = attribute(node, key)
      if (written === undefined || dayOf(node, key) !== undefined) continue
      out.push(diagnostic("plan-date", {
        message: `${node.id}: ${key} is ${JSON.stringify(written)}, which is not a date, so the timeline ignores it`,
        node: node.id,
        source: writtenAt(node, key),
        hint: `write \`@${key}=YYYY-MM-DD\``
      }))
    }
  }

  // Met is a date, and milestones are met in the order of their dates: where the project is is
  // the first that is not.
  const metKey = vocabulary.attributes.met
  const plan = lifecycle(project)
  for (const milestone of plan.milestones) {
    const { met, node } = milestone
    const written = attribute(node, metKey)
    if (written === undefined) continue
    const [earlier] = unmetBefore(plan, milestone)
    const problem = met === undefined
      ? {
        message: `${node.id}: ${metKey} is ${JSON.stringify(written)}, which is not a date, so it records nothing`,
        hint: `write \`@${metKey}=YYYY-MM-DD\`, or let \`sdp gate ${node.id} --record\` write it when the gate passes`
      }
      : earlier
      ? {
        message: `${node.id} is met, but ${earlier.node.id}, which is dated before it, is not`,
        hint: `record ${earlier.node.id} first, or delete \`@${metKey}=\` from ${node.id}`
      }
      : undefined
    if (problem) out.push(diagnostic("milestone-met", { ...problem, node: node.id, source: writtenAt(node, metKey) }))
  }

  // Plans: what a plan, phase or closing relation names must be an iteration or a phase (a target
  // that does not exist at all is a dangling link), and `activity` must map disciplines to iterations.
  for (const node of authored) {
    const planReference = (rel: string, target: string, roles: ReadonlyArray<KindRole>, source: SourceRef | undefined) => {
      const known = roles.flatMap((role) => graph.ofKind(vocabulary.kinds[role]).map((n) => n.id))
      const what = roles.map((role) => vocabulary.kinds[role][0] ?? role).join(" or ")
      out.push(diagnostic("plan-reference", {
        message: `${node.id}: ${rel} "${target}" names no ${what}`,
        node: node.id,
        source,
        hint: known.length > 0
          ? `use one of the declared ${what} ids: ${known.join(", ")}`
          : `create it with ${roles.map((role) => `\`sdp new ${wordFor(vocabulary.kinds[role])}\``).join(" or ")}, or remove \`@${rel}:${target}\``
      }))
    }
    const activityKey = vocabulary.attributes.activity
    const disciplines = [...vocabulary.disciplines.keys()].join(", ")
    for (const edge of graph.out(node.id)) {
      if (edge.rel === activityKey) {
        out.push(diagnostic("plan-reference", {
          message: `${node.id}: ${activityKey} names no discipline, so its link to ${edge.to} plans nothing`,
          node: node.id,
          source: edge.source,
          hint: `name the discipline, \`@${activityKey}.implementation:${edge.to}\`; the disciplines are ${disciplines}`
        }))
      }
      const target = graph.node(edge.to)
      if (!target || target.kind === made.kinds.missing) continue
      for (const [relation, roles] of planRelations) {
        if (hasRelation(vocabulary, relation, edge.rel) && !roles.some((role) => hasKind(vocabulary, role, target.kind))) {
          planReference(edge.rel, edge.to, roles, edge.source)
        }
      }
      if (edge.rel.startsWith(`${activityKey}.`) && !hasKind(vocabulary, "iteration", target.kind)) {
        planReference(edge.rel, edge.to, ["iteration"], edge.source)
      }
    }
    // An `iteration:` plans the work of the node's kind's discipline — a rule's, its spec's; a kind in no discipline has none.
    const planned = graph.out(node.id).find((edge) =>
      hasRelation(vocabulary, "plan", edge.rel) && hasKind(vocabulary, "iteration", graph.node(edge.to)?.kind ?? "")
    )
    const kind = workKind(project, node)
    const disciplined = [...vocabulary.disciplines.values()].some((kinds) => kinds.includes(kind))
    if (planned && !disciplined && !isPlanKind(vocabulary, node.kind)) {
      out.push(diagnostic("plan-reference", {
        message: `${node.id}: kind ${kind} belongs to no discipline, so its iteration plans no discipline's work`,
        node: node.id,
        source: planned.source,
        hint: `plan the work with \`@${activityKey}.<discipline>:<iteration>\`, or add ${kind} to a discipline under vocabulary.disciplines`
      }))
    }
    for (const [discipline, edge] of plannedDisciplines(project, node)) {
      if (vocabulary.disciplines.has(discipline)) continue
      out.push(diagnostic("plan-reference", {
        message: `${node.id}: ${activityKey} names "${discipline}", which is not a discipline`,
        node: node.id,
        source: edge.source,
        hint: `use one of: ${disciplines}, or add it under vocabulary.disciplines in the configuration`
      }))
    }
    const activity = attribute(node, activityKey)
    if (activity !== undefined && (!Predicate.isObject(activity) || Array.isArray(activity))) {
      out.push(diagnostic("plan-reference", {
        message: `${node.id}: ${activityKey} should map disciplines to iterations`,
        node: node.id,
        source: writtenAt(node, activityKey),
        hint: `plan each discipline with a link of its own: \`@${activityKey}.implementation:IT-beta @${activityKey}.test:IT-beta\``
      }))
    }
  }

  // A tagged function's shape says what it gives back only when the function states it: sdp infers no type.
  const untyped = new Map(project.annotations.filter((annotation) => annotation.returnType === false).map((a) => [codeNodeId(a), a]))
  for (const [id, { file, symbolLine }] of untyped) {
    out.push(diagnostic("return-type", {
      message: `${id} states no return type, so its shape does not say what it gives back`,
      node: id,
      source: { file, line: symbolLine },
      hint: "write the type it returns after its parameters, `(…): T`: sdp reads the shape as written and infers no type"
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
