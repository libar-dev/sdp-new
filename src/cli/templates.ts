/** File templates for `sdp new` and `sdp init`. Templates grow with the requested maturity. */
import { type Config, defaults } from "../model/Config.ts"
import { slugify } from "../parse/Gherkin.ts"

export const directoryFor: Record<string, string> = {
  requirement: "specs/requirements",
  nfr: "specs/quality",
  capability: "specs/capabilities",
  decision: "docs/decisions",
  element: "docs/architecture",
  pattern: "docs/architecture/patterns",
  milestone: "docs/delivery/milestones",
  risk: "docs/risks"
}

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

/** What `sdp new` writes: the new node's id, its file (relative to the workspace root) and content. */
export const newSpec = (options: {
  readonly kind: string
  readonly title: string
  readonly maturity: string
  readonly today: string
  readonly config: Config
  readonly existing: ReadonlyArray<string>
  readonly id?: string | undefined
  readonly dir?: string | undefined
}) => {
  const { config, dir, existing, kind, title } = options
  const id = options.id ?? newId(kind, title, config, existing)
  const directory = (dir ?? directoryFor[kind] ?? `specs/${kind}`).replace(/\/+$/, "")
  return { id, file: `${directory}/${fileNameFor(kind, id, title)}`, content: specTemplate({ ...options, id }) }
}

const levels = ["idea", "draft", "specified", "ready"]

export const specTemplate = (options: {
  readonly kind: string
  readonly id: string
  readonly title: string
  readonly maturity: string
  readonly today: string
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
links:
  affects: []           # ids of requirements, elements, ... this decision shapes
  # supersedes: DEC-0000
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
    case "pattern":
      return `---
id: ${id}
kind: ${kind}
title: ${title}
significant: false      # the architects' call
# rationale: which quality attributes, risks or costs of change make this significant?
links: {}
  # instance-of: PAT-...
  # depends-on: [ARCH-...]
  # decided-by: DEC-...
---

# ${title}

Responsibility in one or two sentences. Anchor it in code with an \`@sdp is ${id}\` comment.
`
    case "milestone":
      return `---
id: ${id}
kind: milestone
title: ${title}
phase: elaboration
---

# ${title}

What must be true to pass this milestone. The scenarios below are the gate.

\`\`\`gherkin
Scenario: No errors in the specification graph
  Then there are no error diagnostics
\`\`\`
`
  }
  const quality = kind === "nfr"
  const sections: Array<string> = [
    `---
id: ${id}
kind: ${kind}
title: ${title}
maturity: ${maturity}   # idea → draft → specified → ready (implemented/verified is derived from scenario results)
${quality ? "type: quality\nquality: performance  # performance | availability | security | usability | ...\n" : ""}# iteration: E1
links: {}
---

# ${title}

${level === 0 ? "One sentence capturing the idea." : quality ? "Which quality matters, for whom, and why." : "Who needs what, and why. Describe the problem before the solution."}
`
  ]
  // A ready spec has no open questions left, so its template has none.
  if (level >= 1 && level < 3) sections.push(`## Open questions

- [ ] What is still unknown?
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
  "#   (scanned for @sdp comments that link code to the graph)",
  `# steps: ${yamlList(defaults.steps)}    # step definition modules`,
  `# exclude: []                 # added to the built-in ${yamlList(defaults.exclude)}`,
  `# results: ${defaults.results}`,
  `# maturity: [${defaults.maturity.join(", ")}]`,
  "# architecture:",
  `#   kinds: [${defaults.architecture.kinds.join(", ")}]     # abstractions architects may mark significant`,
  `#   drivers: [${defaults.architecture.drivers.join(", ")}]  # shown next to significant elements in \`sdp arch\``,
  ""
].join("\n")

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
\`sdp run <id> --snippets\` prints step definition stubs for steps that are not automated yet.

Relations are free-form: name them for what they mean. Link code with \`@sdp implements REQ-…\`
comments. Architectural significance (\`significant: true\` plus a \`rationale\`) is the architects'
call: propose it, do not set it yourself.
`
