@id=write-step-definitions
@realized-by:ARCH-runner @realized-by:ARCH-builtin-steps @realized-by:ARCH-spec-parser
Feature: Write step definitions

  Developers and agents bind each step of a spec once to code in a step module, and are told of
  every step that matches no definition, or more than one, with what to write. Checks of the specs
  themselves — fitness functions, milestone gates — are scenarios too, written without code in steps
  every run includes.

  Not Cucumber's step API: no hooks and no custom parameter types.

  Background:
    Given a file "specs/cart.feature" containing:
      """
      @id=cart
      Feature: Cart

        Shoppers collect items before paying.

        Rule: A cart holds what was added

          Scenario: Add an item
            Given an empty cart
            When I add a lamp
            Then the cart holds 1 item
      """

  Rule: What a handler returns or throws is its step's status

    Scenario Outline: A handler that <handler>
      Given a step definition "an empty cart" that <handler>
      When the workspace is run
      Then the step "an empty cart" has status "<status>"

      Examples:
        | handler                    | status  |
        | returns nothing            | passed  |
        | returns a rejected Promise | failed  |
        | returns pending()          | pending |

  Rule: A handler gets typed arguments and a world fresh for each scenario, shared by the step modules on one world factory

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
      Then node "shop#one-lamp" has attribute status = "<status>"
      And node "shop#two-lamps" has attribute status = "<status>"

      Examples:
        | checkout | status |
        | shop     | passed |
        | till     | failed |

  Rule: A scenario sees the global state the scenarios before it left

    Scenario: A scenario sees what one before it left in global state
      Given a file "specs/more.feature" containing:
        """
        @id=more
        Feature: More

          Rule: Another lamp joins the first

            Scenario: Add another
              When I add a lamp
              Then the cart holds 2 items
        """
      And a file "specs/steps/cart.steps.ts" containing:
        """
        import { defineSteps } from "sdp/steps"

        const shared = globalThis as { lamps?: number }

        export default defineSteps(() => ({}), ({ Step }) => {
          Step("an empty cart", () => {})
          Step("I add a lamp", () => {
            shared.lamps = (shared.lamps ?? 0) + 1
          })
          Step("the cart holds {int} item(s)", ({ args: [n] }) => {
            if (shared.lamps !== n) throw new Error(`the cart holds ${shared.lamps}`)
          })
        })
        """
      When I run "sdp run"
      Then the exit code is 0
      And the output contains "2 scenario(s): 2 passed"

  Rule: A step that outlasts its timeout fails and is told through its signal to stop; one that never yields, once it returns

    Code that never yields cannot be stopped while it runs.

    Scenario Outline: A handler that <handler>, past its timeout
      Given a step definition "an empty cart" that <handler>
      When the workspace is run with a step timeout of 50 ms
      Then the step "an empty cart" has status "failed"
      And the step "an empty cart" reports "step timed out"
      And the handler of "an empty cart" saw its signal abort

      Examples:
        | handler                                                    |
        | waits for its signal                                       |
        | listens to its signal and keeps the thread busy for 200 ms |

  Rule: A step may take as long as the workspace's timeout says, 30 seconds unless it says otherwise, and --timeout overrides it

    Scenario Outline: The workspace's timeout, and --timeout
      Given a file "sdp.config.yaml" containing:
        """
        <configuration>
        """
      And a file "specs/steps/cart.steps.ts" containing:
        """
        import { setTimeout } from "node:timers/promises"
        import { defineSteps } from "sdp/steps"

        export default defineSteps(() => ({}), ({ Step }) => {
          Step("an empty cart", ({ signal }) => setTimeout(1000, undefined, { signal }))
          Step("I add a lamp", () => {})
          Step("the cart holds {int} item", () => {})
        })
        """
      When I run "sdp run <option>"
      Then the exit code is <exit code>
      And the output contains "<output>"

      Examples:
        | configuration              | option          | exit code | output                  |
        | # every key at its default | --timeout 50ms  | 1         | step timed out          |
        | timeout: 50ms              |                 | 1         | step timed out          |
        | timeout: 50ms              | --timeout '5 s' | 0         | 1 scenario(s): 1 passed |

  @maturity=idea
  Rule: A step that overruns its timeout is stopped, whether or not it yields

  @maturity=idea
  Rule: No scenario sees the global state another scenario left

  Rule: Every step is matched against every definition, and each that matches none comes with a definition to start from

    So one run reports every step that is missing or ambiguous, not only the first.

    Scenario: --snippets writes one definition for each expression no definition matches
      Given a file "specs/wishlist.feature" containing:
        """
        @id=wishlist
        Feature: Wishlist
          Rule: A wishlist keeps what a shopper wants for later
            Scenario: Keep a lamp for later
              Given an empty cart
              When I add a lamp
              And I keep it for later
              Then the wishlist holds 1 item
              But the cart holds 1 item
        """
      And a file "specs/steps/cart.steps.ts" containing:
        """
        import { defineSteps } from "sdp/steps"

        export default defineSteps(() => ({}), ({ Given }) => {
          Given("an empty cart", () => {})
        })
        """
      When I run "sdp run --snippets"
      Then the exit code is 1
      And the output contains 'When("I add a lamp"' 1 time
      And the output contains 'When("I keep it for later"'
      And the output contains 'Then("the wishlist holds {int} item"'
      And the output contains 'Then("the cart holds {int} item"' 1 time
      And the output does not contain 'Given("an empty cart"'

  Rule: A step module counts once, however many names and files export it

    Scenario: A module exported under two names, and again from another file, is one module
      Given a file "specs/steps/cart.steps.ts" containing:
        """
        import { defineSteps } from "sdp/steps"

        export const steps = defineSteps(() => ({}), ({ Step }) => {
          Step("an empty cart", () => {})
          Step("I add a lamp", () => {})
          Step("the cart holds {int} item", () => {})
        })
        export default steps
        """
      And a file "specs/steps/shop.steps.ts" containing:
        """
        export { steps } from "./cart.steps.ts"
        """
      When I run "sdp run"
      Then the exit code is 0
      And the output contains "1 scenario(s): 1 passed"

  Rule: steps lists the step definitions a run would know, built-in ones included, as file:line, keyword and expression

    It answers "is there a step for this already?" before a near-duplicate is written.

    Scenario Outline: steps <text> finds the definitions that mention the text or match it as a step
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
      And the output contains "1 step definition(s)"

      Examples:
        | text                             | found                           |
        | desk lamp                        | specs/steps/search.steps.ts:4   |
        | a shopper searches for \"lamp\"  | specs/steps/search.steps.ts:5   |
        | there are no warning diagnostics | there are no {word} diagnostics |

  Rule: A built-in step passes when the graph agrees, and otherwise says what it expected and what it found

    So a rule about the specs themselves is an ordinary scenario, and needs no code.

    Scenario Outline: Where the graph differs
      Given these specs:
        | tags                                              | Feature |
        | @id=search @maturity=idea @realized-by:ARCH-index | Search  |
      And a file "src/index.ts" containing:
        """
        /** @sdp is ARCH-index */
        export const index = new Map<string, string>()
        """
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
        | step                                                     | reason                                      |
        | the query "feature" returns 3 results                    | returned 2 result(s), expected 3            |
        | every node matching "element" also matches "*[maturity]" | ARCH-index (element) src/index.ts:1         |
        | the node "search" has maturity "ready"                   | search.maturity is "idea", expected "ready" |

  Rule: A built-in step fails when its answer cannot be trusted

    "There is none" is the easiest thing to prove by accident. `sdp q` only notes what a step fails
    on: exploring is not asserting.

    Scenario Outline: A query that does not parse, or names what nothing in the workspace has
      Given these specs:
        | tags                                              | Feature |
        | @id=search @maturity=idea @realized-by:ARCH-index | Search  |
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
        | step                                                   | reason                                     |
        | the query "feature[" returns no results                | invalid query                              |
        | the query "feture" returns no results                  | no kind feture; closest: feature           |
        | the query "#serach[maturity=ready]" returns no results | no node has the id serach; closest: search |

  Rule: Only a run runs step files; every other command reads them without running them, and says what it could not read

    Asking must be safe: reading a workspace runs none of its code.

    Scenario Outline: <command> and the step file that writes a file when it runs
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
        | command          | exit | is there or not               |
        | sdp context cart | 0    | does not exist                |
        | sdp steps        | 0    | does not exist                |
        | sdp run          | 1    | contains "this step file ran" |

  Rule: Step modules, and the code they test, import sdp without installing it

    Scenario: A step module, and the application code it imports, import sdp without installing it
      Given a file "src/cart.ts" containing:
        """
        import { isAppError } from "sdp"

        export const lamp = (): number => (isAppError(undefined) ? 0 : 1)
        """
      And a file "specs/steps/cart.steps.ts" containing:
        """
        import { defineSteps } from "sdp/steps"
        import { lamp } from "../../src/cart.ts"

        export default defineSteps(() => ({ items: 0 }), ({ Given, When, Then }) => {
          Given("an empty cart", () => {})
          When("I add a lamp", ({ world }) => {
            world.items += lamp()
          })
          Then("the cart holds {int} item(s)", ({ args: [n], world }) => {
            if (world.items !== n) throw new Error(`the cart holds ${world.items}`)
          })
        })
        """
      When I run "sdp run --json"
      Then the JSON output has:
        | data.summary.passed | 1 |

  @maturity=idea
  Rule: A step definition can be scoped to an area, so that two areas say the same words and mean steps of their own

  @open @maturity=idea
  Rule: Is a step matched only by a definition of its own kind — Given, When or Then — though every step is matched against every definition today?

  @maturity=idea
  Rule: A step module defines parameter types of its own, such as an id, and steps lists them

  @maturity=idea @decided-by:a-host-runner-runs-application-suites
  Rule: A step module says what runs after each scenario, passed or failed, to clean up what its steps made
