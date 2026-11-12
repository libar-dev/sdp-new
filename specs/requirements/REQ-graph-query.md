---
id: REQ-graph-query
kind: requirement
title: Path-pattern queries
maturity: ready
iteration: C1
tags: [graph, agents]
links:
  refines: CAP-agent-collaboration
  realized-by: ARCH-query-engine
  decided-by: DEC-0006
  constrained-by: NFR-query-performance
---

# Path-pattern queries

People and agents ask the graph questions with one-line path patterns that look like Cypher's
ASCII art: node selectors joined by edge steps. The same language is used on the command line
(`sdp q`), by MCP clients, and inside scenarios — which is how milestone gates and architecture
rules are written.

```text
requirement[maturity=ready] -realized-by-> element[significant]
element[significant] !-*- decision          # filter: without any decision neighbour
#ARCH-billing -depends-on+-> *              # transitive closure
```

## Scenarios

~~~gherkin
Background:
  Given a file "model.md" containing:
    """
    ---
    id: MODEL
    kind: model
    nodes:
      - { id: REQ-a, kind: requirement, maturity: ready, links: { realized-by: ARCH-orders } }
      - { id: REQ-b, kind: requirement, maturity: draft, links: { realized-by: ARCH-billing } }
      - { id: REQ-c, kind: requirement, maturity: idea }
      - { id: ARCH-orders, kind: element, title: Orders, significant: true, rationale: transaction boundary, links: { decided-by: DEC-1, depends-on: ARCH-db } }
      - { id: ARCH-billing, kind: element, title: Billing, significant: true, rationale: regulated, links: { depends-on: ARCH-orders } }
      - { id: ARCH-db, kind: element, title: Database }
      - { id: DEC-1, kind: decision, status: accepted }
    ---
    # A small model
    """

Scenario Outline: Path patterns select nodes
  When I query "<query>"
  Then the result is "<result>"

  Examples:
    | query                                         | result                    |
    | requirement                                   | REQ-a, REQ-b, REQ-c       |
    | requirement[maturity=ready]                   | REQ-a                     |
    | requirement[maturity<ready]                   | REQ-b, REQ-c              |
    | requirement[maturity>=draft]                  | REQ-a, REQ-b              |
    | requirement[!maturity]                        | nothing                   |
    | element[title~bill]                           | ARCH-billing              |
    | *[rationale]                                  | ARCH-orders, ARCH-billing |
    | requirement -realized-by-> element            | ARCH-orders, ARCH-billing |
    | element[significant] !-decided-by-> decision  | ARCH-billing              |
    | element ?-decided-by-> *                      | ARCH-orders               |
    | #ARCH-db <-depends-on- *                      | ARCH-orders               |
    | #ARCH-billing -depends-on+-> *                | ARCH-orders, ARCH-db      |
    | #DEC-1 <-*- * <-realized-by- requirement      | REQ-a                     |

Scenario Outline: Malformed queries explain themselves
  When I query "<query>"
  Then the query is rejected with "<message>"

  Examples:
    | query            | message          |
    | requirement[     | unbalanced       |
    | requirement => x | expected an edge |
    | *[title~(]       | invalid regex    |
~~~
