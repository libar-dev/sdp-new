---
id: ARCH-overview
kind: view
title: Architecture overview
nodes:
  - id: ARCH-workspace
    kind: element
    title: Workspace IO
    links: { feeds: [ARCH-spec-parser, ARCH-code-annotations] }
  - id: ARCH-checker
    kind: element
    title: Checker
    links: { reads: ARCH-graph }
  - id: ARCH-architecture-view
    kind: element
    title: Architecture view
    links: { reads: ARCH-graph }
  - id: ARCH-lifecycle
    kind: element
    title: Lifecycle view
    links: { reads: ARCH-graph }
  - id: ARCH-cli
    kind: element
    title: Command line
    links: { uses: [ARCH-query-engine, ARCH-runner, ARCH-checker] }
  - id: ARCH-mcp
    kind: element
    title: MCP server
    links: { uses: [ARCH-query-engine, ARCH-checker] }
---

# Architecture overview

A pipeline (see [[PAT-pipes-and-filters]]) from files to answers. Files are the only source of
truth; the graph is rebuilt on every command ([[PAT-derived-index]]).

```mermaid
flowchart LR
  files[(Markdown, .feature, code)] --> ws[Workspace IO]
  ws --> parser[Spec parser] & annotations[Code annotation scanner] --> builder[Graph builder] --> graph((System graph))
  graph --> query[Query engine] & checker[Checker] & runner[Scenario runner] & lifecycle[Lifecycle view] & view[Architecture view]
  runner -- results.json --> builder
  query & checker & runner --> cli[CLI] & mcp[MCP server]
```

Only the elements marked `significant: true` (see `sdp arch`) are architecture; the others are
declared for orientation. An element with its own file specifies its contract there, as scenarios.

## Implementation

TypeScript on Effect 4, run directly by Node.js 24 with no build step ([[DEC-0004]]). The pipeline
is pipes and filters: workspace IO → parse → build → analyse (query, check, run, lifecycle). Every
stage after IO is a pure function of its input, which is what lets executable specs run the real
pipeline against an in-memory file system.

| Module | Responsibility | Element |
| --- | --- | --- |
| `src/workspace/` | Config, globbing and reading through Effect `FileSystem`; an in-memory file system for executable specs | ARCH-workspace |
| `src/parse/Markdown.ts`, `Gherkin.ts`, `Spec.ts` | Markdown scanner, Gherkin through the official parser with every line mapped back, spec assembly | ARCH-spec-parser |
| `src/parse/Annotations.ts` | `@sdp` comments in code | ARCH-code-annotations |
| `src/graph/Build.ts` | Pure graph construction, implicit links, results merge, stage derivation | ARCH-graph-builder |
| `src/model/Graph.ts` | Immutable graph with adjacency indexes | ARCH-graph |
| `src/graph/Query.ts` | SDPQ parser and evaluator | ARCH-query-engine |
| `src/run/` | Step API, runner (Effect, timeouts), built-in graph steps, results schema | ARCH-runner |
| `src/check/` | Rules over the built project | ARCH-checker |
| `src/arch/` | Curated architecture view and promotion candidates | ARCH-architecture-view |
| `src/lifecycle/` | Phases, iterations, gates and discipline activity | ARCH-lifecycle |
| `src/graph/Context.ts`, `Export.ts`, `Status.ts` | Context bundles, exports, status summary | |
| `src/cli/` | `effect/cli` commands | ARCH-cli |
| `src/mcp/` | `effect/ai` MCP server | ARCH-mcp |

Effect is used where it pays: services (`FileSystem`, `Path`) at the edge, so the identical
pipeline runs against memory in executable specs; `Schema` for the config file and stored results;
`Effect.fn` workflows; step handlers as Effects with `Effect.timeout`; `effect/cli` and
`McpServer`. The pure core — parsing, graph, query, checks — is plain functions over immutable data.

sdp specifies itself: `specs/` and `docs/` hold its requirements, quality requirements, ideas,
decisions, curated architecture and delivery plan, and the step definitions in `specs/steps/` run
them against the real pipeline. `npm run verify` is typecheck + `sdp check` + `sdp run`.
