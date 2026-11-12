/**
 * Rule checks over a built project. Every diagnostic carries a rule id, a
 * `file:line`, and a hint phrased as an instruction, so humans and agents can
 * fix issues without reading this file. What belongs in the architecture is
 * never checked: declaring it is the architect's call.
 *
 * Maturity criteria make declared maturity honest: a node may claim a level only
 * when its content supports it. They run on every Feature and Rule that declares
 * a maturity, each on its own content — a Rule's is its examples —
 * and on every node declared in code, which has no content beyond its title, so
 * it can claim no more than the first level.
 *
 *   idea         a title (anything goes; capture it before it is lost)
 *   draft        a description of the problem or intent (a Rule's name says what must hold)
 *   specified    at least one scenario stating an outcome (`Then`)
 *   ready        nothing tagged `@open`, every rule has an example, every scenario
 *                states an outcome, gherkin parses
 *   implemented  what ready asks, and so is a spec that declares no maturity
 */
import { annotate } from "sdp/annotations"
import { Predicate } from "effect"
import { type Diagnostic, diagnostic, sortDiagnostics } from "../model/Diagnostic.ts"
import type { GraphNode, SourceRef } from "../model/Graph.ts"
import {
  attribute,
  criteria,
  criteriaOf,
  dayOf,
  hasKind,
  hasRelation,
  isPlanKind,
  isToCome,
  type KindRole,
  made,
  type RelationRole,
  type Vocabulary,
  wordFor
} from "../model/Vocabulary.ts"
import type { Project } from "../graph/Build.ts"
import { idsDeclaration } from "../graph/Types.ts"
import { lifecycle, plannedDisciplines, unmetBefore, workKind } from "../lifecycle/Lifecycle.ts"
import type { Rule, Scenario } from "../parse/Gherkin.ts"
import { type OpenQuestion, type Spec, suiteId } from "../parse/Spec.ts"

const builtinLevels: ReadonlyArray<string> = Object.values(criteria)

/** What the maturity criteria look at: the content of a Feature or of a Rule, and none of a node declared in code. */
export interface Content {
  /** A Feature's first paragraph, or the reason under a Rule, which no level asks for. */
  readonly summary: string
  readonly scenarios: ReadonlyArray<Scenario>
  readonly rules: ReadonlyArray<Rule>
  readonly openQuestions: ReadonlyArray<OpenQuestion>
  /** What the content is written under. */
  readonly under: "Feature" | "Rule"
  /** Examples of rules ahead of it, judged on their own: they show it has examples, and their problems are reported at their rule. */
  readonly ahead?: ReadonlyArray<Scenario> | undefined
}

const noContent: Content = { summary: "", scenarios: [], rules: [], openQuestions: [], under: "Feature" }

const isOpen = (rule: Rule) => rule.tags.includes(made.tags.open)

/**
 * What a Feature claiming `maturity` is judged on: its first paragraph, and the rules at its
 * maturity, with their examples. A rule that declares another maturity is judged on its own; the
 * examples of one ahead of the Feature still show that it has examples. From the implemented rung
 * up, an open rule is a question still to come, not part of what is built.
 */
export const featureContent = (spec: Spec, vocabulary: Vocabulary, maturity: string): Content => {
  const built = vocabulary.maturity.includes(maturity) && !isToCome(vocabulary, maturity)
  const rank = (rung: unknown) => vocabulary.maturity.indexOf(String(rung))
  const own = (rule: Rule) => attribute(rule, "maturity")
  const rules = spec.rules.filter((rule) => {
    const declared = own(rule)
    return (declared === undefined || declared === maturity || rank(declared) < 0) && !(built && isOpen(rule))
  })
  const ids = new Set(rules.map((rule) => rule.id))
  const scenarios = spec.scenarios.filter((scenario) => scenario.rule === undefined || ids.has(scenario.rule))
  const aheadRules = new Set(spec.rules.filter((rule) => rank(own(rule)) > rank(maturity) && !isOpen(rule)).map((rule) => rule.id))
  const ahead = spec.scenarios.filter((scenario) => scenario.rule !== undefined && aheadRules.has(scenario.rule))
  const lines = new Set([...rules, ...scenarios].map((element) => element.line))
  return {
    summary: spec.summary,
    scenarios,
    rules,
    openQuestions: spec.openQuestions.filter((question) => lines.has(question.line)),
    under: "Feature",
    ahead
  }
}

/** What a Rule that declares its own maturity is judged on: its examples. Its name says what must hold, and a reason is written only where that is not plain. */
const ruleContent = (spec: Spec, rule: Rule): Content => {
  const scenarios = spec.scenarios.filter((scenario) => scenario.rule === rule.id)
  const lines = new Set([rule, ...scenarios].map((element) => element.line))
  return { summary: rule.description ?? "", scenarios, rules: [rule], openQuestions: spec.openQuestions.filter((question) => lines.has(question.line)), under: "Rule" }
}

/** Why the rules of `content` are not what ready asks: an open question, a rule without an example, an example without an outcome. */
const readyReasons = (content: Content): ReadonlyArray<string> => {
  const reasons: Array<string> = []
  const open = content.openQuestions
  if (open.length > 0) reasons.push(`${open.length} open question(s), e.g. "${open[0]!.text}" (line ${open[0]!.line})`)
  // An open rule is a question, counted above; any other rule is a to-do until it has an example.
  const bare = content.rules.filter((rule) => !content.scenarios.some((s) => s.rule === rule.id) && !open.some((q) => q.line === rule.line))
  if (bare.length > 0) reasons.push(`rule "${bare[0]!.name}" has no example (line ${bare[0]!.line})`)
  const noOutcome = content.scenarios.filter((s) => !s.hasOutcome)
  if (noOutcome.length > 0) reasons.push(`scenario "${noOutcome[0]!.name}" has no Then step`)
  return reasons
}

