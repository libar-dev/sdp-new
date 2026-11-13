/**
 * Rule checks over a built project. Every diagnostic carries a rule id, a
 * `file:line`, and a hint phrased as an instruction, so humans and agents can
 * fix issues without reading this file. What belongs in the architecture is
 * never checked: declaring it is the architect's call.
 *
 * A maturity is the team's judgement of how far work still to come has come, so
 * it is checked only to be a rung of the ladder, never for what it claims, and
 * the content behind it not at all. What is checked is what is live — a Feature
 * or a Rule that declares no maturity: a live rule has an example, and, against
 * a base revision (`compareWithBase`), nothing live stops being live without an
 * error.
 */
import { Predicate } from "effect"
import { createHash } from "node:crypto"
import type { Config } from "../model/Config.ts"
import { type Diagnostic, diagnostic, sortDiagnostics } from "../model/Diagnostic.ts"
import type { GraphNode, SourceRef } from "../model/Graph.ts"
import {
  attribute,
  dayOf,
  hasKind,
  hasRelation,
  isPlanKind,
  isStage,
  isWork,
  type KindRole,
  made,
  notAKind,
  offLadder,
  type RelationRole,
  type Vocabulary,
  wordFor
} from "../model/Vocabulary.ts"
import { type Project, type SourceFile, workOf } from "../graph/Build.ts"
import { lifecycle, plannedDisciplines, unmetBefore, workKind } from "../lifecycle/Lifecycle.ts"
import { codeNodeId } from "../parse/Annotations.ts"
import type { Pickle, Rule, Scenario } from "../parse/Gherkin.ts"
import { parseFeatureSpec, prefixCaseHint, type Spec, suiteId } from "../parse/Spec.ts"

const isOpen = (rule: Rule) => rule.tags.includes(made.tags.open)

/** A spec whose rules are a test suite: not a decision, which holds none, nor the plan, whose scenarios are gates. */
const isSuite = (spec: Spec, vocabulary: Vocabulary) => !hasKind(vocabulary, "decision", spec.kind) && !isPlanKind(vocabulary, spec.kind)

/** The tags that declare a maturity, as written: `@maturity=ready`, or each value of one written twice. */
export const maturityTags = (maturity: unknown): string => [maturity].flat().map((value) => `@maturity=${String(value)}`).join(" ")

/** What a change to a feature is written as, which is no spec of its own: check and `sdp new` say it alike. */
export const changeIsRules = (feature: string) =>
  `write each as a \`Rule:\` in that ${feature}'s file, with @maturity=<rung> above it while it is still to come; sdp q ${feature} --ids lists them`

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

/** A rule, a feature or an example as a link that replaces names it: its id, its kind, and a rule's or an example's spec. */
interface Replacing {
  readonly id: string
  readonly kind: string
  readonly spec?: string | undefined
}

/** A node of the graph as a link that replaces names it. */
const replacing = (node: GraphNode): Replacing => ({
  id: node.id,
  kind: node.kind,
  spec: typeof node.attrs.spec === "string" ? node.attrs.spec : undefined
})

const isExample = (node: Replacing) => node.kind === made.kinds.scenario

/** How many characters `a` and `b` begin with alike. */
const sharedStart = (a: string, b: string): number => {
  let shared = 0
  while (shared < a.length && a[shared] === b[shared]) shared++
  return shared
}

/** Why `from` cannot replace `to`, whatever either's maturity, or undefined when it can. */
const cannotReplace = (from: Replacing, to: Replacing, vocabulary: Vocabulary): string | undefined => {
  const replaceable = (node: Replacing) => isExample(node) || node.kind === made.kinds.rule || hasKind(vocabulary, "feature", node.kind)
  return !replaceable(from)
    ? `${from.id} is a ${from.kind}: only a rule, a feature or an example replaces another`
    : !replaceable(to)
    ? `${to.id} is a ${to.kind}, not a rule, a feature or an example`
    : isExample(from) !== isExample(to)
    ? "an example replaces only an example, and a rule or a feature only a rule or a feature"
    : from.id === to.id || from.spec === to.id || to.spec === from.id
    ? `${from.id} cannot replace itself, its own feature or a rule of its own`
    : undefined
}

