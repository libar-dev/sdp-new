@id=know-what-is-verified
@realized-by:ARCH-runner @realized-by:ARCH-graph-builder @realized-by:ARCH-spec-parser
Feature: Know what is verified

  Teams, their leads and agents want to know what is built and still works — a spec, an iteration,
  a milestone — from what its scenarios did when they last ran, not from a status somebody types,
  and want a result to stop counting by itself once what it ran against changed.

  Not a history: each scenario keeps only what it did when it last ran, in the checkout where it ran.

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

    A live example must pass, so one that does not makes its work failing, not in progress; until
    its examples run, live work is unrun.

    Scenario Outline: A wishlist <declaring> whose example <holding>
      Given a file "specs/wishlist.feature" containing:
        """
        @id=wishlist <declaring>
        Feature: Wishlist

          Rule: A wishlist keeps a lamp

            Scenario: Keep a lamp
              Then the wishlist holds a lamp
        """
      And a step definition "the wishlist holds a lamp" that <holding>
      When the workspace is run
      Then node "wishlist" has attribute stage = "<stage>"

      Examples:
        | declaring           | holding | stage     |
        | @maturity=specified | fails   | specified |
        |                     | passes  | verified  |
        |                     | fails   | failing   |

  Rule: A live feature is verified when its live rules pass

    A rule still to come neither fails it nor makes it verified; a live rule without an example yet
    keeps it from verified.

    Scenario Outline: A cart that holds what was added, with a rule still to come that <later> and a question
      Given a file "specs/cart.feature" containing:
        """
        @id=cart
        Feature: Cart

          Rule: A cart holds what was added

            Scenario: Add an item
              Then the cart holds 1 item

          @maturity=ready
          Rule: A cart is kept for a week

            Scenario: Come back to the cart
              Then the cart is kept

          @open
          Rule: Does a cart expire?
        """
      And a step definition "the cart holds {int} item(s)" that <adding>
      And a step definition "the cart is kept" that <later>
      When the workspace is run
      Then node "cart" has attribute stage = "<stage>"
      And node "cart" has attribute rulesToCome = "2"
      And node "cart#a-cart-is-kept-for-a-week" has attribute stage = "ready"

      Examples:
        | adding | later  | stage    |
        | passes | fails  | verified |
        | fails  | passes | failing  |

  Rule: Every report counts stages the same way, and failing ranks with in-progress

    So status, the lifecycle and a query agree. A failing spec is no further along than one being
    automated, but a regression keeps a name of its own.

    Scenario: An idea and a failing spec in one iteration
      Given these specs:
        | tags                                           | Feature  |
        | @id=IT-beta                                    | Beta     |
        | @id=wishlist @maturity=idea @iteration:IT-beta | Wishlist |
      And a file "specs/export.feature" containing:
        """
        @id=export @iteration:IT-beta
        Feature: Export

          Rule: An export saves a file

            Scenario: Export
              Then a file is saved
        """
      And a step definition "a file is saved" that fails
      When the workspace is run with "export"
      Then sdp status counts the stages "failing:1 idea:1 unrun:1"
      When the lifecycle is computed
      Then the iterations are:
        | id      | stages           |
        | IT-beta | failing:1 idea:1 |
      When I query "feature[stage=in-progress]"
      Then the result is "nothing"
      When I query "feature[stage>=in-progress, stage<=failing]"
      Then the result is "export"

  Rule: A result counts only while the code, the files its run imported, sdp's configuration, a lockfile and the inputs the workspace declares are unchanged

    After that it is stale: kept, not counted, with the kind of change that made it so. Inputs are
    the files of `evidence.inputs` and the variables of `evidence.env`; nothing else is watched.

    Scenario Outline: <file> changes after a run
      Given a file "sdp.config.yaml" containing:
        """
        evidence:
          inputs: ["fixtures/**"]
        """
      And a step definition "an empty cart" that passes
      And a step definition "I add a lamp" that passes
      And a step definition "the cart holds {int} item(s)" that passes
      When the workspace is run
      And a file "<file>" containing:
        """
        <content>
        """
      Then node "cart#add-an-item" has attribute status = "stale"
      And node "cart#add-an-item" has attribute staleBecause = "<change>"
      And node "cart" has attribute stage = "unrun"

      Examples:
        | file                | content                  | change            |
        | src/cart.ts         | export const lamps = 1   | code-changed      |
        | package-lock.json   | { "lockfileVersion": 3 } | toolchain-changed |
        | fixtures/lamps.json | [{ "name": "Ada" }]      | inputs-changed    |

  Rule: Editing a scenario, a tag it inherits included, makes its result stale; planning its spec, its maturity included, or rewording it does not

    A result holds while what a step can observe holds, unless the scenario reads the graph: making
    work live keeps its results, so a failure it was allowed fails the next run.

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

          <on the rule>
          Rule: A cart holds what was added

            Scenario: Add an item
              Given an empty cart
              When I add <added>
              Then the cart holds <held>
        """
      Then node "cart#add-an-item" has attribute status = "<status>"

      Examples:
        | edit                        | added     | held    | on the feature                     | on the rule | description                           | status |
        | its steps                   | two lamps | 2 items |                                    |             | Shoppers collect items before paying. | stale  |
        | a tag of its rule           | a lamp    | 1 item  |                                    | @slow       | Shoppers collect items before paying. | stale  |
        | its spec's plan and wording | a lamp    | 1 item  | @maturity=ready @iteration:IT-beta |             | Shoppers collect items.               | passed |

  Rule: A process records no result on step code it did not load, and a result from before that code changed is stale

    A result would certify code that never ran.

    Scenario: A module the process imported changed
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
      When I run "sdp q scenario[status=stale] --ids"
      Then the output lines are "cart#add-an-item"

  Rule: A scenario that reads the graph goes stale when a spec, or a file that says what the code's imports mean, changes; one that does not keeps its result

    Such a file is a tsconfig.json, a package.json or the like.

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

    A gate, a scenario of a milestone or one tagged @gate, runs after the ordinary scenarios and sees
    what they say; an ordinary scenario sees no results, and no gate sees a gate's.

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
        | the node "cart" has stage "unrun"                      |

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
