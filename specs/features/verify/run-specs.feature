@id=run-specs
@realized-by:ARCH-runner @realized-by:ARCH-application
Feature: Run specs as tests

  Developers, CI jobs and agents run the scenarios of the specs they work on, or all of them, and
  read every outcome in one report: examples of work still to come land before its code, and a
  failing example of what is built stops the build.

  Not a gate: a run reports a milestone's gate and does not fail on it.

  Background:
    Given a file "specs/search.feature" containing:
      """
      @id=search @maturity=specified
      Feature: Search the catalogue

        Rule: A product is found by its name

          Scenario: Find a product by name
            Given a catalogue with a desk lamp
            When a shopper searches for "lamp"
            Then the desk lamp is found
      """

  Rule: run executes what its targets name: a spec id, a scenario id, or a file or directory relative to the current directory

    Scenario Outline: Run <target> from <directory>
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

  Rule: A run fails when a live example it ran does not pass; an example of work still to come runs and fails no run

    Scenario Outline: An example of a <work> feature that <outcome>
      Given a file "specs/wishlist.feature" containing:
        """
        @id=wishlist <declaring>
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
        | work          | declaring           | outcome                 | definitions                                                                                | status    | exit code |
        | still to come | @maturity=specified | fails                   | Then("the wishlist holds a lamp", () => { throw new Error("empty") })                      | failed    | 0         |
        | live          |                     | fails                   | Then("the wishlist holds a lamp", () => { throw new Error("empty") })                      | failed    | 1         |
        | live          |                     | matches two definitions | Then("the wishlist holds a lamp", () => {}); Then("the wishlist holds a {word}", () => {}) | ambiguous | 1         |
        | live          |                     | passes                  | Then("the wishlist holds a lamp", () => {})                                                | passed    | 0         |

  Rule: A run points out work still to come whose every example passes, and the maturity to delete so that it is live

    Scenario: A wishlist whose examples pass
      Given a file "specs/wishlist.feature" containing:
        """
        @id=wishlist @maturity=ready
        Feature: Wishlist

          Rule: A wishlist keeps what a shopper wants for later

            Scenario: Keep a lamp
              Then the wishlist holds a lamp
        """
      And a file "specs/steps/wishlist.steps.ts" containing:
        """
        import { defineSteps } from "sdp/steps"

        export default defineSteps(() => ({}), ({ Then }) => {
          Then("the wishlist holds a lamp", () => {})
        })
        """
      When I run "sdp run wishlist"
      Then the exit code is 0
      And the output contains "delete @maturity=ready at specs/wishlist.feature:1"

  Rule: A run executes one scenario at a time unless asked otherwise, and never one tagged @serial beside another

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

  Rule: A run's report shows where a failing step is defined, and --verbose adds the steps that passed

    Scenario: A failing step, then --verbose
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
      And the output line with "Then the desk lamp is found" contains "specs/steps/search.steps.ts:6"
      And the output does not contain "Given a catalogue with a desk lamp"
      When I run "sdp run search --verbose"
      Then the output contains "Given a catalogue with a desk lamp"

  Rule: A run starts only on a workspace sdp check accepts, and answers incomplete, with exit code 2, where it could not read the graph whole

    Scenario Outline: A run beside <file>
      Given a file "<file>" containing:
        """
        <content>
        """
      When I run "sdp run"
      Then the exit code is <exit code>
      And the output contains "<said>"

      Examples:
        | file                 | content                                                                                     | exit code | said                                          |
        | specs/broken.feature | Feature: Broken\n  Scenario: Half written\n    Given a note:\n      ```\n      never closed | 1         | specs/broken.feature:6 [gherkin-syntax]       |
        | src/search.ts        | /** @sdp is ARCH-search */\nimport "./missing.ts"\nexport const search = 1                  | 2         | not read: src/search.ts:2 [import-unresolved] |

  @maturity=idea
  Rule: A run can write Cucumber Messages, so the reporters and dashboards that read Cucumber's runs read sdp's
