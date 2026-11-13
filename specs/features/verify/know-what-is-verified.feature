@id=know-what-is-verified
@realized-by:ARCH-runner @realized-by:ARCH-graph-builder @realized-by:ARCH-spec-parser
Feature: Know what is verified

  Teams, their leads and agents want to know what is built and still works from what its scenarios
  did when they last ran, not from a status somebody types, and want a result to stop counting by
  itself once what it ran against changed.

  Not a history: each scenario keeps only what it did when it last ran, in the checkout where it ran.

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

  @decided-by:declared-maturity-derived-stage
  Rule: Work still to come stays at its maturity; live work is verified when every example of its live rules passed, failing when one did not, and in progress until all have run

    Scenario Outline: A wishlist <declaring> run as <target>, its step <holding>
      Given a file "specs/wishlist.feature" containing:
        """
        @id=wishlist <declaring>
        Feature: Wishlist

          Rule: A wishlist keeps what a shopper wants for later

            Scenario: Keep a lamp
              Then the wishlist holds a lamp

            Scenario: Keep a desk
              Then the wishlist holds a lamp
        """
      And a step definition "the wishlist holds a lamp" that <holding>
      When the workspace is run with "<target>"
      Then the workspace node "wishlist" has attribute stage = "<stage>"

      Examples:
        | declaring           | target               | holding | stage       |
        | @maturity=specified | wishlist             | fails   | specified   |
        |                     | wishlist             | passes  | verified    |
        |                     | wishlist             | fails   | failing     |
        |                     | wishlist#keep-a-lamp | passes  | in-progress |

  Rule: A result counts only while what it ran against is unchanged — the code and every file its steps imported, the toolchain, the inputs the workspace declares and, for a scenario that reads the graph, the specs — and is stale after

    This sdp's version, Node's major version and the lockfile decide what ran as much as the code
    does.

    Scenario Outline: <file> changes after a run
      Given a file "sdp.config.yaml" containing:
        """
        evidence:
          inputs: ["fixtures/**"]
        """
      And a file "specs/catalogue.feature" containing:
        """
        @id=catalogue
        Feature: Catalogue
          Rule: The catalogue knows the cart
            Scenario: The cart is specified
              Then the query "#cart" returns 1 result
        """
      When the workspace is run with "catalogue"
      And a file "<file>" containing:
        """
        <content>
        """
      Then the workspace node "catalogue#the-cart-is-specified" has attribute status = "stale"
      And the workspace node "catalogue#the-cart-is-specified" has attribute staleBecause = "<change>"

      Examples:
        | file                   | content                         | change            |
        | src/cart.ts            | export const lamps = 1          | code-changed      |
        | package-lock.json      | { "lockfileVersion": 3 }        | toolchain-changed |
        | fixtures/lamps.json    | [{ "name": "Ada" }]             | inputs-changed    |
        | specs/wishlist.feature | @id=wishlist\nFeature: Wishlist | specs-changed     |

    Scenario: A module the step definitions import, outside the code globs, changes after a run
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
      Then the exit code is 0
      Given a file "specs/steps/lamps.ts" containing:
        """
        export const lamps = 2
        """
      When I run "sdp q 'scenario[staleBecause=code-changed]' --ids"
      Then the output lines are "cart#add-an-item"

    Scenario Outline: A result read <reading>
      When I run "sdp run"
      Then the exit code is 1
      When I run "sdp status --json" <reading>
      Then the JSON output has:
        | data.stale.toolchain-changed | 1 |

      Examples:
        | reading          |
        | as sdp "0.0.1"   |
        | on Node 99       |

  Rule: A variable of evidence.env counts by its value, which no result keeps

    The environment may hold secrets.

    Scenario: The region a run saw, and another
      Given a file "sdp.config.yaml" containing:
        """
        evidence:
          env: [SHOP_REGION]
        """
      When I run "SHOP_REGION=atlantis sdp run"
      Then the exit code is 1
      And the file ".sdp/results.json" does not contain "atlantis"
      When I run "SHOP_REGION=atlantis sdp status --json"
      Then the JSON output has:
        | data.stale | {} |
      When I run "SHOP_REGION=lemuria sdp status --json"
      Then the JSON output has:
        | data.stale.inputs-changed | 1 |

  Rule: A result is about the step code that ran: one whose code changed while it ran is stale at once, and a process records nothing on step code that changed after it loaded it

    A result would certify code that never ran.

    Scenario: A step rewrites a module the step definitions imported
      Given a file "specs/steps/cart.steps.ts" containing:
        """
        import { writeFileSync } from "node:fs"
        import { defineSteps } from "sdp/steps"
        import { lamps } from "./lamps.ts"

        export default defineSteps(() => ({}), ({ Step }) => {
          Step("an empty cart", () => {})
          Step("I add a lamp", () => writeFileSync("specs/steps/lamps.ts", "export const lamps = 2\n"))
          Step("the cart holds {int} item(s)", ({ args: [n] }) => {
            if (lamps !== n) throw new Error(`the cart holds ${lamps}`)
          })
        })
        """
      And a file "specs/steps/lamps.ts" containing:
        """
        export const lamps = 1
        """
      When I run "sdp run --json"
      Then the exit code is 0
      And the JSON output has:
        | data.summary.passed         | 1 |
        | data.wentStale.code-changed | 1 |

    Scenario: A program runs the specs, a module they import changes, and it runs them again
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
      When a program runs:
        """
        import { writeFileSync } from "node:fs"
        import { run } from "$SDP"

        const first = await run(".")
        writeFileSync("specs/steps/lamps.ts", "export const lamps = 2\n")
        const again = await run(".").then(() => "recorded", (error) => error.message)
        console.log(JSON.stringify({ first: first.data.summary.passed, again }))
        """
      Then the exit code is 0
      And the JSON output has:
        | first | 1 |
      And the output contains "specs/steps/lamps.ts changed after this process imported it"
      When I run "sdp q 'scenario[staleBecause=code-changed]' --ids"
      Then the output lines are "cart#add-an-item"

    Scenario: A program runs the specs, a link a module was imported through by the package's imports moves, and it runs them again
      Given a file "package.json" containing:
        """
        { "type": "module", "imports": { "#lamps": [{ "browser": "./web/lamps.ts", "default": "./lib/lamps.ts" }] } }
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
      And a file "one/lamps.ts" containing:
        """
        export const lamps = 1
        """
      And a file "two/lamps.ts" containing:
        """
        export const lamps = 1
        """
      When a program runs:
        """
        import { rmSync, symlinkSync } from "node:fs"
        import { run } from "$SDP"

        symlinkSync("one", "lib")
        const first = await run(".")
        rmSync("lib")
        symlinkSync("two", "lib")
        const again = await run(".").then(() => "recorded", (error) => error.message)
        console.log(JSON.stringify({ first: first.data.summary.passed, again }))
        """
      Then the exit code is 0
      And the JSON output has:
        | first | 1 |
      And the output contains "lib/lamps.ts leads to two/lamps.ts now, not where it led when this process imported it"

  Rule: Editing a scenario makes its result stale; planning or rewording its spec does not

    Scenario Outline: An edit of <edit>
      Given a step definition "an empty cart" that passes
      And a step definition "I add a lamp" that passes
      And a step definition "the cart holds {int} item(s)" that passes
      When the workspace is run
      And a file "specs/cart.feature" containing:
        """
        @id=cart <on the feature>
        Feature: Cart

          <description>

          Rule: A cart holds what was added

            Scenario: Add an item
              Given an empty cart
              When I add <added>
              Then the cart holds <held>
        """
      Then the workspace node "cart#add-an-item" has attribute status = "<status>"

      Examples:
        | edit                        | added     | held    | on the feature                     | description             | status |
        | its steps                   | two lamps | 2 items |                                    | Shoppers collect items. | stale  |
        | its spec's plan and wording | a lamp    | 1 item  | @maturity=ready @iteration:IT-beta | Shoppers buy items.     | passed |

  Rule: Only a gate — a scenario of a milestone or tagged @gate — sees results, and it goes stale when they change

    Scenario: A milestone that needs the cart verified, before and after the cart passes
      Given a file "specs/MS-beta.feature" containing:
        """
        @id=MS-beta
        Feature: Beta
          Rule: The cart is verified before the beta
            Scenario: The cart works
              Then the node "cart" has stage "verified"
        """
      And a file "specs/progress.feature" containing:
        """
        @id=progress
        Feature: Progress
          Rule: Progress is delivery state
            Scenario: Delivery state
              Then the node "cart" has stage "unrun"
        """
      When the workspace is run
      Then the workspace node "MS-beta#the-cart-works" has attribute status = "failed"
      And the step 'the node "cart" has stage "unrun"' reports "is a gate"
      Given a step definition "an empty cart" that passes
      And a step definition "I add a lamp" that passes
      And a step definition "the cart holds {int} item(s)" that passes
      When the workspace is run with "cart"
      Then the workspace node "MS-beta#the-cart-works" has attribute status = "stale"
      And the workspace node "MS-beta#the-cart-works" has attribute staleBecause = "results-changed"

    Scenario: A step reads the project after the cart passed, in an ordinary scenario and in a gate
      Given a file "specs/steps/cart.steps.ts" containing:
        """
        import { defineSteps } from "sdp/steps"

        export default defineSteps(() => ({}), ({ Step }) => {
          Step("an empty cart", () => {})
          Step("I add a lamp", () => {})
          Step("the cart holds {int} item(s)", () => {})
          Step("the cart's example reads as {string}", ({ args: [expected], project }) => {
            const status = project.graph.node("cart#add-an-item")?.attrs.status
            if (status !== expected) throw new Error(`the cart's example reads as ${String(status)}`)
          })
        })
        """
      And a file "specs/audit.feature" containing:
        """
        @id=audit
        Feature: Audit
          Rule: An audit reads the cart
            Scenario: As a test
              Then the cart's example reads as "unrun"

            @gate
            Scenario: As a gate
              Then the cart's example reads as "passed"
        """
      When I run "sdp run cart"
      Then the exit code is 0
      When I run "sdp run audit"
      Then the exit code is 0
      When I run "sdp q 'scenario[status=passed]' --ids"
      Then the output lines are "audit#as-a-gate, audit#as-a-test, cart#add-an-item"

  Rule: A run records the scenarios it executed and drops the results of those gone when it started, and keeps what every other run recorded, one that overlaps it too

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
      Then the workspace node "wishlist#remember-a-lamp" has attribute status = "passed"
      And the workspace node "cart#add-an-item" has attribute status = "passed"
      And the file ".sdp/results.json" does not contain "wishlist#keep-a-lamp-for-later"

    Scenario: Two runs at once each record what they executed
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
      Then the workspace node "wishlist#keep-a-lamp-for-later" has attribute status = "failed"
      And the workspace node "cart#add-an-item" has attribute status = "passed"

    Scenario: A run that finds another recording
      Given a step definition "an empty cart" that passes
      And a step definition "I add a lamp" that passes
      And a step definition "the cart holds {int} item(s)" that passes
      And another run holds the lock on the results for 500 ms
      When the workspace is run
      Then the workspace node "cart#add-an-item" has attribute status = "passed"
      And the results were recorded only after the lock was released

  Rule: A run that cannot take the lock on the results within two seconds records nothing, and names the lock

    A run that stopped while it recorded leaves its lock behind, and every run after it would wait
    for it.

    Scenario: A lock no run holds any more
      Given a file ".sdp/results.json.lock" containing:
        """
        """
      When I run "sdp run"
      Then the exit code is 1
      And the output contains ".sdp/results.json.lock exists"
      And the file ".sdp/results.json" does not exist

  Rule: A run that stops before its end — interrupted, or failed by what it reports each result to — runs nothing more, and records the scenarios it finished

    A stop says nothing against what finished, and running it again would cost the time the stop
    saved.

    Scenario: A program whose report of the first result fails
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
        import { writeFileSync } from "node:fs"
        import { defineSteps } from "sdp/steps"

        export default defineSteps(() => ({}), ({ Step }) => {
          Step("an empty cart", () => {})
          Step("I add a lamp", () => {})
          Step("the cart holds {int} item(s)", () => {})
          Step("a wishlist", () => writeFileSync("started.txt", ""))
        })
        """
      When a program runs:
        """
        import { run } from "$SDP"

        const report = () => {
          throw new Error("the dashboard is down")
        }
        await run(".", { onScenario: report }).then(
          () => console.log(JSON.stringify({ rejected: false })),
          (error) => console.log(JSON.stringify({ rejected: error.message }))
        )
        """
      Then the exit code is 0
      And the JSON output has:
        | rejected | the dashboard is down |
      And the file "started.txt" does not exist
      When I run "sdp q 'scenario[status!=unrun]' --ids"
      Then the output lines are "cart#add-an-item"

    Scenario: Ctrl-C while the second scenario runs
      Given a file "sdp.config.yaml" containing:
        """
        timeout: 5s
        """
      And a file "specs/wishlist.feature" containing:
        """
        @id=wishlist
        Feature: Wishlist
          Rule: A wishlist keeps what a shopper wants for later
            Scenario: Keep a lamp for later
              Given a wishlist
        """
      And a file "specs/steps/shop.steps.ts" containing:
        """
        import { writeFileSync } from "node:fs"
        import { defineSteps } from "sdp/steps"

        export default defineSteps(() => ({}), ({ Step }) => {
          Step("an empty cart", () => {})
          Step("I add a lamp", () => {})
          Step("the cart holds {int} item(s)", () => {})
          Step("a wishlist", ({ signal }) => {
            writeFileSync("started.txt", "")
            return new Promise((stopped) => signal.addEventListener("abort", stopped))
          })
        })
        """
      When I run "sdp run" and interrupt it once "started.txt" exists
      Then the exit code is 130
      When I run "sdp q 'scenario[status!=unrun]' --ids"
      Then the output lines are "cart#add-an-item"

  Rule: A results file sdp cannot read is kept: an answer that reads results says it is incomplete and names the file, and a run records nothing over it

    It holds what earlier runs recorded, perhaps written by another version of sdp: read as no
    results, the next run would drop them all without a word.

    Scenario Outline: A results file <that is>
      Given a file ".sdp/results.json" containing:
        """
        <content>
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
      When I run "sdp status --json"
      Then the exit code is 2
      And the JSON output has:
        | complete | false |
      And the output contains ".sdp/results.json"
      When I run "sdp run"
      Then the exit code is 1
      And the output contains ".sdp/results.json"
      And the file ".sdp/results.json" is:
        """
        <content>
        """

      Examples:
        | that is                   | content                                          |
        | cut short                 | { "version": 4, "scenarios": {                   |
        | of another version of sdp | { "version": 5, "imports": {}, "scenarios": {} } |

  @maturity=idea
  Rule: A result CI recorded counts in every checkout that matches what it ran against

    A colleague or a reviewer then knows what CI verified without running everything again.

  @maturity=idea @decided-by:a-host-runner-runs-application-suites
  Rule: A scenario that runs in several ways keeps a result for each, and passes, as does a gate that needs it, only on a current pass of every way it must run

    A pass against a simulator says nothing of the real backend, and a run of one part says nothing
    of the rest.

  @maturity=idea
  Rule: A scenario's cleanup always runs, and a scenario or a run whose cleanup failed has not passed

    What one left behind would decide the result of the next.

  @maturity=idea
  Rule: A result says each attempt of a retried scenario
