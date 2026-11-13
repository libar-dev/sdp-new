/**
 * File templates for `sdp new` and `sdp init`. A template writes only what stays in the file —
 * what it is, at any maturity; what the author writes next is said in the answer of `sdp new`,
 * never in the file. A new spec is a Gherkin file: its
 * tags say what it is and what it links to, its Feature's name is its title.
 *
 * @sdp is ARCH-application
 */
import { Duration, Result } from "effect"
import { decisionPlaceholder } from "../check/Check.ts"
import { type Config, defaults } from "../model/Config.ts"
import type { Graph } from "../model/Graph.ts"
import { attribute, dayOf, hasKind, hasRelation, holdsCodeRules, idForm, isStage, isWork, offLadder, type Vocabulary, vocabularyWords, wordFor } from "../model/Vocabulary.ts"
import { slugify } from "../parse/Gherkin.ts"
import { inferKind, parseFeatureSpec } from "../parse/Spec.ts"

/** Where a new spec goes, by the template it is written from, then by its kind. A feature stays where it is written, built or not. */
const directoryFor: Record<string, string> = {
  feature: "specs/features",
  decision: "specs/decisions",
  milestone: "specs/plan",
  phase: "specs/plan",
  iteration: "specs/plan"
}

/**
 * What `sdp new` has a template for; any other kind gets the generic one. An element or a pattern
 * is no file: its code declares it.
 */
export const templateKinds = ["feature", "decision", "element", "pattern", "milestone", "phase", "iteration"] as const

type Template = "feature" | "decision" | "element" | "pattern" | "milestone" | "phase" | "iteration" | "rules" | "generic"

/**
 * The template for a kind: the one of the role it plays in the workspace's vocabulary, so a team
 * that calls its decisions `adr` gets the decision template for `sdp new adr`, or that of a spec of
 * the rules the code keeps.
 */
const templateOf = (kind: string, vocabulary: Vocabulary): Template =>
  hasKind(vocabulary, "feature", kind)
    ? "feature"
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
    : holdsCodeRules(vocabulary, kind)
    ? "rules"
    : "generic"

/**
 * A new id is its kind's prefix, where the workspace has one, and the slug of its title. A kind
 * without a prefix is named by the slug alone, and its spec says its kind with `@kind=`.
 */
export const newId = (kind: string, title: string, config: Config, existing: ReadonlyArray<string>): string => {
  const prefix = config.ids[kind]
  const slug = slugify(title)
  // Every id says what it names; only a title with no letter or digit to slug is numbered, after its prefix or else its kind.
  if (slug === "") {
    const base = prefix ?? kind
    const numbers = existing.map((id) => new RegExp(`^${base}-(\\d+)$`).exec(id)?.[1]).filter(Boolean).map(Number)
    return `${base}-${String(Math.max(0, ...numbers) + 1).padStart(4, "0")}`
  }
  return prefix === undefined ? slug : `${prefix}-${slug}`
}

export interface NewSpec {
  readonly id: string
  /** The file to write, and what it holds; an element or a pattern has none, for its code declares it. */
  readonly file: { readonly path: string; readonly content: string } | undefined
  /** What the author writes next, one instruction per line: the template leaves none in the file. */
  readonly next: ReadonlyArray<string>
}

/**
 * What `sdp new` writes: the new node's id, its file and content. The file is relative to the
 * workspace root unless `dir` is absolute. `sdp new element` or `sdp new pattern` writes no file:
 * only the id its code declares, and how.
 * Fails, with the reason, for a change, which is rules of the feature it changes, and for a kind
 * named like a rung of the ladder or a stage — each unless the workspace names a kind of that name
 * — for a maturity asked of a kind that is no work or that is no rung of the ladder, and
 * when the content would not read back with its id, kind and title: the id of an element or a
 * pattern is read back too, though it has no file.
 */
