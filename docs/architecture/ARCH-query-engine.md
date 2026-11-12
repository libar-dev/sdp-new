---
id: ARCH-query-engine
kind: element
title: Query engine (SDPQ)
significant: true
rationale: >-
  Public contract used by agents, milestone gates and decision guards; its syntax is embedded in
  specs across workspaces, and it carries the interactive-latency requirement.
iteration: C1
links:
  decided-by: DEC-0006
  constrained-by: NFR-query-performance
  reads: ARCH-graph
---

# Query engine (SDPQ)

Parses one-line path patterns and evaluates them over the graph as a frontier of paths.
[[REQ-graph-query]] says what people and agents can ask; this spec pins down the semantics that
gates, decision guards and agents rely on, since the syntax is a public contract.

```text
query  := node (edge node)* [edge]
node   := (kind(|kind)* | * | #ID(|ID)*) ([cond(, cond)*])*
cond   := key | !key | key=v(|v)* | key!=v | key~regex | key!~regex | key<v | key<=v | key>v | key>=v
edge   := [! | ?] (-rel-> | <-rel- | -rel-)        rel := (* | name(|name)* | nothing) [+]
```

- **Nodes.** A query starts from every node matching its first selector. `#ID` selects by id (an
  unknown id selects nothing). All conditions must hold, whether written in one `[…]` group,
  separated by commas, or in several groups.
- **Values.** `id`, `kind`, `title` and `source` (`file:line`) are keys like any attribute; `a.b`
  reaches into a nested attribute. Equality and regexes ignore case. A list matches when any of
  its elements does. `false`, empty and missing values count as absent: `!key` and `key!=v` match
  them, ordering never does. `<` and `>` compare along the maturity, stage and verification ladders,
  then as numbers, then as text — so ISO dates order correctly. Quote a value that holds spaces,
  commas or `|`; a regex may contain brackets.
- **Edges.** `-rel->` follows outgoing edges, `<-rel-` incoming ones, `-rel-` both. `*` or nothing
  matches any relation, `a|b` either. A trailing `+` follows the relation one or more hops without
  revisiting nodes, at most 12 hops. An edge at the end of a query leads to any node.
- **Filters.** `?edge node` keeps the current nodes that have such a neighbour, `!edge node` those
  that have none; neither moves.
- **Results.** The result is the distinct end nodes; the paths keep every route, each hop with its
  direction, a closure hop written `-rel+->`. Expansion keeps at most 10 000 paths per step. A
  result cut short by either limit is marked truncated.
- **Errors.** A malformed query is rejected with a reason before anything runs.

Code: `src/graph/Query.ts`.

## Scenarios

~~~gherkin
Background:
  Given a file "model.md" containing:
    """
    ---
    id: MODEL
    kind: model
    nodes:
      - { id: REQ-checkout, kind: requirement, maturity: ready, tags: [checkout, web], due: "2026-12-01", links: { realized-by: ARCH-orders } }
      - { id: REQ-refunds, kind: requirement, maturity: idea, estimate: 8, due: "2027-03-01", links: { realized-by: ARCH-billing } }
      - { id: ARCH-orders, kind: element, title: "Order service, v2", significant: true, links: { depends-on: ARCH-billing } }
      - { id: ARCH-billing, kind: element, title: Billing, significant: false, links: { depends-on: ARCH-ledger } }
      - { id: ARCH-ledger, kind: element, title: "Ledger [legacy]", owner: { team: core }, links: { depends-on: ARCH-orders } }
    ---
    # Model
    """

Scenario Outline: Selectors name kinds or ids
  When I query "<query>"
  Then the result is "<result>"

  Examples:
    | query                       | result                                                                 |
    | requirement\|element        | REQ-checkout, REQ-refunds, ARCH-orders, ARCH-billing, ARCH-ledger      |
    | *                           | MODEL, REQ-checkout, REQ-refunds, ARCH-orders, ARCH-billing, ARCH-ledger |
    | #ARCH-orders\|REQ-refunds   | ARCH-orders, REQ-refunds                                               |
    | #ARCH-unknown               | nothing                                                                |
    | #ARCH-orders[significant]   | ARCH-orders                                                            |
    | #ARCH-billing[significant]  | nothing                                                                |

