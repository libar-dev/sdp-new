/** File templates for `sdp new` and `sdp init`. Templates grow with the requested maturity. */
import { type Config, defaults } from "../model/Config.ts"
import { slugify } from "../parse/Gherkin.ts"

export const directoryFor: Record<string, string> = {
  requirement: "specs/requirements",
  idea: "specs/ideas",
  nfr: "specs/quality",
  capability: "specs/capabilities",
  decision: "docs/decisions",
  element: "docs/architecture",
  pattern: "docs/architecture/patterns",
  milestone: "docs/delivery/milestones",
  plan: "docs/delivery",
  risk: "docs/risks"
}

/** Kinds with a template of their own; any other kind gets the generic one. `idea` is a requirement at maturity idea. */
export const templateKinds = ["requirement", "idea", "nfr", "decision", "element", "pattern", "milestone", "plan"] as const

export const newId = (kind: string, title: string, config: Config, existing: ReadonlyArray<string>): string => {
  const prefix = config.ids[kind] ?? kind.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4)
  const slug = slugify(title)
  // Decisions and risks are numbered; so is anything whose title has no ASCII letters to slug.
  if (kind === "decision" || kind === "risk" || slug === "") {
    const numbers = existing.map((id) => new RegExp(`^${prefix}-(\\d+)$`).exec(id)?.[1]).filter(Boolean).map(Number)
    return `${prefix}-${String(Math.max(0, ...numbers) + 1).padStart(4, "0")}`
  }
  return `${prefix}-${slug}`
}

export const fileNameFor = (kind: string, id: string, title: string) =>
  /^\w+-\d+$/.test(id) && (kind === "decision" || kind === "risk") && slugify(title) !== "" ? `${id}-${slugify(title)}.md` : `${id}.md`

/**
 * What `sdp new` writes: the new node's id, its file and content. The file is relative to the
 * workspace root unless `dir` is absolute. `sdp new idea` writes a requirement at maturity idea.
 */
export const newSpec = (options: {
  readonly kind: string
  readonly title: string
  /** Defaults to `idea` for ideas and to the first level of the configured ladder otherwise. */
  readonly maturity?: string | undefined
  readonly today: string
  readonly config: Config
  readonly existing: ReadonlyArray<string>
  readonly id?: string | undefined
  readonly dir?: string | undefined
}) => {
  const { config, dir, existing, title } = options
  const idea = options.kind === "idea"
  const kind = idea ? "requirement" : options.kind
  const maturity = options.maturity ?? (idea ? "idea" : config.maturity[0] ?? "idea")
  const id = options.id ?? newId(kind, title, config, existing)
  const directory = (dir ?? directoryFor[options.kind] ?? `specs/${kind}`).replace(/(.)\/+$/, "$1")
  return {
    id,
    file: `${directory}/${fileNameFor(kind, id, title)}`,
    content: specTemplate({ kind, id, title, maturity, today: options.today, ladder: config.maturity })
  }
}

const levels = ["idea", "draft", "specified", "ready"]

