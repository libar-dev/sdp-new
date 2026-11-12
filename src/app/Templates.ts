/**
 * File templates for `sdp new` and `sdp init`. A template writes only what stays in the file —
 * what it is, and from `specified` on a rule with a scenario to fill in; what the author writes
 * next is said in the answer of `sdp new`, never in the file. A new spec is a Gherkin file: its
 * tags say what it is and what it links to, its Feature's name is its title.
 */
import { annotate } from "sdp/annotations"
import { Result } from "effect"
import { decisionPlaceholder } from "../check/Check.ts"
import { type Config, defaults } from "../model/Config.ts"
import type { Graph } from "../model/Graph.ts"
import { attribute, criteria, dayOf, hasKind, hasRelation, made, type Vocabulary, wordFor } from "../model/Vocabulary.ts"
import { slugify } from "../parse/Gherkin.ts"
import { inferKind, parseFeatureSpec } from "../parse/Spec.ts"

annotate(import.meta, { is: "ARCH-reports" })

/** Where a new spec goes, by the template it is written from, then by its kind. A feature or a change is not built yet. */
const directoryFor: Record<string, string> = {
  feature: "specs/incoming",
  change: "specs/incoming",
  requirement: "specs/requirements",
  nfr: "specs/quality",
  capability: "specs/capabilities",
  decision: "specs/decisions",
  pattern: "specs/architecture",
  milestone: "specs/delivery",
  plan: "specs/delivery",
  phase: "specs/delivery",
  iteration: "specs/delivery",
  risk: "specs/risks"
}

/** Where a feature is once its scenarios pass. */
const builtFeatures = "specs/features"

/** What `sdp new` has a template for; any other kind gets the generic one. `idea` is a feature at maturity idea. */
export const templateKinds = ["feature", "idea", "change", "decision", "requirement", "nfr", "element", "pattern", "milestone", "plan", "phase", "iteration", "risk"] as const

type Template = "feature" | "change" | "decision" | "element" | "pattern" | "milestone" | "plan" | "phase" | "iteration" | "risk" | "generic"

/**
 * The template for a kind: the one of the role it plays in the workspace's vocabulary, so a team
 * that calls its decisions `adr` gets the decision template for `sdp new adr`.
 */
const templateOf = (kind: string, vocabulary: Vocabulary): Template =>
  hasKind(vocabulary, "feature", kind)
    ? "feature"
    : kind === "change"
    ? "change"
    : hasKind(vocabulary, "decision", kind)
    ? "decision"
    : hasKind(vocabulary, "milestone", kind)
    ? "milestone"
    : hasKind(vocabulary, "phase", kind)
    ? "phase"
    : hasKind(vocabulary, "iteration", kind)
    ? "iteration"
    : hasKind(vocabulary, "pattern", kind)
    ? "pattern"
    : hasKind(vocabulary, "architectural", kind)
    ? "element"
    : kind === "plan"
    ? "plan"
    : kind === "risk"
    ? "risk"
    : "generic"

/**
 * A new id is its kind's prefix, where the workspace has one, and the slug of its title. A kind
 * without a prefix is named by the slug alone, and its spec says its kind with `@kind=`.
 */
export const newId = (kind: string, title: string, config: Config, existing: ReadonlyArray<string>): string => {
  const prefix = config.ids[kind]
  const slug = slugify(title)
  // Every id says what it names; only a title with no ASCII letters to slug is numbered, after its prefix or else its kind.
  if (slug === "") {
    const base = prefix ?? kind
    const numbers = existing.map((id) => new RegExp(`^${base}-(\\d+)$`).exec(id)?.[1]).filter(Boolean).map(Number)
    return `${base}-${String(Math.max(0, ...numbers) + 1).padStart(4, "0")}`
  }
  return prefix === undefined ? slug : `${prefix}-${slug}`
}

export interface NewSpec {
  readonly id: string
  /** The file to write, and what it holds; an element has none, for its code declares it. */
  readonly file: { readonly path: string; readonly content: string } | undefined
  /** What the author writes next, one instruction per line: the template leaves none in the file. */
  readonly next: ReadonlyArray<string>
}

/**
 * What `sdp new` writes: the new node's id, its file and content. The file is relative to the
 * workspace root unless `dir` is absolute. `sdp new idea` writes a feature at maturity idea, and
 * `sdp new element` no file: only the id its code declares, and how.
 * Fails, with the reason, when a change names no feature it changes, or when the content would not
 * read back with its id, kind and title.
 */
