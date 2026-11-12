@id=REQ-executable-specs @maturity=ready @execution
@refines:CAP-living-specs @realized-by:ARCH-runner @decided-by:DEC-0001
@iteration:I1 @activity.implementation:I1 @activity.test:I1
Feature: Executable specifications

  The scenarios in a spec run as tests once step definitions exist, without rewriting them, and what
  they did when they last ran is the evidence of whether the spec is built.

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

  @decided-by:DEC-0005
  Rule: A spec's stage is derived from what its scenarios did when they last ran

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

  @decided-by:DEC-0010
  Rule: A result counts only while what it ran against is unchanged

    After that it is stale: kept, but not counted. So `verified` promises no more than this, and
    nothing about what sdp was not told of: a service the steps call, the clock, a file
    `evidence.inputs` does not name.

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
        | file                      | content                       | reason            |
        | src/cart.ts               | export const lamps = 1        | code-changed      |
        | sdp.config.yaml           | results: .sdp/results.json    | code-changed      |
        | specs/steps/cart.steps.ts | export const phrases = []     | code-changed      |
        | package-lock.json         | { "lockfileVersion": 3 }      | toolchain-changed |
        | npm-shrinkwrap.json       | { "lockfileVersion": 3 }      | toolchain-changed |
        | pnpm-lock.yaml            | lockfileVersion: "9.0"        | toolchain-changed |
        | yarn.lock                 | # yarn lockfile v1            | toolchain-changed |
        | bun.lock                  | { "lockfileVersion": 1 }      | toolchain-changed |
        | fixtures/lamps.json       | [{ "name": "Ada" }]           | inputs-changed    |

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

  Rule: What a handler returns or throws is its step's status

    Scenario Outline: Nothing, a Promise or an Effect, each passing or failing, and pending()
      Given a step definition "an empty cart" that <handler>
      When the workspace is run
      Then the step "an empty cart" has status "<status>"

      Examples:
        | handler                     | status  |
        | returns nothing             | passed  |
        | throws an error             | failed  |
        | returns a resolved Promise  | passed  |
        | returns a rejected Promise  | failed  |
        | returns a successful Effect | passed  |
        | returns a failed Effect     | failed  |
        | returns pending()           | pending |
        | throws pending()            | pending |

    Scenario Outline: A failing step reports the author's message
      Given a step definition "an empty cart" that <handler>
      When the workspace is run
      Then the step "an empty cart" reports 'deliberate failure in "an empty cart"'

      Examples:
        | handler                                     |
        | throws an error                             |
        | returns a rejected Promise                  |
        | returns a failed Effect                     |
        | wraps a failing Promise in Effect.tryPromise |

  Rule: A handler gets typed arguments, a fresh world and a deadline it is asked to keep

    A step runs in sdp's own thread, where code that never yields cannot be stopped.

    Scenario Outline: Parameters are typed by the expression, and a regular expression passes on the text it captured
      Given a file "specs/pricing.feature" containing:
        """
        Feature: Pricing
          Scenario: Price a lamp
            Given <step>
        """
      And a step definition "<expression>" that records its arguments
      When the workspace is run
      Then the handler received the arguments <arguments>

      Examples:
        | step                  | expression                  | arguments      |
        | 3 lamps cost 19.5     | {int} lamps cost {float}    | [3, 19.5]      |
        | the lamp "Ada" is red | the lamp {string} is {word} | ["Ada", "red"] |
        | a lamp for 2 rooms    | a lamp for {} rooms         | ["2"]          |
        | 4 lamps in the hall   | /^(\d+) lamps in the (\w+)$/ | ["4", "hall"]  |

    Scenario: Doc strings and data tables reach the handler
      Given a file "specs/notes.feature" containing:
        """
        Feature: Notes
          Scenario: Take notes
            Given the note:
              ```
              Buy milk
              ```
            And the list:
              | milk  | 1 |
              | bread | 2 |
        """
      And a step definition "the note:" that records its arguments
      And a step definition "the list:" that records its arguments
      When the workspace is run
      Then the handler received the doc string "Buy milk"
      And the handler received the table:
        | milk  | 1 |
        | bread | 2 |

    Scenario Outline: Every scenario gets a fresh world, shared by the modules on one world factory
      Given a file "specs/shop.feature" containing:
        """
        @id=REQ-shop
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
      Then node "REQ-shop#one-lamp" has attribute status = "<status>"
      And node "REQ-shop#two-lamps" has attribute status = "<status>"
      Examples:
        | checkout | status |
        | shop     | passed |
        | till     | failed |

    Scenario: A step that outlasts its timeout fails
      Given a step definition "an empty cart" that takes a second
      When the workspace is run with a step timeout of 50 ms
      Then the step "an empty cart" has status "failed"
      And the step "an empty cart" reports "step timed out"

    Scenario: A step that never yields cannot be stopped, and fails once it returns late
      Given a step definition "an empty cart" that keeps the thread busy for 200 ms
      When the workspace is run with a step timeout of 50 ms
      Then the step "an empty cart" has status "failed"
      And the step "an empty cart" reports "step timed out"

    Scenario: A step that times out is told to stop through its signal
      Given a step definition "an empty cart" that waits for its signal
      When the workspace is run with a step timeout of 50 ms
      Then the step "an empty cart" has status "failed"
      And the step "an empty cart" reports "step timed out"
      And the handler of "an empty cart" saw its signal abort

    Scenario: Interrupting a run tells the running step to stop
      Given a step definition "an empty cart" that waits for its signal
      When the workspace is run and interrupted while "an empty cart" runs
      Then the handler of "an empty cart" saw its signal abort

    Scenario: A world factory that throws fails the step that needs the world
      Given the step definitions:
        | module | world    | expression    | behaviour |
        | cart   | throwing | an empty cart | passes    |
        | steps  | steps    | I add a lamp  | passes    |
      When the workspace is run
      Then the step "an empty cart" has status "failed"
      And the step "an empty cart" reports "could not create the world of"
      And the step "an empty cart" reports "run.steps.ts: deliberate failure in the world factory"
      And the step "I add a lamp" has status "skipped"

  Rule: Every step is matched against every definition

    So one run reports everything that is missing or ambiguous, not only the first step that is.

    Scenario Outline: Every undefined step comes with a suggested definition
      When the workspace is run
      Then the step "<step>" has status "undefined"
      And the step "<step>" suggests the definition '<suggestion>'

      Examples:
        | step                  | suggestion                                                               |
        | an empty cart         | Given("an empty cart", ({ world }) => pending())                         |
        | I add a lamp          | When("I add a lamp", ({ world }) => pending())                           |
        | the cart holds 1 item | Then("the cart holds {int} item", ({ world, args: [int] }) => pending()) |

    Scenario: A step that matches more than one definition is ambiguous, which fails its spec
      Given a step definition "an empty cart" that passes
      And a step definition "an {word} cart" that passes
      When the workspace is run
      Then the step "an empty cart" has status "ambiguous"
      And node "REQ-cart#add-an-item" has attribute status = "ambiguous"
      And the step "an empty cart" reports "matches 2 definitions"
      And node "REQ-cart" has attribute verification = "failing"

    Scenario Outline: After a step that does not pass the rest are skipped but still matched, and the scenario takes the worst status
      Given a step definition "an empty cart" that <first step>
      And a step definition "I add a lamp" that passes
      When the workspace is run
      Then the step "an empty cart" has status "<status>"
      And the step "I add a lamp" has status "skipped"
      And the step "the cart holds 1 item" has status "undefined"
      And node "REQ-cart#add-an-item" has attribute status = "<scenario>"
      Examples: Worst first: failed, ambiguous, undefined, pending, skipped, passed
        | first step | status  | scenario  |
        | fails      | failed  | failed    |
        | pends      | pending | undefined |

    Scenario: --snippets prints one module for every undefined step, each expression once, And and But as the keyword before them
      Given a file "specs/REQ-wishlist.feature" containing:
        """
        @id=REQ-wishlist
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
      Then the output contains 'import { defineSteps, pending } from "sdp/steps"'
      And the output contains "export default defineSteps(newWorld, ({ When, Then }) => {"
      And the output contains '  When("I add a lamp", ({ world }) => pending())' 1 time
      And the output contains '  When("I keep it for later", ({ world }) => pending())'
      And the output contains '  Then("the wishlist holds {int} item", ({ world, args: [int] }) => pending())'
      And the output contains '  Then("the cart holds {int} item", ({ world, args: [int] }) => pending())' 1 time
      And the output contains "Existing step files: specs/steps/cart.steps.ts"
      And the output contains "step modules that pass the same factory share it"

  Rule: Only a run imports step modules; every other command reads them as text, and says what it could not read

    Scenario Outline: Reading a workspace runs none of its step files
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
      Then the exit code is 0
      And the file "executed.txt" <is there or not>

      Examples:
        | command              | is there or not                |
        | sdp context REQ-cart | does not exist                 |
        | sdp steps            | does not exist                 |
        | sdp check            | does not exist                 |
        | sdp status           | does not exist                 |
        | sdp run              | contains "this step file ran"  |

    Scenario: A step definition is read whether its registrar is destructured, renamed or taken whole, and it matches by text, whatever keyword registered it
      Given a file "specs/steps/cart.steps.ts" containing:
        """
        import { defineSteps } from "sdp/steps"

        export default defineSteps(() => ({}), ({ Given: given, Then }) => {
          given("an empty cart", () => {})
          Then(`I add a lamp`, () => {})
        })
        """
      And a file "specs/steps/more.steps.ts" containing:
        """
        import { defineSteps } from "sdp/steps"

        export default defineSteps(() => ({}), (steps) => {
          steps.Step(/^the cart holds [0-9]+ items?$/, () => {})
        })
        """
      When I run "sdp steps cart"
      Then the exit code is 0
      And the output contains "specs/steps/cart.steps.ts:4\tGiven\tan empty cart"
      And the output contains "specs/steps/more.steps.ts:4\tStep\t/^the cart holds [0-9]+ items?$/"
      When I run "sdp run --json"
      Then the JSON output has:
        | data.summary.passed | 1 |

    Scenario: A step registered other than by a statement of its own is reported, never guessed
      Given a file "specs/steps/cart.steps.ts" containing:
        """
        import { defineSteps } from "sdp/steps"

        export default defineSteps(() => ({}), ({ Given, When, Then }) => {
          Given("an empty cart", () => {
            const When = (text: string) => text
            When("a phantom step")
          })
          if (process.env.NO_LAMPS === undefined) When("I add a lamp", () => {})
          const outcome = Then
          outcome("the cart holds {int} item(s)", () => {})
        })
        """
      When I run "sdp steps cart"
      Then the exit code is 2
      And the output contains "specs/steps/cart.steps.ts:4\tGiven\tan empty cart"
      And the output contains "1 step definition(s)"
      And the output contains "not read: specs/steps/cart.steps.ts:8: this statement registers steps under a condition, in a loop or through another name"
      And the output contains "not read: specs/steps/cart.steps.ts:9:"
      When I run "sdp run --json"
      Then the JSON output has:
        | data.summary.passed | 1 |

    Scenario: A malformed step expression stops the run in one line that names the definition; a reader gets an answer marked incomplete
      Given a file "specs/steps/cart.steps.ts" containing:
        """
        import { defineSteps } from "sdp/steps"

        export default defineSteps(() => ({}), ({ Given }) => {
          Given("a cart of {items}", () => {})
        })
        """
      When I run "sdp run"
      Then the exit code is 1
      And the output contains 'specs/steps/cart.steps.ts:4: invalid step expression "a cart of {items}": Undefined parameter type'
      And the output does not contain "    at "
      When I run "sdp context REQ-cart"
      Then the exit code is 2
      And the output contains "incomplete: this answer may miss something"
      And the output section "Contract" contains "undefined: Given an empty cart"
      And the output section "Step definitions" contains 'specs/steps/cart.steps.ts:4: invalid step expression "a cart of {items}"'

  Rule: Step modules, and the code they test, import sdp without installing it, and the step API loads nothing else

    Scenario: A step module imports sdp without installing it
      Given a file "specs/steps/cart.steps.ts" containing:
        """
        import { defineSteps } from "sdp/steps"

        export default defineSteps(() => ({ items: 0 }), ({ Given, When, Then }) => {
          Given("an empty cart", () => {})
          When("I add a lamp", ({ world }) => {
            world.items++
          })
          Then("the cart holds {int} item(s)", ({ args: [n], world }) => {
            if (world.items !== n) throw new Error(`the cart holds ${world.items}`)
          })
        })
        """
      When I run "sdp run --json"
      Then the JSON output has:
        | data.summary.passed | 1 |

    Scenario: Annotated application code under test imports sdp/annotations without installing it
      Given a file "src/cart.ts" containing:
        """
        import { annotate } from "sdp/annotations"

        export const lamp = () => 1
        annotate(lamp, { implements: "REQ-cart" })
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

    Scenario: The step API loads no parser and reads no workspace
      When a fresh Node process imports "sdp/steps"
      Then the output contains "/src/run/Steps.ts"
      And the output does not contain "oxc-parser"
      And the output does not contain "/src/parse/"
      And the output does not contain "/src/graph/"
      And the output does not contain "/src/workspace/"

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

  Rule: A run executes the examples it was asked for, one at a time unless asked otherwise, and reports each once and in order

    Step definitions written for a sequential run may share state, so running scenarios concurrently
    is the caller's choice, and a scenario tagged @serial is never part of it.

    Scenario Outline: Whatever finishes first, and however slow the reporter
      Given a file "specs/timing.feature" containing:
        """
        @id=REQ-timing
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
      When the workspace is run for "REQ-timing" with concurrency 3 and a reporter that takes a moment
      Then the reporter saw "start One, end One, start Two, end Two, start Three, end Three"

      Examples:
        | first step     |
        | passes         |
        | takes a moment |

    Scenario: Scenarios run concurrently when asked to, except those tagged @serial
      Given a file "specs/timing.feature" containing:
        """
        @id=REQ-timing
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
      And node "REQ-timing#alone" has attribute status = "passed"

    Scenario: --tags selects examples, and a scenario passes only when all its examples ran
      Given a file "specs/payment.feature" containing:
        """
        @id=REQ-payment
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
      And node "REQ-payment#pay-by-method" has attribute status = "skipped"
      And node "REQ-payment" has attribute stage = "in-progress"

    Scenario: Whether a scenario runs alone depends on the examples a run selects
      Given a file "specs/timing.feature" containing:
        """
        @id=REQ-timing
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

  @decided-by:DEC-0010
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
        | step                                                        |
        | the query "requirement[stage=verified]" returns no results  |
        | the query "scenario[status=failed]" returns no results      |
        | the query "*[status=failed]" returns no results             |
        | the node "REQ-cart" has verification "passing"              |
        | the node "REQ-cart#add-an-item" has status "unrun"          |

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