const addDays = (isoDate: string, days: number) => {
  const date = new Date(`${isoDate}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export const specTemplate = (options: {
  readonly kind: string
  readonly id: string
  readonly title: string
  readonly maturity: string
  readonly today: string
  /** The configured maturity ladder, lowest first. */
  readonly ladder?: ReadonlyArray<string> | undefined
}): string => {
  const { id, kind, maturity, title, today } = options
  const level = Math.max(0, levels.indexOf(maturity))
  switch (kind) {
    case "decision":
      return `---
id: ${id}
kind: decision
title: ${title}
status: proposed        # proposed | accepted | rejected | deprecated | superseded
category: architecture  # architecture | product | process | technology | organization | ...
date: ${today}
deciders: []
# What this decision shapes links to it: \`decided-by: ${id}\` on the requirement or element.
links:
  # supersedes: DEC-…
---

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
    case "element":
      return `---
id: ${id}
kind: element
title: ${title}
significant: false      # the architects' call
# rationale: which quality attributes, risks or costs of change make this significant?
links:
  # instance-of: PAT-…
  # decided-by: DEC-…
  # constrained-by: NFR-…
  # depends-on: ARCH-…
---

# ${title}

Responsibility in one or two sentences. Anchor it in code next to the declaration that is it:
\`annotate(Thing, { is: "${id}" })\` in TypeScript (from \`sdp/annotations\`; run \`sdp types\`
so the id is typed), or an \`@sdp is ${id}\` comment in other languages.
`
    case "pattern":
      return `---
id: ${id}
kind: pattern
title: ${title}
significant: false      # the architects' call
# rationale: why applying this pattern consistently matters to the architecture
links:
  # decided-by: DEC-…
---

# ${title}

The problem this pattern solves and how, in a sentence or two. Elements that apply it link
\`instance-of: ${id}\`; code that applies it says so with
\`annotate(Thing, { "instance-of": "${id}" })\`, or an \`@sdp instance-of ${id}\` comment.
`
    case "milestone":
      return `---
id: ${id}
kind: milestone
title: ${title}
phase: elaboration      # the phase this milestone closes: inception | elaboration | construction | transition (sdp new plan)
---

# ${title}

What must be true to pass this milestone. The scenarios below are the gate.

\`\`\`gherkin
Scenario: No errors in the specification graph
  Then there are no error diagnostics
\`\`\`
`
    case "plan": {
      // Back-to-back two-week iterations, one per phase, starting today.
      const iteration = (index: number) => `start: "${addDays(today, 14 * index)}", end: "${addDays(today, 14 * index + 13)}"`
      return `---
id: ${id}
kind: plan
title: ${title}
nodes:
  - { id: inception,    kind: phase, title: Inception,    order: 1 }
  - { id: elaboration,  kind: phase, title: Elaboration,  order: 2 }
  - { id: construction, kind: phase, title: Construction, order: 3 }
  - { id: transition,   kind: phase, title: Transition,   order: 4 }
  - { id: I1, kind: iteration, title: Vision and scope,      phase: inception,    ${iteration(0)} }
  - { id: E1, kind: iteration, title: Architecture baseline, phase: elaboration,  ${iteration(1)} }
  - { id: C1, kind: iteration, title: First increment,       phase: construction, ${iteration(2)} }
  - { id: T1, kind: iteration, title: Beta,                  phase: transition,   ${iteration(3)} }
---

# ${title}

Four phases with one example iteration each; add, rename and re-date iterations as the plan firms
up. Plan work by setting \`iteration: E1\` on a spec, decision or element, and close each phase with
a milestone (\`sdp new milestone "Lifecycle architecture"\`, \`phase: elaboration\`) whose scenarios
are its gate. \`sdp lifecycle\` shows the result.
`
    }
  }
  const quality = kind === "nfr"
  const ladder = (options.ladder ?? levels).join(" → ")
  const sections: Array<string> = [
    `---
id: ${id}
kind: ${kind}
title: ${title}
maturity: ${maturity}   # ${ladder} (implemented/verified is derived from scenario results)
${quality ? "quality: performance  # performance | availability | security | usability | ...\n" : ""}# iteration: E1
${quality ? `# Elements this constrains link to it: \`constrained-by: ${id}\`.\n` : ""}links:
  # refines: CAP-…
${quality ? "" : "  # realized-by: ARCH-…\n"}---

# ${title}

${level === 0 ? "One sentence capturing the idea." : quality ? "Which quality matters, for whom, and why." : "Who needs what, and why. Describe the problem before the solution."}
`
  ]
  if (level >= 1 && level < 3) sections.push(`## Open questions

- [ ] What is still unknown?
`)
  // What separates ready from specified: nothing is left open.
  if (level >= 3) sections.push(`## Open questions

None: a ready spec has no open questions left, which is what sets it apart from a specified one.
An unchecked item listed here fails the ready gate.
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
  `# results: ${defaults.results}`,
  `# types: ${defaults.types}         # written by \`sdp types\`: types the ids annotate() accepts`,
  `# maturity: [${defaults.maturity.join(", ")}]`,
  "# architecture:",
  `#   kinds: [${defaults.architecture.kinds.join(", ")}]     # abstractions architects may mark significant`,
  `#   drivers: [${defaults.architecture.drivers.join(", ")}]  # shown next to significant elements in \`sdp arch\``,
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

- Find anything by id: \`grep -rn "REQ-guest-checkout" .\`
- Query the graph: \`sdp q 'requirement[maturity=ready] -realized-by-> element'\` (syntax: \`sdp q --help\`)
- Everything about one node before you change it: \`sdp context REQ-guest-checkout\`
- Curated architecture (only what architects marked significant): \`sdp arch\`
- Validate: \`sdp check\` · Execute scenarios: \`sdp run\` · Status: \`sdp status\`
- Line-oriented dumps for grep/jq: \`sdp graph --write\` → .sdp/graph.jsonl, .sdp/graph.tsv

To change behaviour, change its spec first: the Gherkin scenarios are the acceptance tests.
\`sdp context <id>\` lists the steps that have no definition yet, and \`sdp run <id> --snippets\`
prints a step definition module for them.

Relations are free-form: name them for what they mean. The templates use ${relationVocabulary}.
Link code to specs with typed annotations in TypeScript — \`annotate(pay, { implements: "REQ-…" })\`
from \`sdp/annotations\`, after \`sdp types\` so ids are checked — or \`@sdp implements REQ-…\`
comments in other languages. Architectural significance (\`significant: true\`
plus a \`rationale\`) is the architects' call: propose it, do not set it yourself.
`