export const newSpec = (options: {
  readonly kind: string
  readonly title: string
  /** Defaults to the first level of the configured ladder. */
  readonly maturity?: string | undefined
  readonly today: string
  readonly config: Config
  /** The graph the new spec joins: its ids, and the iteration a new one follows. */
  readonly graph: Graph
  readonly id?: string | undefined
  readonly dir?: string | undefined
  /** The id of the feature a change changes. */
  readonly changes?: string | undefined
}): Result.Result<NewSpec, string> => {
  const { changes, config, dir, graph, title } = options
  const { vocabulary } = config
  const feature = wordFor(vocabulary.kinds.feature)
  const kind = options.kind === "idea" ? feature : options.kind
  const maturity = options.maturity ?? vocabulary.maturity[0]!
  const id = options.id ?? newId(kind, title, config, graph.nodes().map((node) => node.id))
  const template = templateOf(kind, vocabulary)
  if (template !== "change" && changes !== undefined) {
    return Result.fail(`only a change names the ${feature} it changes: sdp new change "<title>" --changes ${changes}`)
  }
  const changed = changes === undefined ? undefined : graph.node(changes)
  if (template === "change" && (changed === undefined || !hasKind(vocabulary, "feature", changed.kind))) {
    const found = changes === undefined
      ? "it names none"
      : changed === undefined || changed.kind === made.kinds.missing
      ? `no spec has the id ${changes}`
      : `${changes} is a ${changed.kind}`
    return Result.fail(
      `a ${kind} names the ${feature} it changes, and ${found}: sdp new ${kind} "<title>" --changes <id>, where sdp q ${feature} --ids lists the ids`
    )
  }
  const next = guidance({ kind, id, maturity, config, changes })
  if (template === "element") return Result.succeed({ id, file: undefined, next })
  const endKey = vocabulary.attributes.end
  const undated = template === "iteration"
    ? graph.ofKind(vocabulary.kinds.iteration).find((node) => attribute(node, endKey) !== undefined && dayOf(node, endKey) === undefined)
    : undefined
  if (undated !== undefined) {
    return Result.fail(
      `${undated.id} ends on ${JSON.stringify(attribute(undated, endKey))}, which is not a date: write @${endKey}=YYYY-MM-DD there first, so that a new iteration can follow the one that ends last`
    )
  }
  const home = [options.kind, template].find((name) => Object.hasOwn(directoryFor, name))
  const directory = (dir ?? (home === undefined ? `specs/${kind}` : directoryFor[home]!)).replace(/(.)\/+$/, "$1")
  const file = `${directory}/${id}.feature`
  const content = specTemplate({ kind, id, title, maturity, today: options.today, config, graph, changes })
  const back = parseFeatureSpec(file, content, config).spec
  if (back?.id !== id || back.kind !== kind || back.title !== title) {
    return Result.fail(
      `refusing to write ${file}: it would not read back with id ${JSON.stringify(id)}, kind ${JSON.stringify(kind)} and title ${JSON.stringify(title)}`
    )
  }
  return Result.succeed({ id, file: { path: file, content }, next })
}

/** The levels whose criteria are built in: a template grows with them. */
const levels: ReadonlyArray<string> = Object.values(criteria)

