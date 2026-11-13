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

  Rule: run executes what its targets name — a spec id, a scenario id, or a file or directory relative to the current directory — and, with --tags, only the examples whose tags match it

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

  Rule: A run whose targets or --tags select no scenario is refused, in one line that names what selected nothing

    A misspelt target or tag would otherwise run nothing and pass: a CI job that runs --tags @smok
    would stay green without running a single example.

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
      When I run "sdp run wishlist --json"
      Then the exit code is <exit code>
      And the JSON output has:
        | data.scenarios.status | <status> |

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

  Rule: A run refuses a workspace on which a result would mean nothing: a file it could not read as written, a scenario outside a rule, an example of an open question, or a maturity off the ladder

    A spec, step or code file sdp could not read as written may hold what a result rests on; an example
    outside a rule verifies no rule; one of an open question or a maturity off the ladder fails no run.
    What else sdp check rejects leaves results true: check gates it, and npm run verify runs both.

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

    Scenario: A run beside a link to no spec and an import sdp cannot follow
      Given a file "specs/reports.feature" containing:
        """
        @id=reports @maturity=idea @depends-on:mailer
        Feature: Reports
        """
      And a file "src/search.ts" containing:
        """
        /** @sdp is ARCH-search */
        import "./missing.ts"
        export const search = 1
        """
      When I run "sdp run --json"
      Then the exit code is 2
      And the JSON output has:
        | complete       | false                         |
        | data.scenarios | search#find-a-product-by-name |

  @maturity=idea
  Rule: A run can write Cucumber Messages, so the reporters and dashboards that read Cucumber's runs read sdp's
