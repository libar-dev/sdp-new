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

  Rule: run executes the examples its targets and --tags select

    A target is what its reader has at hand: a spec id from a query, a scenario id from a report, or
    a path the shell completes from where it is.

    Scenario Outline: Run <arguments> from <directory>
      Given a file "sdp.config.yaml" containing:
        """
        # every key at its default
        """
      And a file "specs/shelf/sort.feature" containing:
        """
        @id=sort @maturity=idea
        Feature: Sort

          Rule: A shopper sorts by name or by price

            Scenario: Sort by name
              When a shopper sorts by name

            @smoke
            Scenario: Sort by price
              When a shopper sorts by price
        """
      When I run "sdp run <arguments> --json" in "<directory>"
      Then the exit code is 0
      And the JSON output has:
        | data.scenarios | <scenarios> |

      Examples:
        | arguments          | directory | scenarios                             |
        | sort               | .         | sort#sort-by-name, sort#sort-by-price |
        | sort#sort-by-price | .         | sort#sort-by-price                    |
        | search.feature     | specs     | search#find-a-product-by-name         |
        | shelf              | specs     | sort#sort-by-name, sort#sort-by-price |
        | --tags @smoke      | .         | sort#sort-by-price                    |

  Rule: A run that selects no scenario is refused, naming what selected nothing

    A misspelt target, tag or glob would otherwise run nothing and pass: a CI job that runs
    --tags @smok, or reads specs from a folder that moved, would stay green without running an example.

    Scenario Outline: Run <arguments>, <case>
      Given these specs:
        | tags                        | Feature  |
        | @id=wishlist @maturity=idea | Wishlist |
      When I run "sdp run <arguments>"
      Then the exit code is 1
      And the output contains "nothing matches <arguments>"

      Examples:
        | arguments    | case                   |
        | serach       | a misspelt target      |
        | wishlist     | a spec with no example |
        | --tags @smok | a tag no example has   |

    Scenario: Run everything, the features globs matching no spec
      Given a file "sdp.config.yaml" containing:
        """
        features: ["specs/shop/**/*.feature"]
        """
      When I run "sdp run"
      Then the exit code is 1
      And the output contains "nothing matches the features globs specs/shop/**/*.feature"

  Rule: A run fails only when a live example it ran does not pass

    The examples of work still to come are written before its code, so they run and fail until it is
    built.

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
      When I run "sdp run wishlist --json"
      Then the exit code is <exit code>
      And the JSON output has:
        | data.scenarios.status | <status> |

      Examples:
        | work          | declaring           | outcome                 | definitions                                                                                | status    | exit code |
        | still to come | @maturity=specified | fails                   | Then("the wishlist holds a lamp", () => { throw new Error("empty") })                      | failed    | 0         |
        | live          |                     | fails                   | Then("the wishlist holds a lamp", () => { throw new Error("empty") })                      | failed    | 1         |
        | live          |                     | has a step not defined  |                                                                                            | undefined | 1         |
        | live          |                     | matches two definitions | Then("the wishlist holds a lamp", () => {}); Then("the wishlist holds a {word}", () => {}) | ambiguous | 1         |
        | live          |                     | passes                  | Then("the wishlist holds a lamp", () => {})                                                | passed    | 0         |

  Rule: A run names the maturity to delete on work still to come whose every example passes

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

  Rule: A scenario runs beside another only when --concurrency asks for it and neither is tagged @serial

    Steps written for a run of one scenario at a time may share state, so running several at once
    is asked for, never assumed; a scenario that measures time would measure the others beside it.

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

  Rule: A run's report shows a failing step with the file and line that define it

    Scenario: A failing step
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

  Rule: A run's report shows the steps that passed only with --verbose

    Scenario: The steps before a failing one, then --verbose
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
      And the output does not contain "Given a catalogue with a desk lamp"
      When I run "sdp run search --verbose"
      Then the output contains "Given a catalogue with a desk lamp"

  Rule: A run refuses a workspace on which a result would mean nothing

    An unread spec, or a path that is no file, may hold examples a result rests on; an example outside
    a rule verifies none, and one of a question or off the ladder fails no run. What else check
    rejects leaves results true: check gates it.

    Scenario: Every problem a run refuses, in one workspace
      Given a file "specs/broken.feature" containing:
        """
        Feature: Broken
          Scenario: Half written
            Given a note:
              ```
              never closed
        """
      And a file "specs/reports.feature" containing:
        """
        @id=reports
        Feature: Reports

          Scenario: Daily
            Then a report is mailed

          @open
          Rule: Are reports mailed weekly too?

            Scenario: Weekly
              Then a report is mailed
        """
      And a file "specs/export.feature" containing:
        """
        @id=export @maturity=done
        Feature: Export

          Rule: A report is exported as CSV

            Scenario: To CSV
              Then a report is exported
        """
      When I run the pipeline:
        """
        mkdir src && ln -s missing.ts src/reports.ts
        sdp run
        """
      Then the exit code is 1
      And the output contains "src/reports.ts:1 [not-a-file]"
      And the output contains "specs/broken.feature:6 [gherkin-syntax]"
      And the output contains "specs/reports.feature:4 [scenario-outside-rule]"
      And the output contains "specs/reports.feature:10 [question-example]"
      And the output contains "specs/export.feature:1 [maturity-off-ladder]"

    Scenario: A link to no spec, which check reports
      Given these specs:
        | tags                                       | Feature |
        | @id=reports @maturity=idea @depends-on:mailer | Reports |
      When I run "sdp run --json"
      Then the exit code is 0
      And the JSON output has:
        | data.scenarios | search#find-a-product-by-name |

  Rule: Code sdp could not read leaves a run incomplete, never refused

    Unread code costs the graph annotations and imports, never examples.

    Scenario: A run beside code that does not parse
      Given a file "src/cart.ts" containing:
        """
        /** @sdp is ARCH-cart */
        export const = 1
        """
      When I run "sdp run --json"
      Then the exit code is 2
      And the JSON output has:
        | complete       | false                         |
        | data.scenarios | search#find-a-product-by-name |
      And the output contains "not read: src/cart.ts:2 [annotation-unreadable]"

  @maturity=idea
  Rule: A run can write Cucumber Messages, so the reporters and dashboards that read Cucumber's runs read sdp's
