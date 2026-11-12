@id=run-specs @maturity=ready
@realized-by:ARCH-runner @realized-by:ARCH-reports
Feature: Run specs as tests

  Developers, CI jobs and agents run the scenarios of the specs they are working on, or all of them,
  and want every outcome, and where to look when one fails, in one report read from the top.

  Not a gate: a run reports a milestone's gate and does not fail on it. What a run's results mean
  for a spec, and how long they count, is not decided here.

  Background:
    Given a file "specs/search.feature" containing:
      """
      @id=search
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
        | data.scenarios         | search#find-a-product-by-name |
        | data.passed            | true                          |
        | data.summary.undefined | 1                             |

    Scenario Outline: A spec, a scenario, a file and a directory
      Given a file "specs/sort/sort.feature" containing:
        """
        @id=sort
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
        | target               | scenarios                             |
        | sort                 | sort#sort-by-name, sort#sort-by-price |
        | sort#sort-by-price   | sort#sort-by-price                    |
        | specs/search.feature | search#find-a-product-by-name         |
        | specs/sort           | sort#sort-by-name, sort#sort-by-price |

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
      Then the exit code is 1
      And the output line with "Then the desk lamp is found" contains "defined at specs/steps/search.steps.ts:6"
      And the output contains "no results"
      And the output does not contain "Given a catalogue with a desk lamp"
      When I run "sdp run search --verbose"
      Then the exit code is 1
      And the output contains "Given a catalogue with a desk lamp"

    Scenario: Examples that --tags left out
      Given a file "specs/sort.feature" containing:
        """
        @id=sort
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

  Rule: run and gate start only on a workspace they can read whole, with every scenario under a rule

    A scenario left unread, a fact or a link dropped, or an id two specs claim would make the run
    incomplete and its record untrue; a scenario outside a rule is in a spec sdp check rejects.

    Scenario Outline: A file sdp cannot read, a tag it drops, an id two specs claim, a scenario outside a rule
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
        | sdp run          | specs/wishlist.feature    | @id=wishlist @iteration=IT-beta\nFeature: Wishlist                                            | 1    | link-syntax           |
        | sdp run          | specs/wishlist.feature    | @id=wishlist\nFeature: Wishlist\n  Scenario: Outside\n    Then there are no error diagnostics | 3    | scenario-outside-rule |
