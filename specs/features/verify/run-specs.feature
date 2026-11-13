@id=run-specs
@realized-by:ARCH-runner @realized-by:ARCH-application
Feature: Run specs as tests

  Developers, CI jobs and agents run the scenarios of the specs they work on, or all of them, and
  read every outcome, and where to look when one fails, in one report. Examples of work still to
  come land on the main line before its code, while a failing example of what is built stops the
  build.

  Not a gate: a run reports a milestone's gate and does not fail on it.

  Background:
    Given a file "specs/search.feature" containing:
      """
      @id=search @maturity=specified
      Feature: Search the catalogue

        Shoppers find products by name.

        Rule: A product is found by its name

          Scenario: Find a product by name
            Given a catalogue with a desk lamp
            When a shopper searches for "lamp"
            Then the desk lamp is found
      """

  Rule: run executes what its targets name: a spec id, a scenario id, or a file or directory relative to the current directory

    Scenario Outline: A spec, a scenario, and a file from a subdirectory
      Given a file "specs/sort.feature" containing:
        """
        @id=sort @maturity=idea
        Feature: Sort

          Rule: A shopper sorts by name or by price

            Scenario: Sort by name
              When a shopper sorts by name

            Scenario: Sort by price
              When a shopper sorts by price
        """
      When I run "sdp run <target> --json" in "<directory>"
      Then the exit code is 0
      And the JSON output has:
        | data.scenarios | <scenarios> |

      Examples:
        | target             | directory | scenarios                             |
        | sort               | .         | sort#sort-by-name, sort#sort-by-price |
        | sort#sort-by-price | .         | sort#sort-by-price                    |
        | search.feature     | specs     | search#find-a-product-by-name         |

  Rule: An example of work still to come runs, and fails no run

    It is the acceptance test of work not built yet, written before its code.

    Scenario Outline: An example of a feature still to come that <outcome>
      Given a file "specs/wishlist.feature" containing:
        """
        @id=wishlist @maturity=specified
        Feature: Wishlist

          Rule: A wishlist keeps what a shopper wants for later

            Scenario: Keep a lamp
              Then the wishlist holds a lamp
        """
      And a file "specs/steps/wishlist.steps.ts" containing:
        """
        import { defineSteps } from "sdp/steps"

        export default defineSteps(() => ({}), ({ Then }) => {
          <definitions>
        })
        """
      When I run "sdp run wishlist"
      Then the exit code is 0
      And the output line with "wishlist#keep-a-lamp" contains "<status>"

      Examples:
        | outcome                       | definitions                                                           | status    |
        | fails                         | Then("the wishlist holds a lamp", () => { throw new Error("empty") }) | failed    |
        | has a step with no definition |                                                                       | undefined |
        | passes                        | Then("the wishlist holds a lamp", () => {})                           | passed    |

  Rule: A run fails when a live example it ran does not pass

    Each example is judged by what this run recorded of it.

    Scenario Outline: An example of a live feature that <outcome>
      Given a file "specs/wishlist.feature" containing:
        """
        @id=wishlist
        Feature: Wishlist

          Rule: A wishlist keeps what a shopper wants for later

            Scenario: Keep a lamp
              Then the wishlist holds a lamp
        """
      And a file "specs/steps/wishlist.steps.ts" containing:
        """
        import { defineSteps } from "sdp/steps"

        export default defineSteps(() => ({}), ({ Then }) => {
          <definitions>
        })
        """
      When I run "sdp run wishlist"
      Then the exit code is <exit code>
      And the output line with "wishlist#keep-a-lamp" contains "<status>"

      Examples:
        | outcome                 | definitions                                                                                | status    | exit code |
        | fails                   | Then("the wishlist holds a lamp", () => { throw new Error("empty") })                      | failed    | 1         |
        | matches two definitions | Then("the wishlist holds a lamp", () => {}); Then("the wishlist holds a {word}", () => {}) | ambiguous | 1         |
        | passes                  | Then("the wishlist holds a lamp", () => {})                                                | passed    | 0         |

  Rule: An example --tags left out fails no run, and its outline is not verified until every example of it has run

    Scenario: An outline run with its failing example left out
      Given a file "specs/payment.feature" containing:
        """
        @id=payment
        Feature: Payment

          Rule: A payment is made by card or by invoice

            Scenario Outline: Pay by <method>
              Then a payment by <method> is made

              @fast
              Examples:
                | method |
                | card   |

              @slow
              Examples:
                | method  |
                | invoice |
        """
      And a file "specs/steps/payment.steps.ts" containing:
        """
        import { defineSteps } from "sdp/steps"

        export default defineSteps(() => ({}), ({ Then }) => {
          Then("a payment by {word} is made", ({ args: [method] }) => {
            if (method === "invoice") throw new Error("no invoices yet")
          })
        })
        """
      When I run "sdp run payment --tags @fast"
      Then the exit code is 0
      And the output contains "1 scenario(s): 1 skipped"
      When I run "sdp q 'feature[stage=in-progress]' --ids"
      Then the output lines are "payment"
      When I run "sdp run payment"
      Then the exit code is 1

  Rule: A row of an outline is judged on its own: one that is no gate fails the run though its outline runs with the gates

    Scenario Outline: An outline that runs with the gates, its ordinary row <outcome>
      Given a file "specs/wishlist.feature" containing:
        """
        @id=wishlist
        Feature: Wishlist

          Rule: A wishlist keeps what a shopper wants for later

            Scenario Outline: Nothing of a kind
              Then the query "<kind>" returns no results

              Examples:
                | kind       |
                | <ordinary> |

              @gate
              Examples:
                | kind |
                | code |
        """
      When I run "sdp run"
      Then the exit code is <exit code>
      And the output contains "<said>"

      Examples:
        | outcome | ordinary | exit code | said                                                            |
        | failing | feature  | 1         | an example of it that is no gate did not pass: it fails the run |
        | passing | decision | 0         | 1 gate scenario(s): 1 passed                                    |

  Rule: A run points out work still to come whose every example passes, and the maturity to delete so that it is live

    Only on complete, current evidence, and naming every maturity to delete, so that following the
    notes leaves none of that work still to come. When a feature still to come has rules still to
    come, its maturity moves onto them.

    Scenario: A rule whose examples pass, in a feature still to come with a rule still without one
      Given a file "specs/wishlist.feature" containing:
        """
        @id=wishlist @maturity=ready
        Feature: Wishlist

          Rule: A wishlist keeps what a shopper wants for later

            Scenario: Keep a lamp
              Then the wishlist holds a lamp

            Scenario: Keep a desk
              Then the wishlist holds a desk

          Rule: A wishlist is shared with a friend
        """
      And a file "specs/steps/wishlist.steps.ts" containing:
        """
        import { defineSteps } from "sdp/steps"

        export default defineSteps(() => ({}), ({ Then }) => {
          Then("the wishlist holds a {word}", () => {})
        })
        """
      When I run "sdp run wishlist#keep-a-lamp"
      Then the exit code is 0
      And the output does not contain "note:"
      When I run "sdp run wishlist#keep-a-desk"
      Then the exit code is 0
      And the output contains "delete @maturity=ready at specs/wishlist.feature:1, and write it above the rules still to come at specs/wishlist.feature:12"
      Given a file "specs/wishlist.feature" containing:
        """
        @id=wishlist
        Feature: Wishlist

          Rule: A wishlist keeps what a shopper wants for later

            Scenario: Keep a lamp
              Then the wishlist holds a lamp

            Scenario: Keep a desk
              Then the wishlist holds a desk

          @maturity=ready
          Rule: A wishlist is shared with a friend
        """
      When I run "sdp check --base none"
      Then the exit code is 0
      When I run "sdp q 'scenario[!toCome]' --ids"
      Then the output lines are "wishlist#keep-a-lamp, wishlist#keep-a-desk"

  Rule: A run executes one scenario at a time unless asked otherwise, and never one tagged @serial beside another

    Step definitions written for a sequential run may share state, so running scenarios concurrently
    is the caller's choice.

    Scenario Outline: Three scenarios, one of them @serial, run <how>
      Given a file "specs/timing.feature" containing:
        """
        @id=timing
        Feature: Timing
          Rule: Every step finishes
            Scenario: One
              Given a slow step

            Scenario: Two
              Given a slow step

            @serial
            Scenario: Alone
              Given a slow step
        """
      And a step definition "a slow step" that takes a moment
      When the workspace is <run>
      Then the <timing>
      And the scenario "Alone" ran alone

      Examples:
        | how                   | run                        | timing                               |
        | without --concurrency | run                        | scenario "One" ran alone             |
        | with --concurrency 4  | run with "--concurrency 4" | scenarios "One" and "Two" overlapped |

  Rule: A run reports each example once and in order, whatever finishes first and however slow the reporter

    Scenario Outline: A first scenario that <first step>, run three at a time
      Given a file "specs/timing.feature" containing:
        """
        @id=timing
        Feature: Timing
          Rule: Every step finishes
            Scenario: One
              Given a first step

            Scenario: Two
              Given a step

            Scenario: Three
              Given a step
        """
      And a step definition "a step" that passes
      And a step definition "a first step" that <first step>
      When the workspace is run for "timing" with concurrency 3 and a reporter that takes a moment
      Then the reporter saw "start One, end One, start Two, end Two, start Three, end Three"

      Examples:
        | first step     |
        | passes         |
        | takes a moment |

  Rule: A run's report says where to look: the definition of a failing step, the examples --tags left out, a step file that defines nothing; --verbose adds the steps that passed

    Scenario: A failing step, an example left out, and a step file that defines nothing
      Given a file "specs/sort.feature" containing:
        """
        @id=sort @maturity=idea
        Feature: Sort

          Rule: A shopper sorts by any order

            Scenario Outline: Sort by <order>
              When a shopper sorts by <order>

              Examples:
                | order |
                | name  |

              @slow
              Examples:
                | order      |
                | popularity |
        """
      And a file "specs/steps/search.steps.ts" containing:
        """
        import { defineSteps } from "sdp/steps"

        export default defineSteps(() => ({}), ({ Given, When, Then }) => {
          Given("a catalogue with a desk lamp", () => {})
          When("a shopper searches for {string}", () => {})
          Then("the desk lamp is found", () => {
            throw new Error("no results")
          })
        })
        """
      And a file "specs/steps/sort.steps.ts" containing:
        """
        export const phrases = ["a shopper sorts by name"]
        """
      When I run "sdp run --tags 'not @slow'"
      Then the exit code is 0
      And the output line with "Then the desk lamp is found" contains "specs/steps/search.steps.ts:6"
      And the output line with "example Sort by popularity" contains "not selected"
      And the output contains "specs/steps/sort.steps.ts defines no steps"
      And the output does not contain "Given a catalogue with a desk lamp"
      When I run "sdp run search --verbose"
      Then the exit code is 0
      And the output contains "Given a catalogue with a desk lamp"

  Rule: run and gate start only on a workspace they can read whole, whose scenarios sdp check accepts

    A scenario left unread, a tag dropped or an id two specs claim would make the record untrue, and
    which examples fail the run would rest on a declaration nobody made.

    Scenario Outline: A file sdp cannot read, an id two specs claim, a scenario outside a rule
      Given a file "specs/MS-beta.feature" containing:
        """
        @id=MS-beta
        Feature: Beta

          Rule: Every feature is ready

            Scenario: None is below ready
              Then the query "feature[maturity<ready]" returns no results
        """
      And a file "<file>" containing:
        """
        <content>
        """
      When I run "<command>"
      Then the exit code is 1
      And the output contains "<file>:<line> [<rule>]"
      And the file ".sdp/results.json" does not exist

      Examples:
        | command          | file                      | content                                                                                       | line | rule                  |
        | sdp run          | specs/broken.feature      | Feature: Broken\n  Scenario: Half written\n    Given a note:\n      ```\n      never closed   | 6    | gherkin-syntax        |
        | sdp gate MS-beta | specs/shop/search.feature | @id=search\nFeature: Search again                                                             | 1    | duplicate-id          |
        | sdp run          | specs/wishlist.feature    | @id=wishlist\nFeature: Wishlist\n  Scenario: Outside\n    Then there are no error diagnostics | 3    | scenario-outside-rule |

  Rule: A run on a graph sdp could not read whole answers incomplete, and exits 2 when nothing it ran failed

    What sdp could not follow, an import of the code say, could change what a scenario that reads
    the graph found; it is no declaration dropped, so the run runs all the same, and says so.

    Scenario Outline: An import sdp cannot follow, for <command>
      Given a file "specs/MS-beta.feature" containing:
        """
        @id=MS-beta
        Feature: Beta

          Rule: The workspace has no error

            Scenario: No error
              Then there are no error diagnostics
        """
      And a file "src/search.ts" containing:
        """
        /** @sdp is ARCH-search */
        import "./missing.ts"
        export const search = 1
        """
      When I run "<command> --json"
      Then the exit code is 2
      And the JSON output has:
        | complete    | false |
        | data.passed | true  |
      And the output contains "not read: src/search.ts:2 [import-unresolved]"

      Examples:
        | command          |
        | sdp run          |
        | sdp gate MS-beta |

  @maturity=idea
  Rule: A run can write Cucumber Messages, so the reporters and dashboards that read Cucumber's runs read sdp's
