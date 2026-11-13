@id=run-specs
@realized-by:ARCH-runner @realized-by:ARCH-application
Feature: Run specs as tests

  Developers, CI jobs and agents run the scenarios of the specs they are working on, or all of them,
  and want every outcome, and where to look when one fails, in one report read from the top.
  Analysts and agents write a rule's examples before its code and land them on the main line, while
  the team wants a failing example of what is built to stop the build.

  Not a gate: a run reports a milestone's gate and does not fail on it. What a run's results mean
  for a spec, and how long they count, is not decided here.

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

    Scenario: A file, from a subdirectory
      When I run "sdp run search.feature --json" in "specs"
      Then the JSON output has:
        | data.scenarios        | search#find-a-product-by-name |
        | data.passed           | true                          |
        | data.toCome.undefined | 1                             |

    Scenario Outline: A spec, a scenario, a file and a directory
      Given a file "specs/sort/sort.feature" containing:
        """
        @id=sort @maturity=idea
        Feature: Sort

          Rule: A shopper sorts by name or by price

            Scenario: Sort by name
              When a shopper sorts by name

            Scenario: Sort by price
              When a shopper sorts by price
        """
      When I run "sdp run <target> --json"
      Then the exit code is 0
      And the JSON output has:
        | data.scenarios | <scenarios> |

      Examples:
        | target                 | scenarios                                                            |
        | sort                   | sort#sort-by-name, sort#sort-by-price                                |
        | sort#sort-by-price     | sort#sort-by-price                                                   |
        | specs/search.feature   | search#find-a-product-by-name                                        |
        | ./specs/search.feature | search#find-a-product-by-name                                        |
        | specs/sort             | sort#sort-by-name, sort#sort-by-price                                |
        | .                      | search#find-a-product-by-name, sort#sort-by-name, sort#sort-by-price |

  Rule: An example of work still to come runs, and fails no run

    It is the acceptance test of what is not built yet, written before its code and kept on the main
    line. Its stage stays the maturity it declares; its verification is what its examples did.

    Scenario Outline: An example of a feature at specified that <outcome>
      Given a file "specs/wishlist.feature" containing:
        """
        @id=wishlist @maturity=specified
        Feature: Wishlist

          Shoppers keep what they want for later.

          Rule: A wishlist keeps what a shopper wants for later

            Scenario: Keep a lamp
              Then the wishlist holds a lamp
        """
      And a file "specs/steps/wishlist.steps.ts" containing:
        """
        import { defineSteps, pending } from "sdp/steps"

        export default defineSteps(() => ({}), ({ Then }) => {
          <definitions>
        })
        """
      When I run "sdp run wishlist"
      Then the exit code is 0
      And the output line with "wishlist#keep-a-lamp" contains "<status>"
      And the output line with "wishlist#keep-a-lamp" contains "still to come"
      And the output contains "1 scenario(s) of work still to come, none of which fails the run: 1 <status>"
      When I run "sdp q '#wishlist[stage=specified]' --ids"
      Then the output lines are "wishlist"

      Examples:
        | outcome                       | definitions                                                                                | status    |
        | fails                         | Then("the wishlist holds a lamp", () => { throw new Error("empty") })                      | failed    |
        | is pending                    | Then("the wishlist holds a lamp", () => pending())                                         | pending   |
        | matches two definitions       | Then("the wishlist holds a lamp", () => {}); Then("the wishlist holds a {word}", () => {}) | ambiguous |
        | has a step with no definition |                                                                                            | undefined |
        | passes                        | Then("the wishlist holds a lamp", () => {})                                                | passed    |

    Scenario Outline: A failing example of a feature at <maturity>
      Given a file "specs/wishlist.feature" containing:
        """
        @id=wishlist @maturity=<maturity>
        Feature: Wishlist

          Rule: A wishlist keeps what a shopper wants for later

            Scenario: Keep a lamp
              Then the wishlist holds a lamp
        """
      When I run "sdp run wishlist"
      Then the exit code is 0
      And the output line with "wishlist#keep-a-lamp" contains "still to come"

      Examples:
        | maturity                 |
        | someday                  |
        | verified                 |
        | ready @maturity=someday  |

  Rule: A run fails when a live example it ran does not pass

    Each example is judged by the result this run recorded: neither another run's result written
    meanwhile nor a result gone stale while it ran stands in for it. An example `--tags` left out
    fails no run, and is no evidence either. A row of an outline is judged on its own: one that is no
    gate fails the run though its outline runs with the gates.

    Scenario Outline: An example of a live feature that <outcome>
      Given a file "specs/wishlist.feature" containing:
        """
        @id=wishlist
        Feature: Wishlist

          Shoppers keep what they want for later.

          Rule: A wishlist keeps what a shopper wants for later

            Scenario: Keep a lamp
              Then the wishlist holds a lamp
        """
      And a file "specs/steps/wishlist.steps.ts" containing:
        """
        import { defineSteps, pending } from "sdp/steps"

        export default defineSteps(() => ({}), ({ Then }) => {
          <definitions>
        })
        """
      When I run "sdp run wishlist"
      Then the exit code is <exit code>
      And the output contains "1 scenario(s): 1 <status>"

      Examples:
        | outcome                       | definitions                                                                                | status    | exit code |
        | fails                         | Then("the wishlist holds a lamp", () => { throw new Error("empty") })                      | failed    | 1         |
        | is pending                    | Then("the wishlist holds a lamp", () => pending())                                         | pending   | 1         |
        | matches two definitions       | Then("the wishlist holds a lamp", () => {}); Then("the wishlist holds a {word}", () => {}) | ambiguous | 1         |
        | has a step with no definition |                                                                                            | undefined | 1         |
        | passes                        | Then("the wishlist holds a lamp", () => {})                                                | passed    | 0         |

    Scenario Outline: An outline that runs with the gates, its ordinary row <outcome>
      Given a file "specs/wishlist.feature" containing:
        """
        @id=wishlist
        Feature: Wishlist

          Shoppers keep what they want for later.

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
        | outcome                | ordinary                | exit code | said                                                                                                                       |
        | failing                | feature                 | 1         | wishlist#nothing-of-a-kind is recorded with the gates, and an example of it that is no gate did not pass: it fails the run |
        | passing                | decision                | 0         | 1 gate scenario(s): 1 passed                                                                                               |
        | reading delivery state | feature[stage=verified] | 1         | an ordinary scenario sees none                                                                                             |

    Scenario Outline: A spec <declaring>, and an example without a step definition
      Given a file "specs/export-to-csv.feature" containing:
        """
        <tags>
        Feature: Export to CSV

          Analysts want data in Excel.

          Rule: Every row is exported

            Scenario: Export
              Then I get a file
        """
      When I run "sdp run"
      Then the exit code is <exit code>

      Examples:
        | declaring             | tags                              | exit code |
        | that declares nothing | @id=export-to-csv                 | 1         |
        | that is still to come | @id=export-to-csv @maturity=ready | 0         |
        | named by its path     |                                   | 1         |

    Scenario: A failure fails the run that recorded it, even when its result went stale while it ran
      Given a file "sdp.config.yaml" containing:
        """
        evidence:
          inputs: [prices.csv]
        """
      And a file "prices.csv" containing:
        """
        lamp,10
        """
      And a file "specs/cart.feature" containing:
        """
        @id=cart
        Feature: Cart

          Shoppers collect items before paying.

          Rule: A cart holds what was added

            Scenario: Add an item
              Then the cart holds 1 item
        """
      And a file "specs/steps/cart.steps.ts" containing:
        """
        import { writeFileSync } from "node:fs"
        import { defineSteps } from "sdp/steps"

        export default defineSteps(() => ({}), ({ Then }) => {
          Then("the cart holds {int} item", () => {
            writeFileSync(new URL("../../prices.csv", import.meta.url), "lamp,12")
            throw new Error("the cart is empty")
          })
        })
        """
      When I run "sdp run"
      Then the exit code is 1
      And the output contains "1 scenario(s): 1 failed"

    Scenario: An open question excuses no example written under it
      Given a file "specs/wishlist.feature" containing:
        """
        @id=wishlist
        Feature: Wishlist

          Shoppers keep what they want for later.

          @open
          Rule: Does a wishlist expire?

            Scenario: An old wishlist
              Then the wishlist holds a lamp
        """
      When I run "sdp q 'scenario[!toCome]' --ids"
      Then the output lines are "wishlist#an-old-wishlist"
      When I run "sdp run wishlist"
      Then the exit code is 1
      And the output contains "specs/wishlist.feature:9 [question-example]"

    Scenario: The run, a query and sdp status tell a regression from work still to come
      Given a file "specs/cart.feature" containing:
        """
        @id=cart
        Feature: Cart

          Shoppers collect items before paying.

          Rule: A cart holds what was added

            Scenario: Add an item
              Then the cart holds 1 item
        """
      And a file "specs/wishlist.feature" containing:
        """
        @id=wishlist @maturity=ready
        Feature: Wishlist

          Shoppers keep what they want for later.

          Rule: A wishlist keeps what a shopper wants for later

            Scenario: Keep a lamp
              Then the wishlist holds a lamp
        """
      And a file "specs/steps/shop.steps.ts" containing:
        """
        import { defineSteps } from "sdp/steps"

        export default defineSteps(() => ({}), ({ Then }) => {
          Then("the cart holds {int} item", () => {
            throw new Error("the cart is empty")
          })
          Then("the wishlist holds a lamp", () => {
            throw new Error("the wishlist is empty")
          })
        })
        """
      When I run "sdp run cart wishlist"
      Then the exit code is 1
      And the output contains "1 scenario(s): 1 failed"
      And the output contains "1 scenario(s) of work still to come, none of which fails the run: 1 failed"
      When I run "sdp q 'scenario[!toCome][status=failed|ambiguous|pending|undefined]' --ids"
      Then the output lines are "cart#add-an-item"
      When I run "sdp status --json"
      Then the JSON output has:
        | data.scenarios.failed | 1 |
        | data.toCome.failed    | 1 |

    Scenario: An example that --tags left out fails no run
      Given a file "specs/payment.feature" containing:
        """
        @id=payment
        Feature: Payment

          Shoppers pay by card or by invoice.

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
      When I run "sdp run payment"
      Then the exit code is 1

  Rule: A run points out work still to come whose every example passes, and the maturity to delete so that it is live

    Only on complete, current evidence: every example of the rule or feature ran in this run or
    still counts, at least one of them in this run, and none of its rules is open or without an
    example. A feature is named with each of its rules that declares a maturity of its own, so that
    following the notes leaves none of it still to come. A rule of a feature still to come is live
    only once its feature is, so its note moves the feature's maturity onto the rules still to come.
    It is a note of the run, not of `sdp check`, since the evidence is one checkout's.

    Background:
      Given a file "specs/steps/wishlist.steps.ts" containing:
        """
        import { defineSteps } from "sdp/steps"

        export default defineSteps(() => ({}), ({ Then }) => {
          Then("the wishlist holds a {word}", () => {})
        })
        """

    Scenario: A feature whose every example passes, once the last of them has run
      Given a file "specs/wishlist.feature" containing:
        """
        @id=wishlist @maturity=ready
        Feature: Wishlist

          Shoppers keep what they want for later.

          Rule: A wishlist keeps what a shopper wants for later

            Scenario: Keep a lamp
              Then the wishlist holds a lamp

            Scenario: Keep a desk
              Then the wishlist holds a desk
        """
      When I run "sdp run wishlist#keep-a-lamp"
      Then the exit code is 0
      And the output does not contain "note:"
      When I run "sdp run wishlist#keep-a-desk"
      Then the exit code is 0
      And the output contains "note: wishlist is still to come, and every example of it passes: make it live, delete @maturity=ready at specs/wishlist.feature:1"

    Scenario: A feature whose every example passes, with a rule at a maturity of its own
      Given a file "specs/wishlist.feature" containing:
        """
        @id=wishlist @maturity=ready
        Feature: Wishlist

          Shoppers keep what they want for later.

          Rule: A wishlist keeps what a shopper wants for later

            Scenario: Keep a lamp
              Then the wishlist holds a lamp

          @maturity=specified
          Rule: A wishlist is shared with a friend

            Scenario: Share the list
              Then the wishlist holds a desk
        """
      When I run "sdp run"
      Then the exit code is 0
      And the output contains "note: wishlist is still to come, and every example of it passes: make it live, delete @maturity=ready at specs/wishlist.feature:1"
      And the output contains "note: wishlist#a-wishlist-is-shared-with-a-friend is still to come, and every example of it passes: make it live, delete @maturity=specified at specs/wishlist.feature:11"
      Given a file "specs/wishlist.feature" containing:
        """
        @id=wishlist
        Feature: Wishlist

          Shoppers keep what they want for later.

          Rule: A wishlist keeps what a shopper wants for later

            Scenario: Keep a lamp
              Then the wishlist holds a lamp

          Rule: A wishlist is shared with a friend

            Scenario: Share the list
              Then the wishlist holds a desk
        """
      When I run "sdp check --base none"
      Then the exit code is 0
      When I run "sdp q 'scenario[!toCome]' --ids"
      Then the output lines are "wishlist#keep-a-lamp, wishlist#share-the-list"

    Scenario: A rule whose examples pass, in a live feature that has a rule still without one, and a question
      Given a file "specs/wishlist.feature" containing:
        """
        @id=wishlist
        Feature: Wishlist

          Shoppers keep what they want for later.

          @maturity=ready
          Rule: A wishlist keeps what a shopper wants for later

            Scenario: Keep a lamp
              Then the wishlist holds a lamp

          @maturity=draft
          Rule: A wishlist is shared with a friend

            Friends buy presents from it.

          @open
          Rule: Does a wishlist expire?
        """
      When I run "sdp run"
      Then the exit code is 0
      And the output contains "note: wishlist#a-wishlist-keeps-what-a-shopper-wants-for-later is still to come, and every example of it passes: make it live, delete @maturity=ready at specs/wishlist.feature:6"
      And the output contains "note:" 1 time

    Scenario: A rule whose examples pass, in a feature still to come that has a rule still without one
      Given a file "specs/wishlist.feature" containing:
        """
        @id=wishlist @maturity=ready
        Feature: Wishlist

          Shoppers keep what they want for later.

          Rule: A wishlist keeps what a shopper wants for later

            Scenario: Keep a lamp
              Then the wishlist holds a lamp

          Rule: A wishlist is shared with a friend

            Friends buy presents from it.

          @open
          Rule: Does a wishlist expire?
        """
      When I run "sdp run"
      Then the exit code is 0
      And the output contains "note: wishlist#a-wishlist-keeps-what-a-shopper-wants-for-later is still to come, and every example of it passes: make it live, delete @maturity=ready at specs/wishlist.feature:1, and write it above the rules still to come at specs/wishlist.feature:11"
      Given a file "specs/wishlist.feature" containing:
        """
        @id=wishlist
        Feature: Wishlist

          Shoppers keep what they want for later.

          Rule: A wishlist keeps what a shopper wants for later

            Scenario: Keep a lamp
              Then the wishlist holds a lamp

          @maturity=ready
          Rule: A wishlist is shared with a friend

            Friends buy presents from it.

          @open
          Rule: Does a wishlist expire?
        """
      When I run "sdp check --base none"
      Then the exit code is 0
      When I run "sdp q 'scenario[!toCome]' --ids"
      Then the output lines are "wishlist#keep-a-lamp"

  Rule: A run executes the examples it was asked for, one at a time unless asked otherwise, and reports each once and in order

    Step definitions written for a sequential run may share state, so running scenarios concurrently
    is the caller's choice, and a scenario tagged @serial is never part of it.

    Scenario Outline: Whatever finishes first, and however slow the reporter
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

    Scenario: Without --concurrency, one scenario at a time
      Given a file "specs/timing.feature" containing:
        """
        @id=timing
        Feature: Timing
          Rule: Every step finishes
            Scenario: One
              Given a slow step

            Scenario: Two
              Given a slow step
        """
      And a step definition "a slow step" that takes a moment
      When the workspace is run
      Then the scenario "One" ran alone

    Scenario: Scenarios run concurrently when asked to, except those tagged @serial
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
      When the workspace is run with "--concurrency 4"
      Then the scenarios "One" and "Two" overlapped
      And the scenario "Alone" ran alone
      And node "timing#alone" has attribute status = "passed"

    Scenario: --tags selects examples, and a scenario passes only when all its examples ran
      Given a file "specs/payment.feature" containing:
        """
        @id=payment
        Feature: Payment
          Rule: A payment is made by card or by invoice
            Scenario Outline: Pay by <method>
              Given a payment by <method>

              @fast
              Examples:
                | method |
                | card   |

              @slow
              Examples:
                | method  |
                | invoice |
        """
      And a step definition "a payment by card" that passes
      And a step definition "a payment by invoice" that fails
      When the workspace is run with "--tags '@fast'"
      Then the step "a payment by card" has status "passed"
      And the step "a payment by invoice" did not run
      And node "payment#pay-by-method" has attribute status = "skipped"
      And node "payment" has attribute stage = "in-progress"

    Scenario: Whether a scenario runs alone depends on the examples a run selects
      Given a file "specs/timing.feature" containing:
        """
        @id=timing
        Feature: Timing
          Rule: Every step finishes
            Scenario: One
              Given a slow step

            Scenario Outline: Two <mode>
              Given a slow step

              Examples:
                | mode     |
                | together |

              @serial
              Examples:
                | mode  |
                | alone |
        """
      And a step definition "a slow step" that takes a moment
      When the workspace is run with "--concurrency 4 --tags 'not @serial'"
      Then the scenarios "One" and "Two together" overlapped

  Rule: A run's report says where to look: the definition of a failing step, the examples --tags left out, a step file that defines nothing

    Scenario: A step that fails shows where it is defined; passed steps show with --verbose
      Given a file "specs/steps/search.steps.ts" containing:
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
      When I run "sdp run search"
      Then the exit code is 0
      And the output line with "Then the desk lamp is found" contains "defined at specs/steps/search.steps.ts:6"
      And the output contains "no results"
      And the output does not contain "Given a catalogue with a desk lamp"
      When I run "sdp run search --verbose"
      Then the exit code is 0
      And the output contains "Given a catalogue with a desk lamp"

    Scenario: Examples that --tags left out
      Given a file "specs/sort.feature" containing:
        """
        @id=sort @maturity=idea
        Feature: Sort

          Rule: A shopper sorts by any order

            Scenario Outline: Sort by <order>
              When a shopper sorts by <order>

              @fast
              Examples:
                | order |
                | name  |

              @slow
              Examples:
                | order      |
                | popularity |
        """
      When I run "sdp run sort --tags @fast"
      Then the exit code is 0
      And the output line with "example Sort by popularity" contains "not selected"
      And the output contains "1 example(s) not selected are skipped"

    Scenario: A step file that defines nothing
      Given a file "specs/steps/search.steps.ts" containing:
        """
        export const phrases = ["a catalogue with a desk lamp"]
        """
      When I run "sdp run"
      Then the exit code is 0
      And the output contains "note: specs/steps/search.steps.ts defines no steps"

  Rule: run and gate start only on a workspace they can read whole, whose scenarios sdp check accepts

    A scenario left unread, a fact or a link dropped, or an id two specs claim would make the run
    incomplete and its record untrue. A scenario outside a rule and an example under an open
    question are in specs sdp check rejects: which examples fail the run would rest on a declaration
    nobody made.

    Scenario Outline: A file sdp cannot read, a tag it drops, an id two specs claim, a scenario outside a rule, an example of a question
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
        | command          | file                      | content                                                                                                                           | line | rule                  |
        | sdp run          | specs/broken.feature      | Feature: Broken\n  Scenario: Half written\n    Given a note:\n      ```\n      never closed                                       | 6    | gherkin-syntax        |
        | sdp gate MS-beta | specs/shop/search.feature | @id=search\nFeature: Search again                                                                                                 | 1    | duplicate-id          |
        | sdp run          | specs/wishlist.feature    | @id=wishlist @iteration=IT-beta\nFeature: Wishlist                                                                                | 1    | link-syntax           |
        | sdp run          | specs/wishlist.feature    | @id=wishlist\nFeature: Wishlist\n  Scenario: Outside\n    Then there are no error diagnostics                                     | 3    | scenario-outside-rule |
        | sdp run          | specs/wishlist.feature    | @id=wishlist\nFeature: Wishlist\n  Rule: Kept\n    @maturity=draft\n    Scenario: Keep\n      Then there are no error diagnostics | 4    | annotation            |
        | sdp gate MS-beta | specs/wishlist.feature    | @id=wishlist\nFeature: Wishlist\n  @open\n  Rule: Kept?\n    Scenario: Keep\n      Then there are no error diagnostics            | 5    | question-example      |

    Scenario Outline: A spec that declares the retired rung, for <command>
      Given a file "specs/MS-beta.feature" containing:
        """
        @id=MS-beta
        Feature: Beta

          Rule: Every feature is ready

            Scenario: None is below ready
              Then the query "feature[maturity<ready]" returns no results
        """
      And a file "specs/wishlist.feature" containing:
        """
        @id=wishlist @maturity=<rung>
        Feature: Wishlist

          Rule: Kept

            Scenario: Keep
              Then there are no error diagnostics
        """
      When I run "<command>"
      Then the exit code is 1
      And the output contains "specs/wishlist.feature:1 [retired-maturity]"
      And the file ".sdp/results.json" does not exist

      Examples:
        | command          | rung        |
        | sdp run          | implemented |
        | sdp gate MS-beta | implemented |

    Scenario: A path the code globs match that is no file, which is in no spec
      When I run "sh -c 'mkdir src && ln -s nowhere.ts src/gone.ts'"
      Then the exit code is 0
      When I run "sdp run"
      Then the exit code is 1
      And the output contains "cannot run: 1 problem(s) in the workspace must be fixed first (sdp check)"
      And the output contains "src/gone.ts:1 [not-a-file]"
      And the file ".sdp/results.json" does not exist
