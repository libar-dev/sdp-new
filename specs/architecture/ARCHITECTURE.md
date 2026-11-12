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

The elements too small for a file of their own, and the rules that hold between all elements.
`sdp arch` prints the architecture and `sdp arch --mermaid` draws it; how data flows through it is
[[PAT-pipes-and-filters]].

`A uses B` says one thing: a module anchored to `A` imports a value — a function, a class, a
constant — from a module anchored to `B`. An import of types alone is no use: it calls no code of
the other element.

## Open questions

- [ ] Does `src/app/` — the use cases, the answer envelope, the templates — get an element of its
  own? Until the architects say, its modules are anchored to ARCH-reports.
- [ ] `src/model/Results.ts`, the results a run records as data, is anchored to no element.

## Scenarios

~~~gherkin
Scenario: The uses links declared between elements are exactly the value imports between the modules anchored to them
  Then the "uses" links between elements are the value imports between the modules anchored to them

Scenario: No element depends on itself through others, so no cycle between elements goes unrecorded
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
