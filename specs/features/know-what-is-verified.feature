@id=know-what-is-verified @maturity=implemented
@realized-by:ARCH-runner @realized-by:ARCH-graph-builder @realized-by:ARCH-spec-parser
Feature: Know what is verified

  Teams, their leads and agents want to know what is built and still works — a spec, an iteration,
  a milestone — from what its scenarios did when they last ran, not from a status somebody types
  and nobody updates, and want a result to stop counting by itself once what it ran against changed.

  Not a status anyone sets: a stage is derived, never written. Not a history: each scenario keeps
  only what it did when it last ran, in the checkout where it ran.

  Background:
    Given a file "specs/cart.feature" containing:
      """
      @id=cart @maturity=implemented
      Feature: Cart

        Shoppers collect items before paying.

        Rule: A cart holds what was added

          Scenario: Add an item
            Given an empty cart
            When I add a lamp
            Then the cart holds 1 item
      """

  @decided-by:declared-maturity-derived-stage
  Rule: Work still to come stays at its maturity; implemented work, at what its examples did

    Before it is built, an example is the specification of work still to come. Implemented promises
    that its examples pass, so one that does not makes it failing: a regression is not work in
    progress.

    Scenario: Until its scenarios run, a spec's stage is its declared maturity
      Given these specs:
        | tags                        | Feature  |
        | @id=wishlist @maturity=idea | Wishlist |
      When the workspace is loaded
      Then node "cart#add-an-item" has attribute status = "unrun"
      And node "cart" has attribute verification = "unrun"
      And node "cart" has attribute stage = "implemented"
      And node "wishlist" has attribute verification = "none"
      And node "wishlist" has attribute stage = "idea"

    Scenario Outline: Work still to come stays at its maturity, whatever its examples did
      Given a file "specs/wishlist.feature" containing:
        """
        @id=wishlist @maturity=specified
        Feature: Wishlist

          Shoppers keep what they want for later.

          Rule: A wishlist keeps a lamp

            Scenario: Keep a lamp
              Then the wishlist holds a lamp
        """
      And a step definition "the wishlist holds a lamp" that <holding>
      When the workspace is run
      Then node "wishlist#keep-a-lamp" has attribute status = "<status>"
      And node "wishlist" has attribute verification = "<verification>"
      And node "wishlist" has attribute stage = "specified"
      And node "wishlist" has attribute toCome = "true"

      Examples:
        | holding | status  | verification |
        | passes  | passed  | passing      |
        | fails   | failed  | failing      |
        | pends   | pending | partial      |

    Scenario: Without step definitions a scenario is undefined, and implemented work with one is failing
      When the workspace is run
      Then node "cart#add-an-item" has attribute status = "undefined"
      And node "cart" has attribute verification = "undefined"
      And node "cart" has attribute stage = "failing"

    Scenario: A scenario without steps is undefined: it automates nothing
      Given a file "specs/later.feature" containing:
        """
        @id=later @maturity=idea
        Feature: Later
          Rule: An idea is written down first
            Scenario: To be written
        """
      When the workspace is run
      Then node "later#to-be-written" has attribute status = "undefined"
      And node "later" has attribute stage = "idea"

    Scenario: A scenario stays undefined until every step has a definition
      Given a step definition "an empty cart" that passes
      And a step definition "I add a lamp" that passes
      When the workspace is run
      Then node "cart#add-an-item" has attribute status = "undefined"
      And node "cart" has attribute stage = "failing"

    Scenario Outline: All passed is verified, and an example that fails or is pending is failing
      Given a step definition "an empty cart" that passes
      And a step definition "I add a lamp" that <adding>
      And a step definition "the cart holds {int} item(s)" that passes
      When the workspace is run
      Then node "cart#add-an-item" has attribute status = "<scenario>"
      And node "cart" has attribute verification = "<verification>"
      And node "cart" has attribute stage = "<stage>"

      Examples:
        | adding | scenario | verification | stage    |
        | passes | passed   | passing      | verified |
        | pends  | pending  | partial      | failing  |
        | fails  | failed   | failing      | failing  |

    Scenario: A spec is verified only when every one of its scenarios passed, and in-progress while some have not run
      Given a file "specs/wishlist.feature" containing:
        """
        @id=wishlist @maturity=implemented
        Feature: Wishlist

          Shoppers keep what they want for later.

          Rule: A wishlist keeps what a shopper wants for later

            Scenario: Keep a lamp
              Then the wishlist holds a lamp

            Scenario: Share the list
              Then a friend sees the list
        """
      And a step definition "the wishlist holds a lamp" that passes
      When the workspace is run with "wishlist#keep-a-lamp"
      Then node "wishlist#keep-a-lamp" has attribute status = "passed"
      And node "wishlist#share-the-list" has attribute status = "unrun"
      And node "wishlist" has attribute verification = "partial"
      And node "wishlist" has attribute stage = "in-progress"

    Scenario: A spec without a maturity is implemented: it has no stage until its scenarios say more
      Given a file "specs/export-to-csv.feature" containing:
        """
        @id=export-to-csv
        Feature: Export to CSV

          Analysts want data in Excel.

          Rule: Every row is exported

            Scenario: Export current rows
              When I export the report
              Then I get a CSV file
        """
      And a step definition "I export the report" that passes
      When the workspace is loaded
      Then node "export-to-csv" has attribute stage = "undefined"
      When the workspace is run
      Then node "export-to-csv" has attribute stage = "failing"
      And node "export-to-csv" has attribute toCome = "undefined"

    Scenario: A stage written as a maturity is implemented, and no run starts until it is fixed
      Given a file "specs/export-to-csv.feature" containing:
        """
        @id=export-to-csv @maturity=verified
        Feature: Export to CSV

          Analysts want data in Excel.

          Rule: Every row is exported

            Scenario: Export current rows
              Then I get a CSV file
        """
      When the workspace is loaded
      Then node "export-to-csv" has attribute stage = "undefined"
      And node "export-to-csv" has attribute toCome = "undefined"
      When I run "sdp run"
      Then the exit code is 1
      And the output contains "specs/export-to-csv.feature:1 [maturity-value]"

    Scenario: Verification orders from none to passing, so a query can ask for everything short of it
      Given these specs:
        | tags                        | Feature  |
        | @id=wishlist @maturity=idea | Wishlist |
      And a step definition "an empty cart" that passes
      And a step definition "I add a lamp" that passes
      And a step definition "the cart holds {int} item(s)" that passes
      When the workspace is run
      And I query "feature[verification<passing]"
      Then the result is "wishlist"
      When I query "feature[verification>=passing]"
      Then the result is "cart"

  Rule: An implemented feature is verified when its implemented rules pass

    A rule still to come neither fails it nor makes it verified, and `rulesToCome` counts them; an
    implemented rule without an example yet keeps it from verified. Each rule has a stage of its own.

    Scenario Outline: A cart that holds what was added, with a rule still to come that <later> and a question
      Given a file "specs/cart.feature" containing:
        """
        @id=cart @maturity=implemented
        Feature: Cart

          Shoppers collect items before paying.

          Rule: A cart holds what was added

            Scenario: Add an item
              Given an empty cart
              When I add a lamp
              Then the cart holds 1 item

          @maturity=ready
          Rule: A cart is kept for a week

            Scenario: Come back to the cart
              Then the cart is kept

          @open
          Rule: Does a cart expire?
        """
      And a step definition "an empty cart" that passes
      And a step definition "I add a lamp" that <adding>
      And a step definition "the cart holds {int} item(s)" that passes
      And a step definition "the cart is kept" that <later>
      When the workspace is run
      Then node "cart" has attribute stage = "<stage>"
      And node "cart" has attribute rulesToCome = "2"
      And node "cart#a-cart-holds-what-was-added" has attribute stage = "<stage>"
      And node "cart#a-cart-is-kept-for-a-week" has attribute stage = "ready"
      And node "cart#a-cart-is-kept-for-a-week" has attribute verification = "<verification>"

      Examples:
        | adding | later  | stage    | verification |
        | passes | fails  | verified | failing      |
        | fails  | passes | failing  | passing      |

    Scenario Outline: A rule <declaring> that has no example yet keeps its feature from verified
      Given a file "specs/cart.feature" containing:
        """
        @id=cart @maturity=implemented
        Feature: Cart

          Shoppers collect items before paying.

          Rule: A cart holds what was added

            Scenario: Add an item
              Then the cart holds 1 item

          <tags>
          Rule: A cart is emptied once paid
        """
      And a step definition "the cart holds {int} item(s)" that passes
      When the workspace is run
      Then node "cart#a-cart-holds-what-was-added" has attribute stage = "verified"
      And node "cart" has attribute stage = "in-progress"
      When I query "feature[stage=verified]"
      Then the result has 0 nodes

      Examples:
        | declaring                    | tags                  |
        | with its feature's maturity  |                       |
        | that declares it implemented | @maturity=implemented |

  Rule: Every report counts stages the same way, and failing ranks with in-progress

    So status, the lifecycle and a query agree. A failing spec is no further along than one being
    automated, so the two share a place in the order; a regression is not work in progress, so
    failing keeps a name of its own.

    Scenario: An idea, a failing and a verified spec in one iteration
      Given these specs:
        | tags                                           | Feature  |
        | @id=IT-beta                                    | Beta     |
        | @id=wishlist @maturity=idea @iteration:IT-beta | Wishlist |
      And a file "specs/export.feature" containing:
        """
        @id=export @maturity=implemented @iteration:IT-beta
        Feature: Export

          Something to export.

          Rule: An export saves a file

            Scenario: Export
              Then a file is saved
        """
      And a file "specs/fast-exports.feature" containing:
        """
        @id=fast-exports @kind=nfr @maturity=implemented @iteration:IT-beta
        Feature: Exports are fast

          Rule: A report exports within a second

            Scenario: Within a second
              Then the guard holds
        """
      And a step definition "a file is saved" that fails
      And a step definition "the guard holds" that passes
      When the workspace is run with "export fast-exports"
      Then sdp status counts the stages "failing:1 idea:1 implemented:1 verified:1"
      When the lifecycle is computed
      Then the iterations are:
        | id      | stages                      |
        | IT-beta | failing:1 idea:1 verified:1 |
      When I query "feature|nfr[stage>ready]"
      Then the result is "cart, export, fast-exports"
      When I query "feature|nfr[stage<verified]"
      Then the result is "cart, export, wishlist"
      When I query "feature|nfr[stage=in-progress]"
      Then the result is "nothing"
      When I query "feature|nfr[stage>=in-progress, stage<=failing]"
      Then the result is "export"

  Rule: A result counts only while what it ran against is unchanged

    After that it is stale: kept, but not counted, with the kind of change that made it so.

    Scenario: Once the code a result ran against changed, a gate on it is unmet, and sdp says why
      Given a file "specs/MS-beta.feature" containing:
        """
        @id=MS-beta
        Feature: Beta
          Rule: The cart is verified before the beta
            Scenario: The cart works
              Then the node "cart" has stage "verified"
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
      And the output contains 'cart.stage is "implemented", expected "verified"'
      And the output contains "stale: 1 earlier result(s) no longer count (1 code-changed)"

  Rule: Editing a scenario, a tag it inherits included, makes its result stale; planning or rewording its spec does not

    A scenario's hash covers what a step handler can observe, and nothing else, and a result counts
    only while its hash holds: planning a spec, raising its maturity, naming the decision a rule
    rests on or rewording a reason leaves it valid, unless the scenario reads the graph.

    Scenario Outline: Its steps, or a tag on the scenario, its rule or its feature, are edited
      Given a step definition "an empty cart" that passes
      And a step definition "I add a lamp" that passes
      And a step definition "the cart holds {int} item(s)" that passes
      When the workspace is run
      And a file "specs/cart.feature" containing:
        """
        @id=cart @maturity=implemented <on the feature>
        Feature: Cart

          Shoppers collect items before paying.

          <on the rule>
          Rule: A cart holds what was added

            <on the scenario>
            Scenario: Add an item
              Given an empty cart
              When I add <added>
              Then the cart holds <held>
        """
      Then node "cart#add-an-item" has attribute status = "stale"
      And node "cart#add-an-item" has attribute staleBecause = "scenario-changed"
      And node "cart" has attribute verification = "unrun"
      And node "cart" has attribute stage = "implemented"

      Examples:
        | added     | held    | on the feature | on the rule | on the scenario |
        | two lamps | 2 items |                |             |                 |
        | a lamp    | 1 item  | @slow          |             |                 |
        | a lamp    | 1 item  |                | @slow       |                 |
        | a lamp    | 1 item  |                |             | @slow           |

    Scenario Outline: Which edits change a scenario's hash
      Given a file "specs/pay.feature" containing:
        """
        @id=pay @maturity=draft @iteration:IT-payments
        Feature: Pay

          Shoppers pay.

          @decided-by:pay-before-shipping
          Rule: An order needs a payment

            No goods leave without one.

            @slow
            Scenario: Card payment
              Given a cart with 2 items
              When the shopper pays with:
                | card | 4242 |
              Then an order is created
        """
      When "specs/pay.feature" is parsed
      And "specs/pay.feature" is parsed again after replacing "<text>" with "<replacement>"
      Then the hash of "pay#card-payment" <hash>

      Examples:
        | text                            | replacement              | hash           |
        | 2 items                         | 3 items                  | changes        |
        | 4242                            | 4000                     | changes        |
        | @slow                           | @fast                    | changes        |
        | @id=pay                         | @id=pay @kind=story      | changes        |
        | @maturity=draft                 | @maturity=implemented    | stays the same |
        | @iteration:IT-payments          | @iteration:IT-checkout   | stays the same |
        | @decided-by:pay-before-shipping | @decided-by:pay-up-front | stays the same |
        | Feature: Pay                    | Feature: Payment         | stays the same |
        | Shoppers pay.                   | Shoppers pay by card.    | stays the same |
        | No goods leave without one.     | Nothing ships unpaid.    | stays the same |


  Rule: Declaring work implemented keeps the results of its examples

    Maturity is no part of an example's hash, so a failure it was allowed fails the next run, and a
    result that reads the graph goes stale as on any change to a spec.

    Scenario: A wishlist still to come is declared implemented while its example fails
      Given a file "specs/wishlist.feature" containing:
        """
        @id=wishlist @maturity=ready
        Feature: Wishlist

          Shoppers keep what they want for later.

          Rule: A wishlist keeps what a shopper wants for later

            Scenario: Keep a lamp
              Then the wishlist holds a lamp
        """
      And a file "specs/steps/wishlist.steps.ts" containing:
        """
        import { defineSteps } from "sdp/steps"

        export default defineSteps(() => ({}), ({ Then }) => {
          Then("the wishlist holds a lamp", () => {
            throw new Error("the wishlist is empty")
          })
        })
        """
      When I run "sdp run wishlist"
      Then the exit code is 0
      Given a file "specs/wishlist.feature" containing:
        """
        @id=wishlist @maturity=implemented
        Feature: Wishlist

          Shoppers keep what they want for later.

          Rule: A wishlist keeps what a shopper wants for later

            Scenario: Keep a lamp
              Then the wishlist holds a lamp
        """
      When I run "sdp q 'scenario[!toCome][status=failed]' --ids"
      Then the output lines are "wishlist#keep-a-lamp"
      When I run "sdp q '#wishlist[stage=failing]' --ids"
      Then the output lines are "wishlist"
      When I run "sdp run wishlist"
      Then the exit code is 1

  Rule: Any change to the code, the step definitions or the configuration makes every result stale

    Knowing which scenarios reached a change would take tracing, and still miss what a step reads
    through a service.

    Scenario Outline: A code file, the configuration or a step definition file changes
      Given a step definition "an empty cart" that passes
      And a step definition "I add a lamp" that passes
      And a step definition "the cart holds {int} item(s)" that passes
      When the workspace is run
      And a file "<file>" containing:
        """
        <content>
        """
      Then node "cart#add-an-item" has attribute status = "stale"
      And node "cart#add-an-item" has attribute staleBecause = "code-changed"
      And node "cart" has attribute stage = "implemented"

      Examples:
        | file                      | content                    |
        | src/cart.ts               | export const lamps = 1     |
        | sdp.config.yaml           | results: .sdp/results.json |
        | specs/steps/cart.steps.ts | export const phrases = []  |

  Rule: A file a handler imports only while it runs is part of what its result ran against

    What step modules import is part of what scenarios run against, so every local import is
    recorded with the source that was loaded, also one a handler makes while it runs.

    Scenario: A handler imports a file while it runs
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

  Rule: Each result is compared with the files its own run imported

    So a file no step definition imports any more stops counting, and a partial run that reaches a
    new file leaves the results of earlier runs standing.

    Background:
      Given a file "specs/steps/lamps.ts" containing:
        """
        export const lamps = 1
        """

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

    Scenario: A file only a later, partial run imported concerns only that run's results
      Given a file "specs/wishlist.feature" containing:
        """
        @id=wishlist
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
      When I run "sdp run cart --json"
      Then the JSON output has:
        | data.summary.passed | 1 |
      When I run "sdp run wishlist --json"
      Then the JSON output has:
        | data.summary.passed | 1  |
        | data.stale          | {} |
      Given a file "specs/steps/lamps.ts" containing:
        """
        export const lamps = 2
        """
      When I run "sdp q scenario[status=stale] --ids"
      Then the output lines are "wishlist#keep-a-lamp"

  Rule: A long-lived process records no run once a module it imported changed or was deleted

    Node.js keeps a module for the life of a process: the changed code did not run, and a result
    would certify code that never ran. A module that is gone is as changed as one whose content
    differs.

    Background:
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

    Scenario: A module the process imported changed
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
      Then the output lines are "cart#add-an-item"
      When I run "sdp run"
      Then the exit code is 1
      And the output contains "the cart holds 2"

    Scenario: A module the process imported was deleted
      When this process runs the workspace through the API
      Then the output contains "1 scenario(s): 1 passed"
      When I run "rm specs/steps/lamps.ts"
      Then the exit code is 0
      When this process runs the workspace through the API
      Then the output contains "specs/steps/lamps.ts changed after this process imported it"
      When I run "sdp q feature[stage=verified] --ids"
      Then the output lines are ""

  Rule: A result goes stale when a lockfile at the workspace root changes

    A lockfile pins the packages the code and the steps run with.

    Scenario Outline: Each lockfile a package manager writes
      Given a step definition "an empty cart" that passes
      And a step definition "I add a lamp" that passes
      And a step definition "the cart holds {int} item(s)" that passes
      When the workspace is run
      And a file "<file>" containing:
        """
        <content>
        """
      Then node "cart#add-an-item" has attribute status = "stale"
      And node "cart#add-an-item" has attribute staleBecause = "toolchain-changed"
      And node "cart" has attribute stage = "implemented"

      Examples:
        | file                | content                  |
        | package-lock.json   | { "lockfileVersion": 3 } |
        | npm-shrinkwrap.json | { "lockfileVersion": 3 } |
        | pnpm-lock.yaml      | lockfileVersion: "9.0"   |
        | yarn.lock           | # yarn lockfile v1       |
        | bun.lock            | { "lockfileVersion": 1 } |

  Rule: A result goes stale when an input the workspace declares changes: a file of `evidence.inputs`, a variable of `evidence.env`

    What the steps read besides the code — fixtures, data, the environment — counts only where the
    workspace declares it. Nothing sdp was not told of is watched: a service the steps call, the
    clock, a file `evidence.inputs` does not name.

    Background:
      Given a file "sdp.config.yaml" containing:
        """
        evidence:
          inputs: ["fixtures/**"]
          env: [SHOP_REGION]
        """

    Scenario: A file of evidence.inputs changes
      Given a step definition "an empty cart" that passes
      And a step definition "I add a lamp" that passes
      And a step definition "the cart holds {int} item(s)" that passes
      When the workspace is run
      And a file "fixtures/lamps.json" containing:
        """
        [{ "name": "Ada" }]
        """
      Then node "cart#add-an-item" has attribute status = "stale"
      And node "cart#add-an-item" has attribute staleBecause = "inputs-changed"
      And node "cart" has attribute stage = "implemented"

    Scenario: A variable of evidence.env has another value, and only a digest of its value is stored
      When I run "SHOP_REGION=atlantis sdp run"
      Then the exit code is 1
      And the output contains "1 scenario(s): 1 undefined"
      And the file ".sdp/results.json" does not contain "atlantis"
      When I run "SHOP_REGION=atlantis sdp status --json"
      Then the JSON output has:
        | data.stale | {} |
      When I run "SHOP_REGION=lemuria sdp status --json"
      Then the JSON output has:
        | data.stale.inputs-changed | 1 |

  Rule: A scenario that reads the graph goes stale when any spec changes; one that does not keeps its result

    What a step that reads the graph sees is built from every spec and the id declarations.

    Scenario: Another spec is added
      Given a step definition "an empty cart" that passes
      And a step definition "I add a lamp" that passes
      And a step definition "the cart holds {int} item(s)" that passes
      And a file "specs/catalogue.feature" containing:
        """
        @id=catalogue
        Feature: Catalogue
          Rule: The catalogue knows the cart
            Scenario: The cart is specified
              Then the query "#cart" returns 1 result
        """
      When the workspace is run
      And these specs:
        | tags         | Feature  |
        | @id=wishlist | Wishlist |
      Then node "catalogue#the-cart-is-specified" has attribute status = "stale"
      And node "catalogue#the-cart-is-specified" has attribute staleBecause = "specs-changed"
      And node "cart#add-an-item" has attribute status = "passed"

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
              Then the node "cart" has stage "verified"
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
      And the workspace is run with "cart"
      Then node "cart#add-an-item" has attribute status = "failed"
      And node "MS-beta#the-cart-works" has attribute status = "stale"
      And node "MS-beta#the-cart-works" has attribute staleBecause = "results-changed"

    Scenario: Whether a scenario is a gate depends on the examples a run selects
      Given a step definition "an empty cart" that passes
      And a step definition "I add a lamp" that passes
      And a step definition "the cart holds {int} item(s)" that passes
      And a file "specs/release.feature" containing:
        """
        @id=release
        Feature: Release
          Rule: The cart is released once it is verified
            Scenario Outline: The cart is <state>
              Then the node "cart" has <attribute> "<state>"

              Examples: As authored
                | attribute | state       |
                | maturity  | implemented |

              @gate
              Examples: After the ordinary scenarios
                | attribute | state    |
                | stage     | verified |
        """
      When the workspace is run with "--tags 'not @gate'"
      Then the step 'the node "cart" has maturity "implemented"' has status "passed"
      And node "release#the-cart-is-state" has attribute status = "skipped"

    Scenario: An ordinary scenario sees the graph without results, whatever ran before
      Given a step definition "an empty cart" that passes
      And a step definition "I add a lamp" that passes
      And a step definition "the cart holds {int} item(s)" that passes
      And a file "specs/audit.feature" containing:
        """
        @id=audit
        Feature: Audit
          Rule: An audit sees the graph as it is written
            Scenario: Look at the graph
              Then the graph shows no results
        """
      And a step definition "the graph shows no results" that finds every scenario unrun
      When the workspace is run
      And the workspace is run
      Then node "cart#add-an-item" has attribute status = "passed"
      And node "audit#look-at-the-graph" has attribute status = "passed"

    Scenario Outline: An ordinary scenario that asserts on results is told to become a gate
      Given a file "specs/progress.feature" containing:
        """
        @id=progress
        Feature: Progress
          Rule: Progress is delivery state
            Scenario: Delivery state
              Then <step>
        """
      When the workspace is run
      Then the step '<step>' has status "failed"
      And the step '<step>' reports "a scenario that asserts on delivery state is a gate: tag it @gate or put it in a milestone"

      Examples:
        | step                                                   |
        | the query "feature[stage=verified]" returns no results |
        | the query "scenario[status=failed]" returns no results |
        | the query "*[status=failed]" returns no results        |
        | the node "cart" has verification "passing"             |
        | the node "cart#add-an-item" has status "unrun"         |

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
      And the workspace is run with "cart"
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
        @id=wishlist
        Feature: Wishlist
          Rule: A wishlist keeps what a shopper wants for later
            Scenario: Keep a lamp for later
              Then the query "#cart" returns 1 result
        """
      When the workspace is run
      And a file "specs/wishlist.feature" containing:
        """
        @id=wishlist
        Feature: Wishlist
          Rule: A wishlist keeps what a shopper wants for later
            Scenario: Remember a lamp
              Then the query "#cart" returns 1 result
        """
      And the workspace is run with "wishlist"
      Then node "wishlist#remember-a-lamp" has attribute status = "passed"
      And node "cart#add-an-item" has attribute status = "passed"
      And the file ".sdp/results.json" does not contain "wishlist#keep-a-lamp-for-later"

    Scenario: Two runs at once each record what they executed, and neither restores what the other replaced
      Given a file "specs/wishlist.feature" containing:
        """
        @id=wishlist
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
      And the workspace is run for "cart" and for "wishlist" at the same time
      Then node "wishlist#keep-a-lamp-for-later" has attribute status = "failed"
      And node "cart#add-an-item" has attribute status = "passed"

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
      Then the exit code is 1
      And the file ".sdp/results.json" contains '"cart#add-an-item": {'
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

  @maturity=idea
  Rule: A result CI recorded counts in every checkout that matches what it ran against

    A colleague or a reviewer then knows what CI verified without running everything again.
