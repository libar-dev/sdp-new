# sdp — design

sdp manages software delivery end to end: requirements at every maturity, quality requirements,
decisions, the curated architecture and the delivery lifecycle form **one graph**, written as plain
files, checked by rules and partly **executable**. This document explains the design. The
decisions behind it are recorded in the same format they describe: see `docs/decisions/`.

- [1. Principles](#1-principles)
- [2. Specifications](#2-specifications)
- [3. Executable specifications](#3-executable-specifications)
- [4. Decisions](#4-decisions)
- [5. Curated architecture](#5-curated-architecture)
- [6. The graph](#6-the-graph)
- [7. Lifecycle](#7-lifecycle)
- [8. Working with AI agents](#8-working-with-ai-agents)
- [9. Implementation](#9-implementation)
- [10. Reference](#10-reference)
- [11. Limits and next steps](#11-limits-and-next-steps)

## 1. Principles

1. **Files are the source of truth.** Markdown, `.feature` files and code comments. The graph is a
   derived index, rebuilt on every command ([DEC-0003](decisions/DEC-0003-files-are-the-source-of-truth.md)).
   Git, pull requests, grep and editors work on everything.
2. **One format for every maturity.** An idea and an implemented feature differ in content, not in
   format or tool ([DEC-0001](decisions/DEC-0001-markdown-with-gherkin.md)).
3. **Evidence over status fields.** Authors declare maturity and the tool checks it; nobody declares
   "done" — scenario results decide ([DEC-0005](decisions/DEC-0005-derived-delivery-stage.md)).
4. **Free-form graph.** Kinds and relations are the authors' words, not a metamodel
   ([DEC-0002](decisions/DEC-0002-free-form-relations.md)).
5. **Significance is the architect's call.** Few abstractions are architecture; architects mark them,
   the tool shows them and never computes or checks significance
   ([DEC-0008](decisions/DEC-0008-significance-is-the-architects-call.md)).
6. **Agent-native.** Everything is reachable with grep/jq, a `--json` CLI, and MCP; every fact
   carries `file:line`.

## 2. Specifications

A spec is any Markdown file whose YAML front matter has an `id`:

````markdown
---
id: REQ-guest-checkout           # unique, literal, greppable
kind: requirement                # free text; inferred from the id prefix when omitted
title: Guest checkout            # defaults to the first # heading
maturity: specified              # idea → draft → specified → ready
iteration: C2                    # any attribute whose value is a node id becomes an edge
tags: [checkout]
links:                           # explicit, free-form relations
  refines: CAP-online-sales
  realized-by: [ARCH-orders, ARCH-payments]
  constrained-by: { to: NFR-checkout-latency, note: "p95" }
---

# Guest checkout

Shoppers without an account can buy. Prose, tables, diagrams, EARS sentences —
whatever explains the need. Mention other nodes with [[DEC-0004]] or typed:
realized-by:: [[ARCH-orders]]

## Open questions
- [ ] Do we verify the email address before payment?
- [x] Can guests save their cart? No.

## Scenarios

```gherkin
Scenario: Guest pays by card
  Given a cart with 2 items
  When the guest checks out with a valid card
  Then an order is created
  And a receipt is emailed
```
````

### Why Markdown with embedded Gherkin

Gherkin was the obvious candidate and it is kept — but as the *behaviour* notation inside a richer
container rather than as the whole format. The full comparison (plain `.feature` files, Gauge-style
Markdown, Cucumber's Markdown dialect, EARS, a TypeScript DSL, YAML records, formal methods) is in
[DEC-0001](decisions/DEC-0001-markdown-with-gherkin.md). In short:

| Need | How the format meets it |
| --- | --- |
| Idea-level specs | A title in front matter is a valid spec. No Gherkin needed yet. |
| Structured metadata, links | YAML front matter; any key is an attribute, `links` holds relations. |
| Prose, rationale, diagrams | Markdown body; Mermaid renders on GitHub. |
| Executable behaviour | Standard Gherkin in ```` ```gherkin ```` fences (also `~~~gherkin`), compiled by the official Cucumber parser; all blocks of a file form one Feature. |
| Existing Cucumber suites | `.feature` files are specs too (`@id:REQ-x @maturity:ready` tags). |
| LLM-friendliness | Markdown + YAML + Gherkin are the formats models read and write best. |

### Maturity

| Level | Gate (checked by `sdp check`, rule `maturity-gate`) |
| --- | --- |
| `idea` | a title |
| `draft` | a description of the problem or intent |
| `specified` | at least one scenario with an outcome (`Then`) |
| `ready` | no unresolved open questions; every scenario has steps and an outcome |

A spec claiming more than its content supports is an error; content ahead of its label yields a
`maturity-promotable` hint. Teams can rename or extend the ladder (`maturity:` in config); custom
levels have no built-in gate but participate in ordering (`maturity<ready` in queries).

### Non-functional requirements

Quality requirements use the same format, as *quality attribute scenarios*: the Given carries the
source, environment and artifact; the When the stimulus; the Then the response and its measure.

```gherkin
Scenario: Checkout under peak load
  Given 500 concurrent shoppers on the production topology
  When a shopper submits an order
  Then the confirmation is shown within 300 ms at p95
```

Mark them `kind: nfr` (or `type: quality`); the architecture view shows them as drivers next to the
significant elements they constrain. When automated, their step definitions are fitness functions — see
`specs/quality/NFR-query-performance.md`, which runs in every `sdp run`.

## 3. Executable specifications

`sdp run` compiles every scenario to pickles (outlines expand per example row), matches each step
against step definitions using Cucumber Expressions, and records results in `.sdp/results.json`.

```ts
// specs/steps/cart.steps.ts
import { Effect } from "effect"
import { defineSteps, pending } from "sdp"

export default defineSteps(() => ({ cart: [] as Array<string> }), ({ Given, When, Then }) => {
  Given("a cart with {int} items", ({ world, args: [n] }) => { world.cart = Array(n).fill("item") })
  When("the guest checks out with a valid card", () => pending("payment sandbox not wired yet"))
  Then("an order is created", ({ world }) => Effect.sync(() => { /* assert */ }))
})
```

- Parameters are typed from the expression (`{int}` → `number`). Handlers may return nothing, a
  Promise or an Effect; each step has a timeout.
- Each step module gets a fresh world per scenario.
- Statuses: `passed`, `failed`, `pending`, `undefined` (no definition — *not* a failure),
  `ambiguous`, `skipped`. Undefined steps come with a suggested definition (`--snippets`).
- Results are keyed by scenario id and a hash of its executable content; editing a scenario makes
  its result `stale`.

Results roll up into each spec node:

| Scenario results | `verification` | `stage` |
| --- | --- | --- |
| no scenarios | `none` | declared maturity |
| never run / stale | `unrun` | declared maturity |
| all undefined | `undefined` | declared maturity |
| some pending/undefined | `pending` | `in-progress` |
| any failed | `failing` | `in-progress` |
| all passed | `passing` | `verified` |

This is how "the same format for implemented and not implemented" works: the spec never changes
format, only the evidence around it does.

### Built-in steps: rules over the graph

Built-in steps assert against the project graph, so architecture fitness functions, decision guards
and milestone gates are ordinary scenarios:

```gherkin
Then the query "element[significant] !-*- decision" returns no results
Then the query "requirement[maturity=ready]" returns at least 5 results
Then the query "requirement|nfr" returns:
  | REQ-a |
Then every node matching "requirement[maturity=ready]" also matches "*[stage=verified]"
Then there are no error diagnostics
Then there are no diagnostics for rule "dangling-link"
Then the node "REQ-a" has stage "verified"
```

`sdp run` executes ordinary scenarios first and **gate scenarios** (specs of kind `milestone`, or
scenarios tagged `@gate`) second, against a graph rebuilt with the fresh results. Gate failures are
reported but do not fail `sdp run` (a future milestone is expected to be unmet); `sdp gate <id>`
enforces one.

## 4. Decisions

Decision records are specs with `kind: decision`, MADR-like sections (Context, Options, Decision,
Consequences), a `status` (`proposed | accepted | rejected | deprecated | superseded`) and a free
`category` — `architecture` is one category among `product`, `process`, `technology`,
`organization`, … They link to what they `affect`, and `supersedes` older decisions.

`sdp check` keeps them consistent (`decision-status`, `decision-supersede`, `decision-content`).
A decision that can be verified carries a guard scenario — e.g. DEC-0001 asserts that all Gherkin
parses, DEC-0002 that every reference resolves. While the project is young, a decision that changes
is rewritten or deleted rather than superseded; git keeps the history.

## 5. Curated architecture

Most abstractions in a codebase — classes, modules, functions — are design detail. A small share
(one in ten is a fair illustration, not a measure) carry quality attributes, are expensive to
change, or constrain many other parts. Those are the architecture, and listing everything else next
to them hides them. Which ones they are is the architect's call
([DEC-0008](decisions/DEC-0008-significance-is-the-architects-call.md)):

- **Declaring** an element or pattern is cheap: a Markdown file (`kind: element`/`pattern`), an
  inline node, or a code comment `@sdp is ARCH-x kind=element`.
- **Marking significance** is an explicit act by an architect: `significant: true`, with a
  `rationale` saying why. sdp never computes, limits or checks it — no ratio, no budget, no rule.
- **The tool helps, people decide**: `sdp arch --candidates` suggests non-significant nodes worth a
  look, ranked by links from decisions and quality requirements, requirement dependencies and fan-in.
- **The curated view** (`sdp arch`, MCP `sdp_architecture`, context bundles) contains only the
  significant nodes, the patterns they apply, and the decisions and quality requirements linked to
  them (`architecture.drivers`).
- Teams that want their own rule write it as a scenario, e.g. in a milestone gate:
  `Then the query "*[significant, !rationale]" returns no results`.

Patterns are nodes (`kind: pattern`); elements link to them with any relation (conventionally
`instance-of`, with an optional `role`). Relationships among elements are free-form (`feeds`,
`reads`, `publishes-to`, …).

## 6. The graph

| Source | Becomes |
| --- | --- |
| Markdown with `id` in front matter | a node; other front matter keys are attributes |
| `nodes:` list in front matter | additional inline nodes (phases, iterations, small elements) |
| `links:` in front matter | edges named by their keys, with optional attributes |
| an attribute whose value is a node id | an edge named after the key (`iteration: C2`) |
| `[[ID]]` in prose | a `mentions` edge |
| `rel:: [[ID]]` in prose | an edge named `rel` |
| each Gherkin scenario | a `scenario` node with `-verifies->` to its spec |
| `@sdp <rel> <ID>` in a code comment | a `code` node (symbol below, or file) with `-rel->` to the id |
| `@sdp is <ID> key=value` | anchors (and if needed declares) the node in code |
| a reference to an unknown id | a `missing` node plus a `dangling-link` error |

Every node and edge records the `file:line` it came from.

### Querying: SDPQ

One-line path patterns borrowing Cypher's ASCII-art edges ([DEC-0006](decisions/DEC-0006-path-pattern-queries.md)):

```text
query     := node (edge node)*
node      := (kind | kind|kind | * | #ID | #ID|ID) [cond, ...]*
cond      := key | !key | key=a|b | key!=a | key~regex | key!~regex | key<v | key<=v | key>v | key>=v
edge      := [!|?] ( -rel-> | <-rel- | -rel- )    rel := * | name(|name)* [+]
```

- Values compare case-insensitively; arrays match if any element matches; numbers, ISO dates and
  the maturity/stage ladders compare in order. Quote values containing spaces or commas.
- `!` keeps nodes **without** a matching neighbour, `?` keeps those **with** one; neither moves.
- `+` follows the relation transitively. The result is the set of end nodes, or paths (`--paths`).

```sh
sdp q 'requirement[maturity<ready]'
sdp q 'requirement -realized-by-> element[significant] -decided-by-> decision' --paths
sdp q 'scenario[status=failed] -verifies-> *'
sdp q '#DEC-0003 <-*- *'
sdp q 'requirement|nfr[stage!=verified] ?-iteration-> iteration[phase=construction]'
```

Aggregation is left to standard tools: `sdp q '…' --json | jq …`.

### Exports

`sdp graph -f jsonl|json|tsv|dot|mermaid [-q query]`; `sdp graph --write` writes
`.sdp/graph.jsonl` and `.sdp/graph.tsv`. Both are one fact per line:

```sh
grep -P '^edge\t[^\t]*\tsupersedes\t' .sdp/graph.tsv
jq -c 'select(.type=="node" and .attrs.stage=="in-progress")' .sdp/graph.jsonl
```

## 7. Lifecycle

The RUP structure — phases, iterations, milestones, disciplines — is graph data, not tool
configuration ([DEC-0007](decisions/DEC-0006-lightweight-rup.md)):

| RUP concept | In sdp |
| --- | --- |
| Phase (Inception, Elaboration, Construction, Transition) | `kind: phase` nodes with `order` |
| Iteration (I1, E1, E2, C1…) | `kind: iteration` nodes with `phase:`, `start:`, `end:` |
| Milestone (LCO, LCA, IOC, PR) | `kind: milestone` specs with `phase:`; their scenarios are the gate |
| Planned work | any node with `iteration: <id>` |
| Discipline (business modeling … deployment) | config maps disciplines to kinds; activity per iteration is computed |

`sdp lifecycle` renders phases with gate status, iterations with work by stage, and the discipline
activity chart — the familiar "hump" diagram, computed from the plan:

```text
DISCIPLINE ACTIVITY (relative per discipline)
                     I1  E1  E2  C1  C2  C3  C4  T1  T2
  business-modeling  ███
  requirements           ▒▒▒ ███ ▓▓▓ ▒▒▒ ▒▒▒ ░░░
  analysis-design    ▒▒▒ ███ ▒▒▒ ▒▒▒
  implementation     ░░░ ▒▒▒ ███ ▒▒▒ ▒▒▒ ▒▒▒
  test               ░░░ ▓▓▓ ███ ▓▓▓ ░░░ ░░░
  deployment                                     ███ ███
```

Implementation activity counts planned specs that are in progress or verified; test activity counts
executed scenarios of planned specs; the other rows count planned nodes of the mapped kinds.

## 8. Working with AI agents

Agents get four interchangeable interfaces, from least to most specialised:

1. **Files and grep.** Ids are literal; `grep -rn REQ-guest-checkout .` finds the spec, its
   mentions, code annotations and step results. `grep -rn "@sdp" src/` lists code links.
2. **Line-oriented dumps.** `.sdp/graph.jsonl` / `.tsv` for jq/awk.
3. **CLI with `--json`.** `sdp q`, `sdp show`, `sdp context`, `sdp check`, `sdp run`, `sdp status`.
4. **MCP.** `sdp mcp` serves `sdp_query`, `sdp_show`, `sdp_context`, `sdp_check`,
   `sdp_architecture`, `sdp_status` over stdio; every call re-reads the workspace.

`sdp context <id>` is the main entry point for implementation work: one Markdown document with the
spec, its relationships, scenario status with suggested step definitions, the significant
architecture and decisions within two hops, and linked code. Diagnostics carry an actionable `hint`.

## 9. Implementation

TypeScript on Effect 4, run directly by Node.js 24 (no build step; [DEC-0004](decisions/DEC-0004-effect-on-node-without-build.md)).
Pipes and filters: IO → parse → build → analyse.

| Module | Responsibility | Significant |
| --- | --- | --- |
| `src/workspace/` | Config, globbing, reading through Effect `FileSystem`; in-memory FS for specs/tests | |
| `src/parse/` | Markdown scanner, Gherkin (official parser, line-mapped), code annotations | ✔ ARCH-spec-parser |
| `src/graph/Build.ts` | Pure graph construction, implicit links, results merge, stage derivation | |
| `src/model/Graph.ts` | Immutable graph with adjacency indexes | ✔ ARCH-graph |
| `src/graph/Query.ts` | SDPQ parser and evaluator | ✔ ARCH-query-engine |
| `src/run/` | Step API, runner (Effect, timeouts), built-in graph steps, results schema | ✔ ARCH-runner |
| `src/check/`, `src/arch/`, `src/lifecycle/` | Rules, architecture view and candidates, lifecycle | |
| `src/cli/`, `src/mcp/` | `effect/cli` commands; `effect/ai` MCP server | |

Effect is used where it pays: services (`FileSystem`, `Path`) at the edge so the identical
pipeline runs against memory in executable specs; `Schema` for config/results; `Effect.fn`
workflows; step handlers as Effects with `Effect.timeout`; `effect/cli` and `McpServer`. The pure
core (parsing, graph, query, checks) is plain functions over immutable data.

sdp specifies itself: `specs/` and `docs/` hold its requirements, quality requirements, ideas,
decisions, curated architecture and delivery plan; `specs/steps/sdp.steps.ts` runs them against the
real pipeline. `npm run verify` = typecheck + unit tests + `sdp run` + `sdp check`.

## 10. Reference

**Reserved front matter keys:** `id`, `kind`, `title`, `links`, `nodes`.
**Conventional attributes:** `maturity`, `tags`, `iteration`, `phase`, `type` (`quality`),
`status` and `category` (decisions), `significant` and `rationale` (architecture), `order`,
`start`, `end`.
**Derived attributes:** `file`, `summary`, `scenarios`, `verification`, `stage`, `openQuestions`;
on scenarios `status`, `lastRun`, `hash`, `steps`, `examples`.
**Default id prefixes** (`sdp new`): REQ, NFR, DEC, ARCH, PAT, MS, CAP, RISK — configurable.

**Check rules:** `front-matter`, `missing-id`, `duplicate-id`, `dangling-link`, `link-syntax`,
`inline-node`, `gherkin-syntax`, `scenario-empty`, `maturity-value`, `maturity-gate`,
`maturity-promotable`, `decision-status`, `decision-supersede`, `decision-content`.

**Config (`sdp.config.yaml`)**: `specs`, `features`, `code`, `steps`, `exclude`, `results`,
`maturity`, `ids`, `architecture.{kinds, drivers}`, `lifecycle.disciplines`. See
`src/model/Config.ts`.

## 11. Limits and next steps

- Discipline activity is computed from the plan; deriving it from git history is captured as
  [REQ-history-lifecycle](../specs/ideas/REQ-history-lifecycle.md).
- No custom Cucumber parameter types, hooks (Before/After) or parallel scenario execution in the
  CLI yet (the runner supports `concurrency`).
- Ideas in `specs/ideas/`: graph explorer, spec-aware PR review, editor support (LSP).
