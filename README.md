# sdp

Living specifications, curated architecture and decision records as **one queryable graph** —
written as Markdown, executable as tests, organised along a RUP-style lifecycle, and built for AI
agents as much as for people.

- **One spec format for every maturity.** A one-line idea and a fully designed feature are the same
  kind of file: Markdown + YAML front matter, with behaviour in standard Gherkin blocks. Scenarios
  execute as tests once step definitions exist; until then they are simply *undefined*, not failing.
- **Honest status.** Authors declare maturity (`idea → draft → specified → ready`) and `sdp check`
  verifies the claim; *implemented* is never declared — it is derived from scenario results.
- **Decisions of every kind** (architecture, product, process, …) as records in the same graph,
  optionally guarding themselves with a scenario.
- **Curated architecture.** Architects mark the few significant elements and patterns (with a
  rationale); sdp shows exactly those with their decisions and quality requirements, and never
  decides significance for them.
- **Free-form graph.** Kinds and relation names are your words. Query with one-line path patterns,
  export as JSONL/TSV for grep and jq, or serve over MCP.
- **Lifecycle.** Phases, iterations and milestones are graph nodes; milestone gates are scenarios;
  the discipline activity chart is computed from the plan.

Read [docs/DESIGN.md](docs/DESIGN.md) for the design and [docs/decisions/](docs/decisions/) for why.

## Quick start

Requires Node.js ≥ 24 (TypeScript runs directly, no build step).

```sh
npm install
npm run verify                  # typecheck + unit tests + sdp's own executable specs + check

node src/cli/main.ts status     # or ./bin/sdp.js status, or `npm link` once for a global `sdp`
```

In your own repository:

```sh
sdp init                                     # sdp.config.yaml + agent instructions
sdp new requirement "Guest checkout"         # specs/requirements/REQ-guest-checkout.md (maturity: idea)
sdp new nfr "Checkout latency" --maturity specified
sdp new decision "Use Postgres for orders"   # docs/decisions/DEC-0001-use-postgres-for-orders.md
sdp check                                    # links, maturity gates, decisions, significance
sdp run --snippets                           # execute scenarios; stubs for undefined steps
```

## Commands

| Command | What it does |
| --- | --- |
| `sdp status` | One-screen summary: kinds, relations, stages, decisions, scenarios, significance, diagnostics |
| `sdp q '<pattern>'` | Query, e.g. `sdp q 'requirement[maturity<ready]'`, `--paths`, `--ids`, `--json` |
| `sdp show <id>` | A node with attributes and edges |
| `sdp context <id>` | Everything needed to work on a node, as Markdown (for agents and humans) |
| `sdp check` | Diagnostics with rule ids, `file:line` and a hint; exit 1 on errors |
| `sdp run [ids/paths] [--tags expr]` | Execute scenarios, record `.sdp/results.json`; gates run last |
| `sdp gate <milestone>` | Evaluate one milestone gate; exit 1 if unmet |
| `sdp arch [--candidates] [-f mermaid]` | The curated architecture, or ranked promotion candidates |
| `sdp lifecycle` | Phases, iterations, gates and discipline activity |
| `sdp graph [-f jsonl\|tsv\|dot\|mermaid] [-q pattern] [--write]` | Export the graph |
| `sdp new <kind> <title>` · `sdp init` | Authoring helpers |
| `sdp mcp` | MCP server (stdio) for agents |

All read commands accept `--json`; `-C <dir>` selects the workspace root.

## This repository specifies itself

```text
specs/capabilities/   business goals (CAP-*)
specs/requirements/   functional requirements, all ready and verified (REQ-*)
specs/quality/        quality requirements as quality attribute scenarios (NFR-*)
specs/ideas/          ideas and drafts, deliberately unfinished
specs/steps/          step definitions driving the real pipeline in memory
docs/decisions/       architecture, technology, product and process decisions (DEC-*)
docs/architecture/    curated elements and patterns (ARCH-*, PAT-*)
docs/delivery/        the plan (phases, iterations) and milestone gates (MS-*)
```

```sh
node src/cli/main.ts run          # 41 scenarios pass; gates: LCO, LCA, IOC met, PR not yet
node src/cli/main.ts lifecycle
node src/cli/main.ts arch
node src/cli/main.ts context REQ-graph-query
```

A conventional product example — a shop with domain code, step definitions that exercise it, a
verified requirement, a specified-but-unbuilt one, an idea, a quality requirement and a product
decision — lives in [examples/shop](examples/shop): `node src/cli/main.ts -C examples/shop run`.

## Using it from an MCP client

```json
{ "mcpServers": { "sdp": { "command": "node", "args": ["/path/to/sdp/src/cli/main.ts", "-C", "/path/to/workspace", "mcp"] } } }
```
