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
      Then node "wishlist" has attribute stage = "<stage>"

      Examples:
        | declaring           | target               | holding | stage       |
        | @maturity=specified | wishlist             | fails   | specified   |
        |                     | wishlist             | passes  | verified    |
        |                     | wishlist             | fails   | failing     |
        |                     | wishlist#keep-a-lamp | passes  | in-progress |

  Rule: A result counts only while what it ran against is unchanged — the code, the toolchain, the inputs the workspace declares and, for a scenario that reads the graph, the specs — and is stale after

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
      Then node "catalogue#the-cart-is-specified" has attribute status = "stale"
      And node "catalogue#the-cart-is-specified" has attribute staleBecause = "<change>"

      Examples:
        | file                   | content                         | change            |
        | src/cart.ts            | export const lamps = 1          | code-changed      |
        | package-lock.json      | { "lockfileVersion": 3 }        | toolchain-changed |
        | fixtures/lamps.json    | [{ "name": "Ada" }]             | inputs-changed    |
        | specs/wishlist.feature | @id=wishlist\nFeature: Wishlist | specs-changed     |

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
      Then node "cart#add-an-item" has attribute status = "<status>"

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
      Then node "MS-beta#the-cart-works" has attribute status = "failed"
      And the step 'the node "cart" has stage "unrun"' reports "is a gate"
      Given a step definition "an empty cart" that passes
      And a step definition "I add a lamp" that passes
      And a step definition "the cart holds {int} item(s)" that passes
      When the workspace is run with "cart"
      Then node "MS-beta#the-cart-works" has attribute status = "stale"
      And node "MS-beta#the-cart-works" has attribute staleBecause = "results-changed"

  Rule: A run records the scenarios it executed, and keeps what every other run recorded, one that overlaps it too

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
      Then node "wishlist#keep-a-lamp-for-later" has attribute status = "failed"
      And node "cart#add-an-item" has attribute status = "passed"

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