/** Why `content` does not meet the built-in criteria of `level` (empty when it does, or when it has none). */
export const unmetCriteria = (content: Content, level: string | undefined): ReadonlyArray<string> => {
  const reasons: Array<string> = []
  const index = level === undefined ? -1 : builtinLevels.indexOf(level)
  if (index >= 1 && content.under === "Feature" && content.summary === "") {
    reasons.push("no description: write a paragraph on the problem or intent under the Feature")
  }
  const shown = [...content.scenarios, ...(content.ahead ?? [])]
  if (index >= 2 && shown.length === 0) {
    reasons.push(`no scenarios: add a Scenario that states an outcome under ${content.under === "Rule" ? "it" : "a Rule"}`)
  }
  if (index >= 2 && shown.length > 0 && !shown.some((s) => s.hasOutcome)) {
    reasons.push("no scenario states an outcome: add a Then step")
  }
  if (index >= 3) reasons.push(...readyReasons(content))
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

/** Every rule check over a built project, as diagnostics with `file:line` and a hint. */
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

  // What a Feature, a Rule or a node declared in code claims is judged on its own content.
  for (const node of graph.nodes()) {
    const maturity = attribute(node, "maturity")
    if (maturity === undefined) continue
    const spec = project.specById.get(node.id)
    const owner = node.kind === made.kinds.rule ? project.specById.get(String(node.attrs.spec)) : undefined
    const rule = owner?.rules.find((candidate) => candidate.id === node.id)
    const source = spec ? at(spec) : owner && rule ? at(owner, rule.attrLines.maturity ?? rule.line) : node.source
    if (!Predicate.isString(maturity) || !vocabulary.maturity.includes(maturity)) {
      out.push(diagnostic("maturity-value", {
        message: `${node.id}: unknown maturity "${String(maturity)}"`,
        node: node.id,
        source,
        hint: `use one of: ${vocabulary.maturity.join(", ")}`
      }))
      continue
    }
    // A rule at its Feature's own maturity is judged with the Feature, not a second time on its own.
    if (owner && rule && attribute(owner, "maturity") === maturity) continue
    const content = spec ? featureContent(spec, vocabulary, maturity) : owner && rule ? ruleContent(owner, rule) : noContent
    const reasons = unmetCriteria(content, criteriaOf(vocabulary, maturity))
    const above = rule ? "the Rule" : "`Feature:`"
    if (reasons.length > 0) {
      out.push(diagnostic("maturity-criteria", {
        message: `${node.id} claims maturity "${maturity}" but ${reasons.join("; ")}`,
        node: node.id,
        source,
        hint: spec || rule
          ? `fix the content, or lower it: @maturity=${achievableMaturity(content)} above ${above}${
            spec && !isToCome(vocabulary, maturity) ? "; a rule still to come declares a maturity of its own" : ""
          }`
          : `give it a spec file of its own for content beyond a title, or lower its maturity in the code to ${achievableMaturity(content)}`
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
          hint: `write @maturity=${achievable} above ${above} if the team agrees`
        }))
      }
    }
  }

  // A spec that declares no maturity is implemented, from the day it is written: check asks for it,
  // and holds each of its rules to what ready asks, as a run holds their examples. A decision and
  // the plan's nodes are no such work.
  const { implemented } = vocabulary
  for (const spec of project.specs) {
    if (spec.id === suiteId(spec.file) || attribute(spec, "maturity") !== undefined) continue
    if (hasKind(vocabulary, "decision", spec.kind) || isPlanKind(vocabulary, spec.kind)) continue
    out.push(diagnostic("maturity-missing", {
      message: `${spec.id} declares no maturity, so it is ${implemented}: its examples fail a run that they do not pass`,
      node: spec.id,
      source: at(spec),
      hint: `declare how far it has come above \`Feature:\`: @maturity=${implemented} once it is built, a rung below while it is still to come`
    }))
    const content = featureContent(spec, vocabulary, implemented)
    const reasons = readyReasons(content)
    if (reasons.length === 0) continue
    out.push(diagnostic("maturity-criteria", {
      message: `${spec.id} declares no maturity, so it is ${implemented}, but ${reasons.join("; ")}`,
      node: spec.id,
      source: at(spec),
      hint: `write what is missing, or declare how far it has come: @maturity=${achievableMaturity(content)} above \`Feature:\``
    }))
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

  // A rule still to come names the implemented rule it replaces, which stays enforced until the edit
  // that builds the replacement deletes it with the link. So no two rules can replace each other.
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
      ? `${edge.from} is ${vocabulary.implemented}, so what it replaced is gone: the edit that builds a replacement deletes the rule it replaces and this link`
      : to.attrs.toCome === true
      ? `${edge.to} is still to come, so nothing built is replaced`
      : undefined
    if (problem === undefined) continue
    out.push(diagnostic("replacement", {
      message: `${edge.from} -${edge.rel}-> ${edge.to}: ${problem}`,
      node: edge.from,
      source: edge.source,
      hint: `a rule still to come names the ${vocabulary.implemented} rule it replaces: @${edge.rel}:<feature>#<rule>`
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

  if (project.types !== undefined && project.types !== idsDeclaration(project)) {
    out.push(diagnostic("types-stale", {
      message: `${project.config.types} no longer matches the graph, so annotate() may accept removed ids or reject new ones`,
      source: { file: project.config.types, line: 1 },
      hint: "run `sdp types` to regenerate it"
    }))
  }

  for (const spec of project.specs) {
    for (const scenario of spec.scenarios) {
      // An open scenario is a question: its name is all there is so far.
      if (scenario.steps.length === 0 && !scenario.tags.includes(made.tags.open)) {
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
