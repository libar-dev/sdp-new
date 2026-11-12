/**
 * File templates for `sdp new` and `sdp init`. Templates grow with the requested maturity. Front
 * matter is built as data and written by the YAML library, so a title is always a title, whatever
 * it looks like to YAML; only fixed text — suggestions to uncomment — is written as is.
 */
import { annotate } from "sdp/annotations"
import { Result } from "effect"
import { Document, isMap, isNode, isSeq } from "yaml"
import { type Config, defaults } from "../model/Config.ts"
import { criteria, hasKind, type Vocabulary, wordFor } from "../model/Vocabulary.ts"
import { slugify } from "../parse/Gherkin.ts"
import { parseMarkdown } from "../parse/Markdown.ts"
import { inferKind, parseMarkdownSpec } from "../parse/Spec.ts"

annotate(import.meta, { is: "ARCH-reports" })

/** Where a new spec goes, by the template it is written from, then by its kind. */
const directoryFor: Record<string, string> = {
  requirement: "specs/requirements",
  idea: "specs/requirements",
  nfr: "specs/quality",
  capability: "specs/capabilities",
  decision: "docs/decisions",
  element: "docs/architecture",
  pattern: "docs/architecture/patterns",
  milestone: "docs/delivery/milestones",
  plan: "docs/delivery",
  risk: "docs/risks"
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
  return Result.succeed({ id, file, content })
}

/** A front matter key, its value, and a comment to write after the value. */
type Field = readonly [key: string, value: unknown, comment?: string]

/**
 * Front matter: the fields as YAML data, a list of records one record per line, then fixed
 * lines — commented-out keys an author may enable.
 */
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
 * The content of a new spec. The words sdp interprets — kinds, relations, attributes —
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
  // Front matter says only what the file does not say elsewhere: the kind when the id's prefix
  // does not give it, the title when the heading would not read back as it.
  const identity: ReadonlyArray<Field> = [
    ["id", id],
    ...(inferKind(id, config) === kind ? [] : [["kind", kind] as const]),
    ...(parseMarkdown(`# ${title}\n`).title === title ? [] : [["title", title] as const])
  ]
  switch (templateOf(kind, vocabulary)) {
    case "decision":
      return `${
        frontMatter(identity, [
          "# Only for a choice that is hard to reverse, surprising without context and a real trade-off;",
          "# any other choice is a sentence in the spec it concerns. What rests on a decision links to it",
          "# with `decided-by`, its rules are scenarios there, and its price is a risk."
        ])
      }
# ${title}

Not <what a reasonable person would have chosen>, because <why>.
`
    case "element":
      return `${
        frontMatter([["id", id], ["kind", kind], ["title", title]], [
          "links:",
          "  # instance-of: PAT-…",
          "  # decided-by: DEC-…",
          "  # constrained-by: NFR-…",
          "  # depends-on: ARCH-…"
        ])
      }
# ${title}

Responsibility in one or two sentences, and why it matters to the architecture. Anchor it in code next to the declaration that is it:
\`annotate(Thing, { ${vocabulary.relations.anchor}: "${id}" })\` in TypeScript (from \`sdp/annotations\`; run \`sdp types\`
so the id is typed), or an \`@sdp ${vocabulary.relations.anchor} ${id}\` comment in other languages.
`
    case "pattern":
      return `${frontMatter([["id", id], ["kind", kind], ["title", title]], ["links:", "  # decided-by: DEC-…"])}
# ${title}

The problem this pattern solves and how, in a sentence or two. Elements that apply it link
\`instance-of: ${id}\`; code that applies it says so with
\`annotate(Thing, { "instance-of": "${id}" })\`, or an \`@sdp instance-of ${id}\` comment.
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
  const quality = kind === "nfr"
  const sections: Array<string> = [
    `${
      frontMatter([
        ["id", id],
        ["kind", kind],
        ["title", title],
        ["maturity", maturity, `${vocabulary.maturity.join(" → ")} (implemented/verified is derived from scenario results)`],
        ...(quality ? [["quality", "performance", "performance | availability | security | usability | ..."] as const] : [])
      ], [
        `# ${plan}: E1         # when this spec is written`,
        `# ${activity}: { implementation: C1, test: [C1, T1] }   # when other disciplines work on it`,
        ...(quality ? ["# Elements this constrains link to it, with `constrained-by`."] : []),
        "links:",
        "  # refines: CAP-…",
        ...(quality ? [] : ["  # realized-by: ARCH-…"])
      ])
    }
# ${title}

${level === 0 ? "One sentence capturing the idea." : quality ? "Which quality matters, for whom, and why." : "Who needs what, and why. Describe the problem before the solution."}
`
  ]
  if (level >= 1 && level < 3) sections.push(`## Open questions

- [ ] What is still unknown?
`)
  // What separates ready from specified: nothing is left open.
  if (level >= 3) sections.push(`## Open questions

None: a ready spec has no open questions left. That and complete scenarios are all the criteria
of \`ready\` ask for; whether the design behind it is settled is for the team's own Definition of Ready.
`)
  if (level >= 2) {
    sections.push(
      quality
        ? `## Scenarios

Quality attribute scenarios: Given = source, environment, artifact; When = stimulus; Then = response and measure.

\`\`\`gherkin
Scenario: <quality attribute scenario>
  Given <environment, e.g. normal load of 500 concurrent users>
  When <stimulus, e.g. a user submits an order>
  Then <response measure, e.g. confirmation is shown within 300 ms at p95>
\`\`\`
`
        : `## Scenarios

\`\`\`gherkin
Scenario: <the main success case>
  Given <context>
  When <action>
  Then <observable outcome>
\`\`\`
`
    )
  }
  return sections.join("\n")
}

