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

People and agents ask the graph a question in one line — on the command line, over MCP and inside
scenarios, which is how gates, guards and architecture rules are written. The syntax is a public
contract, because specs in every workspace embed it.

A query returns nodes or paths and nothing more: counting and grouping are jq's
([[REQ-graph-export]]).

## Scenarios

~~~gherkin
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
      - { id: ARCH-orders, kind: element, title: "Order service, v2", public: true, links: { depends-on: ARCH-billing } }
      - { id: ARCH-billing, kind: element, title: Billing, public: false, links: { depends-on: ARCH-ledger } }
      - { id: ARCH-ledger, kind: element, title: "Ledger [legacy]", owner: { team: core }, links: { depends-on: ARCH-orders } }
    ---
    # Model

    Everything ends in the [[ARCH-ledger]].
    """

Scenario: The grammar is what sdp q --help prints
  When I run "sdp q --help"
  Then the output contains:
    """
    query  := node (edge node)* [edge]
    node   := (kind(|kind)* | * | #ID(|ID)*) ([cond(, cond)*])*
    cond   := key | !key | key=v(|v)* | key!=v(|v)* | key~regex | key!~regex | key<v | key<=v | key>v | key>=v
    edge   := [! | ?] (-rel-> | <-rel- | -rel-)        rel := (* | name(|name)* | nothing) [+]
    """

Scenario Outline: A selector names kinds, ids or every node
  When I query "<query>"
  Then the result is "<result>"

  Examples:
    | query                     | result                                                                   |
    | requirement\|element      | REQ-checkout, REQ-refunds, ARCH-orders, ARCH-billing, ARCH-ledger        |
    | *                         | MODEL, REQ-checkout, REQ-refunds, ARCH-orders, ARCH-billing, ARCH-ledger |
    | #ARCH-orders\|REQ-refunds | ARCH-orders, REQ-refunds                                                 |

Scenario Outline: A word the workspace does not know is no error: it matches nothing
  When I query "<query>"
  Then the result is "<result>"

  Examples:
    | query               | result  |
    | #ARCH-unknown       | nothing |
    | gizmo               | nothing |
    | element -feeds-> *  | nothing |
    | element[colour=red] | nothing |

Scenario Outline: Every condition must hold, in one group or in several
  When I query "<query>"
  Then the result is "<result>"

  Examples:
    | query                        | result      |
    | element[public, title~order] | ARCH-orders |
    | element[public][title~order] | ARCH-orders |
    | #ARCH-orders[public]         | ARCH-orders |
    | #ARCH-billing[public]        | nothing     |

Scenario Outline: A bare key asks whether it is set; a comparison reads the value
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

  Examples: Missing, null, false, empty text and an empty list are not set
    | query        | result                                      |
    | flag[value]  | F-zero, F-true                              |
    | flag[!value] | F-missing, F-null, F-false, F-empty, F-none |

  Examples: = and ~ find false, zero and empty text; != also matches a node that has no value
    | query              | result                                             |
    | flag[value=false]  | F-false                                            |
    | flag[value!=false] | F-missing, F-null, F-zero, F-empty, F-none, F-true |
    | flag[value=0]      | F-zero                                             |
    | flag[value=""]     | F-empty                                            |
    | flag[value!=""]    | F-missing, F-null, F-false, F-zero, F-none, F-true |
    | flag[value=null]   | nothing                                            |
    | flag[value~^f]     | F-false                                            |
    | flag[value<1]      | F-zero                                             |

Scenario Outline: Case is ignored, and a list matches when any of its elements does
  When I query "<query>"
  Then the result is "<result>"

  Examples:
    | query                  | result       |
    | element[public=TRUE]   | ARCH-orders  |
    | element[title=BILLING] | ARCH-billing |
    | element[title~^bill]   | ARCH-billing |
    | requirement[tags=web]  | REQ-checkout |
    | requirement[tags!=web] | REQ-refunds  |

Scenario Outline: A bar separates alternatives, except in a regex or in quotes
  When I query '<query>'
  Then the result is "<result>"

  Examples:
    | query                               | result                    |
    | requirement[maturity=ready\|idea]   | REQ-checkout, REQ-refunds |
    | requirement[maturity!=ready\|draft] | REQ-refunds               |
    | element[title!~^(billing\|ledger)]  | ARCH-orders               |
    | element[title~^[bl]]                | ARCH-billing, ARCH-ledger |
    | element[title~\[legacy\]]           | ARCH-ledger               |
    | *[title="Order service, v2"]        | ARCH-orders               |
    | *[title~"service, v[0-9]"]          | ARCH-orders               |

Scenario Outline: Less and greater order values that are set
  When I query "<query>"
  Then the result is "<result>"

  Examples: Along the maturity ladder
    | query                       | result       |
    | requirement[maturity>idea]  | REQ-checkout |
    | requirement[maturity<=idea] | REQ-refunds  |

  Examples: Then as numbers; a node without the key is not compared
    | query                     | result      |
    | requirement[estimate>5]   | REQ-refunds |
    | requirement[estimate<100] | REQ-refunds |

  Examples: Then as text, so ISO dates order
    | query                        | result       |
    | requirement[due<2027-01-01]  | REQ-checkout |
    | requirement[due>=2027-03-01] | REQ-refunds  |

Scenario Outline: id, kind, title and source are keys, and a dot reaches into a nested attribute
  When I query "<query>"
  Then the result is "<result>"

  Examples:
    | query                | result                    |
    | *[id~^req-]          | REQ-checkout, REQ-refunds |
    | *[kind=model]        | MODEL                     |
    | *[source=model.md:7] | ARCH-orders               |
    | *[owner.team=core]   | ARCH-ledger               |

Scenario Outline: A key reads only what the node itself holds
  When I query "<query>"
  Then the result is "<result>"

  Examples:
    | query                      | result                                 |
    | element[toString]          | nothing                                |
    | element[owner.constructor] | nothing                                |
    | element[!constructor]      | ARCH-orders, ARCH-billing, ARCH-ledger |

Scenario Outline: A key also holds the targets of the node's links, so a condition and a filter agree
  When I query "<query>"
  Then the result is "<result>"

  Examples:
    | query                                    | result       |
    | requirement[realized-by=ARCH-orders]     | REQ-checkout |
    | requirement ?-realized-by-> #ARCH-orders | REQ-checkout |
    | element[depends-on=ARCH-ledger]          | ARCH-billing |
    | element ?-depends-on-> #ARCH-ledger      | ARCH-billing |

Scenario Outline: An edge follows a relation out, in or both ways; at the end of a query it leads to any node
  When I query "<query>"
  Then the result is "<result>"

  Examples:
    | query                                                | result                   |
    | #ARCH-billing -depends-on-> *                        | ARCH-ledger              |
    | #ARCH-billing <-depends-on- *                        | ARCH-orders              |
    | #ARCH-billing -depends-on- *                         | ARCH-ledger, ARCH-orders |
    | #ARCH-billing <-depends-on\|realized-by- *           | ARCH-orders, REQ-refunds |
    | #REQ-checkout -realized-by-> * -depends-on-> element | ARCH-billing             |
    | #REQ-checkout -realized-by->                         | ARCH-orders              |

Scenario Outline: A star or no name is any relation but a prose mention
  When I query "<query>"
  Then the result is "<result>"

  Examples:
    | query                   | result                                |
    | #ARCH-billing <-- *     | ARCH-orders, REQ-refunds              |
    | #ARCH-billing -*- *     | ARCH-ledger, ARCH-orders, REQ-refunds |
    | #ARCH-ledger <-*- *     | ARCH-billing                          |
    | #MODEL -*-> *           | nothing                               |
    | #MODEL -mentions-> *    | ARCH-ledger                           |
    | #MODEL -*\|mentions-> * | ARCH-ledger                           |

Scenario Outline: A plus is one or more hops, and reaches its start when a cycle leads back
  When I query "<query>"
  Then the result is "<result>"

  Examples:
    | query                                       | result                                 |
    | #ARCH-orders -depends-on+-> *               | ARCH-billing, ARCH-ledger, ARCH-orders |
    | #ARCH-orders <-depends-on+- *               | ARCH-billing, ARCH-ledger, ARCH-orders |
    | #ARCH-orders -depends-on+-> #ARCH-orders    | ARCH-orders                            |
    | #REQ-checkout -realized-by+-> #REQ-checkout | nothing                                |

Scenario Outline: ? keeps the nodes with such a neighbour, ! those without, and neither moves
  When I query "<query>"
  Then the result is "<result>"

  Examples:
    | query                                                        | result      |
    | element ?<-realized-by- requirement[maturity=ready]          | ARCH-orders |
    | element !<-realized-by- *                                    | ARCH-ledger |
    | element !-depends-on+-> #ARCH-orders                         | nothing     |
    | requirement ?-realized-by-> element[public] -realized-by-> * | ARCH-orders |

Scenario Outline: A malformed query is rejected with a reason
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

Rule: The result is the distinct end nodes; a path is a route that exists, each edge drawn as it points

  Background:
    Given a file "routes.md" containing:
      """
      ---
      id: ROUTES
      kind: model
      nodes:
        - { id: A, kind: stop, links: { r: B } }
        - { id: B, kind: stop, links: { r: A, s: C } }
        - { id: C, kind: stop }
      ---
      # Routes
      """

  Scenario: Several routes to a node are one result and as many paths
    When I query "requirement -realized-by-> element -depends-on+-> *"
    Then the result is "ARCH-billing, ARCH-ledger, ARCH-orders"
    And the paths are:
      | REQ-checkout -realized-by-> ARCH-orders -depends-on-> ARCH-billing                                                     |
      | REQ-checkout -realized-by-> ARCH-orders -depends-on-> ARCH-billing -depends-on-> ARCH-ledger                           |
      | REQ-checkout -realized-by-> ARCH-orders -depends-on-> ARCH-billing -depends-on-> ARCH-ledger -depends-on-> ARCH-orders |
      | REQ-refunds -realized-by-> ARCH-billing -depends-on-> ARCH-ledger                                                      |
      | REQ-refunds -realized-by-> ARCH-billing -depends-on-> ARCH-ledger -depends-on-> ARCH-orders                            |
      | REQ-refunds -realized-by-> ARCH-billing -depends-on-> ARCH-ledger -depends-on-> ARCH-orders -depends-on-> ARCH-billing |

  Scenario: An edge walked against its direction is drawn as it points
    When I query "#ARCH-ledger <-depends-on- element <-realized-by- *"
    Then the paths are:
      | ARCH-ledger <-depends-on- ARCH-billing <-realized-by- REQ-refunds |

  Scenario: Two edges between the same nodes are two routes, each in its direction
    When I query "#A -r- #B"
    Then the paths are:
      | A -r-> B |
      | A <-r- B |

  Scenario: A closure over several relations names the relation of each hop
    When I query "#A -r|s+-> #C"
    Then the paths are:
      | A -r-> B -s-> C |

  Scenario: A closure reaches its start through a cycle, by a route that says how
    When I query "#A -r+-> #A"
    Then the paths are:
      | A -r-> B -r-> A |
~~~
