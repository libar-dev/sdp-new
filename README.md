---
id: README
kind: guide
title: sdp
links:
  introduces: [VISION, CAP-living-specs, CAP-curated-architecture, CAP-agent-collaboration]
---

# sdp

Living specifications, curated architecture and decision records as **one queryable graph** —
written as Markdown, executable as tests, organised along a RUP-style lifecycle, and built for AI
agents as much as for people.

- **One spec format for every maturity.** A one-line idea and a fully designed feature are the same
  kind of file: Markdown + YAML front matter, with behaviour in standard Gherkin blocks. Scenarios
  execute as tests once step definitions exist; until then they are simply *undefined*, not failing.
- **Honest status.** Authors declare maturity (`idea → draft → specified → ready`) and `sdp check`
  verifies that the content supports the claim — structurally; a team's own Definition of Ready is
  a gate it writes. *Implemented* is never declared: it is derived from scenario results.
- **Decisions of every kind** (architecture, product, process, …) as records in the same graph,
  optionally guarding themselves with a scenario.
- **Curated architecture.** Architects mark the few significant elements and patterns (with a
  rationale); sdp shows exactly those with their decisions and quality requirements, and never
  decides significance for them.
- **Free-form graph.** Kinds and relation names are your words. Query with one-line path patterns,
  export as JSONL/TSV for grep and jq, or serve over MCP.
- **Lifecycle.** Phases, iterations and milestones are graph nodes; milestone gates are scenarios.
  Each piece of work plans its disciplines' activity (`iteration:`, `activity:`), so the RUP chart
  of overlapping disciplines is the plan itself, shown apart from the evidence.
- **Everything is a spec.** Guides too: this README is a node of sdp's own graph, and its quick
  start runs with every build.

Read [docs/VISION.md](docs/VISION.md) for why sdp exists, the
[requirements](specs/requirements/) for exactly what it does — the command line is
[REQ-cli](specs/requirements/REQ-cli.md) — and the [decisions](docs/decisions/) for why it works
the way it does.

## Quick start

Requires Node.js ≥ 24 (TypeScript runs directly, no build step).

```sh
npm install
npm run verify                  # typecheck, sdp check, and sdp's own executable specifications
node src/cli/main.ts status     # or ./bin/sdp.js status, or `npm link` once for a global `sdp`
```

The rest of the quick start is executable: `npm run verify` runs each scenario below with the real
`sdp` in a fresh, empty directory, so what you read here is what you get. In your own repository:

~~~gherkin
Scenario: Start with an idea, a quality requirement and a decision
  Given an empty workspace
  When I run "sdp init"
  Then the output contains "created sdp.config.yaml"
  When I run "sdp new requirement 'Guest checkout'"
  Then the output contains "specs/requirements/REQ-guest-checkout.md"
  When I run "sdp new nfr 'Checkout latency' --maturity specified"
  Then the output contains "specs/quality/NFR-checkout-latency.md"
  When I run "sdp new decision 'Use Postgres for orders'"
  Then the output contains "docs/decisions/DEC-0001-use-postgres-for-orders.md"
  When I run "sdp check"
  Then the exit code is 0
~~~

`sdp init` writes `sdp.config.yaml` and `AGENTS.sdp.md`, a guide for coding agents. Each `sdp new`
prints the id and file it created from a template; `--maturity` decides how much the template
asks for. Once behaviour is written down as Gherkin, `sdp run` executes it. Steps without a
definition are *undefined* — reported, never failing — and `sdp run --snippets` ends with one
step definition module covering all of them:

~~~gherkin
Scenario: Specify behaviour before it is automated
  Given a file "specs/requirements/REQ-guest-checkout.md" containing:
    """
    ---
    id: REQ-guest-checkout
    maturity: specified
    ---
    # Guest checkout

    Shoppers without an account can buy.

    ```gherkin
    Scenario: Guest pays by card
      Given a cart with 2 items
      When the guest pays with a valid card
      Then an order is created
    ```
    """
  When I run "sdp run --snippets"
  Then the exit code is 0
  And the output contains "1 scenario(s): 1 undefined"
  And the output contains 'Given("a cart with {int} items", ({ world, args: [int] }) => pending())'
  When I run "sdp q 'requirement[maturity>=specified]' --ids"
  Then the output contains "REQ-guest-checkout"
  When I run "sdp status"
  Then the output contains "undefined 1"
~~~

## Commands

| Command | What it does |
| --- | --- |
| `sdp status` | One-screen summary: kinds, relations, stages, decisions, scenarios, gates, significant elements, diagnostics |
| `sdp q '<pattern>'` | Query, e.g. `sdp q 'requirement[maturity<ready]'`, `--paths`, `--ids` |
| `sdp show <id>` | A node with attributes and edges |
| `sdp context <id>` | Everything needed to work on a node, as Markdown (for agents and humans) |
| `sdp check` | Diagnostics with rule ids, `file:line` and a hint; exit 1 on errors |
| `sdp steps [text]` | Step definitions, built-in ones included, one per line with `file:line`; read from the step files, never run |
| `sdp run [ids/paths] [--tags expr]` | Execute scenarios, record `.sdp/results.json`; gates run last and never fail the run |
| `sdp gate <milestone>` | Evaluate one milestone's gate (or a spec's `@gate` scenarios); exit 1 if unmet |
| `sdp arch [--candidates] [-f mermaid\|dot\|json]` | The curated architecture, or suggestions for architects to look at |
| `sdp lifecycle` | Phases, gates, planned work and discipline activity per iteration, and the evidence apart |
| `sdp graph [-f jsonl\|tsv\|json\|dot\|mermaid] [-q pattern] [--write]` | Export the graph |
| `sdp types` | Write the id declarations that type `annotate()` from `sdp/annotations` in TypeScript |
| `sdp new <kind> <title>` · `sdp init` | Authoring helpers; templates for requirement, idea, nfr, decision, element, pattern, milestone and plan (`sdp new --help`) |
| `sdp mcp` | MCP server (stdio) for agents |

Like git, commands work on the nearest directory at or above the current one that holds an
`sdp.config.yaml`; `-C <dir>` names the workspace root instead. Which commands print JSON with `--json`, and every flag,
exit code and example: [REQ-cli](specs/requirements/REQ-cli.md).

## This repository specifies itself

Its requirements, quality requirements, decisions, architecture, plan and risks are specs in
`specs/` and `docs/`; [VISION, *Finding your way*](docs/VISION.md#finding-your-way) maps where each
kind lives. There are no other tests: every check of sdp is a scenario in one of these specs, run
by the step definitions in `specs/steps/` against the real pipeline in memory or the real CLI in
temporary directories.

```sh
node src/cli/main.ts run          # every scenario; gates run last, and an unmet gate does not fail the run
node src/cli/main.ts lifecycle
node src/cli/main.ts arch
node src/cli/main.ts context REQ-graph-query
```

A conventional product example — a shop with domain code, step definitions that exercise it, a
verified requirement, a specified-but-unbuilt one, an idea, a quality requirement and product
decisions — lives in [examples/shop](examples/shop). Run it with
`node src/cli/main.ts -C examples/shop run`:

~~~gherkin
Scenario: The shop example verifies itself
  Given the workspace is a copy of "examples/shop"
  When I run "sdp run"
  Then the exit code is 0
  And the output contains "4 scenario(s): 3 passed, 1 undefined"
~~~

## Using it from an MCP client

```json
{ "mcpServers": { "sdp": { "command": "node", "args": ["/path/to/sdp/src/cli/main.ts", "-C", "/path/to/workspace", "mcp"] } } }
```
