@id=write-step-definitions
@realized-by:ARCH-runner @realized-by:ARCH-builtin-steps @realized-by:ARCH-spec-parser
Feature: Write step definitions

  Developers and agents bind each step of a spec once to code in a step module, and checks of the
  specs themselves are scenarios written without code, in steps every run includes.

  Not Cucumber's step API: a handler gets its world, its arguments and a signal as one context, and
  may return an Effect.

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

  Rule: What a handler returns or throws is its step's status; the steps after one that does not pass are skipped, but one that no definition matches is still undefined, and the scenario takes the worst status

    A run shows every step still to be written, not only those before the first that failed.

    Scenario Outline: A first step that <first step>
      Given the step definitions:
        | module | world | expression    | behaviour    |
        | steps  | steps | an empty cart | <first step> |
        | steps  | steps | I add a lamp  | passes       |
        | steps  | steps | <defined>     | passes       |
      When the workspace is run
      Then the step "an empty cart" has status "<status>"
      And the step "I add a lamp" has status "skipped"
      And the step "the cart holds 1 item" has status "<last status>"
      And the workspace node "cart#add-an-item" has attribute status = "<scenario>"

      Examples:
        | first step | defined                          | status  | last status | scenario |
        | fails      | the cart holds {int} item(s)     | failed  | skipped     | failed   |
        | pends      | the cart holds {int} item(s)     | pending | skipped     | pending  |
        | fails      | the wishlist holds {int} item(s) | failed  | undefined   | failed   |

  Rule: A rejection or an exception nobody awaited fails the step that started it while that step runs, and the run goes on; one that fails after the step fails the run once it has recorded what it ran, and one left as a step module loads fails loading, as one it throws does

    Work a step starts and does not await is still its work, and a failure that ends the run would
    lose what every other scenario showed.

    Scenario: A step starts a call it does not await, which fails while the step still runs
      Given a file "specs/wishlist.feature" containing:
        """
        @id=wishlist
        Feature: Wishlist
          Rule: A wishlist keeps what a shopper wants for later
            Scenario: Keep a lamp for later
              Given a wishlist
        """
      And a file "specs/steps/shop.steps.ts" containing:
        """
        import { defineSteps } from "sdp/steps"

        const after = (ms: number) => new Promise((done) => setTimeout(done, ms))

        export default defineSteps(() => ({}), ({ Step }) => {
          Step("an empty cart", async () => {
            void after(5).then(() => {
              throw new Error("the cart service is down")
            })
            await after(50)
          })
          Step("I add a lamp", () => {})
          Step("the cart holds {int} item(s)", () => {})
          Step("a wishlist", () => after(100))
        })
        """
      When I run "sdp run --json --concurrency 2"
      Then the exit code is 1
      And the JSON output has:
        | data.summary.failed | 1 |
        | data.summary.passed | 1 |
      And the output contains "the cart service is down"
      When I run "sdp q 'scenario[status=failed]' --ids"
      Then the output lines are "cart#add-an-item"

    Scenario: A step starts a call it does not await, which fails after the step passed
      Given a file "specs/steps/cart.steps.ts" containing:
        """
        import { defineSteps } from "sdp/steps"

        const after = (ms: number) => new Promise((done) => setTimeout(done, ms))

        export default defineSteps(() => ({}), ({ Step }) => {
          Step("an empty cart", () => {
            void after(5).then(() => {
              throw new Error("the audit log is full")
            })
          })
          Step("I add a lamp", () => after(50))
          Step("the cart holds {int} item(s)", () => {})
        })
        """
      When I run "sdp run"
      Then the exit code is 1
      And the output contains "the audit log is full"
      When I run "sdp q 'scenario[status=passed]' --ids"
      Then the output lines are "cart#add-an-item"

    Scenario: A step module leaves a rejection nobody awaits as it loads
      Given a file "specs/steps/cart.steps.ts" containing:
        """
        import { defineSteps } from "sdp/steps"

        void Promise.reject(new Error("the fixtures are missing"))
        await new Promise(() => {})

        export default defineSteps(() => ({}), ({ Step }) => {
          Step("an empty cart", () => {})
          Step("I add a lamp", () => {})
          Step("the cart holds {int} item(s)", () => {})
        })
        """
      When I run "sdp run"
      Then the exit code is 1
      And the output contains "could not load step definitions"
      And the output contains "the fixtures are missing"
      And the file ".sdp/results.json" does not exist

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

  Rule: A handler gets a world fresh for each scenario and each row of an outline, shared by the step modules on one world factory; a factory that throws fails the step that needs its world

    Scenario Outline: Two scenarios count lamps in a world the <checkout> factory makes
      Given a file "specs/shop.feature" containing:
        """
        @id=shop
        Feature: Shop
          Rule: The cart counts each lamp added
            Scenario Outline: A lamp for <shopper>
              When I add a lamp
              Then the cart holds 1 item

              Examples:
                | shopper |
                | Ada     |
                | Grace   |

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
      Then the workspace node "shop#a-lamp-for-shopper" has attribute status = "<status>"
      And the workspace node "shop#two-lamps" has attribute status = "<status>"

      Examples:
        | checkout | status |
        | shop     | passed |
        | till     | failed |

    Scenario: A world factory that throws
      Given a file "specs/steps/cart.steps.ts" containing:
        """
        import { defineSteps } from "sdp/steps"

        const database = () => {
          throw new Error("no database")
        }

        export default defineSteps(database, ({ Step }) => {
          Step("an empty cart", () => {})
          Step("I add a lamp", () => {})
          Step("the cart holds {int} item(s)", () => {})
        })
        """
      When I run "sdp run --json"
      Then the exit code is 1
      And the JSON output has:
        | data.scenarios.examples.steps.status | failed, skipped, skipped |
      And the output contains "could not create the world of specs/steps/cart.steps.ts: no database"

  Rule: A step fails once it outlasts the workspace's timeout — one that never yields, once it returns — and is told through its signal to stop; a timeout of its own fails it with its own error

    Scenario: A step that waits past a timeout of 50 ms
      Given a file "sdp.config.yaml" containing:
        """
        timeout: 50ms
        """
      And a step definition "an empty cart" that waits for its signal
      When the workspace is run
      Then the step "an empty cart" has status "failed"
      And the handler of "an empty cart" saw its signal abort

    Scenario: A step that never yields, past a timeout of 50 ms
      Given a file "sdp.config.yaml" containing:
        """
        timeout: 50ms
        """
      And a file "specs/steps/cart.steps.ts" containing:
        """
        import { defineSteps } from "sdp/steps"

        export default defineSteps(() => ({}), ({ Given }) => {
          Given("an empty cart", () => {
            const end = Date.now() + 200
            while (Date.now() < end) {}
          })
        })
        """
      When I run "sdp run --json"
      Then the exit code is 1
      And the JSON output has:
        | data.summary.failed | 1 |
      And the output contains "step timed out"

    Scenario: A step whose own call times out after 10 ms, well within the workspace's timeout
      Given the package "effect" is installed in the workspace
      And a file "specs/steps/cart.steps.ts" containing:
        """
        import { Effect } from "effect"
        import { defineSteps } from "sdp/steps"

        export default defineSteps(() => ({}), ({ Given }) => {
          Given("an empty cart", () => Effect.sleep("1 second").pipe(Effect.timeout("10 millis")))
        })
        """
      When I run "sdp run --json"
      Then the exit code is 1
      And the JSON output has:
        | data.summary.failed | 1 |
      And the output contains "Operation timed out after '10ms'"

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

  Rule: A run names each step file that exports no step module

    Its steps would otherwise read as undefined with no word of why.

    Scenario: A step module defined and not exported
      Given a file "specs/steps/cart.steps.ts" containing:
        """
        import { defineSteps } from "sdp/steps"

        defineSteps(() => ({}), ({ Given }) => {
          Given("an empty cart", () => {})
        })
        """
      When I run "sdp run --json"
      Then the exit code is 1
      And the JSON output has:
        | data.summary.undefined | 1 |
      And the output contains "specs/steps/cart.steps.ts defines no steps"

  Rule: A run refuses step definitions whose expression is malformed, and names each at its file and line

    No step could be matched against them reliably, nor against the definitions beside them.

    Scenario: An expression whose brace is not closed
      Given a file "specs/steps/cart.steps.ts" containing:
        """
        import { defineSteps } from "sdp/steps"

        export default defineSteps(() => ({}), ({ Given, When }) => {
          Given("an empty cart", () => {})
          When("I add {int lamps", () => {})
        })
        """
      When I run "sdp run"
      Then the exit code is 1
      And the output contains "specs/steps/cart.steps.ts:5: invalid step expression"
      And the file ".sdp/results.json" does not exist

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
      When I run "sdp steps '<text>' --json"
      Then the JSON output has:
        | data.expression | <found> |

      Examples:
        | text                             | found                              |
        | desk lamp                        | a catalogue with a desk lamp       |
        | a shopper searches for \"lamp\"  | /^a shopper searches for "(.*)"$/ |
        | there are no warning diagnostics | there are no {word} diagnostics    |

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

  Rule: A program that runs the specs through the API keeps its own imports of sdp

    The program may have another package by that name, or another version of sdp: only the step
    modules, and the code they test, import the sdp that runs them.

    Scenario: A program with a package of its own named sdp runs the specs
      Given a file "node_modules/sdp/package.json" containing:
        """
        { "name": "sdp", "type": "module", "exports": "./index.js" }
        """
      And a file "node_modules/sdp/index.js" containing:
        """
        export const name = "a session description parser"
        """
      And a file "specs/steps/cart.steps.ts" containing:
        """
        import { defineSteps } from "sdp/steps"

        export default defineSteps(() => ({}), ({ Step }) => {
          Step("an empty cart", () => {})
          Step("I add a lamp", () => {})
          Step("the cart holds {int} item(s)", () => {})
        })
        """
      When a program runs:
        """
        import { run } from "$SDP"

        const report = await run(".")
        const own = await import("sdp")
        console.log(JSON.stringify({ passed: report.data.summary.passed, sdp: own.name ?? "the sdp that ran the specs" }))
        """
      Then the exit code is 0
      And the JSON output has:
        | passed | 1                             |
        | sdp    | a session description parser |

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