Scenario Outline: Conditions compare attribute values
  When I query '<query>'
  Then the result is "<result>"

  Examples:
    | query                              | result                    |
    | element[!significant]              | ARCH-billing, ARCH-ledger |
    | element[significant, title~order]  | ARCH-orders               |
    | element[significant][title~order]  | ARCH-orders               |
    | requirement[tags=web]              | REQ-checkout              |
    | requirement[tags!=web]             | REQ-refunds               |
    | requirement[maturity=ready\|idea]  | REQ-checkout, REQ-refunds |
    | requirement[maturity>idea]         | REQ-checkout              |
    | requirement[estimate>5]            | REQ-refunds               |
    | requirement[estimate<100]          | REQ-refunds               |
    | requirement[due<2027-01-01]        | REQ-checkout              |
    | element[title=BILLING]             | ARCH-billing              |
    | element[title~^bill]               | ARCH-billing              |
    | element[title!~^(billing\|ledger)] | ARCH-orders               |
    | element[title~^[bl]]               | ARCH-billing, ARCH-ledger |
    | element[title~\[legacy\]]          | ARCH-ledger               |
    | *[title="Order service, v2"]       | ARCH-orders               |
    | *[title~"service, v[0-9]"]         | ARCH-orders               |
    | *[id~^req-]                        | REQ-checkout, REQ-refunds |
    | *[source=model.md:7]               | ARCH-orders               |
    | *[owner.team=core]                 | ARCH-ledger               |

Scenario Outline: Edge steps follow relations in either direction
  When I query "<query>"
  Then the result is "<result>"

  Examples:
    | query                                                             | result                                 |
    | #ARCH-billing -depends-on-> *                                     | ARCH-ledger                            |
    | #ARCH-billing <-depends-on- *                                     | ARCH-orders                            |
    | #ARCH-billing -depends-on- *                                      | ARCH-ledger, ARCH-orders               |
    | #ARCH-billing <-depends-on\|realized-by- *                        | ARCH-orders, REQ-refunds               |
    | #ARCH-billing <-- *                                               | ARCH-orders, REQ-refunds               |
    | #ARCH-billing -*- *                                               | ARCH-ledger, ARCH-orders, REQ-refunds  |
    | #ARCH-orders -depends-on+-> *                                     | ARCH-billing, ARCH-ledger              |
    | #ARCH-orders <-depends-on+- *                                     | ARCH-billing, ARCH-ledger              |
    | #REQ-checkout -realized-by-> * -depends-on-> element              | ARCH-billing                           |
    | #REQ-checkout -realized-by->                                      | ARCH-orders                            |
    | element ?<-realized-by- requirement[maturity=ready]               | ARCH-orders                            |
    | element !<-realized-by- *                                         | ARCH-ledger                            |
    | requirement ?-realized-by-> element[significant] -realized-by-> * | ARCH-orders                            |

Scenario: The result is the distinct end nodes; the paths keep every route
  When I query "requirement -realized-by-> element -depends-on+-> *"
  Then the result is "ARCH-billing, ARCH-ledger, ARCH-orders"
  And the paths are:
    | REQ-checkout -realized-by-> ARCH-orders -depends-on+-> ARCH-billing |
    | REQ-checkout -realized-by-> ARCH-orders -depends-on+-> ARCH-ledger  |
    | REQ-refunds -realized-by-> ARCH-billing -depends-on+-> ARCH-ledger  |
    | REQ-refunds -realized-by-> ARCH-billing -depends-on+-> ARCH-orders  |

Scenario: A path records the direction of every hop
  When I query "#ARCH-ledger <-depends-on- element <-realized-by- *"
  Then the paths are:
    | ARCH-ledger <-depends-on- ARCH-billing <-realized-by- REQ-refunds |

Scenario: A closure stops after twelve hops and says so
  Given a chain of 15 nodes linked by "next"
  When I query "#N1 -next+-> *"
  Then the result has 12 nodes
  And the result is truncated

Scenario: Path expansion stops at a limit and says so
  Given a generated graph of 200 nodes and 12000 edges
  When the query "* -*-> * -*-> *" runs on it with at most 1000 paths
  Then the result has 1000 paths
  And the result is truncated

Scenario Outline: Malformed queries are rejected with a reason
  When I query '<query>'
  Then the query is rejected with "<reason>"

  Examples:
    | query                                      | reason                   |
    |                                            | empty query              |
    | requirement]                               | unbalanced               |
    | *[title="open                              | unbalanced               |
    | requirement realized-by element            | expected an edge         |
    | requirement <-realized-by-> element        | expected an edge         |
    | requirement -realized-by-> -depends-on-> * | expected a node selector |
    | requirement[maturity=ready]x               | could not parse filters  |
    | requirement[=ready]                        | invalid condition        |
    | requirement[!maturity=ready]               | only negates bare keys   |
~~~
