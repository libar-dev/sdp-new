---
id: REQ-graph-query
kind: requirement
title: Path-pattern queries
maturity: ready
iteration: I1
activity: { implementation: I1, test: I1 }
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
rules are written. The syntax is a public contract: specs in every workspace embed it.

```text
query  := node (edge node)* [edge]
node   := (kind(|kind)* | * | #ID(|ID)*) ([cond(, cond)*])*
cond   := key | !key | key=v(|v)* | key!=v(|v)* | key~regex | key!~regex | key<v | key<=v | key>v | key>=v
edge   := [! | ?] (-rel-> | <-rel- | -rel-)        rel := (* | name(|name)* | nothing) [+]
```

- **Nodes.** A query starts from every node matching its first selector. `#ID` selects by id (an
  unknown id selects nothing). All conditions must hold, whether written in one `[…]` group,
  separated by commas, or in several groups.
- **Values.** `id`, `kind`, `title` and `source` (`file:line`) are keys like any attribute; `a.b`
  reaches into a nested attribute. A bare `key` asks whether the key is set: missing, `null`,
  `false`, empty text and empty lists are not, so `!key` finds them. Equality and regexes compare
  the value itself, ignoring case — `key=false`, `key=0` and `key=""` find exactly those values —
  and `key!=v` also matches nodes where the key is missing or `null`, which have no value to
  compare. A list matches when any of its elements does. `<` and `>` compare only set values,
  along the maturity, stage and verification ladders, then as numbers, then as text — so ISO dates
  order correctly. `|` separates alternatives except
  in a regex; quote a value, in single or double quotes, when it contains a comma or a literal `|`.
  A regex may contain brackets.
- **Edges.** `-rel->` follows outgoing edges, `<-rel-` incoming ones, `-rel-` both. `*` or nothing
  matches any relation, `a|b` either. A trailing `+` follows the relation one or more hops without
  revisiting nodes. An edge at the end of a query leads to any node.
- **Filters.** `?edge node` keeps the current nodes that have such a neighbour, `!edge node` those
  that have none; neither moves.
- **Results.** The result is the distinct end nodes; with `--paths`, every route that reached them,
  each hop with its direction and a closure hop written `-rel+->`. Evaluation is bounded, and a
  result cut short says so and names the limit, even when it is empty ([[ARCH-query-engine]]).
- **Errors.** A malformed query is rejected with a reason before anything runs.

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
    | query                       | result                                                                   |
    | requirement\|element        | REQ-checkout, REQ-refunds, ARCH-orders, ARCH-billing, ARCH-ledger        |
    | *                           | MODEL, REQ-checkout, REQ-refunds, ARCH-orders, ARCH-billing, ARCH-ledger |
    | #ARCH-orders\|REQ-refunds   | ARCH-orders, REQ-refunds                                                 |
    | #ARCH-unknown               | nothing                                                                  |
    | #ARCH-orders[significant]   | ARCH-orders                                                              |
    | #ARCH-billing[significant]  | nothing                                                                  |

Scenario Outline: Conditions compare attribute values
  When I query '<query>'
  Then the result is "<result>"

  Examples:
    | query                               | result                    |
    | element[significant]                | ARCH-orders               |
    | element[!significant]               | ARCH-billing, ARCH-ledger |
    | element[significant=false]          | ARCH-billing              |
    | element[significant!=false]         | ARCH-orders, ARCH-ledger  |
    | element[significant=TRUE]           | ARCH-orders               |
    | element[significant, title~order]   | ARCH-orders               |
    | element[significant][title~order]   | ARCH-orders               |
    | requirement[tags=web]               | REQ-checkout              |
    | requirement[tags!=web]              | REQ-refunds               |
    | requirement[maturity=ready\|idea]   | REQ-checkout, REQ-refunds |
    | requirement[maturity!=ready\|draft] | REQ-refunds               |
    | requirement[maturity>idea]          | REQ-checkout              |
    | requirement[maturity<=idea]         | REQ-refunds               |
    | requirement[estimate>5]             | REQ-refunds               |
    | requirement[estimate<100]           | REQ-refunds               |
    | requirement[due<2027-01-01]         | REQ-checkout              |
    | requirement[due>=2027-03-01]        | REQ-refunds               |
    | element[title=BILLING]              | ARCH-billing              |
    | element[title~^bill]                | ARCH-billing              |
    | element[title!~^(billing\|ledger)]  | ARCH-orders               |
    | element[title~^[bl]]                | ARCH-billing, ARCH-ledger |
    | element[title~\[legacy\]]           | ARCH-ledger               |
    | *[title="Order service, v2"]        | ARCH-orders               |
    | *[title~"service, v[0-9]"]          | ARCH-orders               |
    | *[id~^req-]                         | REQ-checkout, REQ-refunds |
    | *[source=model.md:7]                | ARCH-orders               |
    | *[owner.team=core]                  | ARCH-ledger               |

Scenario Outline: Unset is told apart from false, zero and empty text
  Given a file "flags.md" containing:
    """
    ---
    id: FLAGS
    kind: flags
    nodes:
      - { id: F-missing, kind: flag }
      - { id: F-null, kind: flag, value: null }
      - { id: F-false, kind: flag, value: false }
      - { id: F-zero, kind: flag, value: 0 }
      - { id: F-empty, kind: flag, value: "" }
      - { id: F-none, kind: flag, value: [] }
      - { id: F-true, kind: flag, value: true }
    ---
    # Flags
    """
  When I query '<query>'
  Then the result is "<result>"

  Examples:
    | query              | result                                              |
    | flag[value]        | F-zero, F-true                                      |
    | flag[!value]       | F-missing, F-null, F-false, F-empty, F-none         |
    | flag[value=false]  | F-false                                             |
    | flag[value!=false] | F-missing, F-null, F-zero, F-empty, F-none, F-true  |
    | flag[value=0]      | F-zero                                              |
    | flag[value=""]     | F-empty                                             |
    | flag[value!=""]    | F-missing, F-null, F-false, F-zero, F-none, F-true  |
    | flag[value=null]   | nothing                                             |
    | flag[value~^f]     | F-false                                             |
    | flag[value<1]      | F-zero                                              |

Scenario Outline: Edges follow relations in either direction
  When I query "<query>"
  Then the result is "<result>"

  Examples:
    | query                                                             | result                                |
    | #ARCH-billing -depends-on-> *                                     | ARCH-ledger                           |
    | #ARCH-billing <-depends-on- *                                     | ARCH-orders                           |
    | #ARCH-billing -depends-on- *                                      | ARCH-ledger, ARCH-orders              |
    | #ARCH-billing <-depends-on\|realized-by- *                        | ARCH-orders, REQ-refunds              |
    | #ARCH-billing <-- *                                               | ARCH-orders, REQ-refunds              |
    | #ARCH-billing -*- *                                               | ARCH-ledger, ARCH-orders, REQ-refunds |
    | #ARCH-orders -depends-on+-> *                                     | ARCH-billing, ARCH-ledger             |
    | #ARCH-orders <-depends-on+- *                                     | ARCH-billing, ARCH-ledger             |
    | #REQ-checkout -realized-by-> * -depends-on-> element              | ARCH-billing                          |
    | #REQ-checkout -realized-by->                                      | ARCH-orders                           |
    | element ?<-realized-by- requirement[maturity=ready]               | ARCH-orders                           |
    | element !<-realized-by- *                                         | ARCH-ledger                           |
    | requirement ?-realized-by-> element[significant] -realized-by-> * | ARCH-orders                           |

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
    | *[title~(]                                 | invalid regex            |
~~~
