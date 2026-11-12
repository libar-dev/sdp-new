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

People and agents ask the graph questions with SDPQ: one-line path patterns that borrow Cypher's
ASCII-art edges ([[DEC-0006]]). The same language is used on the command line (`sdp q`), by MCP
clients, and inside scenarios, which is how milestone gates, decision guards and architecture
rules are written.

```text
query     := node (edge node)*
node      := (kind | kind|kind | * | #ID | #ID|ID) [cond, ...]*
cond      := key | !key | key=a|b | key!=a | key~regex | key!~regex | key<v | key<=v | key>v | key>=v
edge      := [!|?] ( -rel-> | <-rel- | -rel- )        rel := * | name(|name)* [+]
```

- A query starts from every node matching the first selector and follows each edge step to the
  next one. The result is the set of end nodes, or with `--paths` the paths that reached them.
- `-rel->` follows outgoing edges, `<-rel-` incoming ones, `-rel-` either. `*` matches any relation,
  `a|b` either, and a trailing `+` follows the relation transitively (up to 12 hops).
- `!` keeps the nodes **without** a matching neighbour and `?` those **with** one; neither moves.
- `key` holds when the attribute is present and not `false` or empty; `!key` when it is not.
  Conditions see attributes and also `id`, `kind`, `title` and `source` (`file:line`); `a.b` reaches
  into a nested attribute.
- Equality and regular expressions ignore case. An array matches when any element does. Numbers,
  ISO dates and the maturity, stage and verification ladders compare in order. Quote values that
  contain spaces or commas.
- A malformed query is rejected with a message saying what is wrong. Results stop at 10,000 paths,
  and say so.

```sh
sdp q 'requirement[maturity<ready]'
sdp q 'requirement -realized-by-> element[significant] -decided-by-> decision' --paths
sdp q 'scenario[status=failed] -verifies-> *'
sdp q '#DEC-0003 <-*- *'
sdp q 'requirement|nfr[stage!=verified] ?-iteration-> iteration[phase=construction]'
```

A query returns nodes or paths, nothing more. Counting and grouping are left to standard tools:
`sdp q '…' --json | jq …`.

## Scenarios

~~~gherkin
Background:
  Given a file "model.md" containing:
    """
    ---
    id: MODEL
    kind: model
    nodes:
      - { id: REQ-a, kind: requirement, maturity: ready, tags: [checkout, payments], priority: 10, links: { realized-by: ARCH-orders } }
      - { id: REQ-b, kind: requirement, maturity: draft, priority: 9, links: { realized-by: ARCH-billing } }
      - { id: REQ-c, kind: requirement, maturity: idea }
      - { id: ARCH-orders, kind: element, title: Orders, significant: true, rationale: transaction boundary, links: { decided-by: DEC-1, depends-on: ARCH-db } }
      - { id: ARCH-billing, kind: element, title: Billing, significant: true, rationale: regulated, links: { depends-on: ARCH-orders } }
      - { id: ARCH-db, kind: element, title: Order database }
      - { id: DEC-1, kind: decision, status: accepted }
      - { id: E1, kind: iteration, start: "2026-11-23" }
      - { id: C1, kind: iteration, start: "2027-01-04" }
    ---
    # A small model
    """

Scenario Outline: Path patterns select nodes
  When I query "<query>"
  Then the result is "<result>"

  Examples:
    | query                                         | result                    |
    | requirement                                   | REQ-a, REQ-b, REQ-c       |
    | #REQ-a\|REQ-c                                 | REQ-a, REQ-c              |
    | requirement[maturity=ready]                   | REQ-a                     |
    | requirement[maturity=READY]                   | REQ-a                     |
    | requirement[maturity=ready\|draft]            | REQ-a, REQ-b              |
    | requirement[maturity!=idea]                   | REQ-a, REQ-b              |
    | requirement[maturity<ready]                   | REQ-b, REQ-c              |
    | requirement[maturity>=draft]                  | REQ-a, REQ-b              |
    | requirement[!maturity]                        | nothing                   |
    | requirement[tags=payments]                    | REQ-a                     |
    | requirement[priority>9]                       | REQ-a                     |
    | iteration[start>=2027-01-01]                  | C1                        |
    | element[title~bill]                           | ARCH-billing              |
    | element[title!~bill]                          | ARCH-orders, ARCH-db      |
    | element[title='Order database']               | ARCH-db                   |
    | *[rationale]                                  | ARCH-orders, ARCH-billing |
    | requirement -realized-by-> element            | ARCH-orders, ARCH-billing |
    | element[significant] !-decided-by-> decision  | ARCH-billing              |
    | element ?-decided-by-> *                      | ARCH-orders               |
    | #ARCH-db <-depends-on- *                      | ARCH-orders               |
    | #ARCH-orders -depends-on- *                   | ARCH-db, ARCH-billing     |
    | #ARCH-orders -decided-by\|depends-on-> *      | DEC-1, ARCH-db            |
    | #ARCH-billing -depends-on+-> *                | ARCH-orders, ARCH-db      |
    | #DEC-1 <-*- * <-realized-by- requirement      | REQ-a                     |

Scenario: Paths show how each result was reached
  When I query "requirement -realized-by-> element -decided-by-> decision"
  Then one of the paths is "REQ-a -realized-by-> ARCH-orders -decided-by-> DEC-1"

Scenario Outline: Malformed queries explain themselves
  When I query "<query>"
  Then the query is rejected with "<message>"

  Examples:
    | query            | message          |
    | requirement[     | unbalanced       |
    | requirement => x | expected an edge |
    | *[title~(]       | invalid regex    |
~~~
