---
id: ARCH-overview
kind: view
title: Architecture overview
nodes:
  - id: ARCH-workspace
    kind: element
    title: Workspace IO
    links: { feeds: [ARCH-spec-parser, ARCH-code-annotations], decided-by: DEC-0004 }
  - id: ARCH-checker
    kind: element
    title: Checker
    links: { reads: ARCH-graph, uses: ARCH-lifecycle }
  - id: ARCH-architecture-view
    kind: element
    title: Architecture view
    links: { reads: ARCH-graph, decided-by: DEC-0008 }
  - id: ARCH-lifecycle
    kind: element
    title: Lifecycle view
    links: { reads: ARCH-graph }
  - id: ARCH-reports
    kind: element
    title: Context bundles, exports and status
    links: { reads: ARCH-graph, uses: [ARCH-architecture-view, ARCH-checker] }
  - id: ARCH-cli
    kind: element
    title: Command line
    links: { uses: [ARCH-workspace, ARCH-query-engine, ARCH-runner, ARCH-checker, ARCH-architecture-view, ARCH-lifecycle, ARCH-reports] }
  - id: ARCH-mcp
    kind: element
    title: MCP server
    links: { uses: [ARCH-workspace, ARCH-query-engine, ARCH-checker, ARCH-architecture-view, ARCH-reports], decided-by: DEC-0004 }
---

# Architecture overview

A pipeline (see [[PAT-pipes-and-filters]]) from files to answers. Files are the only source of
truth; the graph is rebuilt on every command ([[PAT-derived-index]]).

```mermaid
flowchart LR
  files[(Markdown, .feature, code)] --> ws[Workspace IO]
  ws --> parser[Spec parser] & annotations[Code annotation scanner] --> builder[Graph builder] --> graph((System graph))
  graph --> query[Query engine] & checker[Checker] & runner[Scenario runner] & lifecycle[Lifecycle view] & view[Architecture view] & reports[Context, export, status]
  runner -- results.json --> builder
  runner --> query & checker
  reports --> view & checker
  cli[CLI] --> query & checker & runner & lifecycle & view & reports
  mcp[MCP server] --> query & checker & view & reports
```

Every element and pattern declared here is the architecture, by the architects' act of declaring
it ([[DEC-0008]]; `sdp arch` shows it). An element with its own file specifies its contract there,
as scenarios.

## Implementation

TypeScript on Effect 4, run directly by Node.js 24 with no build step ([[DEC-0004]]), one module
per element:

| Module | Responsibility | Element |
| --- | --- | --- |
| `src/workspace/` | Finds the workspace root (walking up to `sdp.config.*`), reads config and files through Effect `FileSystem`, imports step modules with `import "sdp"` resolved to the running sdp; an in-memory file system for executable specs | ARCH-workspace |
| `src/parse/Markdown.ts`, `Gherkin.ts`, `Spec.ts` | CommonMark and YAML parsing, Gherkin through the official parser with every line mapped back, spec assembly | ARCH-spec-parser |
| `src/annotations.ts`, `src/parse/TypedAnnotations.ts`, `src/parse/Annotations.ts`, `src/graph/Types.ts` | typed `annotate()` calls (the API, the static reader, the generated id declarations) and `@sdp` comments in any language | ARCH-code-annotations |
| `src/graph/Build.ts` | Pure graph construction, link keys, results merge, stage derivation | ARCH-graph-builder |
| `src/model/Graph.ts` | Immutable graph with adjacency indexes | ARCH-graph |
| `src/model/Vocabulary.ts`, `Config.ts` | The vocabulary profile: the words sdp interprets, and the configuration that renames them | ARCH-vocabulary |
| `src/graph/Query.ts` | SDPQ parser and evaluator | ARCH-query-engine |
| `src/run/` | Step API, runner (Effect, timeouts), built-in graph steps, results schema | ARCH-runner |
| `src/check/` | Rules over the built project | ARCH-checker |
| `src/arch/` | The architecture view | ARCH-architecture-view |
| `src/lifecycle/` | Phases, iterations, gates and discipline activity | ARCH-lifecycle |
| `src/graph/Context.ts`, `Export.ts`, `Status.ts` | Context bundles, exports, status summary | ARCH-reports |
| `src/cli/` | `effect/cli` commands | ARCH-cli |
| `src/mcp/` | `effect/ai` MCP server | ARCH-mcp |

Effect is used where it pays: services (`FileSystem`, `Path`) at the edge, so the identical
pipeline runs against memory in executable specs; `Schema` for the config file and stored results;
`Effect.fn` workflows; step handlers as Effects with `Effect.timeout`; `effect/cli` and
`McpServer`. The pure core — parsing, graph, query, checks — is plain functions over immutable data.

Where the specifications of sdp itself live: [[VISION]], *Finding your way*.

## Scenarios

~~~gherkin
Scenario: The pipeline reads a workspace in memory as it reads one on disk
  Given a file "notes/NOTE-outside.md" containing:
    """
    ---
    id: NOTE-outside
    ---
    # Outside the workspace
    """
  And a file "shop/specs/REQ-cart.md" containing:
    """
    ---
    id: REQ-cart
    ---
    # Cart
    """
  When the workspace "shop" is loaded from memory and from disk
  Then both graphs have exactly the nodes "REQ-cart"
~~~
