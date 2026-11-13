@id=ask-the-graph
@realized-by:ARCH-query-engine @realized-by:ARCH-application @realized-by:ARCH-reports
Feature: Ask the graph

  Developers, architects and AI agents ask questions that cross specs, decisions, architecture and
  code — which code is behind a feature, what rests on a decision — in one line, and learn where
  each node is written and whether anything may be missing.

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

  Rule: A question is one line: the nodes to start from, by kind, id or what they hold, then the links to follow, or to filter by

    Scenario Outline: A kind, an id, what a node holds, links followed, and links that filter
      When I query "<query>"
      Then the result is "<result>"

      Examples:
        | query                                           | result                                                    |
        | feature\|element                                | checkout, refunds, ARCH-orders, ARCH-billing, ARCH-ledger |
        | #ARCH-orders\|refunds                           | ARCH-orders, refunds                                      |
        | feature[maturity>idea, realized-by=ARCH-orders] | checkout                                                  |
        | #ARCH-billing -imports-> *                      | ARCH-ledger                                               |
        | #ARCH-billing <-imports\|realized-by- *         | ARCH-orders, refunds                                      |
        | #ARCH-orders -imports+-> *                      | ARCH-billing, ARCH-ledger, ARCH-orders                    |
        | element ?<-realized-by- feature[maturity=ready] | ARCH-orders                                               |
        | element !<-realized-by- *                       | ARCH-ledger                                               |

  Rule: The answer is the nodes the question ends on, each with its kind, its state and the file and line it is written at, or every route to them

    Scenario: Two routes to billing, and a feature where it is written
      When I query "* -realized-by|imports-> #ARCH-billing"
      Then the result is "ARCH-billing"
      And the paths are:
        | refunds -realized-by-> ARCH-billing |
        | ARCH-orders -imports-> ARCH-billing |
      When I run "sdp q feature"
      Then the exit code is 0
      And the output line with "checkout" contains "ready"
      And the output line with "checkout" contains "specs/checkout.feature:1"

  Rule: One node can be looked up with every link it has, and the title at the other end

    Scenario: Billing, its links and its neighbours
      When I run "sdp show ARCH-billing --json"
      Then the exit code is 0
      And the JSON output has:
        | data.out.to           | ARCH-ledger                                    |
        | data.in.from          | ARCH-orders, code:src/billing.ts#bill, refunds |
        | data.neighbours.title | Ledger [legacy], Order service, Refunds, bill  |

  Rule: A question that reaches too far is cut short, and its answer says so and exits with 2

    Scenario: Links followed further than 12 hops
      Given a chain of 14 nodes linked by "next"
      When I run "sdp q '#N1 -next+-> node14'"
      Then the exit code is 2
      And the output contains "cut short: a + edge reaches further than 12 hops"

  Rule: The same question gets the same answer on the command line, over MCP and from a program

    A program gets it as a Promise from `sdp`, or as an Effect from `sdp/effect` on a file system of
    its choosing.

    Scenario: What imports billing, four ways
      When I run "sdp q '#ARCH-billing <-imports- *' --json"
      Then the exit code is 0
      And the JSON output has:
        | complete        | true          |
        | data.nodes.file | src/orders.ts |
      When an MCP client of "sdp mcp" calls "sdp_query" with:
        """
        { "expression": "#ARCH-billing <-imports- *", "json": true }
        """
      Then the JSON output has:
        | complete        | true          |
        | data.nodes.file | src/orders.ts |
      When a program asks the API for "#ARCH-billing <-imports- *"
      Then the JSON output has:
        | complete        | true          |
        | data.nodes.file | src/orders.ts |
      When a program written with Effect asks the API for "#ARCH-billing <-imports- *" on files in memory
      Then the JSON output has:
        | complete        | true          |
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
      And the output contains "uses"
      And the output does not contain "avoids"

  Rule: Questions stay interactive on workspaces far larger than a typical repository's

    @serial
    Scenario: A question over 20,000 nodes answers within 250 ms
      Given a generated graph of 20000 nodes and 60000 edges
      When the query "feature[maturity=ready] -realized-by-> element -decided-by-> decision" runs on it
      Then the median run completes within 250 ms

  @maturity=draft @iteration:IT-scale
  Rule: A question on 5,000 specs and 20,000 source files on disk answers within a second, the median of warm runs

  @maturity=idea
  Rule: An answer names the commit it was read at, says when the files differ from it, and which files it could not read

  @maturity=idea
  Rule: Each record of the exported graph names the version of its format