const yamlList = (values: ReadonlyArray<string>) => `[${values.map((v) => JSON.stringify(v)).join(", ")}]`

/** The defaults, commented out: an empty configuration behaves exactly like this file. */
export const configTemplate = [
  "# sdp configuration. Every key is optional; uncomment one to change its default.",
  "# Keys are described in REQ-configuration (sdp context REQ-configuration).",
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

/** The relations the templates suggest, in one place so templates, help and guides agree. */
export const relationVocabulary =
  "requirement `realized-by: ARCH-…` and `refines: CAP-…`; element `decided-by: DEC-…`, `instance-of: PAT-…`, `constrained-by: NFR-…`"

export const agentsTemplate = `---
id: AGENTS-sdp
kind: guide
title: Working with specs (sdp)
---

# Working with specs (sdp)

Specs, decisions, architecture, the delivery plan and guides like this one are Markdown files with
YAML front matter (\`id\`, \`kind\`, \`title\`, \`links\`). Together they form one graph.

## Find things

- Anything by its id: \`grep -rn "REQ-guest-checkout" .\` — an id is literal wherever it is
  declared or linked. Two ids are made by sdp: a scenario is \`<spec id>#<slug of its name>\`,
  annotated code is \`code:<path>#<symbol>\`.
- Query the graph: \`sdp q 'requirement[maturity=ready] -realized-by-> element'\` (syntax:
  \`sdp q --help\`), or \`sdp graph | jq …\` — one record per line.
- Everything about one node before you change it: \`sdp context REQ-guest-checkout\`
- The architecture (every element and pattern architects declared): \`sdp arch\`
- The words sdp interprets, as this workspace configures them: \`sdp vocabulary\`
- Validate: \`sdp check\` · Execute scenarios: \`sdp run\` · Status: \`sdp status\`
- Every read command answers as JSON with \`--json\`: \`{ complete, notes, data }\`. Exit code 2
  and \`complete: false\` mean sdp could not read everything: do not conclude that something is absent

## Change behaviour

Change the spec first: its Gherkin scenarios are the acceptance tests. What a user sees belongs
to a requirement; how one part of the system does it belongs to that element, and
\`realized-by\` leads from the one to the other. \`sdp context <id>\` lists the steps that have
no definition yet, \`sdp run <id> --snippets\` prints a step definition module for them, and
\`sdp steps <text>\` finds a definition that already says it. Extend that one: a step that two
definitions match fails.

## Plan work, and mind the gates

Work is planned in its own spec: \`iteration: E1\` says when it is written,
\`activity: { implementation: C1, test: [C1, T1] }\` when it is built and tested.
\`sdp lifecycle\` shows the plan, marks the current iteration with \`*\` and shows every
milestone's gate. \`sdp run\` reports gates and never fails on one, and a later milestone is
expected to be unmet. A gate of the current phase or a past one is not:
\`sdp gate <milestone>\` exits 1 on it.

## Link

Relations are free-form: name them for what they mean. The templates use ${relationVocabulary}.
Code links to the architecture: \`annotate(Orders, { is: "ARCH-orders" })\` from
\`sdp/annotations\` says which code an element is (after \`sdp types\` the compiler checks the
id), and an \`@sdp is ARCH-orders\` comment does the same in other languages. A requirement
names its element with \`realized-by\`. What belongs in the architecture is the architects' call:
propose an element, a pattern or an \`is\` annotation, do not add or remove one yourself.
`
