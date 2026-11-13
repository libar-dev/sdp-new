@id=know-what-is-verified
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
      @id=cart
      Feature: Cart

        Shoppers collect items before paying.

        Rule: A cart holds what was added

          Scenario: Add an item
            Given an empty cart
            When I add a lamp
            Then the cart holds 1 item
      """

  @decided-by:declared-maturity-derived-stage
  Rule: Work still to come stays at its maturity; live work, at what its examples did

    Before it is built, an example is the specification of work still to come. A live example must
    pass, so one that does not makes its work failing: a regression is not work in progress. Until
    its examples run, live work is unrun.

    Scenario: Until its scenarios run, live work is unrun, and work still to come at its maturity
      Given these specs:
        | tags                        | Feature  |
        | @id=wishlist @maturity=idea | Wishlist |
      When the workspace is loaded
      Then node "cart#add-an-item" has attribute status = "unrun"
      And node "cart" has attribute stage = "unrun"
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
      And node "wishlist" has attribute stage = "specified"
      And node "wishlist" has attribute toCome = "true"

      Examples:
        | holding | status  |
        | passes  | passed  |
        | fails   | failed  |
        | pends   | pending |

    Scenario: Without step definitions a scenario is undefined, and live work with one is failing
      When the workspace is run
      Then node "cart#add-an-item" has attribute status = "undefined"
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
      And node "cart" has attribute stage = "<stage>"

      Examples:
        | adding | scenario | stage    |
        | passes | passed   | verified |
        | pends  | pending  | failing  |
        | fails  | failed   | failing  |

    Scenario: A spec is verified only when every one of its scenarios passed, and in-progress while some have not run
      Given a file "specs/wishlist.feature" containing:
        """
        @id=wishlist
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
      And node "wishlist" has attribute stage = "in-progress"

    Scenario: The stage orders work still to come below live work, so a query can ask for everything short of verified
      Given these specs:
        | tags                        | Feature  |
        | @id=wishlist @maturity=idea | Wishlist |
      And a step definition "an empty cart" that passes
      And a step definition "I add a lamp" that passes
      And a step definition "the cart holds {int} item(s)" that passes
      When the workspace is run
      And I query "feature[stage<verified]"
      Then the result is "wishlist"
      When I query "feature[stage>=verified]"
      Then the result is "cart"

  Rule: A live feature is verified when its live rules pass

    A rule still to come neither fails it nor makes it verified, and `rulesToCome` counts them; a
    live rule without an example yet keeps it from verified. Each rule has a stage of its own.

    Scenario Outline: A cart that holds what was added, with a rule still to come that <later> and a question
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
      And node "cart#come-back-to-the-cart" has attribute status = "<kept>"

      Examples:
        | adding | later  | stage    | kept   |
        | passes | fails  | verified | failed |
        | fails  | passes | failing  | passed |

    Scenario: A live rule that has no example yet keeps its feature from verified
      Given a file "specs/cart.feature" containing:
        """
        @id=cart
        Feature: Cart

          Shoppers collect items before paying.

          Rule: A cart holds what was added

            Scenario: Add an item
              Then the cart holds 1 item

          Rule: A cart is emptied once paid
        """
      And a step definition "the cart holds {int} item(s)" that passes
      When the workspace is run
      Then node "cart#a-cart-holds-what-was-added" has attribute stage = "verified"
      And node "cart" has attribute stage = "in-progress"
      When I query "feature[stage=verified]"
      Then the result has 0 nodes

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
        @id=export @iteration:IT-beta
        Feature: Export

          Something to export.

          Rule: An export saves a file

            Scenario: Export
              Then a file is saved
        """
      And a file "specs/fast-exports.feature" containing:
        """
        @id=fast-exports @iteration:IT-beta
        Feature: Exports are fast

          Rule: A report exports within a second

            Scenario: Within a second
              Then the guard holds
        """
      And a step definition "a file is saved" that fails
      And a step definition "the guard holds" that passes
      When the workspace is run with "export fast-exports"
      Then sdp status counts the stages "failing:1 idea:1 unrun:1 verified:1"
      When the lifecycle is computed
      Then the iterations are:
        | id      | stages                      |
        | IT-beta | failing:1 idea:1 verified:1 |
      When I query "feature[stage>ready]"
      Then the result is "cart, export, fast-exports"
      When I query "feature[stage<verified]"
      Then the result is "cart, export, wishlist"
      When I query "feature[stage=in-progress]"
      Then the result is "nothing"
      When I query "feature[stage>=in-progress, stage<=failing]"
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
      And the output contains 'cart.stage is "unrun", expected "verified"'
      And the output contains "stale: 1 earlier result(s) no longer count (1 code-changed)"

    Scenario Outline: In a monorepo, a file outside the workspace that the step definitions import changes, after a run <where>
      Given a file "shop/sdp.config.yaml" containing:
        """
        features: ["specs/**/*.feature"]
        """
      And a file "shop/specs/cart.feature" containing:
        """
        @id=cart
        Feature: Cart

          Shoppers collect items before paying.

          Rule: A cart holds what was added

            Scenario: Add an item
              Then the cart holds 1 item
        """
      And a file "shop/specs/steps/cart.steps.ts" containing:
        """
        import { defineSteps } from "sdp/steps"
        import { lamps } from "../../../shared/lamps.ts"

        export default defineSteps(() => ({}), ({ Then }) => {
          Then("the cart holds {int} item(s)", ({ args: [n] }) => {
            if (lamps !== n) throw new Error(`the cart holds ${lamps}`)
          })
        })
        """
      And a file "shared/lamps.ts" containing:
        """
        export const lamps = 1
        """
      When I run "sh -c 'mkdir links && ln -s ../shop links/shop'"
      Then the exit code is 0
      When I run "sdp -C <root> run"
      Then the output contains "1 scenario(s): 1 passed"
      When I run "sdp status --json" in "shop"
      Then the JSON output has:
        | data.stale | {} |
      Given a file "shared/lamps.ts" containing:
        """
        export const lamps = 2
        """
      When I run "sdp status --json" in "shop"
      Then the JSON output has:
        | data.stale.code-changed | 1 |

      Examples:
        | where                           | root       |
        | in the workspace                | shop       |
        | through a link to the workspace | links/shop |

    Scenario Outline: The step definitions run through links, and <what>
      Given a file "shop/sdp.config.yaml" containing:
        """
        features: ["specs/**/*.feature"]
        """
      And a file "shop/specs/cart.feature" containing:
        """
        @id=cart
        Feature: Cart

          Shoppers collect items before paying.

          Rule: A cart holds what was added

            Scenario: Add an item
              Then the cart holds 1 item
        """
      And a file "shared/package.json" containing:
        """
        { "type": "module", "imports": { "#lamps": "./lamps.ts" } }
        """
      And a file "shared/cart.steps.ts" containing:
        """
        import { defineSteps } from "sdp/steps"
        import { lamps } from "<import>"

        export default defineSteps(() => ({}), ({ Then }) => {
          Then("the cart holds {int} item(s)", ({ args: [n] }) => {
            if (lamps !== n) throw new Error(`the cart holds ${lamps}`)
          })
        })
        """
      And a file "shared/one.ts" containing:
        """
        export const lamps = 1
        """
      And a file "shared/two.ts" containing:
        """
        export const lamps = 2
        """
      When I run "sh -c 'ln -s ../../shared/cart.steps.ts shop/specs/cart.steps.ts && ln -s one.ts shared/lamps.ts'"
      Then the exit code is 0
      When I run "sdp run" in "shop"
      Then the output contains "1 scenario(s): 1 passed"
      When I run "<change>"
      Then the exit code is 0
      When I run "sdp q scenario[status=stale] --ids" in "shop"
      Then the output lines are "cart#add-an-item"

      Examples:
        | what                                                                     | import     | change                         |
        | the file a link leads to changes                                         | ./lamps.ts | cp shared/two.ts shared/one.ts |
        | a link is made to lead to another, unchanged file                        | ./lamps.ts | ln -sf two.ts shared/lamps.ts  |
        | a link a package import names is made to lead to another, unchanged file | #lamps     | ln -sf two.ts shared/lamps.ts  |

    Scenario: A step file is made a link to a copy of it elsewhere, beside other files it imports
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
      And a file "shared/lamps.ts" containing:
        """
        export const lamps = 2
        """
      When I run "sdp run"
      Then the output contains "1 scenario(s): 1 passed"
      When I run "sh -c 'cp specs/steps/cart.steps.ts shared/cart.ts && ln -sf ../../shared/cart.ts specs/steps/cart.steps.ts'"
      Then the exit code is 0
      When I run "sdp q scenario[status=stale] --ids"
      Then the output lines are "cart#add-an-item"

    Scenario: An outline whose ordinary row changed the code while it ran, and whose gate row ran after
      Given a file "src/cart.ts" containing:
        """
        export const lamps = 1
        """
      And a file "specs/cart.feature" containing:
        """
        @id=cart
        Feature: Cart

          Shoppers collect items before paying.

          Rule: A cart holds what was added

            Scenario Outline: Add <item>
              When I add <item>

              Examples:
                | item   |
                | a lamp |

              @gate
              Examples:
                | item   |
                | a desk |
        """
      And a file "specs/steps/cart.steps.ts" containing:
        """
        import { writeFileSync } from "node:fs"
        import { defineSteps } from "sdp/steps"

        export default defineSteps(() => ({}), ({ When }) => {
          When("I add a lamp", () => {
            writeFileSync(new URL("../../src/cart.ts", import.meta.url), "export const lamps = 2")
          })
          When("I add a desk", () => {})
        })
        """
      When I run "sdp run"
      Then the exit code is 0
      And the output contains "stale: 1 result(s) of this run no longer count (1 code-changed): what they ran against changed while they ran"
      When I run "sdp q scenario[status=stale] --ids"
      Then the output lines are "cart#add-item"

  Rule: Editing a scenario, a tag it inherits included, makes its result stale; planning or rewording its spec does not

    A scenario's hash covers what a step handler can observe, and nothing else, and a result counts
    only while its hash holds: planning a spec, changing its maturity, naming the decision a rule
    rests on or rewording a reason leaves it valid, unless the scenario reads the graph.

    Scenario Outline: Its steps, or a tag on the scenario, its rule or its feature, are edited
      Given a step definition "an empty cart" that passes
      And a step definition "I add a lamp" that passes
      And a step definition "the cart holds {int} item(s)" that passes
      When the workspace is run
      And a file "specs/cart.feature" containing:
        """
        @id=cart <on the feature>
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
      And node "cart" has attribute stage = "unrun"

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
        | @id=pay @maturity=draft         | @id=pay                  | stays the same |
        | @iteration:IT-payments          | @iteration:IT-checkout   | stays the same |
        | @decided-by:pay-before-shipping | @decided-by:pay-up-front | stays the same |
        | Feature: Pay                    | Feature: Payment         | stays the same |
        | Shoppers pay.                   | Shoppers pay by card.    | stays the same |
        | No goods leave without one.     | Nothing ships unpaid.    | stays the same |


  Rule: Making work live keeps the results of its examples

    Maturity is no part of an example's hash, so a failure it was allowed fails the next run, and a
    result that reads the graph goes stale as on any change to a spec.

    Scenario: A wishlist still to come is made live while its example fails
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
        @id=wishlist
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

  Rule: Any change to the code, the step definitions, a package.json that decides how Node loads them or sdp's configuration makes every result stale

    Knowing which scenarios reached a change would take tracing, and still miss what a step reads
    through a service. A package.json decides how Node loads the files below it, up to the next
    one: their type, and what an import of `#` or of the package's own name names. So the nearest
    one of each file the step definitions loaded counts, and so does one written nearer it, as does
    the one of a package of the workspace that a step definition imports by name.

    Scenario Outline: A code file, sdp's configuration or a step definition file changes
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
      And node "cart" has attribute stage = "unrun"

      Examples:
        | file                      | content                    |
        | src/cart.ts               | export const lamps = 1     |
        | sdp.config.yaml           | results: .sdp/results.json |
        | specs/steps/cart.steps.ts | export const phrases = []  |

    Scenario Outline: A package.json the step definitions were loaded by <changes>
      Given a file "package.json" containing:
        """
        { "type": "module", "imports": { "#lamps": "./lib/one.ts" } }
        """
      And a file "lib/one.ts" containing:
        """
        export const lamps = 1
        """
      And a file "lib/two.ts" containing:
        """
        export const lamps = 2
        """
      And a file "specs/steps/cart.steps.ts" containing:
        """
        import { defineSteps } from "sdp/steps"
        import { lamps } from "#lamps"

        export default defineSteps(() => ({}), ({ Step }) => {
          Step("an empty cart", () => {})
          Step("I add a lamp", () => {})
          Step("the cart holds {int} item(s)", ({ args: [n] }) => {
            if (lamps !== n) throw new Error(`the cart holds ${lamps}`)
          })
        })
        """
      When I run "sdp run"
      Then the exit code is 0
      Given a file "<file>" containing:
        """
        <content>
        """
      When I run "sdp status --json"
      Then the JSON output has:
        | data.stale.code-changed | 1 |
      When I run "sdp run"
      Then the exit code is 1
      And the output contains "<failure>"

      Examples:
        | changes                    | file             | content                                                       | failure                                  |
        | maps an import elsewhere   | package.json     | { "type": "module", "imports": { "#lamps": "./lib/two.ts" } } | the cart holds 2                         |
        | is written nearer the code | lib/package.json | { "type": "commonjs" }                                        | does not provide an export named 'lamps' |

    Scenario: A package.json the step definitions import as JSON, its version changed
      Given a file "package.json" containing:
        """
        { "name": "shop", "type": "module", "version": "1.0.0" }
        """
      And a file "specs/steps/cart.steps.ts" containing:
        """
        import { defineSteps } from "sdp/steps"
        import shop from "../../package.json" with { type: "json" }

        export default defineSteps(() => ({}), ({ Step }) => {
          Step("an empty cart", () => {})
          Step("I add a lamp", () => {})
          Step("the cart holds {int} item(s)", () => {
            if (shop.version !== "1.0.0") throw new Error(`the shop is at ${shop.version}`)
          })
        })
        """
      When I run "sdp run"
      Then the exit code is 0
      When I run "sdp run"
      Then the exit code is 0
      Given a file "package.json" containing:
        """
        { "name": "shop", "type": "module", "version": "2.0.0" }
        """
      When I run "sdp q 'feature[stage=verified]' --ids"
      Then the output lines are ""
      When I run "sdp run"
      Then the exit code is 1
      And the output contains "the shop is at 2.0.0"

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

  Rule: A process records no result on step code it did not load: a module it imported, or a package.json it loaded one by, that changed or is gone, or a step file added since; a result from before the change is stale

    A process loads the step files once, and Node.js keeps a module for the life of a process, and
    what it read of the package.json each was loaded by: the code there now did not run, and a
    result would certify code that never ran. A module that is gone is as changed as one whose
    content differs.

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

    Scenario: A package.json the process loaded a module by changed
      Given a file "package.json" containing:
        """
        { "type": "module", "imports": { "#lamps": "./specs/steps/lamps.ts" } }
        """
      And a file "specs/steps/two.ts" containing:
        """
        export const lamps = 2
        """
      And a file "specs/steps/cart.steps.ts" containing:
        """
        import { defineSteps } from "sdp/steps"
        import { lamps } from "#lamps"

        export default defineSteps(() => ({}), ({ Step }) => {
          Step("an empty cart", () => {})
          Step("I add a lamp", () => {})
          Step("the cart holds {int} item(s)", ({ args: [n] }) => {
            if (lamps !== n) throw new Error(`the cart holds ${lamps}`)
          })
        })
        """
      When this process runs the workspace through the API
      Then the output contains "1 scenario(s): 1 passed"
      Given a file "package.json" containing:
        """
        { "type": "module", "imports": { "#lamps": "./specs/steps/two.ts" } }
        """
      When this process runs the workspace through the API
      Then the output contains "package.json changed after this process imported it"
      When I run "sdp q scenario[status=stale] --ids"
      Then the output lines are "cart#add-an-item"
      When I run "sdp run"
      Then the exit code is 1
      And the output contains "the cart holds 2"

    Scenario: A link the process imported through leads elsewhere
      Given a file "specs/steps/one.ts" containing:
        """
        export const lamps = 1
        """
      And a file "specs/steps/two.ts" containing:
        """
        export const lamps = 1
        """
      When I run "ln -sf one.ts specs/steps/lamps.ts"
      Then the exit code is 0
      When this process runs the workspace through the API
      Then the output contains "1 scenario(s): 1 passed"
      When I run "ln -sf two.ts specs/steps/lamps.ts"
      Then the exit code is 0
      When this process runs the workspace through the API
      Then the output contains "specs/steps/lamps.ts leads to specs/steps/two.ts now, not where it led when this process imported it"
      When I run "sdp q scenario[status=stale] --ids"
      Then the output lines are "cart#add-an-item"

    Scenario Outline: A step file is added while a run <that> runs
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
        import { writeFileSync } from "node:fs"
        import { defineSteps } from "sdp/steps"

        export default defineSteps(() => ({}), ({ Step }) => {
          Step("an empty cart", () => {})
          Step("I add a lamp", () => {
            writeFileSync(new URL("./more.steps.ts", import.meta.url), "export const lamps = 2")
          })
          Step("the cart holds {int} item(s)", () => {})
        })
        """
      When I run "sdp run <targets>"
      Then the exit code is <exit code>
      And the output contains "<output>"
      And the file ".sdp/results.json" does not contain "MS-beta#the-cart-works"
      When I run "sdp q scenario[status=stale] --ids"
      Then the output lines are "cart#add-an-item"

      Examples:
        | that                       | targets | exit code | output                                                                                      |
        | that would record a gate   | .       | 1         | specs/steps/more.steps.ts was added after this process loaded the step modules              |
        | that records no gate       | cart    | 0         | stale: 1 result(s) of this run no longer count (1 code-changed): what they ran against changed |

    Scenario: A step file the process loaded is made a link while a run that would record a gate runs
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
        import { copyFileSync, mkdirSync, rmSync, symlinkSync } from "node:fs"
        import { defineSteps } from "sdp/steps"

        export default defineSteps(() => ({}), ({ Step }) => {
          Step("an empty cart", () => {})
          Step("I add a lamp", () => {
            mkdirSync("shared")
            copyFileSync("specs/steps/cart.steps.ts", "shared/cart.ts")
            rmSync("specs/steps/cart.steps.ts")
            symlinkSync("../../shared/cart.ts", "specs/steps/cart.steps.ts")
          })
          Step("the cart holds {int} item(s)", () => {})
        })
        """
      When I run "sdp run"
      Then the exit code is 1
      And the output contains "specs/steps/cart.steps.ts leads to shared/cart.ts now, not where it led when this process imported it"
      And the file ".sdp/results.json" does not contain "MS-beta#the-cart-works"

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
      And node "cart" has attribute stage = "unrun"

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
      And node "cart" has attribute stage = "unrun"

    Scenario: A file of evidence.inputs, named by an absolute glob, changes
      Given a file "fixtures/lamps.json" containing:
        """
        []
        """
      When I run "sh -c 'echo evidence: { inputs: [$PWD/fixtures/**] } > sdp.config.yaml'"
      Then the exit code is 0
      When I run "sdp run"
      Then the exit code is 1
      And the output contains "1 scenario(s): 1 undefined"
      Given a file "fixtures/lamps.json" containing:
        """
        [{ "name": "Ada" }]
        """
      When I run "sdp status --json"
      Then the JSON output has:
        | data.stale.inputs-changed | 1 |

    Scenario: A path of evidence.inputs that is no file counts by its path and what it is, and nothing reports it
      Given a file "fixtures/lamps.json" containing:
        """
        []
        """
      When I run "sdp run"
      Then the exit code is 1
      And the output contains "1 scenario(s): 1 undefined"
      When I run "mkfifo fixtures/orders"
      Then the exit code is 0
      When I run "sdp status --json"
      Then the exit code is 0
      And the JSON output has:
        | complete                  | true |
        | data.stale.inputs-changed | 1    |
      When I run "sdp check --base none"
      Then the exit code is 0
      When I run "sdp run"
      Then the exit code is 1
      And the output contains "1 scenario(s): 1 undefined"

    Scenario: A directory made where evidence.inputs names a path counts by its path and what it is
      Given a file "sdp.config.yaml" containing:
        """
        evidence:
          inputs: [flag]
        """
      And a file "specs/steps/cart.steps.ts" containing:
        """
        import { existsSync } from "node:fs"
        import { defineSteps } from "sdp/steps"

        export default defineSteps(() => ({}), ({ Step }) => {
          Step("an empty cart", () => {})
          Step("I add a lamp", () => {})
          Step("the cart holds {int} item(s)", () => {
            if (existsSync("flag")) throw new Error("the cart is flagged")
          })
        })
        """
      When I run "sdp run"
      Then the exit code is 0
      When I run "mkdir flag"
      Then the exit code is 0
      When I run "sdp status --json"
      Then the JSON output has:
        | data.stale.inputs-changed | 1 |
      When I run "sdp q feature[stage=verified] --ids"
      Then the output lines are ""
      When I run "sdp run"
      Then the exit code is 1
      And the output contains "the cart is flagged"

    Scenario: A directory where evidence.inputs names a path, replaced by a file holding what sdp calls a directory
      Given a file "sdp.config.yaml" containing:
        """
        evidence:
          inputs: [flag]
        """
      And a file "specs/steps/cart.steps.ts" containing:
        """
        import { statSync } from "node:fs"
        import { defineSteps } from "sdp/steps"

        export default defineSteps(() => ({}), ({ Step }) => {
          Step("an empty cart", () => {})
          Step("I add a lamp", () => {})
          Step("the cart holds {int} item(s)", () => {
            if (!statSync("flag").isDirectory()) throw new Error("the flag is no directory")
          })
        })
        """
      When I run "mkdir flag"
      Then the exit code is 0
      When I run "sdp run"
      Then the exit code is 0
      When I run the pipeline:
        """
        rmdir flag && printf 'a directory' > flag
        """
      Then the exit code is 0
      When I run "sdp status --json"
      Then the JSON output has:
        | data.stale.inputs-changed | 1 |

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

  Rule: A scenario that reads the graph goes stale when a spec or a file that says what code's imports mean changes, or Markdown where specs live is added or removed; one that does not keeps its result

    What a step that reads the graph sees is built from every spec, and from the code with the files
    that say which file each name it imports means: tsconfig.json, tsconfig.build.json,
    jsconfig.json, package.json, pnpm-workspace.yaml, deno.json and deno.jsonc, those a tsconfig.json
    extends or references, and the package.json of each package the repository's package manager
    lists. It warns of each Markdown file where specs live, none of which it reads. A change to the
    code makes every result stale already.

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

    Scenario: Markdown is written where specs live
      Given a file "specs/guard.feature" containing:
        """
        @id=guard
        Feature: Guard
          Rule: The specs are clean
            Scenario: No warnings
              Then there are no warning diagnostics
        """
      When the workspace is run
      And a file "specs/notes.md" containing:
        """
        # Notes
        """
      Then node "guard#no-warnings" has attribute status = "stale"
      And node "guard#no-warnings" has attribute staleBecause = "specs-changed"

    Scenario: A tsconfig.json maps a name the code imports so that it closes a cycle
      Given a step definition "an empty cart" that passes
      And a step definition "I add a lamp" that passes
      And a step definition "the cart holds {int} item(s)" that passes
      And a file "specs/layers.feature" containing:
        """
        @id=layers
        Feature: Layers
          Rule: No element depends on itself through others
            Scenario: Tax
              Then the query "#ARCH-tax -imports+-> #ARCH-tax" returns no results
        """
      And a file "tsconfig.json" containing:
        """
        { "compilerOptions": { "paths": { "@/*": ["./src/legacy/*"] } } }
        """
      And a file "src/legacy/billing.ts" containing:
        """
        export const bill = (): number => 0
        """
      And a file "src/billing.ts" containing:
        """
        import { rate } from "./tax.ts"

        /** @sdp is ARCH-billing */
        export const bill = (): number => rate
        """
      And a file "src/tax.ts" containing:
        """
        import { bill } from "@/billing"

        /** @sdp is ARCH-tax */
        export const rate = 0.25
        export const total = (): number => bill()
        """
      When the workspace is run
      Then node "layers#tax" has attribute status = "passed"
      Given a file "tsconfig.json" containing:
        """
        { "compilerOptions": { "paths": { "@/*": ["./src/*"] } } }
        """
      When I query "#ARCH-tax -imports+-> #ARCH-tax"
      Then the result is "ARCH-tax"
      And node "layers#tax" has attribute status = "stale"
      And node "layers#tax" has attribute staleBecause = "specs-changed"
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
                | attribute | state |
                | title     | Cart  |

              @gate
              Examples: After the ordinary scenarios
                | attribute | state    |
                | stage     | verified |
        """
      When the workspace is run with "--tags 'not @gate'"
      Then the step 'the node "cart" has title "Cart"' has status "passed"
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
        | the node "cart" has stage "unrun"                      |
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

  Rule: A run records the scenarios it executed and what they ran against, drops the results of scenarios that were gone when it started, and leaves every other result as it found it

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

    Scenario: A run keeps the result another run recorded of a scenario added after it started
      Given a step definition "an empty cart" that passes
      And a step definition "I add a lamp" that waits until it is released
      And a step definition "the cart holds {int} item(s)" that passes
      And a step definition "a wishlist" that passes
      When the workspace is run for "cart", and while "I add a lamp" runs, a file "specs/wishlist.feature" is added and run:
        """
        @id=wishlist
        Feature: Wishlist
          Rule: A wishlist keeps what a shopper wants for later
            Scenario: Keep a lamp for later
              Given a wishlist
        """
      Then node "wishlist#keep-a-lamp-for-later" has attribute status = "passed"
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

  @maturity=idea @decided-by:a-host-runner-runs-application-suites
  Rule: A scenario that runs in several ways, such as against a simulator and against the real backend, keeps a result for each, and is verified only when it passed in every way it must run

    Results are kept by scenario today, so a pass against the simulator would take the place of a
    failure against the backend.

  @maturity=idea
  Rule: A run of one way leaves the results of the others as it found them

  @maturity=idea
  Rule: A gate knows every scenario it needs and each way that scenario must run, and passes only on a current pass of each: one left out, skipped, not collected, stopped before it ended or stale fails it

    A run of the part that was selected says nothing about the part that was not.

  @maturity=idea
  Rule: A scenario's cleanup runs whether it passed, failed or was stopped, and a scenario whose cleanup failed has not passed

    What one scenario left behind would decide the result of the next.

  @maturity=idea
  Rule: A run whose last cleanup failed fails, though every scenario passed, and no gate passes on it

    What it left behind, a process, a tenant, a directory, is still there for the next run.

  @maturity=idea
  Rule: A result says each attempt of a retried scenario, and a scenario that passed only on a retry says so

  @maturity=idea
  Rule: An earlier result counts again only where the workspace allows it and what it ran against is what is there now; it never makes a stale result current, nor stands for a way of running it was not recorded in

    A pass against the simulator says nothing of the backend a gate requires.
