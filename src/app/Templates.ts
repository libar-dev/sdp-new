/**
 * File templates for `sdp new` and `sdp init`. A template writes only what stays in the file —
 * what it is, and from `specified` on a scenario to fill in; what the author writes next is said
 * in the answer of `sdp new`, never in the file. Front matter is built as data and written by the
 * YAML library, so a title is always a title, whatever it looks like to YAML.
 */
import { annotate } from "sdp/annotations"
import { Result } from "effect"
import { Document, isMap, isNode, isSeq } from "yaml"
import { type Config, defaults } from "../model/Config.ts"
import { criteria, hasKind, type Vocabulary, wordFor } from "../model/Vocabulary.ts"
import { slugify } from "../parse/Gherkin.ts"
import { parseMarkdownSpec } from "../parse/Spec.ts"

annotate(import.meta, { is: "ARCH-reports" })

/** Where a new spec goes, by the template it is written from, then by its kind. */
const directoryFor: Record<string, string> = {
  requirement: "specs/requirements",
  idea: "specs/requirements",
  nfr: "specs/quality",
  capability: "specs/capabilities",
  decision: "specs/decisions",
  element: "specs/architecture",
  pattern: "specs/architecture",
  milestone: "specs/delivery",
  plan: "specs/delivery",
  risk: "specs/risks"
}

/** What `sdp new` has a template for; any other kind gets the generic one. `idea` is a requirement at maturity idea. */
export const templateKinds = ["requirement", "idea", "nfr", "decision", "element", "pattern", "milestone", "plan"] as const

type Template = "decision" | "element" | "pattern" | "milestone" | "plan" | "generic"

/**
 * The template for a kind: the one of the role it plays in the workspace's vocabulary, so a team
 * that calls its decisions `adr` gets the decision template for `sdp new adr`.
 */
const templateOf = (kind: string, vocabulary: Vocabulary): Template =>
  hasKind(vocabulary, "decision", kind)
    ? "decision"
    : hasKind(vocabulary, "milestone", kind)
    ? "milestone"
    : hasKind(vocabulary, "pattern", kind)
    ? "pattern"
    : hasKind(vocabulary, "architectural", kind)
    ? "element"
    : kind === "plan"
    ? "plan"
    : "generic"

/** Records that are numbered, not named: decisions, and risks. */
const isNumbered = (kind: string, vocabulary: Vocabulary) => hasKind(vocabulary, "decision", kind) || kind === "risk"

const prefixOf = (kind: string, config: Config) => config.ids[kind] ?? kind.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4)

export const newId = (kind: string, title: string, config: Config, existing: ReadonlyArray<string>): string => {
  const prefix = prefixOf(kind, config)
  const slug = slugify(title)
  // Decisions and risks are numbered; so is anything whose title has no ASCII letters to slug.
  if (isNumbered(kind, config.vocabulary) || slug === "") {
    const numbers = existing.map((id) => new RegExp(`^${prefix}-(\\d+)$`).exec(id)?.[1]).filter(Boolean).map(Number)
    return `${prefix}-${String(Math.max(0, ...numbers) + 1).padStart(4, "0")}`
  }
  return `${prefix}-${slug}`
}

const fileNameFor = (kind: string, id: string, title: string, vocabulary: Vocabulary) =>
  /^\w+-\d+$/.test(id) && isNumbered(kind, vocabulary) && slugify(title) !== "" ? `${id}-${slugify(title)}.md` : `${id}.md`

export interface NewSpec {
  readonly id: string
  readonly file: string
  readonly content: string
  /** What the author writes next, one instruction per line: the template leaves none in the file. */
  readonly next: ReadonlyArray<string>
}

/**
 * What `sdp new` writes: the new node's id, its file and content. The file is relative to the
 * workspace root unless `dir` is absolute. `sdp new idea` writes a requirement at maturity idea.
 * Fails, with the reason, when the content would not read back with its id, kind and title.
 */
export const newSpec = (options: {
  readonly kind: string
  readonly title: string
  /** Defaults to the first level of the configured ladder. */
  readonly maturity?: string | undefined
  readonly today: string
  readonly config: Config
  readonly existing: ReadonlyArray<string>
  readonly id?: string | undefined
  readonly dir?: string | undefined
}): Result.Result<NewSpec, string> => {
  const { config, dir, existing, title } = options
  const { vocabulary } = config
  const idea = options.kind === "idea"
  const kind = idea ? "requirement" : options.kind
  const maturity = options.maturity ?? vocabulary.maturity[0]!
  const id = options.id ?? newId(kind, title, config, existing)
  const template = templateOf(kind, vocabulary)
  const home = [options.kind, template].find((name) => Object.hasOwn(directoryFor, name))
  const directory = (dir ?? (home === undefined ? `specs/${kind}` : directoryFor[home]!)).replace(/(.)\/+$/, "$1")
  const file = `${directory}/${fileNameFor(kind, id, title, vocabulary)}`
  const content = specTemplate({ kind, id, title, maturity, today: options.today, config })
  const back = parseMarkdownSpec(file, content, config).spec
  if (back?.id !== id || back.kind !== kind || back.title !== title) {
    return Result.fail(
      `refusing to write ${file}: it would not read back with id ${JSON.stringify(id)}, kind ${JSON.stringify(kind)} and title ${JSON.stringify(title)}`
    )
  }
  return Result.succeed({ id, file, content, next: guidance({ kind, id, maturity, config }) })
}

