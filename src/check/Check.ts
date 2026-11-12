/**
 * Rule checks over a built project. Every diagnostic carries a rule id, a
 * `file:line`, and a hint phrased as an instruction, so humans and agents can
 * fix issues without reading this file. What belongs in the architecture is
 * never checked: declaring it is the architect's call.
 *
 * A maturity is the team's judgement of how far work still to come has come, so
 * neither its value nor the content behind it is checked. What is checked is
 * what is live — a Feature or a Rule that declares no maturity: a live rule has
 * an example, and, against a base revision (`compareWithBase`), nothing live
 * stops being live without an error.
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
  type KindRole,
  made,
  type RelationRole,
  retiredMaturity,
  type Vocabulary,
  wordFor
} from "../model/Vocabulary.ts"
import { type Project, type SourceFile, workOf } from "../graph/Build.ts"
import { lifecycle, plannedDisciplines, unmetBefore, workKind } from "../lifecycle/Lifecycle.ts"
import { codeNodeId } from "../parse/Annotations.ts"
import type { Pickle, Rule, Scenario } from "../parse/Gherkin.ts"
import { parseFeatureSpec, type Spec, suiteId } from "../parse/Spec.ts"

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

  // The rung that once said a spec was built would now say it is still to come, and switch its examples off.
  const retired = (declared: unknown) => [declared].flat().some((value) => value === retiredMaturity)
  const retiredAt = (id: string, source: SourceRef | undefined) =>
    out.push(diagnostic("retired-maturity", {
      message: `${id} declares @maturity=${retiredMaturity}, the retired rung: any maturity makes work still to come, so its examples would fail no run`,
      node: id,
      source,
      hint: "delete it: what declares no maturity is live, and its examples must pass"
    }))
  for (const spec of project.specs) {
    if (retired(attribute(spec, "maturity"))) retiredAt(spec.id, at(spec, spec.attrLines.maturity ?? 1))
    for (const rule of spec.rules) {
      if (retired(attribute(rule, "maturity"))) retiredAt(rule.id, at(spec, rule.attrLines.maturity ?? rule.line))
    }
  }
  for (const node of authored.filter((candidate) => !project.specById.has(candidate.id) && candidate.kind !== made.kinds.rule)) {
    if (retired(attribute(node, "maturity"))) retiredAt(node.id, node.source)
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
  // one names what was live at the base, which the comparison with the base reads.
  for (const edge of graph.edges().filter((candidate) => hasRelation(vocabulary, "replaces", candidate.rel))) {
    const from = graph.node(edge.from)
    const to = graph.node(edge.to)
    // A target that does not exist is a dangling link, or, from live work, what the base had.
    if (!from || !to || to.kind === made.kinds.missing) continue
    const replacing = (node: GraphNode) => node.kind === made.kinds.rule || hasKind(vocabulary, "feature", node.kind)
    const problem = !replacing(from)
      ? `${edge.from} is a ${from.kind}: only a rule or a feature replaces another`
      : !replacing(to)
      ? `${edge.to} is a ${to.kind}, not a rule or a feature`
      : edge.from === edge.to || from.attrs.spec === edge.to || to.attrs.spec === edge.from
      ? `${edge.from} cannot replace itself, its own feature or a rule of its own`
      : from.attrs.toCome !== true
      ? `${edge.from} is live, so what it replaced is gone: the change that builds a replacement deletes what it replaces`
      : to.attrs.toCome === true
      ? `${edge.to} is still to come, so nothing built is replaced`
      : undefined
    if (problem === undefined) continue
    out.push(diagnostic("replacement", {
      message: `${edge.from} -${edge.rel}-> ${edge.to}: ${problem}`,
      node: edge.from,
      source: edge.source,
      hint: `work still to come names the live rule or feature it replaces: @${edge.rel}:<feature>#<rule>, or @${edge.rel}:<feature> for all its rules`
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
  // so a first day not written is no mistake while one that is no date is. One diagnostic for an
  // iteration, naming each day it lacks.
  for (const node of graph.ofKind(vocabulary.kinds.iteration)) {
    const { end, start } = vocabulary.attributes
    const offTimeline = dayOf(node, end) === undefined
    if (!offTimeline && (dayOf(node, start) !== undefined || attribute(node, start) === undefined)) continue
    const lacking = [start, end].filter((key) => dayOf(node, key) === undefined)
    const what = lacking.map((key) => {
      const written = attribute(node, key)
      return written === undefined ? `${key} is not written` : `${key} is ${JSON.stringify(written)}, which is not a date`
    })
    out.push(diagnostic("plan-date", {
      message: `${node.id}: ${what.join(" and ")}, so ${offTimeline ? "the timeline leaves it out" : "today is never in it"}`,
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

/** The examples of a set of specs, and the Features and Rules that have a live example. */
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
  const tested = new Set(examples.flatMap(({ live, scenario, spec }) => live ? [spec.id, ...(scenario.rule === undefined ? [] : [scenario.rule])] : []))
  return { examples, tested }
}

/**
 * Each example of the base paired with one example of the workspace at most, and no example of
 * the workspace with two: the same example unchanged, then the same id, edited, then the same steps
 * under another name or in another place. Rows of one outline pair in their order, a live row with a
 * live one before any other.
 */
