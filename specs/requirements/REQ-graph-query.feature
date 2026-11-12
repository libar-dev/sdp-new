@id=REQ-graph-query @maturity=ready @graph @agents
@refines:CAP-agent-collaboration @realized-by:ARCH-query-engine @decided-by:DEC-0006 @constrained-by:NFR-query-performance
@iteration:I1 @activity.implementation:I1 @activity.test:I1
Feature: Path-pattern queries

  People and agents ask the graph a question in one line: on the command line, over MCP and inside
  scenarios, which is how gates, guards and architecture rules are written. The syntax is a public
  contract, because specs in every workspace embed it.

  Background:
    Given these specs:
      | tags                                                                                     | Feature           |
      | @id=REQ-checkout @maturity=ready @checkout @web @due=2026-12-01 @realized-by:ARCH-orders | Checkout          |
      | @id=REQ-refunds @maturity=idea @estimate=8 @due=2027-03-01 @realized-by:ARCH-billing     | Refunds           |
      | @id=ARCH-orders @public=true @depends-on:ARCH-billing                                    | Order service, v2 |
      | @id=ARCH-billing @public=false @depends-on:ARCH-ledger                                   | Billing           |
      | @id=ARCH-ledger @owner.team=core @depends-on:ARCH-orders                                 | Ledger [legacy]   |

  Rule: A query is node selectors joined by edges, and returns nodes or paths and nothing more

    Counting and grouping are jq's, over `sdp graph`.

    Scenario: The grammar is what sdp q --help prints
      When I run "sdp q --help"
      Then the output contains:
        """
        query  := node (edge node)* [edge]
        node   := (kind(|kind)* | * | #ID(|ID)*) ([cond(, cond)*])*
        cond   := key | !key | key=v(|v)* | key!=v(|v)* | key~regex | key!~regex | key<v | key<=v | key>v | key>=v
        edge   := [! | ?] (-rel-> | <-rel- | -rel-)        rel := (* | name(|name)* | nothing) [+]
        """

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

  Rule: A selector names kinds, ids or every node

    Scenario Outline: Kinds, ids and the star
      When I query "<query>"
      Then the result is "<result>"

      Examples:
        | query                     | result                                                            |
        | requirement\|element      | REQ-checkout, REQ-refunds, ARCH-orders, ARCH-billing, ARCH-ledger |
        | *                         | REQ-checkout, REQ-refunds, ARCH-orders, ARCH-billing, ARCH-ledger |
        | #ARCH-orders\|REQ-refunds | ARCH-orders, REQ-refunds                                          |

    Scenario Outline: A word the workspace does not know is no error: it matches nothing
      When I query "<query>"
      Then the result is "<result>"

      Examples:
        | query               | result  |
        | #ARCH-unknown       | nothing |
        | gizmo               | nothing |
        | element -feeds-> *  | nothing |
        | element[colour=red] | nothing |

  Rule: A node matches when every condition holds, in one group or in several

    Scenario Outline: In one group or in several
      When I query "<query>"
      Then the result is "<result>"

      Examples:
        | query                        | result      |
        | element[public, title~order] | ARCH-orders |
        | element[public][title~order] | ARCH-orders |
        | #ARCH-orders[public]         | ARCH-orders |
        | #ARCH-billing[public]        | nothing     |

  Rule: A bare key asks whether a value is set, and a comparison reads the value

    Scenario Outline: Set and unset values
      Given these specs:
        | tags                                | Feature  |
        | @id=F-missing @kind=flag            | No value |
        | @id=F-false @kind=flag @value=false | False    |
        | @id=F-zero @kind=flag @value=0      | Zero     |
        | @id=F-true @kind=flag @value=true   | True     |
      When I query '<query>'
      Then the result is "<result>"

      Examples: Missing and false are not set
        | query        | result             |
        | flag[value]  | F-zero, F-true     |
        | flag[!value] | F-missing, F-false |

      Examples: = and ~ find false and zero; != also matches a node that has no value
        | query              | result                    |
        | flag[value=false]  | F-false                   |
        | flag[value!=false] | F-missing, F-zero, F-true |
        | flag[value=0]      | F-zero                    |
        | flag[value~^f]     | F-false                   |
        | flag[value<1]      | F-zero                    |

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

  Rule: A key reads what the node itself holds: its attributes, its id, kind, title and source, and the targets of its links

    Scenario Outline: id, kind, title and source are keys, and a dot reaches into a nested attribute
      When I query "<query>"
      Then the result is "<result>"

      Examples:
        | query                                 | result                    |
        | *[id~^req-]                           | REQ-checkout, REQ-refunds |
        | *[kind=requirement]                   | REQ-checkout, REQ-refunds |
        | *[source=specs/ARCH-orders.feature:1] | ARCH-orders               |
        | *[owner.team=core]                    | ARCH-ledger               |

    Scenario Outline: Names every object has are no keys
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

  Rule: An edge follows a relation out, in or both ways, and with a plus one or more times

    Scenario Outline: Out, in, both ways, and to any node at the end of a query
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

    Scenario Outline: A star or no name is any relation
      When I query "<query>"
      Then the result is "<result>"

      Examples:
        | query               | result                                |
        | #ARCH-billing <-- * | ARCH-orders, REQ-refunds              |
        | #ARCH-billing -*- * | ARCH-ledger, ARCH-orders, REQ-refunds |
        | #ARCH-ledger <-*- * | ARCH-billing                          |
        | #ARCH-ledger -*-> * | ARCH-orders                           |

    Scenario Outline: A plus is one or more hops, and reaches its start when a cycle leads back
      When I query "<query>"
      Then the result is "<result>"

      Examples:
        | query                                       | result                                 |
        | #ARCH-orders -depends-on+-> *               | ARCH-billing, ARCH-ledger, ARCH-orders |
        | #ARCH-orders <-depends-on+- *               | ARCH-billing, ARCH-ledger, ARCH-orders |
        | #ARCH-orders -depends-on+-> #ARCH-orders    | ARCH-orders                            |
        | #REQ-checkout -realized-by+-> #REQ-checkout | nothing                                |

  Rule: ? keeps the nodes that have such a neighbour and ! those that have none, and neither moves

    Scenario Outline: With and without such a neighbour
      When I query "<query>"
      Then the result is "<result>"

      Examples:
        | query                                                        | result      |
        | element ?<-realized-by- requirement[maturity=ready]          | ARCH-orders |
        | element !<-realized-by- *                                    | ARCH-ledger |
        | element !-depends-on+-> #ARCH-orders                         | nothing     |
        | requirement ?-realized-by-> element[public] -realized-by-> * | ARCH-orders |

  Rule: The result is the distinct end nodes; a path is a route that exists, each edge drawn as it points

    Background:
      Given these specs:
        | tags                       | Feature |
        | @id=A @kind=stop @r:B      | A       |
        | @id=B @kind=stop @r:A @s:C | B       |
        | @id=C @kind=stop           | C       |

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