/** A front matter key, its value, and a comment to write after the value. */
type Field = readonly [key: string, value: unknown, comment?: string]

/** Front matter: the fields as YAML data, a list of records one record per line, then fixed lines. */
const frontMatter = (fields: ReadonlyArray<Field>, fixed: ReadonlyArray<string> = []): string => {
  const doc = new Document(Object.fromEntries(fields.map(([key, value]) => [key, value])))
  for (const [key, , comment] of fields) {
    const node = doc.get(key, true)
    if (comment !== undefined && isNode(node)) node.comment = ` ${comment}`
    if (isSeq(node)) for (const item of node.items) if (isMap(item)) item.flow = true
  }
  return ["---", doc.toString({ lineWidth: 0 }).trimEnd(), ...fixed, "---", ""].join("\n")
}

/** The levels whose criteria are built in: a template grows with them. */
const levels: ReadonlyArray<string> = Object.values(criteria)

const addDays = (isoDate: string, days: number) => {
  const date = new Date(`${isoDate}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/**
 * The content of a new spec. The words sdp interprets — kinds, relations, attributes, statuses —
 * are written as the workspace's vocabulary names them, so what a template writes is what sdp reads.
 */
const specTemplate = (options: {
  readonly kind: string
  readonly id: string
  readonly title: string
  readonly maturity: string
  readonly today: string
  readonly config: Config
}): string => {
  const { config, id, kind, maturity, title, today } = options
  const { vocabulary } = config
  const level = Math.max(0, levels.indexOf(maturity))
  const plan = wordFor(vocabulary.relations.plan)
  const phase = wordFor(vocabulary.relations.phase)
  const { activity } = vocabulary.attributes
  // Prefixed like every other id, so a phase is one grep away and no ordinary word is an id.
  const phaseKind = wordFor(vocabulary.kinds.phase)
  const phaseId = (name: string) => `${config.ids[phaseKind] ?? "PH"}-${name.toLowerCase()}`
  const phases = ["Inception", "Elaboration", "Construction", "Transition"]
  switch (templateOf(kind, vocabulary)) {
    case "decision": {
      const statuses = vocabulary.statuses.decision
      return `${
        frontMatter([
          ["id", id],
          ["kind", kind],
          ["title", title],
          // A new record starts at the first status the workspace lists.
          ["status", wordFor(statuses), statuses.join(" | ")],
          ["category", "architecture", "architecture | product | process | technology | organization | ..."],
          ["date", today],
          ["deciders", []]
        ], [
          "# What this decision shapes links to it, with `decided-by` on the requirement or element.",
          "links:",
          `  # ${wordFor(vocabulary.relations.supersedes)}: ${prefixOf(kind, config)}-…`
        ])
      }
# ${title}

## Context

What forces are at play? What makes this a decision worth recording?

## Options

1. **Option A** — pros / cons
2. **Option B** — pros / cons

## Decision

We will …

## Consequences

What becomes easier or harder. Add a \`\`\`gherkin block if the decision can be guarded automatically.
`
    }
    case "element":
    case "pattern":
      return `${frontMatter([["id", id], ["kind", kind], ["title", title]])}
# ${title}
`
    case "milestone":
      return `${
        frontMatter([
          ["id", id],
          ["kind", kind],
          ["title", title],
          [phase, phaseId("Elaboration"), `the phase this milestone closes: ${phases.map(phaseId).join(" | ")} (sdp new plan)`]
        ])
      }
# ${title}

What must be true to pass this milestone. The scenarios below are the gate.

\`\`\`gherkin
Scenario: No errors in the specification graph
  Then there are no error diagnostics
\`\`\`
`
    case "plan": {
      // One phase each, and back-to-back two-week iterations, one per phase, starting today.
      const iterations = [["I1", "Vision and scope"], ["E1", "Architecture baseline"], ["C1", "First increment"], ["T1", "Beta"]]
      const { end, order, start } = vocabulary.attributes
      const nodes = [
        ...phases.map((name, index) => ({ id: phaseId(name), kind: phaseKind, title: name, [order]: index + 1 })),
        ...iterations.map(([iteration, name], index) => ({
          id: iteration,
          kind: wordFor(vocabulary.kinds.iteration),
          title: name,
          [phase]: phaseId(phases[index]!),
          [start]: addDays(today, 14 * index),
          [end]: addDays(today, 14 * index + 13)
        }))
      ]
      return `${frontMatter([["id", id], ["kind", kind], ["title", title], ["nodes", nodes]])}
# ${title}

Four phases with one example iteration each; add, rename and re-date iterations as the plan firms
up. Plan work by setting \`${plan}: E1\` on a spec, decision or element — that plans its own
discipline's work, such as writing a requirement — and the other disciplines' work on it with
\`${activity}: { implementation: C1, test: [C1, T1] }\`. Close each phase with a milestone
(\`sdp new ${wordFor(vocabulary.kinds.milestone)} "Lifecycle architecture"\`, \`${phase}: ${phaseId("Elaboration")}\`) whose
scenarios are its gate. \`sdp lifecycle\` shows the result.
`
    }
  }
  const header = `${frontMatter([["id", id], ["kind", kind], ["title", title], ["maturity", maturity]])}
# ${title}
`
  if (level < 2) return header
  // From specified on the criteria ask for a scenario that states an outcome: its shape, for the author to fill in.
  const steps = kind === "nfr"
    ? [
      "Scenario: <quality attribute scenario>",
      "  Given <environment, e.g. normal load of 500 concurrent users>",
      "  When <stimulus, e.g. a user submits an order>",
      "  Then <response measure, e.g. confirmation is shown within 300 ms at p95>"
    ]
    : ["Scenario: <the main success case>", "  Given <context>", "  When <action>", "  Then <observable outcome>"]
  return [header, "## Scenarios", "", "```gherkin", ...steps, "```", ""].join("\n")
}

