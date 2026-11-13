@id=write-step-definitions
@realized-by:ARCH-runner @realized-by:ARCH-builtin-steps @realized-by:ARCH-spec-parser
Feature: Write step definitions

  Developers and agents bind each step of a spec once to code in a step module, and checks of the
  specs themselves are scenarios written without code, in steps every run includes.

  Not Cucumber's step API: no hooks and no custom parameter types.

  Background:
    Given a file "specs/cart.feature" containing:
      """
      @id=cart
      Feature: Cart

        Rule: A cart holds what was added

          Scenario: Add an item
            Given an empty cart
            When I add a lamp
            Then the cart holds 1 item
      """

  Rule: What a handler returns or throws is its step's status; the steps after one that does not pass are skipped, and the scenario takes the worst status

    Scenario Outline: A first step that <first step>
      Given the step definitions:
        | module | world | expression    | behaviour    |
        | steps  | steps | an empty cart | <first step> |
        | steps  | steps | I add a lamp  | passes       |
      When the workspace is run
      Then the step "an empty cart" has status "<status>"
      And the step "I add a lamp" has status "skipped"
      And node "cart#add-an-item" has attribute status = "<scenario>"

      Examples:
        | first step | status  | scenario  |
        | fails      | failed  | failed    |
        | pends      | pending | undefined |

  Rule: A handler gets the step's arguments, typed by its expression, and its doc string or data table

    Scenario: A price and a list
      Given a file "specs/pricing.feature" containing:
        """
        Feature: Pricing
          Scenario: Price a lamp
            Given 3 lamps cost 19.5
            And the list:
              | milk  | 1 |
              | bread | 2 |
        """
      And a step definition "{int} lamps cost {float}" that records its arguments
      And a step definition "the list:" that records its arguments
      When the workspace is run
      Then the handler received the arguments [3, 19.5]
      And the handler received the table:
        | milk  | 1 |
        | bread | 2 |

  Rule: A handler gets a world fresh for each scenario, shared by the step modules on one world factory

    Scenario Outline: Two scenarios count lamps in a world the <checkout> factory makes
      Given a file "specs/shop.feature" containing:
        """
        @id=shop
        Feature: Shop
          Rule: The cart counts each lamp added
            Scenario: One lamp
              When I add a lamp
              Then the cart holds 1 item

            Scenario: Two lamps
              When I add a lamp
              And I add a lamp
              Then the cart holds 2 items
        """
      And the step definitions:
        | module   | world      | expression                   | behaviour                     |
        | cart     | shop       | I add a lamp                 | adds an item to its world     |
        | checkout | <checkout> | the cart holds {int} item(s) | checks the items in its world |
      When the workspace is run
      Then node "shop#two-lamps" has attribute status = "<status>"

      Examples:
        | checkout | status |
        | shop     | passed |
        | till     | failed |

  Rule: A step fails once it outlasts the workspace's timeout, and is told through its signal to stop

    Scenario: A step that waits past a timeout of 50 ms
      Given a file "sdp.config.yaml" containing:
        """
        timeout: 50ms
        """
      And a step definition "an empty cart" that waits for its signal
      When the workspace is run
      Then the step "an empty cart" has status "failed"
      And the handler of "an empty cart" saw its signal abort

  Rule: --snippets writes a definition to start from for each step that matches none

    Scenario: Two steps without a definition
      Given a file "specs/steps/cart.steps.ts" containing:
        """
        import { defineSteps } from "sdp/steps"

        export default defineSteps(() => ({}), ({ Given }) => {
          Given("an empty cart", () => {})
        })
        """
      When I run "sdp run --snippets"
      Then the exit code is 1
      And the output contains 'When("I add a lamp"'
      And the output contains 'Then("the cart holds {int} item"'
      And the output does not contain 'Given("an empty cart"'

  Rule: steps lists the step definitions a run would know, built-in ones included, that mention a text or match it

    Scenario Outline: Find the definitions for '<text>'
      Given a file "specs/steps/search.steps.ts" containing:
        """
        import { defineSteps } from "sdp/steps"

        export default defineSteps(() => ({}), ({ Given, When }) => {
          Given("a catalogue with a desk lamp", () => {})
          When(/^a shopper searches for "(.*)"$/, () => {})
        })
        """
      When I run "sdp steps '<text>'"
      Then the output contains "<found>"

      Examples:
        | text                             | found                           |
        | desk lamp                        | specs/steps/search.steps.ts:4   |
        | a shopper searches for \"lamp\"  | specs/steps/search.steps.ts:5   |
        | there are no warning diagnostics | there are no {word} diagnostics |

  Rule: A built-in step passes when the graph agrees, and otherwise says what it expected and what it found, or why its answer cannot be trusted

    Scenario Outline: A built-in step that does not hold: <step>
      Given these specs:
        | tags                      | Feature |
        | @id=search @maturity=idea | Search  |
      And a file "specs/guard.feature" containing:
        """
        Feature: Guard
          Scenario: Guard
            Then <step>
        """
      When the workspace is run
      Then the step '<step>' has status "failed"
      And the step '<step>' reports '<reason>'

      Examples:
        | step                                   | reason                                      |
        | the query "feature" returns 3 results  | returned 2 result(s), expected 3            |
        | the node "search" has maturity "ready" | search.maturity is "idea", expected "ready" |
        | the query "feture" returns no results  | no kind feture; closest: feature            |

  Rule: Only a run runs step files; every other command reads them without running them

    Scenario Outline: <command> and a step file that writes a file when it runs
      Given a file "specs/steps/cart.steps.ts" containing:
        """
        import { writeFileSync } from "node:fs"
        import { defineSteps } from "sdp/steps"

        writeFileSync("executed.txt", "this step file ran")

        export default defineSteps(() => ({}), ({ Given }) => {
          Given("an empty cart", () => {})
        })
        """
      When I run "<command>"
      Then the exit code is <exit>
      And the file "executed.txt" <is there or not>

      Examples:
        | command   | exit | is there or not               |
        | sdp steps | 0    | does not exist                |
        | sdp run   | 1    | contains "this step file ran" |

  Rule: Step modules, and the code they test, import sdp without installing it

    Scenario: A step module, and the code it imports, import sdp
      Given a file "src/cart.ts" containing:
        """
        import { isAppError } from "sdp"
        export const lamp = (): number => (isAppError(undefined) ? 0 : 1)
        """
      And a file "specs/steps/cart.steps.ts" containing:
        """
        import { defineSteps } from "sdp/steps"
        import { lamp } from "../../src/cart.ts"

        export default defineSteps(() => ({}), ({ Step }) => {
          Step("an empty cart", () => {})
          Step("I add a lamp", () => {})
          Step("the cart holds {int} item(s)", ({ args: [n] }) => {
            if (lamp() !== n) throw new Error(`the cart holds ${lamp()}`)
          })
        })
        """
      When I run "sdp run --json"
      Then the JSON output has:
        | data.summary.passed | 1 |

  @maturity=idea
  Rule: Each scenario runs apart: it sees no global state another left, and a step past its timeout is stopped whether or not it yields

  @maturity=idea
  Rule: A step definition can be scoped to an area, so that two areas say the same words and mean steps of their own

  @open @maturity=idea
  Rule: Is a step matched only by a definition of its own kind — Given, When or Then — though every step is matched against every definition today?

  @maturity=idea
  Rule: A step module defines parameter types of its own, such as an id, and steps lists them

  @maturity=idea @decided-by:a-host-runner-runs-application-suites
  Rule: A step module says what runs after each scenario, passed or failed, to clean up what its steps made