export const newSpec = (options: {
  readonly kind: string
  readonly title: string
  /** A rung of the configured ladder, the first by default. */
  readonly maturity?: string | undefined
  readonly today: string
  readonly config: Config
  /** The graph the new spec joins: its ids, and the iteration a new one follows. */
  readonly graph: Graph
  readonly id?: string | undefined
  readonly dir?: string | undefined
}): Result.Result<NewSpec, string> => {
  const { config, dir, graph, title } = options
  const { vocabulary } = config
  const feature = wordFor(vocabulary.kinds.feature)
  const { kind } = options
  const maturity = options.maturity ?? vocabulary.maturity[0]!
  const id = options.id ?? newId(kind, title, config, graph.nodes().map((node) => node.id))
  const template = templateOf(kind, vocabulary)
  // A change to a feature is no spec of its own, unless the workspace names a kind `change`.
  if (kind === "change" && !vocabularyWords(vocabulary).kinds.includes(kind)) {
    return Result.fail(
      `a change is rules of the ${feature} it changes: write each as a \`Rule:\` in that ${feature}'s file, with @maturity=<rung> above it while it is still to come; sdp q ${feature} --ids lists them`
    )
  }
  // How far work has come is its maturity, never its kind, unless the workspace names a kind of that name.
  const first = vocabulary.maturity[0]!
  const stage = isStage(kind)
  if ((vocabulary.maturity.includes(kind) || stage) && !vocabularyWords(vocabulary).kinds.includes(kind)) {
    const start = `sdp new ${feature} ${JSON.stringify(title)}`
    return Result.fail(
      stage
        ? `${kind} is a stage sdp derives from the run, so it is no kind: ${start} writes a ${feature} at ${first}, the first rung`
        : kind === first
        ? `${kind} is a maturity, not a kind: ${start} writes a ${feature} at ${kind}, the first rung`
        : `${kind} is a maturity, not a kind: ${start} --maturity ${kind} writes a ${feature} at ${kind}`
    )
  }
  // Only work is still to come at a maturity: one asked for any other kind would not be written.
  if (options.maturity !== undefined && !isWork(vocabulary, kind)) {
    return Result.fail(
      `kind ${kind} belongs to no discipline, so it is no work and is written without a maturity: leave out --maturity, or add ${kind} to a discipline under vocabulary.disciplines`
    )
  }
  const instead = offLadder(vocabulary, maturity)
  if (instead !== undefined) return Result.fail(`${maturity} is no rung of the ladder ${vocabulary.maturity.join(", ")}: ${instead}`)
  const next = guidance({ kind, id, config })
  const home = [options.kind, template].find((name) => Object.hasOwn(directoryFor, name))
  const directory = (dir ?? (home === undefined ? `specs/${kind}` : directoryFor[home]!)).replace(/(.)\/+$/, "$1")
  const file = `${directory}/${id}.feature`
  const content = specTemplate({ kind, id, title, maturity, today: options.today, config, graph })
  const back = parseFeatureSpec(file, content, config).spec
  // An element or a pattern is no file, but its id is written in tags all the same, so it is read back as any other.
  if (template === "element" || template === "pattern") {
    return back?.id === id
      ? Result.succeed({ id, file: undefined, next })
      : Result.fail(
        `the id ${JSON.stringify(id)} would not read back from a tag such as @realized-by:<id>: an id is ${idForm}`
      )
  }
  const endKey = vocabulary.attributes.end
  const undated = template === "iteration"
    ? graph.ofKind(vocabulary.kinds.iteration).find((node) => attribute(node, endKey) !== undefined && dayOf(node, endKey) === undefined)
    : undefined
  if (undated !== undefined) {
    return Result.fail(
      `${undated.id} ends on ${JSON.stringify(attribute(undated, endKey))}, which is not a date: write @${endKey}=YYYY-MM-DD there first, so that a new iteration can follow the one that ends last`
    )
  }
  if (back?.id !== id || back.kind !== kind || back.title !== title) {
    return Result.fail(
      `refusing to write ${file}: it would not read back with id ${JSON.stringify(id)}, kind ${JSON.stringify(kind)} and title ${JSON.stringify(title)}`
    )
  }
  return Result.succeed({ id, file: { path: file, content }, next })
}

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
}): string => {
  const { config, graph, id, kind, maturity, title, today } = options
  const { vocabulary } = config
  // The kind is written only when the id's prefix does not give it.
  const identity = [`@id=${id}`, ...(inferKind(id, config) === kind ? [] : [`@kind=${kind}`])]
  const feature = (tags: ReadonlyArray<string>, ...body: ReadonlyArray<string>) =>
    [`${tags.join(" ")}`, `Feature: ${title}`, ...(body.length > 0 ? ["", ...body] : []), ""].join("\n")
  /** A rule to fill in, with its first example. */
  const rule = (name: string, steps: ReadonlyArray<string>) => [`  Rule: ${name}`, "", ...steps.map((step) => `    ${step}`)]
  switch (templateOf(kind, vocabulary)) {
    case "decision":
      return feature(identity, `  ${decisionPlaceholder}`)
    case "phase":
      return feature(identity)
    case "milestone":
      // What it ends is the author's to say, not a guess: the answer says to link it.
      return feature(
        identity,
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
  // Work is still to come, at whatever maturity it starts, and what it says next is the author's; any
  // other kind has no maturity.
  return feature([...identity, ...(isWork(vocabulary, kind) ? [`@maturity=${maturity}`] : [])])
}

/** The relations the templates suggest, in one place so the answers of `sdp new` and the MCP instructions agree. */
export const relationVocabulary =
  "feature `@realized-by:ARCH-…`; rule `@decided-by:<decision>` when it rests on one; code that applies a pattern `@sdp plays PAT-…`"

/**
 * What the author of a new spec writes next, in the workspace's own words. It is the answer of
 * `sdp new` and not text in the file: an instruction left in a spec is read as the spec.
 */
const guidance = (options: {
  readonly kind: string
  readonly id: string
  readonly config: Config
}): ReadonlyArray<string> => {
  const { config, id, kind } = options
  const { vocabulary } = config
  const { anchor } = vocabulary.relations
  const iterationPrefix = config.ids[wordFor(vocabulary.kinds.iteration)]
  const iteration = iterationPrefix === undefined ? "<iteration>" : `${iterationPrefix}-…`
  // Only the iteration: activities are for a team that plans its disciplines apart, as the skill says.
  const plan = `\`@${wordFor(vocabulary.relations.plan)}:${iteration}\` says when it is written`
  const closes = wordFor(vocabulary.relations.closes)
  const phase = wordFor(vocabulary.relations.phase)
  // The one marker of a quality requirement, where the workspace has a value for it.
  const quality = vocabulary.qualities.length === 0 ? "" : `, tagged \`@${vocabulary.attributes.quality}=${wordFor(vocabulary.qualities)}\``
  switch (templateOf(kind, vocabulary)) {
    case "feature":
      return [
        "say under the title who needs what, and why, before any solution; then what it is not",
        "write a `Rule:` per requirement, quality ones included, as what a user can observe: the lines under it say why, its scenarios are the examples",
        `a quality requirement is a rule of the feature it constrains${quality}, with a measurable example: Given the environment, When the stimulus, Then the response and its measure, such as within 300 ms at p95 under 500 concurrent users`,
        "write what is still unknown as a `Rule:` tagged `@open`, its name the question",
        `plan it: ${plan}`,
        "it stays in this file: once it is built, delete its maturity, and it is live; a rule still to come after that declares a maturity of its own above `Rule:`"
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
    case "element":
      return [
        `no file is written: an element is declared where its code is, by the tag \`@sdp ${anchor} ${id}\` in the doc comment of a module-level declaration, or of the file in the comment that opens it`,
        "the rest of that comment is its description: say there what it is for",
        `sdp arch shows it, with its code and the elements that code imports; a feature it realizes links it with \`@realized-by:${id}\``
      ]
    case "pattern":
      return [
        `no file is written: a pattern is declared where the code its instances share is, by the tag \`@sdp ${anchor} ${id}\` in the doc comment of a module-level declaration, or of the file in the comment that opens it`,
        "the rest of that comment is its description: say there which problem it solves, and how",
        `code that applies it says so in its doc comment with \`@sdp plays ${id}\`: sdp arch shows the pattern with the code that plays it and the elements that code is`
      ]
    case "rules":
      return [
        "say under the title what part of the code its rules hold",
        "write a `Rule:` the code keeps, with an example, such as which element may import which: its scenario fails when the code breaks the rule",
        "write what is still unknown as a `Rule:` tagged `@open`, its name the question",
        `plan it: ${plan}`,
        "it stays in this file: once it is built, delete its maturity, and it is live"
      ]
    case "generic":
      return isWork(vocabulary, kind)
        ? [
          "write the idea in a sentence under the title",
          "write what is still unknown as a `Rule:` tagged `@open`, its name the question",
          "link it: @realized-by:ARCH-…",
          `plan it: ${plan}`
        ]
        : [
          "say under the title what it is",
          "link it to what it concerns, `@<relation>:<id>`, and write what must hold of it as a `Rule:` with scenarios as its examples"
        ]
  }
}

const yamlList = (values: ReadonlyArray<string>) => `[${values.map((v) => JSON.stringify(v)).join(", ")}]`

/** The defaults, commented out: an empty configuration behaves exactly like this file. */
export const configTemplate = [
  "# sdp configuration. Every key is optional; uncomment one to change its default.",
  `# features: ${yamlList(defaults.features)}    # specs: Gherkin files, @id=… above Feature:`,
  `# code: ${yamlList(defaults.code)}`,
  "#   (scanned for the @sdp tags in comments that link code to the graph)",
  `# steps: ${yamlList(defaults.steps)}    # step definition modules`,
  `# exclude: []                 # added to the built-in ${yamlList(defaults.exclude)}`,
  "# evidence: { inputs: [], env: [] }   # files (globs) and environment variables the steps read: results go stale when they change",
  `# results: ${defaults.results}`,
  `# timeout: ${Duration.format(defaults.timeout)}                # how long a step may take before it fails; sdp run --timeout and sdp gate --timeout override it`,
  "# base: main                  # what sdp check compares live tests with, where HEAD meets it; default: origin's HEAD, else main, else master; none waives it",
  "# vocabulary:                 # the few words sdp interprets; `sdp vocabulary` prints them all",
  `#   maturity: [${defaults.vocabulary.maturity.join(", ")}]   # how far work still to come has come, in order; live work declares none`,
  `#   kinds: { decision: [${defaults.vocabulary.kinds.decision.join(", ")}] }     # e.g. [decision, adr]`,
  `#   relations: { plan: [${defaults.vocabulary.relations.plan.join(", ")}] }    # relations that plan a node into an iteration`,
  "#   disciplines: {}            # merged with the RUP disciplines, e.g. { operations: [runbook] }",
  "#   words: { relations: [] }   # words of your own that nothing uses yet, so a rule can assert there are none: kinds, relations, attributes",
  ""
].join("\n")