const replacementHint = (rel: string, from: Replacing, to: Replacing) =>
  isExample(from)
    ? `an example renamed with its steps edited, or merged into another, names each example it was, @${rel}:<feature>#<example>, in the change that does it`
    : to.spec === from.id
    ? `put \`@${rel}:${to.id}\` on the rule that replaces it, above its \`Rule:\``
    : `work still to come names the live rule or feature it replaces: @${rel}:<feature>#<rule>, or @${rel}:<feature> for all its rules`

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
  /** Where an attribute of `node` is written: the line of its tag in a spec or above a rule, else the node's own line. */
  const writtenAt = (node: GraphNode, key: string): SourceRef | undefined => {
    const spec = project.specById.get(node.id)
    if (spec) return at(spec, spec.attrLines[key] ?? 1)
    const owner = node.kind === made.kinds.rule ? project.specById.get(String(node.attrs.spec)) : undefined
    const rule = owner?.rules.find((candidate) => candidate.id === node.id)
    return owner && rule ? at(owner, rule.attrLines[key] ?? rule.line) : node.source
  }
  const authored = graph.nodes().filter((node) =>
    node.kind !== made.kinds.scenario && node.kind !== made.kinds.code && node.kind !== made.kinds.missing
  )
  /** Whether a node is work: of a kind a discipline names — a rule, its spec's — or planned by an activity tag. */
  const isWorkNode = (node: GraphNode) => isWork(vocabulary, workKind(project, node)) || plannedDisciplines(project, node).size > 0

  // Live work is a test, so it has a live rule, and a live rule an example: without one, what is
  // built is not tested. Only work is still to come at a maturity, so a rule of any other kind has
  // nothing to wait for.
  for (const spec of project.specs) {
    if (spec.id === suiteId(spec.file) || !isSuite(spec, vocabulary)) continue
    const work = workOf(spec)
    const node = graph.node(spec.id)
    const isWorkSpec = node !== undefined && isWorkNode(node)
    if (isWorkSpec && !work.spec && spec.rules.every((rule) => work.rule(rule).toCome)) {
      out.push(diagnostic("untested-feature", {
        message: `${spec.id} is live, so it needs a live rule`,
        node: spec.id,
        source: at(spec),
        hint: "write a Rule with an example under it; while its rules are still to come, declare a maturity above `Feature:`, such as @maturity=idea"
      }))
    }
    for (const rule of spec.rules) {
      if (work.rule(rule).toCome || spec.scenarios.some((scenario) => scenario.rule === rule.id)) continue
      out.push(diagnostic("untested-rule", {
        message: `${rule.id} is live, so it needs an example`,
        node: rule.id,
        source: at(spec, rule.line),
        hint: isWorkSpec
          ? "write a Scenario under it; while it is still to come, declare a maturity above `Rule:`, such as @maturity=draft"
          : `write a Scenario under it; kind ${spec.kind} belongs to no discipline, so it is no work and declares no maturity, unless you add it to one under vocabulary.disciplines`
      }))
    }
  }

  // A maturity says that work is still to come, at a rung of the team's ladder, and any other word
  // would switch its examples off in silence, whatever it claims: sdp reads none of it.
  const judge = (id: string, declared: unknown, source: SourceRef | undefined) => {
    for (const value of declared === undefined ? [] : [declared].flat()) {
      const word = String(value)
      const instead = offLadder(vocabulary, word)
      if (instead === undefined) continue
      out.push(diagnostic("maturity-off-ladder", {
        message: `${id} declares @maturity=${word}, which is no rung of the ladder ${vocabulary.maturity.join(", ")}, so its examples would fail no run`,
        node: id,
        source,
        hint: isStage(word) ? `${instead}; delete it` : `${instead}; if the work is built, delete it: what is built declares no maturity`
      }))
    }
  }
  for (const spec of project.specs) {
    judge(spec.id, attribute(spec, "maturity"), at(spec, spec.attrLines.maturity ?? 1))
    for (const rule of spec.rules) judge(rule.id, attribute(rule, "maturity"), at(spec, rule.attrLines.maturity ?? rule.line))
  }
  for (const node of authored.filter((candidate) => !project.specById.has(candidate.id) && candidate.kind !== made.kinds.rule)) {
    judge(node.id, attribute(node, "maturity"), node.source)
  }

  // How far work has come is its maturity, and a change is rules of a feature: a spec of either kind
  // would be no work, never the feature that was meant. Any other kind is the authors' word.
  const feature = wordFor(vocabulary.kinds.feature)
  for (const spec of project.specs) {
    const line = spec.attrLines.kind
    const notKind = line === undefined ? undefined : notAKind(vocabulary, spec.kind)
    if (notKind === undefined) continue
    out.push(diagnostic("not-a-kind", {
      message: `${spec.id} declares @kind=${spec.kind}: ${notKind.reason}`,
      node: spec.id,
      source: at(spec, line),
      hint: notKind.is === "retired"
        ? changeIsRules(feature)
        : notKind.is === "stage"
        ? `delete it: what is built is a live ${feature}, whose stage sdp derives from its run`
        : `write @maturity=${spec.kind} in its place: the spec is then a ${feature} at ${spec.kind}`
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

  // A rule or a feature still to come names the live rule or feature it replaces, which stays live
  // until the change that builds the replacement deletes it: so no two replace each other. A live
  // one names what was live at the base, which the comparison with the base reads, and so does an
  // example that names the one it was before its name and its steps changed.
  for (const edge of graph.edges().filter((candidate) => hasRelation(vocabulary, "replaces", candidate.rel))) {
    const from = graph.node(edge.from)
    const to = graph.node(edge.to)
    // A target that does not exist is a dangling link, or, from live work, what the base had, which
    // the comparison with the base judges.
    if (!from || !to || to.kind === made.kinds.missing) continue
    const problem = cannotReplace(replacing(from), replacing(to), vocabulary) ??
      (isExample(from)
        ? `${edge.to} is still here: an example names the one it was in the change that renames it`
        : from.attrs.toCome !== true
        ? `${edge.from} is live, so what it replaced is gone: the change that builds a replacement deletes what it replaces`
        : to.attrs.toCome === true
        ? `${edge.to} is still to come, so nothing built is replaced`
        : undefined)
    if (problem === undefined) continue
    out.push(diagnostic("replacement", {
      message: `${edge.from} -${edge.rel}-> ${edge.to}: ${problem}`,
      node: edge.from,
      source: edge.source,
      hint: replacementHint(edge.rel, replacing(from), replacing(to))
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

  // An iteration's last day places it on the timeline, and its first day only lets today be in it,
  // so a first day not written is no mistake while one that is no date is, and neither is why the
  // timeline leaves an iteration out. One diagnostic for an iteration, naming each day that is wrong.
  for (const node of graph.ofKind(vocabulary.kinds.iteration)) {
    const { end, start } = vocabulary.attributes
    const offTimeline = dayOf(node, end) === undefined
    const startNoDay = attribute(node, start) !== undefined && dayOf(node, start) === undefined
    if (!offTimeline && !startNoDay) continue
    const wrong = (key: string) => {
      const written = attribute(node, key)
      return written === undefined ? `${key} is not written` : `${key} is ${JSON.stringify(written)}, which is not a date`
    }
    const what = [
      ...(offTimeline ? [`${wrong(end)}, so the timeline leaves it out`] : []),
      ...(startNoDay ? [offTimeline ? wrong(start) : `${wrong(start)}, so today is never in it`] : [])
    ]
    const lacking = [...(offTimeline ? [end] : []), ...(startNoDay ? [start] : [])]
    out.push(diagnostic("plan-date", {
      message: `${node.id}: ${what.join("; ")}`,
      node: node.id,
      source: writtenAt(node, lacking.find((key) => attribute(node, key) !== undefined) ?? lacking[0]!),
      hint: `write ${lacking.map((key) => `\`@${key}=YYYY-MM-DD\``).join(" and ")}`
    }))
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
        hint: prefixCaseHint(target, project.config, roles.flatMap((role) => vocabulary.kinds[role])) ?? (known.length > 0
          ? `use one of the declared ${what} ids: ${known.join(", ")}`
          : `create it with ${roles.map((role) => `\`sdp new ${wordFor(vocabulary.kinds[role])}\``).join(" or ")}, or remove \`@${rel}:${target}\``)
      }))
    }
    // A milestone is dated, and so ordered, by what it closes.
    if (hasKind(vocabulary, "milestone", node.kind) && !graph.out(node.id).some((edge) => hasRelation(vocabulary, "closes", edge.rel))) {
      out.push(diagnostic("plan-reference", {
        message: `${node.id}: closes nothing, so no date places it among the milestones`,
        node: node.id,
        source: node.source,
        hint: `set \`@${wordFor(vocabulary.relations.closes)}:\` to the phase or iteration it ends`
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
    // An `iteration:` plans the work of the node's kind's discipline — a rule's, its spec's; a kind in
    // no discipline has none, and is no work unless an activity tag plans it, so a maturity of its
    // marks work still to come that nothing plans.
    const planned = graph.out(node.id).find((edge) =>
      hasRelation(vocabulary, "plan", edge.rel) && hasKind(vocabulary, "iteration", graph.node(edge.to)?.kind ?? "")
    )
    const kind = workKind(project, node)
    if (planned && !isWork(vocabulary, kind) && !isPlanKind(vocabulary, node.kind)) {
      out.push(diagnostic("plan-reference", {
        message: `${node.id}: kind ${kind} belongs to no discipline, so its iteration plans no discipline's work`,
        node: node.id,
        source: planned.source,
        hint: `plan the work with \`@${activityKey}.<discipline>:<iteration>\`, or add ${kind} to a discipline under vocabulary.disciplines`
      }))
    }
    // Said once: a node its iteration plans is told so above, and one an activity tag plans is work.
    const unplannable = !planned && !isWorkNode(node) && !isPlanKind(vocabulary, kind)
    if (attribute(node, "maturity") !== undefined && unplannable) {
      out.push(diagnostic("maturity-on-no-work", {
        message: `${node.id}: kind ${kind} belongs to no discipline, so its maturity marks work that nothing can plan`,
        node: node.id,
        source: writtenAt(node, "maturity"),
        hint: `delete the maturity — what is no work is live, and its rules have examples — or add ${kind} to a discipline under vocabulary.disciplines`
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

/** The specs of a base revision, as `sdp check` compares them with the workspace. */
export interface BaseSpecs {
  /** The commit, abbreviated, as messages name it. */
  readonly commit: string
  /** The feature files at that commit that its own configuration finds, relative to the workspace's root. */
  readonly files: ReadonlyArray<SourceFile>
  /** The configuration at that commit: its specs are read as it was configured, its vocabulary included. */
  readonly config: Config
}

/**
 * What an example tests: its steps, those of its Background first, with their arguments, and not
 * its name, its tags or its rule. A new name for an example or its rule, or a move, keeps it.
 */
const testedBy = (pickle: Pickle): string =>
  createHash("sha1")
    .update(JSON.stringify(pickle.steps.map((step) => [step.text, step.docString ?? null, step.dataTable ?? null])))
    .digest("hex")

/**
 * One example of a spec as it runs: a scenario, or one row of an outline, each judged on its own —
 * whether it is a gate, a milestone's or tagged `@gate`, which is evidence about delivery and no
 * live test, and whether it is an example of work still to come.
 */
interface Example {
  readonly spec: Spec
  readonly scenario: Scenario
  readonly pickle: Pickle
  readonly gate: boolean
  readonly live: boolean
  readonly tests: string
}

/** The examples of a set of specs, and the Features and Rules that are live. */
const liveTests = (specs: ReadonlyArray<Spec>, vocabulary: Vocabulary) => {
  const examples = specs.flatMap((spec) => {
    const work = workOf(spec)
    const milestone = hasKind(vocabulary, "milestone", spec.kind)
    return spec.scenarios.flatMap((scenario) =>
      scenario.pickles.map((pickle): Example => {
        const gate = milestone || pickle.tags.includes(made.tags.gate)
        return { spec, scenario, pickle, gate, live: !gate && !work.example(scenario), tests: testedBy(pickle) }
      })
    )
  })
  // What is built is live whatever its examples are, gates and none included.
  const built = new Set(specs.filter((spec) => isSuite(spec, vocabulary)).flatMap((spec) => {
    const work = workOf(spec)
    return [...(work.spec ? [] : [spec.id]), ...spec.rules.filter((rule) => !work.rule(rule).toCome).map((rule) => rule.id)]
  }))
  return { examples, built }
}

/**
 * Each example of the base paired with one example of the workspace at most: the same example
 * unchanged, then the same id, edited, then the example whose Scenario names it as one it was
 * (`namedBy`, given the id of the Scenario that names it), then the same steps under another name or
 * in another place. No example of the workspace pairs with two, but for one that names several, which
 * takes over each: a live one that names it before any other that does. Rows of one outline pair in
 * their order, a live row with a live one before any other. `named` holds the examples of the base
 * paired with one that names them.
 */
const pairExamples = (
  before: ReadonlyArray<Example>,
  now: ReadonlyArray<Example>,
  namedBy: (id: string) => ReadonlyArray<string>
): { readonly paired: ReadonlyMap<Example, Example>; readonly named: ReadonlySet<Example> } => {
  const free = new Set(now)
  const paired = new Map<Example, Example>()
  const named = new Set<Example>()
  /**
   * A base example's match: an example of the workspace that `keys` gives the key `key` gives it, one
   * as live as it before one that is not, and a free one before one already paired, which only
   * `merging` takes.
   */
  const index = (
    key: (example: Example) => string,
    keys: (example: Example) => ReadonlyArray<string> = (example) => [key(example)],
    merging = false
  ) => {
    const by = new Map<string, Array<Example>>()
    for (const example of now) for (const named of keys(example)) by.set(named, [...by.get(named) ?? [], example])
    return (example: Example) => {
      const candidates = by.get(key(example)) ?? []
      const among = [...candidates.filter((candidate) => free.has(candidate)), ...merging ? candidates.filter((candidate) => !free.has(candidate)) : []]
      return among.find((candidate) => candidate.live === example.live) ?? among[0]
    }
  }
  const byName = index((example) => example.scenario.id, (example) => namedBy(example.scenario.id), true)
  const passes: ReadonlyArray<(example: Example) => Example | undefined> = [
    index((example) => `${example.scenario.id}\u0000${example.tests}`),
    index((example) => example.scenario.id),
    byName,
    index((example) => example.tests)
  ]
  for (const find of passes) {
    for (const example of before) {
      if (paired.has(example)) continue
      const match = find(example)
      if (match === undefined) continue
      free.delete(match)
      paired.set(example, match)
      if (find === byName) named.add(example)
    }
  }
  return { paired, named }
}

/**
 * Whether anything live at a base revision stops being live in the workspace, as errors: a maturity
 * or `@open` on a Feature or a Rule that was live there, whatever its examples (`demotion`), and a
 * live example of the base that is gone, a gate or still to come here (`example-dropped`), unless
 * what replaces its rule or its feature — a rule or a feature linked to it, here or at the base, that
 * may replace it — is live here and has a live example whose steps no live example of the base had: a
 * replacement keeps the coverage it takes over. A link from a live rule names what was live at the
 * base, so a replacement can be designed and built in one change, and is judged as check() judges a
 * link to what is there. The base is parsed with its own configuration. An example whose Feature or
 * Rule is reported as demoted is not reported again. `missing` says which files of the base do not
 * parse: their live examples were not compared, so the comparison may miss one turned off.
 */
export const compareWithBase = (project: Project, base: BaseSpecs): { readonly diagnostics: ReadonlyArray<Diagnostic>; readonly missing: ReadonlyArray<string> } => {
  const parsed = base.files.map((file) => ({ file: file.path, ...parseFeatureSpec(file.path, file.content, base.config) }))
  const specs = parsed.flatMap(({ spec }) => spec === undefined ? [] : [spec])
  const { vocabulary } = project.config
  const before = liveTests(specs, base.config.vocabulary)
  const now = liveTests(project.specs, vocabulary)
  const at = `the base ${base.commit}`
  const replacesWord = wordFor(vocabulary.relations.replaces)
  const out: Array<Diagnostic> = []

  const demoted = new Set<string>()
  const demote = (id: string, spec: Spec, line: number, change: string) => {
    demoted.add(id)
    out.push(diagnostic("demotion", {
      message: `${id} was live at ${at}: ${change}`,
      node: id,
      source: { file: spec.file, line },
      hint: `a live test declares no maturity: delete it. A change to what it does is a rule still to come that replaces it, \`@${replacesWord}:<feature>#<rule>\`, and deletes it once it is built`
    }))
  }
  for (const spec of project.specs) {
    const declared = attribute(spec, "maturity")
    if (declared !== undefined && before.built.has(spec.id)) {
      demote(spec.id, spec, spec.attrLines.maturity ?? 1, `${maturityTags(declared)} makes it still to come`)
    }
    for (const rule of spec.rules) {
      if (!before.built.has(rule.id)) continue
      const own = attribute(rule, "maturity")
      if (own !== undefined) demote(rule.id, spec, rule.attrLines.maturity ?? rule.line, `${maturityTags(own)} makes it still to come`)
      else if (isOpen(rule)) demote(rule.id, spec, rule.line, "@open makes it a question still to come")
    }
  }

  // Every link that replaces, here and at the base, with what it starts from and what it names, read
  // here or, once that is gone, at the base, and why the one may not replace the other.
  const known = (written: ReadonlyArray<Spec>) =>
    new Map<string, Replacing>(written.flatMap((spec) => [
      [spec.id, { id: spec.id, kind: spec.kind }],
      ...spec.rules.map((rule): [string, Replacing] => [rule.id, { id: rule.id, kind: made.kinds.rule, spec: spec.id }]),
      ...spec.scenarios.map((scenario): [string, Replacing] => [scenario.id, { id: scenario.id, kind: made.kinds.scenario, spec: spec.id }])
    ]))
  const there = known(specs)
  const here = known(project.specs)
  const sides = [
    { written: specs, words: base.config.vocabulary, names: there, inWorkspace: false },
    { written: project.specs, words: vocabulary, names: here, inWorkspace: true }
  ]
  const links = sides.flatMap(({ inWorkspace, names, words, written }) =>
    written.flatMap((spec) => {
      const work = workOf(spec)
      return [
        { from: names.get(spec.id)!, declared: spec.links, toCome: work.spec },
        ...spec.rules.map((rule) => ({ from: names.get(rule.id)!, declared: rule.links, toCome: work.rule(rule).toCome })),
        ...spec.scenarios.map((scenario) => ({ from: names.get(scenario.id)!, declared: scenario.links, toCome: work.example(scenario) }))
      ].flatMap(({ declared, from, toCome }) =>
        declared.filter((link) => hasRelation(words, "replaces", link.rel)).map((link) => {
          const to = names.get(link.to) ?? there.get(link.to)
          return { spec, from, link, to, toCome, inWorkspace, problem: to === undefined ? undefined : cannotReplace(from, to, words) }
        })
      )
    })
  )
  // A link counts only where what it starts from may replace what it names: a rule or a feature
  // replaces each rule or feature it names — a feature stands for its rules too — and an example here
  // names the examples it was. Each is read once, into the replacers of each id and what each
  // example here names.
  const replacers = new Map<string, Array<string>>()
  const namesOf = new Map<string, Array<string>>()
  for (const { from, inWorkspace, link, problem, to } of links) {
    if (to === undefined || problem !== undefined) continue
    if (!isExample(from)) replacers.set(link.to, [...replacers.get(link.to) ?? [], from.id])
    else if (inWorkspace) namesOf.set(from.id, [...namesOf.get(from.id) ?? [], link.to])
  }
  // A link the base has too names what a merged replacement replaced, and is done; any other means
  // what was built at the base and is gone here, in its feature, the one whose id begins most like it.
  const linkedThere = new Set(links.flatMap(({ inWorkspace, link }) => inWorkspace ? [] : [link.to]))
  const featureOf = (id: string) => there.get(id)?.spec ?? id.split("#")[0]
  const builtThere = [...before.built, ...before.examples.filter((example) => example.live).map((example) => example.scenario.id)]
  const likeliest = (from: Replacing, id: string) =>
    [...new Set(builtThere)].sort().reduce<string | undefined>((best, candidate) => {
      const named = there.get(candidate)
      const fits = named !== undefined && !here.has(candidate) && featureOf(candidate) === featureOf(id) &&
        cannotReplace(from, named, vocabulary) === undefined
      return fits && (best === undefined || sharedStart(candidate, id) > sharedStart(best, id)) ? candidate : best
    }, undefined)
  for (const { from, link, spec } of links.filter(({ inWorkspace, to, toCome }) => inWorkspace && to === undefined && !toCome)) {
    const merged = linkedThere.has(link.to)
    const meant = merged ? undefined : likeliest(from, link.to)
    const tag = `\`@${link.rel}:${link.to}\``
    out.push(diagnostic("replaces-nothing", {
      message: `${from.id} -${link.rel}-> ${link.to}: neither the workspace nor ${at} has ${link.to}, so the link replaces nothing`,
      node: from.id,
      source: { file: spec.file, line: link.line },
      hint: merged
        ? `${at} has the link too, so the replacement is merged: delete ${tag}`
        : meant === undefined
        ? `name what it replaces as ${at} has it, or delete ${tag}`
        : `if it means ${meant}, built at the base, write \`@${link.rel}:${meant}\`; if not, delete ${tag}`
    }))
  }
  // check() judges a link to what is here; one from work still to come to what is gone dangles.
  const broken = links.filter((record): record is typeof record & { readonly to: Replacing } =>
    record.inWorkspace && record.to !== undefined && record.problem !== undefined && !record.toCome && !here.has(record.link.to)
  )
  for (const { from, link, problem, spec, to } of broken) {
    out.push(diagnostic("replacement", {
      message: `${from.id} -${link.rel}-> ${link.to}, which ${at} has: ${problem}`,
      node: from.id,
      source: { file: spec.file, line: link.line },
      hint: replacementHint(link.rel, from, to)
    }))
  }

  const liveThere = before.examples.filter((example) => example.live)
  const { named, paired } = pairExamples(liveThere, now.examples, (id) => namesOf.get(id) ?? [])
  // A replacement counts once it is live and has a live example the base did not have live: a test
  // that was already there takes over no other, and a gate enforces nothing. One that names the
  // example it was is new as it would be unnamed: by steps that no live example of the base had.
  const kept = new Set([...paired].flatMap(([example, still]) => named.has(example) ? [] : [still]))
  const testedThere = new Set(liveThere.map((example) => example.tests))
  const newlyTested = new Set(
    now.examples.filter((example) => example.live && !kept.has(example) && !testedThere.has(example.tests)).flatMap(({ scenario, spec }) =>
      [spec.id, ...(scenario.rule === undefined ? [] : [scenario.rule])]
    )
  )
  const replaced = (example: Example) =>
    [example.scenario.rule, example.spec.id].some((id) => id !== undefined && (replacers.get(id) ?? []).some((by) => newlyTested.has(by)))
  for (const example of liveThere) {
    const { pickle, scenario, spec } = example
    const still = paired.get(example)
    if (still?.live || replaced(example)) continue
    if (still !== undefined && [still.spec.id, still.scenario.rule].some((id) => id !== undefined && demoted.has(id))) continue
    if (still === undefined && scenario.rule !== undefined && demoted.has(scenario.rule)) continue
    const rule = scenario.rule ?? spec.id
    const row = scenario.pickles.length > 1 && pickle.exampleLine !== undefined ? ` (its row at ${spec.file}:${pickle.exampleLine})` : ""
    const become = still === undefined ? "is gone" : still.gate ? "is a gate here, which fails no run" : "is an example of work still to come"
    out.push(diagnostic("example-dropped", {
      message: `${scenario.id}${row}, a live example at ${at}, ${become}, and nothing that replaces ${rule} is live with a new live example`,
      node: scenario.id,
      source: still === undefined ? { file: spec.file, line: pickle.exampleLine ?? scenario.line } : { file: still.spec.file, line: still.pickle.exampleLine ?? still.scenario.line },
      hint: still === undefined
        ? `restore it, or, renamed with its steps edited or merged into another, name it on the Scenario it went to, \`@${replacesWord}:${scenario.id}\`; to remove what it tests, write what replaces ${rule}, \`@${replacesWord}:${rule}\`, with a new live example of its own`
        : "a live test declares no maturity and is no gate: move it back under a live rule, or delete what makes it still to come"
    }))
  }

  // A file without a Feature declares nothing; one that does not parse may have declared anything.
  const unread = parsed.filter(({ diagnostics, spec }) => spec === undefined && diagnostics.length > 0).map(({ file }) => file)
  const missing = unread.map((file) => `not compared: ${file} at ${at} does not parse, so its live examples were not compared`)
  return { diagnostics: sortDiagnostics(out), missing }
}