/** The relations the templates suggest, in one place so the answers of `sdp new` and the MCP instructions agree. */
export const relationVocabulary =
  "requirement `realized-by: ARCH-…` and `refines: CAP-…`; element `decided-by: DEC-…`, `instance-of: PAT-…`, `constrained-by: NFR-…`"

/**
 * What the author of a new spec writes next, in the workspace's own words. It is the answer of
 * `sdp new` and not text in the file: an instruction left in a spec is read as the spec.
 */
const guidance = (options: {
  readonly kind: string
  readonly id: string
  readonly maturity: string
  readonly config: Config
}): ReadonlyArray<string> => {
  const { config, id, kind, maturity } = options
  const { vocabulary } = config
  const { anchor } = vocabulary.relations
  switch (templateOf(kind, vocabulary)) {
    case "element":
      return [
        "say under the title what it is responsible for and why that is architecture",
        `anchor it next to the declaration that is it: annotate(Thing, { ${anchor}: "${id}" }) from "sdp/annotations" (sdp types makes the id typed), or an \`@sdp ${anchor} ${id}\` comment in other languages`,
        "link what shaped it: links: { decided-by: DEC-…, instance-of: PAT-…, constrained-by: NFR-… }"
      ]
    case "pattern":
      return [
        "say under the title which problem the pattern solves, and how",
        `elements that apply it link \`instance-of: ${id}\`; what decided it: links: { decided-by: DEC-… }`
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
        ...(level === 1 || level === 2 ? [`list what is still unknown as \`- [ ] …\` under \`## Open questions\`: ${criteria.ready} asks for none left`] : []),
        ...(level >= 2
          ? [quality
            ? "fill in the scenario: Given the source and environment, When the stimulus, Then the response and its measure"
            : "fill in the scenario, and add one for every rule: its name is the rule"]
          : []),
        quality ? "link it: links: { refines: CAP-… }; elements it constrains link to it with constrained-by" : "link it: links: { refines: CAP-…, realized-by: ARCH-… }",
        `plan it: \`${wordFor(vocabulary.relations.plan)}: E1\` says when it is written, \`${vocabulary.attributes.activity}: { implementation: C1, test: [C1, T1] }\` when it is built and tested`
      ]
    }
    default:
      return []
  }
}

const yamlList = (values: ReadonlyArray<string>) => `[${values.map((v) => JSON.stringify(v)).join(", ")}]`

/** The defaults, commented out: an empty configuration behaves exactly like this file. */
export const configTemplate = [
  "# sdp configuration. Every key is optional; uncomment one to change its default.",
  `# specs: ${yamlList(defaults.specs)}          # Markdown with an \`id:\` in front matter becomes a graph node`,
  `# features: ${yamlList(defaults.features)}    # classic Gherkin files (@id:… @kind:… tags)`,
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
