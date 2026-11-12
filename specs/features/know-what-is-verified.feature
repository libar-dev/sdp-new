@id=know-what-is-verified @kind=feature @maturity=ready
@realized-by:ARCH-runner @realized-by:ARCH-graph-builder @realized-by:ARCH-spec-parser
Feature: Know what is verified

  Teams, their leads and agents want to know what is built and still works — a spec, an iteration,
  a milestone — from what its scenarios did when they last ran, not from a status somebody types
  and nobody updates, and want a result to stop counting by itself once what it ran against changed.

  Not a status anyone sets: a stage is derived, never written. Not a history: each scenario keeps
  only what it did when it last ran, in the checkout where it ran.

  Background:
    Given a file "specs/REQ-cart.feature" containing:
      """
      @id=REQ-cart @maturity=ready
      Feature: Cart

        Shoppers collect items before paying.

        Rule: A cart holds what was added

          Scenario: Add an item
            Given an empty cart
            When I add a lamp
            Then the cart holds 1 item
      """

  @decided-by:declared-maturity-derived-stage
  Rule: A spec's stage is its declared maturity until its scenarios say more, then what they did when they last ran

    Undefined is not failed: a scenario nobody has automated is a specification, not a regression.

    Scenario: Until its scenarios run, a spec's stage is its declared maturity
      Given these specs:
        | tags                            | Feature  |
        | @id=REQ-wishlist @maturity=idea | Wishlist |
      When the workspace is loaded
      Then node "REQ-cart#add-an-item" has attribute status = "unrun"
      And node "REQ-cart" has attribute verification = "unrun"
      And node "REQ-cart" has attribute stage = "ready"
      And node "REQ-wishlist" has attribute verification = "none"
      And node "REQ-wishlist" has attribute stage = "idea"

    Scenario: Without step definitions a scenario is undefined, not failed, and its spec keeps the declared maturity
      When the workspace is run
      Then node "REQ-cart#add-an-item" has attribute status = "undefined"
      And node "REQ-cart" has attribute verification = "undefined"
      And node "REQ-cart" has attribute stage = "ready"

    Scenario: A scenario without steps is undefined: it automates nothing
      Given a file "specs/REQ-later.feature" containing:
        """
        @id=REQ-later @maturity=idea
        Feature: Later
          Rule: An idea is written down first
            Scenario: To be written
        """
      When the workspace is run
      Then node "REQ-later#to-be-written" has attribute status = "undefined"
      And node "REQ-later" has attribute stage = "idea"

    Scenario: A scenario stays undefined until every step has a definition
      Given a step definition "an empty cart" that passes
      And a step definition "I add a lamp" that passes
      When the workspace is run
      Then node "REQ-cart#add-an-item" has attribute status = "undefined"
      And node "REQ-cart" has attribute stage = "ready"

    Scenario Outline: All passed is verified, a failure is failing, and anything between is in-progress
      Given a step definition "an empty cart" that passes
      And a step definition "I add a lamp" that <adding>
      And a step definition "the cart holds {int} item(s)" that passes
      When the workspace is run
      Then node "REQ-cart#add-an-item" has attribute status = "<scenario>"
      And node "REQ-cart" has attribute verification = "<verification>"
      And node "REQ-cart" has attribute stage = "<stage>"

      Examples:
        | adding | scenario | verification | stage       |
        | passes | passed   | passing      | verified    |
        | pends  | pending  | partial      | in-progress |
        | fails  | failed   | failing      | failing     |

    Scenario: A spec is verified only when every one of its scenarios passed
      Given a file "specs/REQ-wishlist.feature" containing:
        """
        @id=REQ-wishlist
        Feature: Wishlist
          Rule: A wishlist keeps what a shopper wants for later
            Scenario: Keep a lamp
              Given an empty cart

            Scenario: Share the list
              Given a friend to share with
        """
      And a step definition "an empty cart" that passes
      When the workspace is run
      Then node "REQ-wishlist#keep-a-lamp" has attribute status = "passed"
      And node "REQ-wishlist#share-the-list" has attribute status = "undefined"
      And node "REQ-wishlist" has attribute verification = "partial"
      And node "REQ-wishlist" has attribute stage = "in-progress"

    Scenario Outline: A spec without a maturity, or with a stage written as one, has no stage until its scenarios say more
      Given a file "specs/REQ-csv.feature" containing:
        """
        @id=REQ-csv <maturity>
        Feature: Export to CSV

          Analysts want data in Excel.

          Rule: Every row is exported

            Scenario: Export current rows
              When I export the report
              Then I get a CSV file
        """
      And a step definition "I export the report" that passes
      When the workspace is run
      Then node "REQ-csv" has attribute stage = "undefined"

      Examples:
        | maturity           |
        |                    |
        | @maturity=verified |

    Scenario: Verification orders from none to passing, so a query can ask for everything short of it
      Given these specs:
        | tags                            | Feature  |
        | @id=REQ-wishlist @maturity=idea | Wishlist |
      And a step definition "an empty cart" that passes
      And a step definition "I add a lamp" that passes
      And a step definition "the cart holds {int} item(s)" that passes
      When the workspace is run
      And I query "requirement[verification<passing]"
      Then the result is "REQ-wishlist"
      When I query "requirement[verification>=passing]"
      Then the result is "REQ-cart"

  Rule: Every report counts stages the same way, and failing ranks with in-progress

    So status, the lifecycle and a query agree. A failing spec is no further along than one being
    automated, so the two share a place in the order; a regression is not work in progress, so
    failing keeps a name of its own.

    Scenario: An idea, a failing and a verified spec in one iteration
      Given these specs:
        | tags                                        | Feature |
        | @id=IT-beta                                 | Beta    |
        | @id=REQ-b @maturity=idea @iteration:IT-beta | B       |
      And a file "specs/REQ-a.feature" containing:
        """
        @id=REQ-a @maturity=specified @iteration:IT-beta
        Feature: A

          Something to export.

          Rule: An export saves a file

            Scenario: Export
              Then a file is saved
        """
      And a file "specs/NFR-fast.feature" containing:
        """
        @id=NFR-fast @iteration:IT-beta
        Feature: Exports are fast

          Rule: A report exports within a second

            Scenario: Within a second
              Then the guard holds
        """
      And a step definition "a file is saved" that fails
      And a step definition "the guard holds" that passes
      When the workspace is run
      Then sdp status counts the stages "failing:1 idea:1 ready:1 verified:1"
      When the lifecycle is computed
      Then the iterations are:
        | id      | stages                      |
        | IT-beta | failing:1 idea:1 verified:1 |
      When I query "*[stage>ready]"
      Then the result is "NFR-fast, REQ-a"
      When I query "*[stage<verified]"
      Then the result is "REQ-a, REQ-b, REQ-cart"
      When I query "*[stage=in-progress]"
      Then the result is "nothing"
      When I query "*[stage>=in-progress, stage<=failing]"
      Then the result is "REQ-a"

  Rule: A result counts only while what it ran against is unchanged

    After that it is stale: kept, but not counted, with the kind of change that made it so. Any
    change to the code makes every result stale: knowing which scenarios reached it would take
    tracing, and still miss what a step reads through a service. Nor is anything sdp was not told of
    watched: a service the steps call, the clock, a file `evidence.inputs` does not name.

    Scenario: Editing a scenario makes its last result stale
      Given a step definition "an empty cart" that passes
      And a step definition "I add a lamp" that passes
      And a step definition "the cart holds {int} item(s)" that passes
      When the workspace is run
      And a file "specs/REQ-cart.feature" containing:
        """
        @id=REQ-cart @maturity=ready
        Feature: Cart

          Shoppers collect items before paying.

          Rule: A cart holds what was added

            Scenario: Add an item
              Given an empty cart
              When I add two lamps
              Then the cart holds 2 items
        """
      Then node "REQ-cart#add-an-item" has attribute status = "stale"
      And node "REQ-cart#add-an-item" has attribute staleBecause = "scenario-changed"
      And node "REQ-cart" has attribute verification = "unrun"
      And node "REQ-cart" has attribute stage = "ready"

    Scenario Outline: A tag is part of the scenario, wherever it is inherited from
      Given a step definition "an empty cart" that passes
      And a step definition "I add a lamp" that passes
      And a step definition "the cart holds {int} item(s)" that passes
      When the workspace is run
      And a file "specs/REQ-cart.feature" containing:
        """
        @id=REQ-cart @maturity=ready <on the feature>
        Feature: Cart

          Shoppers collect items before paying.

          <on the rule>
          Rule: A cart holds what was added

            <on the scenario>
            Scenario: Add an item
              Given an empty cart
              When I add a lamp
              Then the cart holds 1 item
        """
      Then node "REQ-cart#add-an-item" has attribute status = "stale"
      And node "REQ-cart#add-an-item" has attribute staleBecause = "scenario-changed"

      Examples:
        | on the feature | on the rule | on the scenario |
        | @slow          |             |                 |
        |                | @slow       |                 |
        |                |             | @slow           |

    Scenario Outline: Each kind of source that changed gives its own reason
      Given a file "sdp.config.yaml" containing:
        """
        evidence:
          inputs: ["fixtures/**"]
        """
      Given a step definition "an empty cart" that passes
      And a step definition "I add a lamp" that passes
      And a step definition "the cart holds {int} item(s)" that passes
      When the workspace is run
      And a file "<file>" containing:
        """
        <content>
        """
      Then node "REQ-cart#add-an-item" has attribute status = "stale"
      And node "REQ-cart#add-an-item" has attribute staleBecause = "<reason>"
      And node "REQ-cart" has attribute stage = "ready"

      Examples:
        | file                      | content                    | reason            |
        | src/cart.ts               | export const lamps = 1     | code-changed      |
        | sdp.config.yaml           | results: .sdp/results.json | code-changed      |
        | specs/steps/cart.steps.ts | export const phrases = []  | code-changed      |
        | package-lock.json         | { "lockfileVersion": 3 }   | toolchain-changed |
        | npm-shrinkwrap.json       | { "lockfileVersion": 3 }   | toolchain-changed |
        | pnpm-lock.yaml            | lockfileVersion: "9.0"     | toolchain-changed |
        | yarn.lock                 | # yarn lockfile v1         | toolchain-changed |
        | bun.lock                  | { "lockfileVersion": 1 }   | toolchain-changed |
        | fixtures/lamps.json       | [{ "name": "Ada" }]        | inputs-changed    |

    Scenario: A scenario that reads the graph also goes stale when a spec changes
      Given a step definition "an empty cart" that passes
      And a step definition "I add a lamp" that passes
      And a step definition "the cart holds {int} item(s)" that passes
      And a file "specs/catalogue.feature" containing:
        """
        @id=REQ-catalogue
        Feature: Catalogue
          Rule: The catalogue knows the cart
            Scenario: The cart is specified
              Then the query "#REQ-cart" returns 1 result
        """
      When the workspace is run
      And these specs:
        | tags             | Feature  |
        | @id=REQ-wishlist | Wishlist |
      Then node "REQ-catalogue#the-cart-is-specified" has attribute status = "stale"
      And node "REQ-catalogue#the-cart-is-specified" has attribute staleBecause = "specs-changed"
      And node "REQ-cart#add-an-item" has attribute status = "passed"

    Scenario: Changing what step definitions import leaves their results stale, and a gate on them unmet
      Given a file "specs/MS-beta.feature" containing:
        """
        @id=MS-beta
        Feature: Beta
          Rule: The cart is verified before the beta
            Scenario: The cart works
              Then the node "REQ-cart" has stage "verified"
        """
      And a file "specs/steps/cart.steps.ts" containing:
        """
        import { defineSteps } from "sdp/steps"
        import { lamps } from "./lamps.ts"

        export default defineSteps(() => ({ items: 0 }), ({ Given, When, Then }) => {
          Given("an empty cart", () => {})
          When("I add a lamp", ({ world }) => {
            world.items += lamps
          })
          Then("the cart holds {int} item(s)", ({ args: [n], world }) => {
            if (world.items !== n) throw new Error(`the cart holds ${world.items}`)
          })
        })
        """
      And a file "specs/steps/lamps.ts" containing:
        """
        export const lamps = 1
        """
      When I run "sdp run --json"
      Then the JSON output has:
        | data.gates.passed | 1 |
      Given a file "specs/steps/lamps.ts" containing:
        """
        export const lamps = 2
        """
      When I run "sdp status --json"
      Then the JSON output has:
        | data.stale.code-changed | 2 |
      When I run "sdp gate MS-beta"
      Then the exit code is 1
      And the output contains 'REQ-cart.stage is "ready", expected "verified"'
      And the output contains "stale: 1 earlier result(s) no longer count (1 code-changed)"

    Scenario: A file a handler imports only while it runs is part of what the result ran against
      Given a file "specs/steps/cart.steps.ts" containing:
        """
        import { defineSteps } from "sdp/steps"

        export default defineSteps(() => ({ items: 0 }), ({ Given, When, Then }) => {
          Given("an empty cart", () => {})
          When("I add a lamp", async ({ world }) => {
            const { lamps } = await import("./lamps.ts")
            world.items += lamps
          })
          Then("the cart holds {int} item(s)", ({ args: [n], world }) => {
            if (world.items !== n) throw new Error(`the cart holds ${world.items}`)
          })
        })
        """
      And a file "specs/steps/lamps.ts" containing:
        """
        export const lamps = 1
        """
      When I run "sdp run --json"
      Then the JSON output has:
        | data.summary.passed | 1 |
      When I run "sdp status --json"
      Then the JSON output has:
        | data.stale | {} |
      Given a file "specs/steps/lamps.ts" containing:
        """
        export const lamps = 2
        """
      When I run "sdp status --json"
      Then the JSON output has:
        | data.stale.code-changed | 1 |

    Scenario: A file the step definitions no longer import no longer counts
      Given a file "specs/steps/cart.steps.ts" containing:
        """
        import { defineSteps } from "sdp/steps"
        import { lamps } from "./lamps.ts"

        export default defineSteps(() => ({}), ({ Step }) => {
          Step("an empty cart", () => {})
          Step("I add a lamp", () => {})
          Step("the cart holds {int} item(s)", ({ args: [n] }) => {
            if (lamps !== n) throw new Error(`the cart holds ${lamps}`)
          })
        })
        """
      And a file "specs/steps/lamps.ts" containing:
        """
        export const lamps = 1
        """
      When I run "sdp run"
      Then the output contains "1 scenario(s): 1 passed"
      And the file ".sdp/results.json" contains '"specs/steps/lamps.ts"'
      Given a file "specs/steps/cart.steps.ts" containing:
        """
        import { defineSteps } from "sdp/steps"

        export default defineSteps(() => ({}), ({ Step }) => {
          Step("an empty cart", () => {})
          Step("I add a lamp", () => {})
          Step("the cart holds {int} item(s)", () => {})
        })
        """
      When I run "sdp run"
      Then the output contains "1 scenario(s): 1 passed"
      And the file ".sdp/results.json" does not contain "lamps.ts"
      Given a file "specs/steps/lamps.ts" containing:
        """
        export const lamps = 2
        """
      When I run "sdp status --json"
      Then the exit code is 0
      And the JSON output has:
        | data.stale | {} |

    Scenario: Each result is compared with the files its own run imported
      Given a file "specs/REQ-wishlist.feature" containing:
        """
        @id=REQ-wishlist
        Feature: Wishlist
          Rule: A wishlist keeps what a shopper wants for later
            Scenario: Keep a lamp
              Given a lamp to keep
        """
      And a file "specs/steps/cart.steps.ts" containing:
        """
        import { defineSteps } from "sdp/steps"

        export default defineSteps(() => ({}), ({ Step }) => {
          Step("an empty cart", () => {})
          Step("I add a lamp", () => {})
          Step("the cart holds {int} item(s)", () => {})
          Step("a lamp to keep", async () => {
            await import("./lamps.ts")
          })
        })
        """
      And a file "specs/steps/lamps.ts" containing:
        """
        export const lamps = 1
        """
      When I run "sdp run REQ-cart --json"
      Then the JSON output has:
        | data.summary.passed | 1 |
      When I run "sdp run REQ-wishlist --json"
      Then the JSON output has:
        | data.summary.passed | 1  |
        | data.stale          | {} |
      Given a file "specs/steps/lamps.ts" containing:
        """
        export const lamps = 2
        """
      When I run "sdp q scenario[status=stale] --ids"
      Then the output lines are "REQ-wishlist#keep-a-lamp"

    Scenario: A process that imported the step modules refuses to record a run once they changed
      Given a file "specs/steps/cart.steps.ts" containing:
        """
        import { defineSteps } from "sdp/steps"
        import { lamps } from "./lamps.ts"

        export default defineSteps(() => ({}), ({ Step }) => {
          Step("an empty cart", () => {})
          Step("I add a lamp", () => {})
          Step("the cart holds {int} item(s)", ({ args: [n] }) => {
            if (lamps !== n) throw new Error(`the cart holds ${lamps}`)
          })
        })
        """
      And a file "specs/steps/lamps.ts" containing:
        """
        export const lamps = 1
        """
      When this process runs the workspace through the API
      Then the output contains "1 scenario(s): 1 passed"
      Given a file "specs/steps/lamps.ts" containing:
        """
        export const lamps = 2
        """
      When this process runs the workspace through the API
      Then the output contains "specs/steps/lamps.ts changed after this process imported it"
      And the output contains "Run again in a new process"
      When I run "sdp q scenario[status=stale] --ids"
      Then the output lines are "REQ-cart#add-an-item"
      When I run "sdp run"
      Then the exit code is 1
      And the output contains "the cart holds 2"

    Scenario: A process that imported a module refuses to record a run once the module is deleted
      Given a file "specs/steps/cart.steps.ts" containing:
        """
        import { defineSteps } from "sdp/steps"
        import { lamps } from "./lamps.ts"

        export default defineSteps(() => ({}), ({ Step }) => {
          Step("an empty cart", () => {})
          Step("I add a lamp", () => {})
          Step("the cart holds {int} item(s)", ({ args: [n] }) => {
            if (lamps !== n) throw new Error(`the cart holds ${lamps}`)
          })
        })
        """
      And a file "specs/steps/lamps.ts" containing:
        """
        export const lamps = 1
        """
      When this process runs the workspace through the API
      Then the output contains "1 scenario(s): 1 passed"
      When I run "rm specs/steps/lamps.ts"
      Then the exit code is 0
      When this process runs the workspace through the API
      Then the output contains "specs/steps/lamps.ts changed after this process imported it"
      When I run "sdp q requirement[stage=verified] --ids"
      Then the output lines are ""

    Scenario: A declared environment variable is part of the evidence, and only its digest is stored
      Given a file "sdp.config.yaml" containing:
        """
        evidence:
          env: [SHOP_REGION]
        """
      And a file "specs/steps/cart.steps.ts" containing:
        """
        import { defineSteps } from "sdp/steps"

        export default defineSteps(() => ({}), ({ Step }) => {
          Step("an empty cart", () => {})
          Step("I add a lamp", () => {})
          Step("the cart holds {int} item(s)", () => {
            if (process.env.SHOP_REGION !== "atlantis") throw new Error("no lamps here")
          })
        })
        """
      When I run "SHOP_REGION=atlantis sdp run"
      Then the output contains "1 scenario(s): 1 passed"
      And the file ".sdp/results.json" does not contain "atlantis"
      When I run "SHOP_REGION=atlantis sdp status --json"
      Then the JSON output has:
        | data.stale | {} |
      When I run "SHOP_REGION=lemuria sdp status --json"
      Then the JSON output has:
        | data.stale.inputs-changed | 1 |

  Rule: A scenario's hash covers what a step handler can observe, and nothing else

    A result counts only while its hash holds, so planning a spec, raising its maturity, naming the
    decision a rule rests on or rewording a reason leaves it valid.

    Scenario Outline: Which edits change a scenario's hash
      Given a file "specs/REQ-pay.feature" containing:
        """
        @id=REQ-pay @maturity=draft @iteration:IT-payments
        Feature: Pay

          Shoppers pay.

          @decided-by:DEC-pay-before-shipping
          Rule: An order needs a payment

            No goods leave without one.

            @slow
            Scenario: Card payment
              Given a cart with 2 items
              When the shopper pays with:
                | card | 4242 |
              Then an order is created
        """
      When "specs/REQ-pay.feature" is parsed
      And "specs/REQ-pay.feature" is parsed again after replacing "<text>" with "<replacement>"
      Then the hash of "REQ-pay#card-payment" <hash>

      Examples:
        | text                                | replacement                  | hash           |
        | 2 items                             | 3 items                      | changes        |
        | 4242                                | 4000                         | changes        |
        | @slow                               | @fast                        | changes        |
        | @id=REQ-pay                         | @id=REQ-pay @kind=story      | changes        |
        | @maturity=draft                     | @maturity=ready              | stays the same |
        | @iteration:IT-payments              | @iteration:IT-checkout       | stays the same |
        | @decided-by:DEC-pay-before-shipping | @decided-by:DEC-pay-up-front | stays the same |
        | Feature: Pay                        | Feature: Payment             | stays the same |
        | Shoppers pay.                       | Shoppers pay by card.        | stays the same |
        | No goods leave without one.         | Nothing ships unpaid.        | stays the same |

  Rule: No scenario reads the layer of evidence it belongs to

    A gate is a scenario of a milestone or one tagged @gate: it runs last and sees what the ordinary
    scenarios say. Results that read results would have no order to be evaluated in. An unmet gate
    does not fail the run, because a later milestone is expected to be unmet.

    Background:
      Given a file "specs/MS-beta.feature" containing:
        """
        @id=MS-beta
        Feature: Beta
          Rule: The cart is verified before the beta
            Scenario: The cart works
              Then the node "REQ-cart" has stage "verified"
        """

    Scenario: A gate sees the results of the scenarios that ran before it
      Given a step definition "an empty cart" that passes
      And a step definition "I add a lamp" that passes
      And a step definition "the cart holds {int} item(s)" that passes
      When the workspace is run
      Then node "MS-beta#the-cart-works" has attribute status = "passed"

    Scenario: An unmet gate is reported like any other scenario
      When the workspace is run
      Then node "MS-beta#the-cart-works" has attribute status = "failed"

    Scenario: A gate's result goes stale when the results it read change
      Given a step definition "an empty cart" that passes
      And a step definition "I add a lamp" that passes
      And a step definition "the cart holds {int} item(s)" that passes
      When the workspace is run
      And a step definition "I add a lamp" that fails
      And the workspace is run with "REQ-cart"
      Then node "REQ-cart#add-an-item" has attribute status = "failed"
      And node "MS-beta#the-cart-works" has attribute status = "stale"
      And node "MS-beta#the-cart-works" has attribute staleBecause = "results-changed"

    Scenario: Whether a scenario is a gate depends on the examples a run selects
      Given a step definition "an empty cart" that passes
      And a step definition "I add a lamp" that passes
      And a step definition "the cart holds {int} item(s)" that passes
      And a file "specs/release.feature" containing:
        """
        @id=REQ-release
        Feature: Release
          Rule: The cart is released once it is verified
            Scenario Outline: The cart is <state>
              Then the node "REQ-cart" has <attribute> "<state>"

              Examples: As authored
                | attribute | state |
                | maturity  | ready |

              @gate
              Examples: After the ordinary scenarios
                | attribute | state    |
                | stage     | verified |
        """
      When the workspace is run with "--tags 'not @gate'"
      Then the step 'the node "REQ-cart" has maturity "ready"' has status "passed"
      And node "REQ-release#the-cart-is-state" has attribute status = "skipped"

    Scenario: An ordinary scenario sees the graph without results, whatever ran before
      Given a step definition "an empty cart" that passes
      And a step definition "I add a lamp" that passes
      And a step definition "the cart holds {int} item(s)" that passes
      And a file "specs/audit.feature" containing:
        """
        @id=REQ-audit
        Feature: Audit
          Rule: An audit sees the graph as it is written
            Scenario: Look at the graph
              Then the graph shows no results
        """
      And a step definition "the graph shows no results" that finds every scenario unrun
      When the workspace is run
      And the workspace is run
      Then node "REQ-cart#add-an-item" has attribute status = "passed"
      And node "REQ-audit#look-at-the-graph" has attribute status = "passed"

    Scenario Outline: An ordinary scenario that asserts on results is told to become a gate
      Given a file "specs/progress.feature" containing:
        """
        @id=REQ-progress
        Feature: Progress
          Rule: Progress is delivery state
            Scenario: Delivery state
              Then <step>
        """
      When the workspace is run
      Then the step '<step>' has status "failed"
      And the step '<step>' reports "a scenario that asserts on delivery state is a gate: tag it @gate or put it in a milestone"

      Examples:
        | step                                                       |
        | the query "requirement[stage=verified]" returns no results |
        | the query "scenario[status=failed]" returns no results     |
        | the query "*[status=failed]" returns no results            |
        | the node "REQ-cart" has verification "passing"             |
        | the node "REQ-cart#add-an-item" has status "unrun"         |

    Scenario: A gate sees what the ordinary results say, not when or how they ran
      Given a step definition "an empty cart" that passes
      And a step definition "I add a lamp" that passes
      And a step definition "the cart holds {int} item(s)" that passes
      And a file "specs/MS-audit.feature" containing:
        """
        @id=MS-audit
        Feature: Audit
          Rule: An audit sees what the results say
            Scenario: Look at the results
              Then the graph shows what the results say and no more

            Scenario: Ask when the cart last ran
              Then the query "scenario[lastRun]" returns at least 1 result
        """
      And a step definition "the graph shows what the results say and no more" that finds statuses without run details
      When the workspace is run
      And the workspace is run with "REQ-cart"
      Then node "MS-audit#look-at-the-results" has attribute status = "passed"
      And the step 'the query "scenario[lastRun]" returns at least 1 result' reports "which no scenario sees"

    Scenario: A gate never sees the result of a gate, so none depends on another or on itself
      Given a file "specs/MS-alpha.feature" containing:
        """
        @id=MS-alpha
        Feature: Alpha
          Rule: No scenario fails
            Scenario: Nothing fails
              Then the query "scenario[status=failed]" returns no results
        """
      When the workspace is run
      And the workspace is run
      Then node "MS-beta#the-cart-works" has attribute status = "failed"
      And node "MS-alpha#nothing-fails" has attribute status = "passed"

  Rule: A run records the scenarios it executed and what they ran against, and leaves every other result as it found it

    Runs overlap: agents, shells and CI jobs record into one store.

    Scenario: A partial run keeps the results of everything else
      Given a step definition "an empty cart" that passes
      And a step definition "I add a lamp" that passes
      And a step definition "the cart holds {int} item(s)" that passes
      And a file "specs/wishlist.feature" containing:
        """
        @id=REQ-wishlist
        Feature: Wishlist
          Rule: A wishlist keeps what a shopper wants for later
            Scenario: Keep a lamp for later
              Then the query "#REQ-cart" returns 1 result
        """
      When the workspace is run
      And a file "specs/wishlist.feature" containing:
        """
        @id=REQ-wishlist
        Feature: Wishlist
          Rule: A wishlist keeps what a shopper wants for later
            Scenario: Remember a lamp
              Then the query "#REQ-cart" returns 1 result
        """
      And the workspace is run with "REQ-wishlist"
      Then node "REQ-wishlist#remember-a-lamp" has attribute status = "passed"
      And node "REQ-cart#add-an-item" has attribute status = "passed"
      And the file ".sdp/results.json" does not contain "REQ-wishlist#keep-a-lamp-for-later"

    Scenario: Two runs at once each record what they executed, and neither restores what the other replaced
      Given a file "specs/wishlist.feature" containing:
        """
        @id=REQ-wishlist
        Feature: Wishlist
          Rule: A wishlist keeps what a shopper wants for later
            Scenario: Keep a lamp for later
              Given a wishlist
        """
      And a step definition "an empty cart" that passes
      And a step definition "I add a lamp" that takes a moment
      And a step definition "the cart holds {int} item(s)" that passes
      And a step definition "a wishlist" that passes
      When the workspace is run
      And a step definition "a wishlist" that fails
      And the workspace is run for "REQ-cart" and for "REQ-wishlist" at the same time
      Then node "REQ-wishlist#keep-a-lamp-for-later" has attribute status = "failed"
      And node "REQ-cart#add-an-item" has attribute status = "passed"

    Scenario: One plain record per scenario in the results file
      Given a file "specs/steps/cart.steps.ts" containing:
        """
        import { defineSteps } from "sdp/steps"

        export default defineSteps(() => ({}), ({ Step }) => {
          Step("an empty cart", () => {})
          Step("I add a lamp", () => {})
        })
        """
      When I run "sdp run"
      Then the file ".sdp/results.json" contains '"REQ-cart#add-an-item": {'
      And the file ".sdp/results.json" contains '"status": "undefined"'
      And the file ".sdp/results.json" contains '"hash": "'
      And the file ".sdp/results.json" contains '"imports": {'
      And the file ".sdp/results.json" contains '"sources": "'
      And the file ".sdp/results.json" contains '"toolchain": "'
      And the file ".sdp/results.json" contains '"inputs": "'
      And the file ".sdp/results.json" contains '"examples": ['
      And the file ".sdp/results.json" contains '"definition": "specs/steps/cart.steps.ts:4"'
      And the file ".sdp/results.json" contains '"snippet": "Then('

    Scenario: A run that cannot get the lock on the results says which file is in its way
      Given a file ".sdp/results.json.lock" containing:
        """
        """
      When I run "sdp run"
      Then the exit code is 1
      And the output contains "another sdp run is recording results (.sdp/results.json.lock exists)"
      And the file ".sdp/results.json" does not exist