const addDays = (isoDate: string, days: number) => {
  const date = new Date(`${isoDate}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/**
 * Where a new iteration goes: after the one that ends last, in its phase — or, before there is
 * one, today, in the phase if there is just one.
 */
const nextIteration = (graph: Graph, vocabulary: Vocabulary, today: string) => {
  const end = (id: string) => dayOf(graph.node(id)!, vocabulary.attributes.end) ?? ""
  const [last] = graph.ofKind(vocabulary.kinds.iteration).map((node) => node.id).filter((id) => end(id) !== "")
    .sort((a, b) => end(b).localeCompare(end(a)))
  const phases = graph.ofKind(vocabulary.kinds.phase)
  if (last === undefined) return { start: today, phase: phases.length === 1 ? phases[0]!.id : undefined }
  return { start: addDays(end(last), 1), phase: graph.out(last).find((edge) => hasRelation(vocabulary, "phase", edge.rel))?.to }
}

/**
 * The content of a new spec. The words sdp interprets — kinds, relations, attributes — are written
 * as the workspace's vocabulary names them, so what a template writes is what sdp reads.
 */
const specTemplate = (options: {
  readonly kind: string
  readonly id: string
  readonly title: string
  readonly maturity: string
  readonly today: string
  readonly config: Config
  readonly graph: Graph
  readonly changes: string | undefined
}): string => {
  const { changes, config, graph, id, kind, maturity, title, today } = options
  const { vocabulary } = config
  const level = Math.max(0, levels.indexOf(maturity))
  // The kind is written only when the id's prefix does not give it.
  const identity = [`@id=${id}`, ...(inferKind(id, config) === kind ? [] : [`@kind=${kind}`])]
  const feature = (tags: ReadonlyArray<string>, ...body: ReadonlyArray<string>) =>
    [`${tags.join(" ")}`, `Feature: ${title}`, ...(body.length > 0 ? ["", ...body] : []), ""].join("\n")
  /** A rule to fill in, with its first example. */
  const rule = (name: string, steps: ReadonlyArray<string>) => [`  Rule: ${name}`, "", ...steps.map((step) => `    ${step}`)]
  switch (templateOf(kind, vocabulary)) {
    case "decision":
      return feature(identity, `  ${decisionPlaceholder}`)
    case "pattern":
    case "risk":
    case "plan":
    case "phase":
      return feature(identity)
    case "milestone":
      return feature(
        [...identity, `@${wordFor(vocabulary.relations.closes)}:${phaseId(config, "Elaboration")}`],
        ...rule("The specification graph is consistent", ["Scenario: No errors in the specification graph", "  Then there are no error diagnostics"])
      )
    case "iteration": {
      // Two weeks long, back to back with the one before.
      const { phase, start } = nextIteration(graph, vocabulary, today)
      const { end: endKey, start: startKey } = vocabulary.attributes
      const inPhase = phase === undefined ? [] : [`@${wordFor(vocabulary.relations.phase)}:${phase}`]
      return feature([...identity, ...inPhase, `@${startKey}=${start}`, `@${endKey}=${addDays(start, 13)}`])
    }
  }
  const tags = [...identity, ...(changes === undefined ? [] : [`@changes:${changes}`]), `@maturity=${maturity}`]
  if (level < 2) return feature(tags)
  // From specified on the criteria ask for a scenario that states an outcome: a rule and its first example, to fill in.
  return feature(
    tags,
    ...rule(
      "<the rule, in one sentence>",
      kind === "nfr"
        ? [
          "Scenario: <quality attribute scenario>",
          "  Given <environment, e.g. normal load of 500 concurrent users>",
          "  When <stimulus, e.g. a user submits an order>",
          "  Then <response measure, e.g. confirmation is shown within 300 ms at p95>"
        ]
        : ["Scenario: <the main success case>", "  Given <context>", "  When <action>", "  Then <observable outcome>"]
    )
  )
}

/** The id `sdp new` gives a phase of that name. */
const phaseId = (config: Config, name: string) => newId(wordFor(config.vocabulary.kinds.phase), name, config, [])

/** The relations the templates suggest, in one place so the answers of `sdp new` and the MCP instructions agree. */
export const relationVocabulary =
  "feature `@realized-by:ARCH-…`; rule `@decided-by:<decision>` when it rests on one; element `@instance-of:PAT-…`; risk `@affects:<feature>` and `@mitigated-by:<feature>`"

/**
 * What the author of a new spec writes next, in the workspace's own words. It is the answer of
 * `sdp new` and not text in the file: an instruction left in a spec is read as the spec.
 */
const guidance = (options: {
  readonly kind: string
  readonly id: string
  readonly maturity: string
  readonly config: Config
  readonly changes: string | undefined
}): ReadonlyArray<string> => {
  const { changes, config, id, kind, maturity } = options
  const { vocabulary } = config
  const { anchor } = vocabulary.relations
  const activity = vocabulary.attributes.activity
  const iterationPrefix = config.ids[wordFor(vocabulary.kinds.iteration)]
  const iteration = iterationPrefix === undefined ? "<iteration>" : `${iterationPrefix}-…`
  const plan = `\`@${wordFor(vocabulary.relations.plan)}:${iteration}\` says when it is written, \`@${activity}.implementation:${iteration} @${activity}.test:${iteration}\` when it is built and tested`
  const closes = wordFor(vocabulary.relations.closes)
  const phase = wordFor(vocabulary.relations.phase)
  switch (templateOf(kind, vocabulary)) {
    case "feature":
      return [
        "say under the title who needs what, and why, before any solution; then what it is not",
        "write a `Rule:` per requirement, quality ones included, as what a user can observe: the lines under it say why, its scenarios are the examples",
        "write what is still unknown as a `Rule:` tagged `@open`, its name the question",
        `plan it: ${plan}`,
        `once its scenarios pass it is built: move it to ${builtFeatures}/`
      ]
    case "change":
      return [
        `say under the title what changes in ${changes}, for whom, and why`,
        "write each rule it adds or changes as a `Rule:` with its reason and its examples, and what is still unknown as a `Rule:` tagged `@open`",
        `plan it: ${plan}`,
        `once it is built its rules join those of ${changes}, and this file is deleted`
      ]
    case "decision":
      return [
        "write what was chosen over what, why, and the cost accepted with it, in one to three sentences",
        "record a decision only for a choice that is hard to reverse, surprising without context and a real trade-off, and that spans features; a reason that concerns one feature is written under the rule it explains",
        `a rule that rests on it is written on the spec it constrains, tagged \`@decided-by:${id}\``
      ]
    case "milestone":
      return [
        `set \`@${closes}:\` to the phase or the iteration this milestone ends: sdp lifecycle shows them`,
        `write what must hold as rules with scenarios: they are its gate, and sdp gate ${id} says whether it is met`
      ]
    case "plan":
      return [
        `a phase is a file of its own: sdp new ${wordFor(vocabulary.kinds.phase)} "Elaboration"; so is an iteration: sdp new ${wordFor(vocabulary.kinds.iteration)} "<title>"`,
        `plan work on the work itself: on a spec, ${plan}`,
        `end each phase with a milestone: sdp new ${wordFor(vocabulary.kinds.milestone)} "<title>" writes one that \`@${closes}:${phaseId(config, "Elaboration")}\``
      ]
    case "phase":
      return [
        "say under the title what this phase takes on, and why in this order",
        `its iterations link to it with \`@${phase}:${id}\`; a milestone that \`@${closes}:${id}\` ends it`
      ]
    case "iteration":
      return [
        `check its dates and its \`@${phase}:\`: a new iteration follows the one that ends last, in its phase`,
        `work is planned into it from the work itself: \`@${wordFor(vocabulary.relations.plan)}:${id}\``
      ]
    case "risk":
      return [
        "say under the title what could go wrong, and what it would cost",
        "link it: @affects:<feature> @mitigated-by:<feature> @due:MS-…",
        "it is retired when the work that mitigates it is verified; `@status=tolerated` says we live with it instead"
      ]
    case "element":
      return [
        `no file is written: an element is declared where its code is, by annotate(<declaration>, { ${anchor}: "${id}" }) from "sdp/annotations" (sdp types makes the id typed), or an \`@sdp ${anchor} ${id}\` comment in other languages`,
        "the doc comment of that code is its description: say there what it is for",
        `sdp arch shows it, with its code and the elements that code imports; a feature it realizes links it with \`@realized-by:${id}\``
      ]
    case "pattern":
      return [
        "say under the title which problem the pattern solves, and how",
        `elements that apply it link \`@instance-of:${id}\`; what decided it, \`@decided-by:<decision>\``
      ]
    case "generic": {
      const level = levels.indexOf(maturity)
      const quality = kind === "nfr"
      return [
        level <= 0
          ? "write the idea in a sentence under the title"
          : quality
          ? `say under the title which quality matters, for whom, and why: ${criteria.draft} asks for that paragraph`
          : `say under the title who needs what, and why, before any solution: ${criteria.draft} asks for that paragraph`,
        ...(level === 1 || level === 2
          ? [`write what is still unknown as a \`Rule:\` tagged \`@open\`, its name the question: ${criteria.ready} asks for none left`]
          : []),
        ...(level >= 2
          ? [quality
            ? "fill in the rule and its scenario: Given the source and environment, When the stimulus, Then the response and its measure"
            : "fill in the rule and its scenario: the rule's name says what must hold, the lines under it why, and each scenario is an example"]
          : []),
        quality ? `elements it constrains link to it with @constrained-by:${id}` : "link it: @realized-by:ARCH-…",
        `plan it: ${plan}`
      ]
    }
  }
}

const yamlList = (values: ReadonlyArray<string>) => `[${values.map((v) => JSON.stringify(v)).join(", ")}]`

/** The defaults, commented out: an empty configuration behaves exactly like this file. */
export const configTemplate = [
  "# sdp configuration. Every key is optional; uncomment one to change its default.",
  `# features: ${yamlList(defaults.features)}    # specs: Gherkin files, @id=… above Feature:`,
  `# code: ${yamlList(defaults.code)}`,
  "#   (scanned for annotate() calls and @sdp comments that link code to the graph)",
  `# steps: ${yamlList(defaults.steps)}    # step definition modules`,
  `# exclude: []                 # added to the built-in ${yamlList(defaults.exclude)}`,
  "# evidence: { inputs: [], env: [] }   # files (globs) and environment variables the steps read: results go stale when they change",
  `# results: ${defaults.results}`,
  `# types: ${defaults.types}         # written by \`sdp types\`: types the ids annotate() accepts`,
  "# vocabulary:                 # the few words sdp interprets; `sdp vocabulary` prints them all",
  `#   maturity: [${defaults.vocabulary.maturity.join(", ")}]`,
  `#   kinds: { decision: [${defaults.vocabulary.kinds.decision.join(", ")}] }     # e.g. [decision, adr]`,
  `#   relations: { plan: [${defaults.vocabulary.relations.plan.join(", ")}] }    # relations that plan a node into an iteration`,
  "#   disciplines: {}            # merged with the RUP disciplines, e.g. { operations: [runbook] }",
  "#   words: { relations: [] }   # words of your own that nothing uses yet, so a rule can assert there are none: kinds, relations, attributes",
  ""
].join("\n")