const pairExamples = (before: ReadonlyArray<Example>, now: ReadonlyArray<Example>): ReadonlyMap<Example, Example> => {
  const free = new Set(now)
  const paired = new Map<Example, Example>()
  const index = (key: (example: Example) => string) => {
    const by = new Map<string, Array<Example>>()
    for (const example of now) by.set(key(example), [...by.get(key(example)) ?? [], example])
    return (example: Example) => {
      const candidates = (by.get(key(example)) ?? []).filter((candidate) => free.has(candidate))
      return candidates.find((candidate) => candidate.live === example.live) ?? candidates[0]
    }
  }
  const passes: ReadonlyArray<(example: Example) => Example | undefined> = [
    index((example) => `${example.scenario.id}\u0000${example.tests}`),
    index((example) => example.scenario.id),
    index((example) => example.tests)
  ]
  for (const find of passes) {
    for (const example of before) {
      if (paired.has(example)) continue
      const match = find(example)
      if (match === undefined) continue
      free.delete(match)
      paired.set(example, match)
    }
  }
  return paired
}

/**
 * Whether anything live at a base revision stops being live in the workspace, as errors: a maturity
 * or `@open` on a Feature or a Rule that had live examples there (`demotion`), and a live example of
 * the base that is gone, a gate or still to come here (`example-dropped`), unless what replaces its
 * rule or its feature — a rule or a feature linked to it, here or at the base — is live here and has
 * a live example: a replacement keeps the coverage it takes over. A link from a live rule names what
 * was live at the base, so a replacement can be designed and built in one change. The base is
 * parsed with its own configuration. An example whose Feature or Rule is reported as demoted is not
 * reported again. The notes say which files of the base could not be read.
 */
export const compareWithBase = (project: Project, base: BaseSpecs): { readonly diagnostics: ReadonlyArray<Diagnostic>; readonly notes: ReadonlyArray<string> } => {
  const parsed = base.files.map((file) => ({ file: file.path, spec: parseFeatureSpec(file.path, file.content, base.config).spec }))
  const specs = parsed.flatMap(({ spec }) => spec === undefined ? [] : [spec])
  const { vocabulary } = project.config
  const before = liveTests(specs, base.config.vocabulary)
  const now = liveTests(project.specs, vocabulary)
  const at = `the base ${base.commit}`
  const out: Array<Diagnostic> = []

  const demoted = new Set<string>()
  const demote = (id: string, spec: Spec, line: number, change: string) => {
    demoted.add(id)
    out.push(diagnostic("demotion", {
      message: `${id} was live at ${at}: ${change}`,
      node: id,
      source: { file: spec.file, line },
      hint: `a live test declares no maturity: delete it. A change to what it does is a rule still to come that replaces it, \`@${wordFor(vocabulary.relations.replaces)}:<feature>#<rule>\`, and deletes it once it is built`
    }))
  }
  for (const spec of project.specs) {
    const declared = attribute(spec, "maturity")
    if (declared !== undefined && before.tested.has(spec.id)) {
      demote(spec.id, spec, spec.attrLines.maturity ?? 1, `${maturityTags(declared)} makes it still to come`)
    }
    for (const rule of spec.rules) {
      if (!before.tested.has(rule.id)) continue
      const own = attribute(rule, "maturity")
      if (own !== undefined) demote(rule.id, spec, rule.attrLines.maturity ?? rule.line, `${maturityTags(own)} makes it still to come`)
      else if (isOpen(rule)) demote(rule.id, spec, rule.line, "@open makes it a question still to come")
    }
  }

  // What replaces each rule or feature, here and at the base: a feature that replaces stands for its rules too.
  const replacedBy = new Map<string, Set<string>>()
  const replaces = (from: string, links: Spec["links"], words: Vocabulary) => {
    for (const link of links.filter((candidate) => hasRelation(words, "replaces", candidate.rel))) {
      replacedBy.set(link.to, (replacedBy.get(link.to) ?? new Set()).add(from))
    }
  }
  for (const [written, words] of [[specs, base.config.vocabulary], [project.specs, vocabulary]] as const) {
    for (const spec of written) {
      replaces(spec.id, spec.links, words)
      for (const rule of spec.rules) replaces(rule.id, rule.links, words)
    }
  }
  // A replacement counts once it is live and has a live example: a gate enforces nothing.
  const replaced = (example: Example) =>
    [example.scenario.rule, example.spec.id].some((id) => id !== undefined && [...replacedBy.get(id) ?? []].some((by) => now.tested.has(by)))

  const paired = pairExamples(before.examples.filter((example) => example.live), now.examples)
  for (const example of before.examples.filter((candidate) => candidate.live)) {
    const { pickle, scenario, spec } = example
    const still = paired.get(example)
    if (still?.live || replaced(example)) continue
    if (still !== undefined && [still.spec.id, still.scenario.rule].some((id) => id !== undefined && demoted.has(id))) continue
    if (still === undefined && scenario.rule !== undefined && demoted.has(scenario.rule)) continue
    const rule = scenario.rule ?? spec.id
    const row = scenario.pickles.length > 1 && pickle.exampleLine !== undefined ? ` (its row at ${spec.file}:${pickle.exampleLine})` : ""
    const become = still === undefined ? "is gone" : still.gate ? "is a gate here, which fails no run" : "is an example of work still to come"
    out.push(diagnostic("example-dropped", {
      message: `${scenario.id}${row}, a live example at ${at}, ${become}, and nothing that replaces ${rule} is live with a live example`,
      node: scenario.id,
      source: still === undefined ? { file: spec.file, line: pickle.exampleLine ?? scenario.line } : { file: still.spec.file, line: still.pickle.exampleLine ?? still.scenario.line },
      hint: still === undefined
        ? "restore it; to remove what it tests, write what replaces its rule, `@replaces:<feature>#<rule>`, with a live example of its own"
        : "a live test declares no maturity and is no gate: move it back under a live rule, or delete what makes it still to come"
    }))
  }

  const unread = parsed.filter(({ spec }) => spec === undefined).map(({ file }) => file)
  const notes = unread.map((file) => `${file} at ${at} does not parse, so its live examples were not compared`)
  return { diagnostics: sortDiagnostics(out), notes }
}
