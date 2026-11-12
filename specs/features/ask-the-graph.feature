@id=ask-the-graph @maturity=implemented
@realized-by:ARCH-query-engine @realized-by:ARCH-reports
Feature: Ask the graph

  Developers, architects and AI agents need answers that cross specs, decisions, architecture and
  code: which code realises a requirement, what rests on a decision, what nothing verifies yet.
  Without them they grep and guess. Any such question is one line, asked on the command line, over
  MCP or in a scenario, and every answer says where each node is written and whether something may
  be missing from it. The graph is plain data too, so grep and jq answer as well.

  Not a general graph database language, and no counting or grouping: those are jq's, over the
  graph as data. Nothing here changes the graph.

  Background:
    Given these specs:
      | tags                                                                                 | Feature           |
      | @id=checkout @maturity=ready @checkout @web @due=2026-12-01 @realized-by:ARCH-orders | Checkout          |
      | @id=refunds @maturity=idea @estimate=8 @due=2027-03-01 @realized-by:ARCH-billing     | Refunds           |
      | @id=ARCH-orders @public=true @depends-on:ARCH-billing                                | Order service, v2 |
      | @id=ARCH-billing @public=false @depends-on:ARCH-ledger                               | Billing           |
      | @id=ARCH-ledger @owner.team=core @depends-on:ARCH-orders                             | Ledger [legacy]   |

  Rule: A question is one line: the nodes to start from, then the links to follow

    One line fits a shell argument and one scenario step, which is how gates and guards are written.
    Not Cypher or SPARQL, which need an engine and several lines; not jq alone, where a question of
    two hops is a program.

    Scenario: The grammar is what sdp q --help prints
      When I run "sdp q --help"
      Then the exit code is 0
      And the output contains:
        """
        query  := node (edge node)* [edge]
        node   := (kind(|kind)* | * | #ID(|ID)*) ([cond(, cond)*])*
        cond   := key | !key | key=v(|v)* | key!=v(|v)* | key~regex | key!~regex | key<v | key<=v | key>v | key>=v
        edge   := [! | ?] (-rel-> | <-rel- | -rel-)        rel := (* | name(|name)* | nothing) [+]
        """

    Scenario Outline: A malformed question is refused with the reason
      When I query '<query>'
      Then the query is rejected with "<reason>"

      Examples:
        | query                                  | reason                   |
        |                                        | empty query              |
        | feature]                               | unbalanced               |
        | *[title="open                          | unbalanced               |
        | feature realized-by element            | expected an edge         |
        | feature <-realized-by-> element        | expected an edge         |
        | feature -realized-by-> -depends-on-> * | expected a node selector |
        | feature[maturity=ready]x               | could not parse filters  |
        | feature[=ready]                        | invalid condition        |
        | feature[!maturity=ready]               | only negates bare keys   |
        | *[title~(]                             | invalid regex            |

  Rule: A node is picked by its kind, its id, or anything it holds

    A condition reads what the node itself holds: its attributes, its id, kind, title and source, and
    the targets of its links, so a condition and a link agree. A word the workspace does not know
    matches nothing.

    Scenario Outline: Kinds, ids, every node, and words nothing has
      When I query "<query>"
      Then the result is "<result>"

      Examples:
        | query                 | result                                                    |
        | feature\|element      | checkout, refunds, ARCH-orders, ARCH-billing, ARCH-ledger |
        | *                     | checkout, refunds, ARCH-orders, ARCH-billing, ARCH-ledger |
        | #ARCH-orders\|refunds | ARCH-orders, refunds                                      |
        | #ARCH-unknown         | nothing                                                   |
        | gizmo                 | nothing                                                   |
        | element -feeds-> *    | nothing                                                   |
        | element[colour=red]   | nothing                                                   |

    Scenario Outline: Every condition holds, in one group or in several
      When I query "<query>"
      Then the result is "<result>"

      Examples:
        | query                        | result      |
        | element[public, title~order] | ARCH-orders |
        | element[public][title~order] | ARCH-orders |
        | #ARCH-billing[public]        | nothing     |

    Scenario Outline: A bare key asks whether a value is set; missing and false are not
      Given these specs:
        | tags                                    | Feature  |
        | @id=missing-value @kind=flag            | No value |
        | @id=false-value @kind=flag @value=false | False    |
        | @id=zero-value @kind=flag @value=0      | Zero     |
        | @id=true-value @kind=flag @value=true   | True     |
      When I query '<query>'
      Then the result is "<result>"

      Examples:
        | query              | result                                |
        | flag[value]        | zero-value, true-value                |
        | flag[!value]       | missing-value, false-value            |
        | flag[value=false]  | false-value                           |
        | flag[value!=false] | missing-value, zero-value, true-value |
        | flag[value=0]      | zero-value                            |
        | flag[value~^f]     | false-value                           |
        | flag[value<1]      | zero-value                            |

    Scenario Outline: A comparison ignores case, matches any element of a list, and takes alternatives
      When I query '<query>'
      Then the result is "<result>"

      Examples:
        | query                              | result                    |
        | element[public=TRUE]               | ARCH-orders               |
        | element[title~^bill]               | ARCH-billing              |
        | feature[tags=web]                  | checkout                  |
        | feature[tags!=web]                 | refunds                   |
        | feature[maturity=ready\|idea]      | checkout, refunds         |
        | feature[maturity!=ready\|draft]    | refunds                   |
        | element[title!~^(billing\|ledger)] | ARCH-orders               |
        | element[title~^[bl]]               | ARCH-billing, ARCH-ledger |
        | element[title~\[legacy\]]          | ARCH-ledger               |
        | *[title="Order service, v2"]       | ARCH-orders               |
        | *[title~"service, v[0-9]"]         | ARCH-orders               |

    Scenario Outline: Less and greater order maturity, then numbers, then text, so ISO dates order
      When I query "<query>"
      Then the result is "<result>"

      Examples:
        | query                    | result   |
        | feature[maturity>idea]   | checkout |
        | feature[maturity<=idea]  | refunds  |
        | feature[estimate>5]      | refunds  |
        | feature[estimate<100]    | refunds  |
        | feature[due<2027-01-01]  | checkout |
        | feature[due>=2027-03-01] | refunds  |

    Scenario Outline: What a node holds, and not the names every object has
      When I query "<query>"
      Then the result is "<result>"

      Examples:
        | query                                 | result                                 |
        | *[id~^arch-]                          | ARCH-orders, ARCH-billing, ARCH-ledger |
        | *[kind=feature]                       | checkout, refunds                      |
        | *[source=specs/ARCH-orders.feature:1] | ARCH-orders                            |
        | *[owner.team=core]                    | ARCH-ledger                            |
        | feature[realized-by=ARCH-orders]      | checkout                               |
        | element[toString]                     | nothing                                |
        | element[owner.constructor]            | nothing                                |
        | element[!constructor]                 | ARCH-orders, ARCH-billing, ARCH-ledger |

  Rule: Links are followed out, in or either way, once or as far as they lead

    Scenario Outline: Out, in, either way, any relation, and to any node at the end
      When I query "<query>"
      Then the result is "<result>"

      Examples:
        | query                                            | result                            |
        | #ARCH-billing -depends-on-> *                    | ARCH-ledger                       |
        | #ARCH-billing <-depends-on- *                    | ARCH-orders                       |
        | #ARCH-billing -depends-on- *                     | ARCH-ledger, ARCH-orders          |
        | #ARCH-billing <-depends-on\|realized-by- *       | ARCH-orders, refunds              |
        | #checkout -realized-by-> * -depends-on-> element | ARCH-billing                      |
        | #checkout -realized-by->                         | ARCH-orders                       |
        | #ARCH-billing <-- *                              | ARCH-orders, refunds              |
        | #ARCH-billing -*- *                              | ARCH-ledger, ARCH-orders, refunds |
        | #ARCH-ledger -*-> *                              | ARCH-orders                       |

    Scenario Outline: As far as links lead, and back to the start when a cycle leads there
      When I query "<query>"
      Then the result is "<result>"

      Examples:
        | query                                    | result                                 |
        | #ARCH-orders -depends-on+-> *            | ARCH-billing, ARCH-ledger, ARCH-orders |
        | #ARCH-orders <-depends-on+- *            | ARCH-billing, ARCH-ledger, ARCH-orders |
        | #ARCH-orders -depends-on+-> #ARCH-orders | ARCH-orders                            |
        | #checkout -realized-by+-> #checkout      | nothing                                |

  Rule: A link can filter instead: keep the nodes that have such a neighbour, or those that have none

    Scenario Outline: With and without such a neighbour
      When I query "<query>"
      Then the result is "<result>"

      Examples:
        | query                                                    | result       |
        | element ?<-realized-by- feature[maturity=ready]          | ARCH-orders  |
        | element !<-realized-by- *                                | ARCH-ledger  |
        | element !-depends-on+-> #ARCH-orders                     | nothing      |
        | feature ?-realized-by-> element[public] -realized-by-> * | ARCH-orders  |
        | element ?-depends-on-> #ARCH-ledger                      | ARCH-billing |

  Rule: The answer is the nodes the question ends on, or every route to them as it exists

    A route shows each link as it points, whichever way it was followed, and the route to a node
    reached as far as links lead is a shortest one.

    Scenario: Several routes to a node are one node and as many routes
      When I query "feature -realized-by-> element -depends-on+-> *"
      Then the result is "ARCH-billing, ARCH-ledger, ARCH-orders"
      And the paths are:
        | checkout -realized-by-> ARCH-orders -depends-on-> ARCH-billing                                                     |
        | checkout -realized-by-> ARCH-orders -depends-on-> ARCH-billing -depends-on-> ARCH-ledger                           |
        | checkout -realized-by-> ARCH-orders -depends-on-> ARCH-billing -depends-on-> ARCH-ledger -depends-on-> ARCH-orders |
        | refunds -realized-by-> ARCH-billing -depends-on-> ARCH-ledger                                                      |
        | refunds -realized-by-> ARCH-billing -depends-on-> ARCH-ledger -depends-on-> ARCH-orders                            |
        | refunds -realized-by-> ARCH-billing -depends-on-> ARCH-ledger -depends-on-> ARCH-orders -depends-on-> ARCH-billing |

    Scenario: A link followed against its direction is shown as it points
      When I query "#ARCH-ledger <-depends-on- element <-realized-by- *"
      Then the paths are:
        | ARCH-ledger <-depends-on- ARCH-billing <-realized-by- refunds |

    Scenario: Two links between the same nodes, several relations, and a cycle
      Given these specs:
        | tags                       | Feature |
        | @id=A @kind=stop @r:B      | A       |
        | @id=B @kind=stop @r:A @s:C | B       |
        | @id=C @kind=stop           | C       |
      When I query "#A -r- #B"
      Then the paths are:
        | A -r-> B |
        | A <-r- B |
      When I query "#A -r|s+-> #C"
      Then the paths are:
        | A -r-> B -s-> C |
      When I query "#A -r+-> #A"
      Then the paths are:
        | A -r-> B -r-> A |

    Scenario: The route to a node reached as far as links lead is a shortest one
      Given these specs:
        | tags                             | Feature |
        | @id=A @kind=stop @next:B @next:C | A       |
        | @id=B @kind=stop @next:D         | B       |
        | @id=C @kind=stop @next:D         | C       |
        | @id=D @kind=stop @next:A         | D       |
      When I query "#A -next+-> *"
      Then the paths are:
        | A -next-> B                     |
        | A -next-> C                     |
        | A -next-> B -next-> D           |
        | A -next-> B -next-> D -next-> A |

  Rule: Each node in an answer comes with its kind, its state and the file and line it is written at

    Its state is the status it declares, else its stage. The count goes to stderr, so stdout is the
    answer alone.

    Scenario: A node per line, only the ids, or the routes
      Given these specs:
        | tags                                                   | Feature                   |
        | @id=index-outgrows-memory @kind=risk @status=tolerated | The index outgrows memory |
      When I run "sdp q '#checkout -realized-by-> element'"
      Then the exit code is 0
      And the output contains "ARCH-orders\telement\t\tOrder service, v2\tspecs/ARCH-orders.feature:1"
      And the output contains "1 node(s)"
      When I run "sdp q 'feature|risk'"
      Then the exit code is 0
      And the output contains "checkout\tfeature\tready"
      And the output contains "index-outgrows-memory\trisk\ttolerated"
      When I run "sdp q 'element' --ids"
      Then the exit code is 0
      And the output lines are "ARCH-orders, ARCH-billing, ARCH-ledger"
      When I run "sdp q '#ARCH-ledger <-depends-on- element' --paths"
      Then the exit code is 0
      And the output lines are "ARCH-ledger <-depends-on- ARCH-billing"

    Scenario: As data, with the routes when asked
      When I run "sdp q '#checkout -realized-by-> element' --paths --json"
      Then the exit code is 0
      And the JSON output has:
        | complete              | true                      |
        | data.nodes            | ARCH-orders               |
        | data.nodes.file       | specs/ARCH-orders.feature |
        | data.paths.nodes      | checkout, ARCH-orders     |
        | data.paths.edges.from | checkout                  |
        | data.paths.edges.rel  | realized-by               |

  Rule: One node can be looked up with every link it has, and the title at the other end

    Scenario: As text, and as data
      When I run "sdp show ARCH-billing"
      Then the exit code is 0
      And the output contains 'public: false'
      And the output contains "-depends-on-> ARCH-ledger  Ledger [legacy]"
      And the output contains "<-realized-by- refunds  Refunds"
      When I run "sdp show ARCH-billing --json"
      Then the exit code is 0
      And the JSON output has:
        | data.node.id          | ARCH-billing                                     |
        | data.out.to           | ARCH-ledger                                      |
        | data.in.from          | ARCH-orders, refunds                             |
        | data.in.declared.file | specs/ARCH-orders.feature, specs/refunds.feature |

  Rule: A word the workspace does not know is pointed out, with the closest one it knows

    A question still gets its answer, with a note; a lookup of an id nothing declares is refused.

    Scenario: A misspelt relation and attribute in a question, and a misspelt id
      When I run "sdp q 'feature -realised-by-> element[titel]'"
      Then the exit code is 0
      And the output contains "0 node(s)"
      And the output contains "note: no relation realised-by; closest: realized-by"
      And the output contains "note: element has no attribute titel; closest: title"
      When I run "sdp show ARCH-ordrs"
      Then the exit code is 1
      And the output contains "no node ARCH-ordrs; closest: ARCH-orders"

  Rule: An answer that may miss something says so and why, and exits with 2

    A question that reaches too far is cut short at a bound: 12 links followed as far as they lead,
    or 10 000 routes at one step. An answer that a bound could not have changed is complete.

    Scenario Outline: Cut short, even when nothing was found
      Given a chain of 14 nodes linked by "next"
      When I run "<command>"
      Then the exit code is 2
      And the output contains "cut short: a + edge reaches further than 12 hops"

      Examples:
        | command                            |
        | sdp q '#N1 -next+-> node14'        |
        | sdp q '#N1 -next+-> node14' --ids  |
        | sdp q '#N1 -next+-> node14' --json |
        | sdp graph -q '#N1 -next+-> node14' |

    Scenario: Twelve links as far as they lead, then cut short
      Given a chain of 15 nodes linked by "next"
      When I query "#N1 -next+-> *"
      Then the result has 12 nodes
      And the result is truncated because "a + edge reaches further than 12 hops"

    Scenario: Too many routes at one step
      Given 25 nodes, each linked to all the others by "knows"
      When I query "member -knows-> member -knows-> member"
      Then the result has 25 nodes
      And the result is truncated because "a step has more than 10000 paths"

    Scenario Outline: A filter is cut short only when the bound leaves it undecided
      Given a chain of 15 nodes linked by "next"
      When I query "<query>"
      Then the result is "<result>"
      And the result is <completeness>

      Examples:
        | query              | result  | completeness                                               |
        | #N1 ?-next+-> #N2  | N1      | complete                                                   |
        | #N1 !-next+-> #N2  | nothing | complete                                                   |
        | #N1 ?-next+-> #N15 | nothing | truncated because "a + edge reaches further than 12 hops" |
        | #N1 !-next+-> #N15 | N1      | truncated because "a + edge reaches further than 12 hops" |

  Rule: The same question gets the same answer on the command line, over MCP and from a program

    One answer serves them all, so they cannot differ in what they accept, their bounds or their notes.
    A program gets it as a Promise from `sdp`, so asking a question needs no Effect; a program written
    with Effect gets the same use case as an Effect from `sdp/effect`, on a file system of its choosing.

    Scenario: Which specs depend on billing, three ways
      When I run "sdp q '#ARCH-billing <-depends-on- *'"
      Then the exit code is 0
      And the output contains "ARCH-orders\telement\t\tOrder service, v2\tspecs/ARCH-orders.feature:1"
      When an MCP client of "sdp mcp" calls "sdp_query" with:
        """
        { "expression": "#ARCH-billing <-depends-on- *" }
        """
      Then the output contains "ARCH-orders\telement\t\tOrder service, v2\tspecs/ARCH-orders.feature:1"
      When a program asks the API for "#ARCH-billing <-depends-on- *"
      Then the JSON output has:
        | complete        | true                      |
        | data.nodes      | ARCH-orders               |
        | data.nodes.file | specs/ARCH-orders.feature |

    Scenario: A program written with Effect asks on a file system of its own
      When a program written with Effect asks the API for "#ARCH-billing <-depends-on- *" on files in memory
      Then the JSON output has:
        | complete        | true                      |
        | data.nodes      | ARCH-orders               |
        | data.nodes.file | specs/ARCH-orders.feature |

  Rule: The whole graph is plain data, one record per line, so plain tools answer what a question answers

    Agents and scripts take records apart faster than they learn a query language. Every record has
    every field, in the same order, and the field names do not change with the workspace. Nothing is
    written to disk: a dump cannot say that it is stale or incomplete.

    Scenario Outline: A node, a node nothing declares, and a link stated in two places
      Given a file "specs/alpha.feature" containing:
        """
        @id=alpha @maturity=idea @realized-by:ARCH-ledger
        @depends-on:gone @realized-by:ARCH-ledger
        Feature: Alpha "with quotes" and a \ backslash

          Rule: Alpha comes first

            Its reason runs
            over two lines.

            Scenario: First
              Then alpha comes first
        """
      When the graph is exported
      Then the output has one line per node and edge
      And the output contains '<record>'

      Examples:
        | record                                                                                                                                                                                                         |
        | {"type":"node","id":"gone","kind":"missing","title":"gone","file":null,"line":null,"attrs":{}}                                                                                                                 |
        | {"type":"edge","from":"alpha","rel":"realized-by","to":"ARCH-ledger","attrs":{},"declared":[{"file":"specs/alpha.feature","line":1},{"file":"specs/alpha.feature","line":2}]}                                  |
        | {"type":"node","id":"alpha#alpha-comes-first","kind":"rule","title":"Alpha comes first","file":"specs/alpha.feature","line":5,"attrs":{"spec":"alpha","description":"Its reason runs |
        | over two lines.","scenarios":1,"verification":"unrun","stage":"idea","toCome":true}} |
        | {"type":"edge","from":"alpha#first","rel":"verifies","to":"alpha#alpha-comes-first","attrs":{},"declared":[{"file":"specs/alpha.feature","line":10}]}                                                          |
        | {"type":"node","id":"ARCH-ledger","kind":"element","title":"Ledger [legacy]","file":"specs/ARCH-ledger.feature","line":1,"attrs":{"owner":{"team":"core"},"file":"specs/ARCH-ledger.feature","scenarios":0,"verification":"none"}}                 |

    Scenario: Every node first, then every link
      When I run the pipeline:
        """
        sdp graph | jq -r .type | uniq
        """
      Then the exit code is 0
      And the output lines are "node, edge"

    Scenario Outline: jq, a few lines of script and grep answer what a question answers
      When I run "sdp q '<query>' --ids"
      Then the output lines are "<answer>"
      When I run the pipeline:
        """
        sdp graph | <tool>
        """
      Then the output lines are "<answer>"

      Examples:
        | query                                                          | answer       | tool                                                                                                                                                                                                                                                                       |
        | feature[maturity=ready]                                        | checkout     | jq -r 'select(.type == "node" and .kind == "feature" and .attrs.maturity == "ready") \| .id'                                                                                                                                                                               |
        | #ARCH-billing <-realized-by- *                                 | refunds      | jq -r 'select(.type == "edge" and .rel == "realized-by" and .to == "ARCH-billing") \| .from'                                                                                                                                                                              |
        | feature[maturity=ready] -realized-by-> element -depends-on-> element | ARCH-billing | jq -rs '(map(select(.type == "node")) \| INDEX(.id)) as $n \| map(select(.type == "edge")) as $e \| $e[] \| select(.rel == "realized-by" and $n[.from].attrs.maturity == "ready") \| .to as $x \| $e[] \| select(.rel == "depends-on" and .from == $x) \| .to' |
        | element !<-realized-by- *                                      | ARCH-ledger  | node -e 'const r = require("fs").readFileSync(0, "utf8").trim().split("\\n").map(JSON.parse); const to = new Set(r.filter((x) => x.rel === "realized-by").map((x) => x.to)); for (const x of r) if (x.kind === "element" && !to.has(x.id)) console.log(x.id)' |

    Scenario: Where a link is declared is one grep away, in this repository too
      When I run the pipeline:
        """
        sdp graph | grep '"rel":"realized-by"' | grep '"to":"ARCH-billing"' | jq -r '.declared[] | "\(.file):\(.line)"'
        """
      Then the output lines are "specs/refunds.feature:1"
      And every node and link of this repository is at a file and line that exist
      And the line of every link of this repository contains the id it links to

  Rule: Part of the graph can be exported: the routes a question matches, as records or as a diagram

    Scenario: Only the nodes and the links the routes walk
      Given these specs:
        | tags                                          | Feature   |
        | @id=coupons @uses:discounts @avoids:discounts | Coupons   |
        | @id=discounts                                 | Discounts |
      When I run "sdp graph -q '#coupons -uses-> #discounts'"
      Then the exit code is 0
      And the output contains '"from":"coupons","rel":"uses","to":"discounts"'
      And the output does not contain '"rel":"avoids"'
      And the output does not contain "checkout"

    Scenario: The same routes as a Mermaid flowchart
      When I run "sdp graph --mermaid -q 'feature -realized-by-> element'"
      Then the exit code is 0
      And the output contains "flowchart LR"
      And the output contains '["ARCH-orders<br/><small>Order service, v2</small>"]'
      And the output contains "-->|realized-by|"

  Rule: Questions stay interactive on workspaces far larger than a typical repository's

    Agents ask many small questions while they work, and every command rebuilds the graph.

    @slow @serial
    Scenario Outline: A question over 20,000 nodes answers within 250 ms
      Given a generated graph of 20000 nodes and 60000 edges
      When the query "<query>" runs on it
      Then the median run completes within 250 ms

      Examples:
        | query                                                                    |
        | feature[maturity=ready] -realized-by-> element -decided-by-> decision    |
        | element !-*- decision                                                    |

    @slow @serial
    Scenario: The graph of 5,000 specs builds within a second
      Given a generated workspace of 5000 specs
      When the graph is built from it
      Then the median run completes within 1000 ms
