@id=ask-the-graph
@realized-by:ARCH-query-engine @realized-by:ARCH-application @realized-by:ARCH-reports
Feature: Ask the graph

  Developers, architects and AI agents need answers that cross specs, decisions, architecture and
  code: which code is behind a feature, what rests on a decision, what nothing verifies yet. Any
  such question is one line, on the command line, over MCP or in a scenario, and every answer says
  where each node is written and whether something may be missing from it.

  Not a general graph database language, and no counting or grouping: those are jq's, over the
  graph as data.

  Background:
    Given these specs:
      | tags                                                  | Feature  |
      | @id=checkout @maturity=ready @realized-by:ARCH-orders | Checkout |
      | @id=refunds @maturity=idea @realized-by:ARCH-billing  | Refunds  |
    And a file "src/orders.ts" containing:
      """
      import { bill } from "./billing.ts"

      /** @sdp is ARCH-orders title="Order service" */
      export const order = (): number => bill()
      """
    And a file "src/billing.ts" containing:
      """
      import { book } from "./ledger.ts"

      /** @sdp is ARCH-billing title=Billing */
      export const bill = (): number => book()
      """
    And a file "src/ledger.ts" containing:
      """
      import { order } from "./orders.ts"

      /** @sdp is ARCH-ledger title="Ledger [legacy]" */
      export const book = (): number => order()
      """

  Rule: A question is one line: the nodes to start from, then the links to follow

    One line fits a shell argument and one scenario step, which is how gates and guards are written.

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

  Rule: A node is picked by its kind, its id, or anything it holds

    A condition reads a node's attributes, id, kind, title and source, and the targets of its links;
    a missing or false value is not set, and a word the workspace does not know matches nothing.

    Scenario Outline: A kind, an id, and what a node holds
      When I query "<query>"
      Then the result is "<result>"

      Examples:
        | query                                           | result                                                    |
        | feature\|element                                | checkout, refunds, ARCH-orders, ARCH-billing, ARCH-ledger |
        | #ARCH-orders\|refunds                           | ARCH-orders, refunds                                      |
        | feature[maturity>idea, realized-by=ARCH-orders] | checkout                                                  |

    Scenario Outline: Missing, false and zero; case, lists, numbers and quoted values
      Given these specs:
        | tags                                            | Feature      |
        | @id=no-value @kind=flag                         | No value     |
        | @id=false-value @kind=flag @value=false @web    | False        |
        | @id=zero-value @kind=flag @value=0 @size=9      | Zero         |
        | @id=true-value @kind=flag @value=true @size=10  | True, or not |
      When I query '<query>'
      Then the result is "<result>"

      Examples:
        | query                      | result                 |
        | flag[value]                | zero-value, true-value |
        | flag[!value]               | no-value, false-value  |
        | flag[value=TRUE]           | true-value             |
        | flag[tags=@web]            | false-value            |
        | flag[size>9]               | true-value             |
        | flag[title="True, or not"] | true-value             |

  Rule: Links are followed out, in or either way, once or as far as they lead

    Scenario Outline: Out, in by any of two relations, and as far as links lead
      When I query "<query>"
      Then the result is "<result>"

      Examples:
        | query                                   | result                                 |
        | #ARCH-billing -imports-> *              | ARCH-ledger                            |
        | #ARCH-billing <-imports\|realized-by- * | ARCH-orders, refunds                   |
        | #ARCH-orders -imports+-> *              | ARCH-billing, ARCH-ledger, ARCH-orders |

  Rule: A link can filter instead: keep the nodes that have such a neighbour, or those that have none

    Scenario Outline: With and without such a neighbour
      When I query "<query>"
      Then the result is "<result>"

      Examples:
        | query                                           | result      |
        | element ?<-realized-by- feature[maturity=ready] | ARCH-orders |
        | element !<-realized-by- *                       | ARCH-ledger |

  Rule: The answer is the nodes the question ends on, or every route to them as it exists

    A route shows each link as it points, whichever way it was followed, and the route to a node
    reached as far as links lead is a shortest one.

    Scenario: Several routes to a node are one node and as many routes
      When I query "feature -realized-by-> element -imports+-> *"
      Then the result is "ARCH-billing, ARCH-ledger, ARCH-orders"
      And the paths are:
        | checkout -realized-by-> ARCH-orders -imports-> ARCH-billing                                               |
        | checkout -realized-by-> ARCH-orders -imports-> ARCH-billing -imports-> ARCH-ledger                        |
        | checkout -realized-by-> ARCH-orders -imports-> ARCH-billing -imports-> ARCH-ledger -imports-> ARCH-orders |
        | refunds -realized-by-> ARCH-billing -imports-> ARCH-ledger                                                |
        | refunds -realized-by-> ARCH-billing -imports-> ARCH-ledger -imports-> ARCH-orders                         |
        | refunds -realized-by-> ARCH-billing -imports-> ARCH-ledger -imports-> ARCH-orders -imports-> ARCH-billing |

    Scenario: A link followed against its direction is shown as it points
      When I query "#ARCH-ledger <-imports- element <-realized-by- *"
      Then the paths are:
        | ARCH-ledger <-imports- ARCH-billing <-realized-by- refunds |

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

    Its state is what sdp derives: a scenario's status as its last run left it, else the node's stage.

    Scenario: A feature and an example
      Given a file "specs/pay.feature" containing:
        """
        @id=pay
        Feature: Pay

          Rule: A card is charged once

            Scenario: Charged
              Then the query "feature" returns at least 1 result
        """
      When I run "sdp q 'feature|scenario'"
      Then the exit code is 0
      And the output line with "checkout" contains "feature"
      And the output line with "checkout" contains "ready"
      And the output line with "pay#charged" contains "scenario"
      And the output line with "pay#charged" contains "unrun"
      And the output line with "pay#charged" contains "specs/pay.feature:6"

  Rule: One node can be looked up with every link it has, and the title at the other end

    Scenario: Billing, its links and its neighbours
      When I run "sdp show ARCH-billing --json"
      Then the exit code is 0
      And the JSON output has:
        | data.node.id          | ARCH-billing                                         |
        | data.out.to           | ARCH-ledger                                          |
        | data.in.from          | ARCH-orders, code:src/billing.ts#bill, refunds       |
        | data.in.declared.file | src/orders.ts, src/billing.ts, specs/refunds.feature |
        | data.neighbours.title | Ledger [legacy], Order service, Refunds, bill        |

  Rule: A word the workspace does not know is pointed out, with the closest one it knows

    A question still gets its answer, with a note; a lookup of an id nothing declares is refused.

    Scenario: A misspelt relation and attribute in a question, and a misspelt id
      When I run "sdp q 'feature -realised-by-> element[titel]'"
      Then the exit code is 0
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
        | sdp q '#N1 -next+-> node14' --json |
        | sdp graph -q '#N1 -next+-> node14' |

    Scenario Outline: A filter is cut short only when the bound leaves it undecided
      Given a chain of 15 nodes linked by "next"
      When I query "<query>"
      Then the result is "<result>"
      And the result is <completeness>

      Examples:
        | query              | result  | completeness                                              |
        | #N1 ?-next+-> #N2  | N1      | complete                                                  |
        | #N1 ?-next+-> #N15 | nothing | truncated because "a + edge reaches further than 12 hops" |
        | #N1 !-next+-> #N15 | N1      | truncated because "a + edge reaches further than 12 hops" |

  Rule: The same question gets the same answer on the command line, over MCP and from a program

    One answer serves them all, so they cannot differ in what they accept, their bounds or their notes.
    A program gets it as a Promise from `sdp`; one written with Effect gets it as an Effect from
    `sdp/effect`, on a file system of its choosing.

    Scenario: What imports billing, four ways
      When I run "sdp q '#ARCH-billing <-imports- *' --json"
      Then the exit code is 0
      And the JSON output has:
        | complete        | true          |
        | data.nodes      | ARCH-orders   |
        | data.nodes.file | src/orders.ts |
      When an MCP client of "sdp mcp" calls "sdp_query" with:
        """
        { "expression": "#ARCH-billing <-imports- *", "json": true }
        """
      Then the JSON output has:
        | complete        | true          |
        | data.nodes      | ARCH-orders   |
        | data.nodes.file | src/orders.ts |
      When a program asks the API for "#ARCH-billing <-imports- *"
      Then the JSON output has:
        | complete        | true          |
        | data.nodes      | ARCH-orders   |
        | data.nodes.file | src/orders.ts |
      When a program written with Effect asks the API for "#ARCH-billing <-imports- *" on files in memory
      Then the JSON output has:
        | complete        | true          |
        | data.nodes      | ARCH-orders   |
        | data.nodes.file | src/orders.ts |

  @decided-by:the-state-holds-what-is-significant
  Rule: The state is plain data, one record per line: each spec by its id, its rules and examples each by their one line, the architecture, and the links written between them

    Agents and scripts take records apart faster than they learn a query language, and an agent reads
    the state before its first step. What is under a line — a reason, a step, the shape of an export —
    is read at the file and line the record names. Every record has every field, in the same order,
    and the field names do not change with the workspace. Nothing is written to disk: a dump cannot
    say that it is stale or incomplete.

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
        | {"type":"edge","from":"alpha","rel":"realized-by","to":"ARCH-ledger","declared":[{"file":"specs/alpha.feature","line":1},{"file":"specs/alpha.feature","line":2}]}                                  |
        | {"type":"node","id":"alpha#alpha-comes-first","kind":"rule","title":"Alpha comes first","file":"specs/alpha.feature","line":5,"attrs":{"stage":"idea","toCome":true}}                                 |
        | {"type":"node","id":"alpha","kind":"feature","title":"Alpha                                                                                                                                   |
        | {"type":"node","id":"alpha#first","kind":"scenario","title":"First","file":"specs/alpha.feature","line":10,"attrs":{"rule":"alpha#alpha-comes-first","status":"unrun"}}                            |
        | {"type":"node","id":"ARCH-ledger","kind":"element","title":"Ledger [legacy]","file":"src/ledger.ts","line":3,"attrs":{}}                                                                         |

    Scenario: What is under a line is read where it is written, and where a node is written is its record's
      Given a file "specs/cart.feature" containing:
        """
        @id=cart
        Feature: Cart

          Shoppers keep what they mean to buy.

          Rule: A cart holds each item once

            Adding it again changes nothing.

            Scenario: Adding an item twice
              When I add "a lamp" twice
        """
      When the graph is exported
      Then the output contains '"id":"cart","kind":"feature","title":"Cart","file":"specs/cart.feature","line":1,"attrs":{"summary":"Shoppers keep what they mean to buy.",'
      And the output contains '"id":"cart#a-cart-holds-each-item-once","kind":"rule","title":"A cart holds each item once","file":"specs/cart.feature","line":6,"attrs":{"stage":"unrun"}}'
      And the output contains '"id":"cart#adding-an-item-twice","kind":"scenario","title":"Adding an item twice","file":"specs/cart.feature","line":10,"attrs":{"rule":"cart#a-cart-holds-each-item-once","status":"unrun"}}'
      And the output does not contain "Adding it again"
      And the output does not contain "a lamp"
      And the output does not contain '"rel":"rule-of"'
      And the output does not contain '"rel":"verifies"'

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
        | query                                                             | answer       | tool                                                                                                                                                                                                                                                          |
        | feature[maturity=ready]                                           | checkout     | jq -r 'select(.type == "node" and .kind == "feature" and .attrs.maturity == "ready") \| .id'                                                                                                                                                                  |
        | #ARCH-billing <-realized-by- *                                    | refunds      | jq -r 'select(.type == "edge" and .rel == "realized-by" and .to == "ARCH-billing") \| .from'                                                                                                                                                                  |
        | feature[maturity=ready] -realized-by-> element -imports-> element | ARCH-billing | jq -rs '(map(select(.type == "node")) \| INDEX(.id)) as $n \| map(select(.type == "edge")) as $e \| $e[] \| select(.rel == "realized-by" and $n[.from].attrs.maturity == "ready") \| .to as $x \| $e[] \| select(.rel == "imports" and .from == $x) \| .to'   |
        | element !<-realized-by- *                                         | ARCH-ledger  | node -e 'const r = require("fs").readFileSync(0, "utf8").trim().split("\\n").map(JSON.parse); const to = new Set(r.filter((x) => x.rel === "realized-by").map((x) => x.to)); for (const x of r) if (x.kind === "element" && !to.has(x.id)) console.log(x.id)' |

    Scenario: Where a link is declared is one grep away, in this repository too
      When I run the pipeline:
        """
        sdp graph | grep '"rel":"realized-by"' | grep '"to":"ARCH-billing"' | jq -r '.declared[] | "\(.file):\(.line)"'
        """
      Then the output lines are "specs/refunds.feature:1"
      And every node and link of this repository is at a file and line that exist
      And the line of every link of this repository contains the id it links to

  @maturity=ready
  Rule: A program reads the state with the schema of its records that the package exports, and every record sdp graph prints decodes with it

    One definition of a record serves sdp, its tests and every program that reads the state, so none
    of them drifts from the others.

    Scenario: The records of this repository's state
      When a program decodes every record of "sdp graph" in the repository with the package's record schema
      Then no record fails to decode

  Rule: Part of the graph can be exported: the routes a question matches, as records or as a diagram

    Scenario: Only the nodes and the links the routes walk, as records and as a diagram
      Given these specs:
        | tags                                          | Feature   |
        | @id=coupons @uses:discounts @avoids:discounts | Coupons   |
        | @id=discounts                                 | Discounts |
      When I run the pipeline:
        """
        sdp graph -q '#coupons -uses-> #discounts' | jq -r 'if .type == "node" then .id else "\(.from) \(.rel) \(.to)" end'
        """
      Then the exit code is 0
      And the output lines are "coupons, discounts, coupons uses discounts"
      When I run "sdp graph --mermaid -q '#coupons -uses-> #discounts'"
      Then the exit code is 0
      And the output contains "discounts"
      And the output contains "uses"
      And the output does not contain "avoids"
      And the output does not contain "checkout"

  @maturity=idea
  Rule: The graph says which files it could not read, and why

  @maturity=idea
  Rule: Each record of the exported graph names the version of its format

    Programs outside sdp will read it, and a format that changes without a word breaks them.

  Rule: Questions stay interactive on workspaces far larger than a typical repository's

    Agents ask many small questions while they work, and every command rebuilds the graph.

    @serial
    Scenario Outline: A question over 20,000 nodes answers within 250 ms
      Given a generated graph of 20000 nodes and 60000 edges
      When the query "<query>" runs on it
      Then the median run completes within 250 ms

      Examples:
        | query                                                                 |
        | feature[maturity=ready] -realized-by-> element -decided-by-> decision |
        | element !-*- decision                                                 |

    @serial
    Scenario: The graph of 5,000 specs builds within a second
      Given a generated workspace of 5000 specs
      When the graph is built from it
      Then the median run completes within 1000 ms

  @maturity=draft @iteration:IT-scale
  Rule: A question on 5,000 specs and 20,000 source files on disk answers within a second, the median of warm runs

    Every question reads the workspace from disk too: in a monorepo the reading alone could make
    agents stop asking and start guessing.

  @maturity=idea
  Rule: An answer names the commit it was read at, and says when the files differ from it

    An agent that compares two answers must know whether they read the same thing.
