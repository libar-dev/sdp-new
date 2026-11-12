---
id: ARCHITECTURE
kind: view
title: Architecture overview
nodes:
  - id: ARCH-workspace
    kind: element
    title: Workspace IO
    links: { uses: [ARCH-graph-builder, ARCH-runner], decided-by: DEC-0004 }
  - id: ARCH-checker
    kind: element
    title: Checker
    links: { uses: [ARCH-code-annotations, ARCH-lifecycle, ARCH-vocabulary] }
  - id: ARCH-architecture-view
    kind: element
    title: Architecture view
    links: { uses: ARCH-vocabulary, decided-by: DEC-0008 }
  - id: ARCH-lifecycle
    kind: element
    title: Lifecycle view
    links: { uses: [ARCH-graph, ARCH-vocabulary] }
  - id: ARCH-reports
    kind: element
    title: Context bundles, exports and status
    links:
      uses:
        - ARCH-workspace
        - ARCH-spec-parser
        - ARCH-code-annotations
        - ARCH-graph
        - ARCH-vocabulary
        - ARCH-query-engine
        - ARCH-runner
        - ARCH-checker
        - ARCH-architecture-view
        - ARCH-lifecycle
  - id: ARCH-cli
    kind: element
    title: Command line
    links: { uses: [ARCH-reports, ARCH-mcp, ARCH-workspace, ARCH-query-engine] }
  - id: ARCH-mcp
    kind: element
    title: MCP server
    links: { uses: [ARCH-reports, ARCH-query-engine], decided-by: DEC-0004 }
---

# Architecture overview

A pipeline (see [[PAT-pipes-and-filters]]) from files to answers. Files are the only source of
truth; the graph is rebuilt on every command ([[PAT-derived-index]]).

```mermaid
flowchart LR
  files[(Markdown, .feature, code, step files)] --> ws[Workspace IO]
  ws --> parser[Spec parser] & annotations[Code annotation scanner] --> builder[Graph builder] --> graph((System graph))
  graph --> views[Query engine, checker, lifecycle view, architecture view, reports] --> app[Use cases] --> cli[CLI] & mcp[MCP server]
  graph --> runner[Scenario runner] -- results.json --> ws
```

The picture is how data flows. Which element depends on which is not drawn: it is declared, as
`uses` links, and checked.

Every element and pattern declared here is the architecture, by the architects' act of declaring
it ([[DEC-0008]]; `sdp arch` shows it). An element with its own file specifies its contract there,
as scenarios.

## What `uses` means

`A uses B` says one thing: a module anchored to `A` imports a value — a function, a class, a
constant — from a module anchored to `B`. A module is anchored by its `is` annotation
(`annotate(import.meta, { is: "ARCH-runner" })`, [[ARCH-code-annotations]]); an import of types
alone is not a use, since it calls no code of the other element, and a module that no annotation
anchors belongs to no element. It is the one relation declared between elements: where data
flows is the picture above, what depends on what is these links.

Because the meaning is mechanical, the links are checked: the `uses` links declared between
elements are exactly the value imports between their modules, so the declared architecture cannot
drift from the code, and no cycle between elements goes unrecorded — there is none.

```sh
sdp graph --mermaid -q 'element -uses-> element'     # the dependency diagram
sdp q 'element -uses+-> element' --paths             # what an element reaches
```

## Implementation

TypeScript on Effect 4, run directly by Node.js 24 with no build step ([[DEC-0004]], [[NFR-no-build-step]]), one module
per element:

| Module | Responsibility | Element |
| --- | --- | --- |
| `src/workspace/` | Finds the workspace root (walking up to `sdp.config.*`), reads config and files through Effect `FileSystem`, computes the fingerprints results are recorded against, imports step modules for `sdp run` with `import "sdp/steps"` resolved to the running sdp; an in-memory file system for executable specs | ARCH-workspace |
| `src/parse/Markdown.ts`, `Gherkin.ts`, `Spec.ts`, `StepDefinitions.ts` | CommonMark and YAML parsing, Gherkin through the official parser with every line mapped back, spec assembly, step definitions read from step files without running them | ARCH-spec-parser |
| `src/annotations.ts`, `src/parse/TypedAnnotations.ts`, `src/parse/Annotations.ts`, `src/graph/Types.ts` | typed `annotate()` calls (the API, the static reader, the generated id declarations) and `@sdp` comments in any language | ARCH-code-annotations |
| `src/graph/Build.ts` | Pure graph construction, link keys, stage derivation from the results it is handed | ARCH-graph-builder |
| `src/model/Graph.ts` | Immutable graph with adjacency indexes | ARCH-graph |
| `src/model/Vocabulary.ts`, `Config.ts` | The vocabulary profile: the words sdp interprets, and the configuration that renames them | ARCH-vocabulary |
| `src/model/Results.ts` | The results a run records, as data: statuses, evidence, the roll-up into verification | — |
| `src/graph/Query.ts` | SDPQ parser and evaluator | ARCH-query-engine |
| `src/steps.ts`, `src/run/` | Step API (`sdp/steps`), matching, runner (Effect, cooperative timeouts), evidence and its layers, the results store, built-in graph steps | ARCH-runner |
| `src/check/` | Rules over the built project | ARCH-checker |
| `src/arch/` | The architecture view | ARCH-architecture-view |
| `src/lifecycle/` | Phases, iterations, gates and discipline activity | ARCH-lifecycle |
| `src/graph/Context.ts`, `Export.ts`, `Status.ts` | Context bundles, the graph as records, status summary | ARCH-reports |
| `src/app/` | The application layer: one use case per command — reading the graph, running scenarios, authoring — each returning an answer of plain records or a typed error; the envelope of an answer, how it reads as text, and the templates | ARCH-reports, until the architects give it an element of its own |
| `src/cli/` | `effect/cli` commands: parse flags, call a use case, print the answer | ARCH-cli |
| `src/mcp/` | `effect/ai` MCP server: check arguments, call the same use case, return the answer | ARCH-mcp |

Effect is used where it pays: services (`FileSystem`, `Path`) at the edge, so the identical
pipeline runs against memory in executable specs; `Schema` for the config file and stored results;
`Effect.fn` workflows; step handlers as Effects with `Effect.timeout`; `effect/cli` and
`McpServer`. The pure core — parsing, graph, query, checks — is plain functions over immutable data.

Where the specifications of sdp itself live: [[VISION]], *Finding your way*.

## Scenarios

~~~gherkin
Scenario: The uses links between elements are the imports between their modules
  Then the "uses" links between elements are the value imports between the modules anchored to them

Scenario: No element depends on itself through others
  Then no element reaches itself over "uses" links

Scenario: Nothing depends on a transport, except the command line that starts the server
  Then the query "#ARCH-cli <-uses- *" returns no results
  And the query "#ARCH-mcp <-uses- *" returns:
    | ARCH-cli |

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
