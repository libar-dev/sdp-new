@id=ask-the-graph
@realized-by:ARCH-query-engine @realized-by:ARCH-application @realized-by:ARCH-reports
Feature: Ask the graph

  Developers, architects and AI agents ask questions that cross specs, decisions, architecture and
  code: which code is behind a feature, what rests on a decision.

  Not a general graph database language, and no counting or grouping: those are jq's, over the
  graph as data.

  Background:
    Given these specs:
      | tags                                                                          | Feature  |
      | @id=checkout @maturity=ready @realized-by:ARCH-orders @points=13 @web @mobile | Checkout |
      | @id=refunds @maturity=idea @realized-by:ARCH-billing @points=8 @web           | Refunds  |
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

  Rule: A question is one line: the nodes to start from, then the links to follow or to filter by

    One line fits a shell argument and a scenario step, which is how gates and guards are written.

    Scenario Outline: A kind, an id, what a node holds, links followed, and links that filter
      When I query "<query>"
      Then the result is "<result>"

      Examples:
        | query                                           | result                                                    |
        | feature\|element                                | checkout, refunds, ARCH-orders, ARCH-billing, ARCH-ledger |
        | #ARCH-orders\|refunds                           | ARCH-orders, refunds                                      |
        | feature[maturity>idea, realized-by=ARCH-orders] | checkout                                                  |
        | feature[maturity>=idea, maturity<=ready]        | checkout, refunds                                         |
        | feature[maturity<READY]                         | refunds                                                   |
        | feature[points>8]                               | checkout                                                  |
        | feature[tags=@mobile]                           | checkout                                                  |
        | element[title='Ledger [legacy]']                | ARCH-ledger                                               |
        | *[kind=feature][title~^Ch]                      | checkout                                                  |
        | *[id~^ARCH-][title!~ice]                        | ARCH-billing, ARCH-ledger                                 |
        | #ARCH-billing -imports-> *                      | ARCH-ledger                                               |
        | #ARCH-billing <-imports\|realized-by- *         | ARCH-orders, refunds                                      |
        | #ARCH-billing -imports- *                       | ARCH-ledger, ARCH-orders                                  |
        | #ARCH-orders -imports+-> *                      | ARCH-billing, ARCH-ledger, ARCH-orders                    |
        | element ?<-realized-by- feature[maturity=ready] | ARCH-orders                                               |
        | element !<-realized-by- *                       | ARCH-ledger                                               |

  Rule: An answer gives each node with its kind, its state and the file and line it is written at

    Scenario: Checkout, where it is written
      When I run "sdp q feature"
      Then the exit code is 0
      And the output contains "checkout\tfeature\tready\tCheckout\tspecs/checkout.feature:1"

  Rule: Asked for routes, an answer gives a shortest one to each node reached as far as links lead

    Every route around a cycle would never end.

    Scenario: Two routes to billing
      When I query "* -realized-by|imports-> #ARCH-billing"
      Then the paths are:
        | refunds -realized-by-> ARCH-billing |
        | ARCH-orders -imports-> ARCH-billing |

    Scenario: One shortest route to each node reached as far as links lead
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

  Rule: One node can be looked up with every link it has, and the title at the other end

    Scenario: Billing, its links and its neighbours
      When I run "sdp show ARCH-billing --json"
      Then the exit code is 0
      And the JSON output has:
        | data.out.to           | ARCH-ledger                                    |
        | data.in.from          | ARCH-orders, code:src/billing.ts#bill, refunds |
        | data.neighbours.title | Ledger [legacy], Order service, Refunds, bill  |

  @decided-by:free-vocabulary
  Rule: A word the workspace does not know is pointed out, with the closest word it knows

    A misspelt word matches nothing, and nothing found reads like an answer: a gate that asks for no
    feature below a misspelt rung would pass whatever the features are.

    Scenario Outline: Asked with <case>
      When I run "sdp q '<query>'"
      Then the exit code is 0
      And the output contains "note: <note>"

      Examples:
        | case                 | query                    | note                                                |
        | a misspelt kind      | featur                   | no kind featur; closest: feature                    |
        | a misspelt id        | #ARCH-ordrs              | no node has the id ARCH-ordrs; closest: ARCH-orders |
        | a misspelt relation  | feature -realised-by-> * | no relation realised-by; closest: realized-by       |
        | a misspelt attribute | element[titel]           | element has no attribute titel; closest: title      |
        | a misspelt rung      | feature[maturity<redy]   | no maturity redy; closest: ready                    |
        | a tag without its @  | feature[tags=web]        | no tag web; a tag is written with its @, as @web    |

    Scenario: A gate that asks for nothing below a misspelt rung fails
      Given a file "specs/gate.feature" containing:
        """
        Feature: Gate
          Rule: Nothing is left below ready
            Scenario: Nothing below ready
              Then the query "feature[maturity<redy]" returns no results
        """
      When the workspace is run
      Then the step 'the query "feature[maturity<redy]" returns no results' has status "failed"
      And the step 'the query "feature[maturity<redy]" returns no results' reports 'no maturity redy; closest: ready'

  Rule: Whatever sdp could not read as written makes every answer incomplete, noted at its file and line

    What it left out is missing from the graph, so an answer could say that something is absent when
    it is only unread.

    Scenario Outline: An answer beside <problem>
      Given a file "<file>" containing:
        """
        <content>
        """
      When I run "sdp q feature --ids"
      Then the exit code is 2
      And the output contains "not read: <at> [<rule>]"

      Examples:
        | problem                               | file                 | content                                                                | at                     | rule                  |
        | a spec that does not parse            | specs/broken.feature | @id=broken\nScenario: Without a feature                                | specs/broken.feature:2 | gherkin-syntax        |
        | a tag whose key is no word            | specs/odd.feature    | @id=odd @1st=x\nFeature: Odd                                           | specs/odd.feature:1    | tag-syntax            |
        | code that does not parse              | src/cart.ts          | /** @sdp is ARCH-cart */\nexport const = 1                             | src/cart.ts:2          | annotation-unreadable |
        | an import sdp cannot follow           | src/cart.ts          | /** @sdp is ARCH-cart */\nimport "./missing.ts"\nexport const cart = 1 | src/cart.ts:2          | import-unresolved     |
        | a value another declaration overrides | src/cart.ts          | /** @sdp is ARCH-orders title=Orders */\nexport const cart = 1         | src/orders.ts:3        | declaration-conflict  |

    Scenario: A path the globs match that leads to no file
      Given the file "specs/gone.feature" is a symbolic link to "nowhere.feature"
      When I run "sdp q feature --ids"
      Then the exit code is 2
      And the output contains "not read: specs/gone.feature:1 [not-a-file]"

  Rule: A question that reaches too far is cut short, and its answer says so

    A bound keeps every question interactive, however large the workspace.

    Scenario: Links followed further than 12 hops
      Given a chain of 14 nodes linked by "next"
      When I run "sdp q '#N1 -next+-> node14'"
      Then the exit code is 2
      And the output contains "cut short: a + edge reaches further than 12 hops"

    Scenario: More than 10,000 routes at one step
      Given 101 specs, each linked to every other by "next"
      When I run "sdp q '* -next-> *' --ids"
      Then the exit code is 2
      And the output contains "cut short: a step has more than 10000 paths"

  Rule: A program gets the same answer from the package's API as from the command line

    Scenario: What imports billing, asked by a program
      When a program asks the API for "#ARCH-billing <-imports- *"
      Then the answer is what "sdp q '#ARCH-billing <-imports- *' --json" prints
      When a program written with Effect asks the API for "#ARCH-billing <-imports- *" on files in memory
      Then the answer is what "sdp q '#ARCH-billing <-imports- *' --json" prints

  Rule: sdp graph prints the state as plain data: one record per line, the nodes before the links

    Agents and scripts take records apart faster than they learn a query language. The state is
    printed, never written to disk: a file cannot say that it is stale or incomplete.

    Scenario: A feature, a node nothing declares, a link stated twice, and the code that declares an element
      Given a file "specs/alpha.feature" containing:
        """
        @id=alpha @maturity=idea @realized-by:ARCH-ledger
        @depends-on:gone @realized-by:ARCH-ledger
        Feature: Alpha
        """
      When the graph is exported
      Then the output contains '{"type":"node","id":"alpha","kind":"feature","title":"Alpha","file":"specs/alpha.feature","line":1,"attrs":{"maturity":"idea","toCome":true,"stage":"idea"}}'
      And the output contains '{"type":"node","id":"gone","kind":"missing","title":"gone","file":null,"line":null,"attrs":{}}'
      And the output contains '{"type":"edge","from":"alpha","rel":"realized-by","to":"ARCH-ledger","declared":[{"file":"specs/alpha.feature","line":1},{"file":"specs/alpha.feature","line":2}]}'
      And the output contains '{"type":"node","id":"ARCH-ledger","kind":"element","title":"Ledger [legacy]","file":"src/ledger.ts","line":3,"attrs":{}}'
      And the output contains '{"type":"edge","from":"code:src/ledger.ts#book","rel":"is","to":"ARCH-ledger","declared":[{"file":"src/ledger.ts","line":3}]}'

    Scenario: Every node first, then every link
      When I run the pipeline:
        """
        sdp graph | jq -r .type | uniq
        """
      Then the exit code is 0
      And the output lines are "node, edge"

  @decided-by:the-state-holds-what-is-significant
  Rule: The state holds each rule and example by its one line, never the text under it

    Scenario: A cart, its rule and its example, with what its author wrote
      Given a file "specs/cart.feature" containing:
        """
        @id=cart @doc=https://example.test/cart @steps=3
        Feature: Cart

          Shoppers keep what they mean to buy.

          Rule: A cart holds each item once

            Adding it again changes nothing.

            @verifies:checkout
            Scenario: Adding an item twice
              When I add "a lamp" twice
        """
      When the graph is exported
      Then the records of type "node" include at least:
        | id                               | kind     | line | summary                              | doc                       | steps | rule                             |
        | cart                             | feature  | 1    | Shoppers keep what they mean to buy. | https://example.test/cart | 3     |                                  |
        | cart#a-cart-holds-each-item-once | rule     | 6    |                                      |                           |       |                                  |
        | cart#adding-an-item-twice        | scenario | 11   |                                      |                           |       | cart#a-cart-holds-each-item-once |
      And the records of type "edge" include at least:
        | from                      | rel      | to       |
        | cart#adding-an-item-twice | verifies | checkout |
      And the output does not contain "Adding it again"
      And the output does not contain "a lamp"
      And the output does not contain '"rel":"rule-of"'
      And the output does not contain '"rel":"verifies","to":"cart'

  Rule: Every record sdp graph prints decodes with the record schema the package exports

    One definition of a record serves sdp, its tests and every program that reads the state, so none
    of them drifts from the others.

    Scenario: The records of this repository's state
      When a program decodes every record of "sdp graph" in the repository with the package's record schema
      Then no record fails to decode

  Rule: The routes a question matches can be printed alone, as records or as a diagram

    Scenario: The route from coupons to discounts, as records and as a diagram
      Given these specs:
        | tags                                          | Feature   |
        | @id=coupons @uses:discounts @avoids:discounts | Coupons   |
        | @id=discounts                                 | Discounts |
      When I run "sdp graph -q '#coupons -uses-> #discounts'"
      Then the exit code is 0
      And the records of type "node" are:
        | id        |
        | coupons   |
        | discounts |
      And the records of type "edge" are:
        | from    | rel  | to        |
        | coupons | uses | discounts |
      When I run "sdp graph --mermaid -q '#coupons -uses-> #discounts'"
      Then the exit code is 0
      And the output contains "uses"
      And the output does not contain "avoids"

  @quality
  Rule: A question over a graph of 20,000 nodes answers within 250 ms

    Agents ask many small questions while they work.

    @serial
    Scenario Outline: A question over 20,000 nodes answers within 250 ms
      Given a random graph of 20000 nodes and 60000 edges
      When the query "<query>" runs on it, for at most 10 seconds
      Then the median run completes within 250 ms

      Examples:
        | query                                                                 |
        | feature[maturity=ready] -realized-by-> element -decided-by-> decision |
        | element !-*+-> decision                                               |
        | * -*+-> *                                                             |

  @maturity=specified @iteration:IT-scale
  Rule: A question whose filter accepts no node answers as quickly as one whose filter finds one

    A misspelt kind is enough to ask one, and learning that nothing is there should cost no more than
    finding what is.

    @serial
    Scenario: The elements that lead to no milestone, over 20,000 nodes
      Given a random graph of 20000 nodes and 60000 edges
      When the query "element !-*+-> milestone" runs on it, for at most 2 seconds
      Then the median run completes within 250 ms

  @quality @maturity=draft @iteration:IT-scale
  Rule: A question on 5,000 specs and 20,000 source files on disk answers within a second

    @serial
    Scenario: The code behind the features still to come, the median of warm runs
      Given a generated workspace of 5000 specs and 20000 source files on disk
      When "sdp q 'feature[maturity=ready] -realized-by-> element <-is- code' --ids" runs 3 times after a run that warms it up
      Then the exit code is 0
      And the median run completes within 1000 ms

  @maturity=ready @iteration:IT-packaging
  Rule: Every JSON answer gives its nodes and edges as the records sdp graph prints

    A program that reads one answer then reads every other, and the shape is the contract the
    package publishes. What a command adds is beside a record, never in it; check's diagnostics are
    no records.

  @maturity=idea
  Rule: An answer names the commit it was read at, and says when the files differ from it

  @maturity=idea
  Rule: Each record of the exported graph names the version of its format
