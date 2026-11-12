@id=REQ-agent-context @maturity=ready @agents
@refines:CAP-agent-collaboration @realized-by:ARCH-reports
@iteration:I1 @activity.implementation:I1 @activity.test:I1
Feature: Context bundles for agents

  Before changing anything, an agent asks for one node's context — `sdp context <id>`, or the MCP
  tool `sdp_context` — and gets one Markdown document with everything needed to work on it, so one
  call replaces a dozen greps.

  Rule: One call gives everything needed to work on a node, the contract first

    For a spec that is built, the names of its scenarios are the reference and its text explains them,
    so the bundle leads with them.

    Scenario: One call gives the node, its spec text, its relationships, and the architecture, decisions and code in reach
      Given a file "specs/REQ-checkout.feature" containing:
        """
        @id=REQ-checkout @maturity=ready @realized-by:ARCH-orders
        Feature: Checkout

          Shoppers pay for their cart.
        """
      And a file "specs/ARCH-orders.feature" containing:
        """
        @id=ARCH-orders @decided-by:DEC-0001
        Feature: Orders

          Owns the order aggregate and its transaction boundary.
        """
      And these specs:
        | tags         | Feature                            |
        | @id=DEC-0001 | One database transaction per order |
      And a file "src/orders.ts" containing:
        """
        // @sdp implements REQ-checkout
        export function checkout() {}
        """
      When I ask for the context of "REQ-checkout"
      Then the output contains "kind: requirement, maturity: ready  ·  source: specs/REQ-checkout.feature:1"
      And the output section "Specification" contains "Shoppers pay for their cart."
      And the output contains "REQ-checkout -realized-by-> ARCH-orders — Orders"
      And the output section "Architecture within" contains "Owns the order aggregate"
      And the output contains "DEC-0001 — One database transaction per order"
      And the output section "Code" contains "src/orders.ts:1 checkout — implements REQ-checkout"

    Scenario: The bundle leads with the contract: each rule with its state, what it rests on and why it holds, then its examples
      Given a file "specs/REQ-cart.feature" containing:
        """
        @id=REQ-cart @maturity=draft
        Feature: Cart

          Shoppers collect items before paying.

          @decided-by:DEC-0001
          Rule: A cart holds each item once

            Two lines for one item would be charged twice.

            Scenario: Adding an item twice raises its quantity
              Then the cart holds 1 item

          Rule: An empty cart cannot be paid

          @open
          Rule: Does a cart expire?
        """
      And these specs:
        | tags         | Feature           |
        | @id=DEC-0001 | One line per item |
      When I ask for the context of "REQ-cart"
      Then the sections of the output are "Not ready yet, Contract, Specification, Decisions in reach"
      And the output contains:
        """
        3 rule(s), 1 scenario(s), 1 open

        ### A cart holds each item once
        [unrun] — specs/REQ-cart.feature:7 · decided-by DEC-0001

        Two lines for one item would be charged twice.

        - [unrun] Adding an item twice raises its quantity — specs/REQ-cart.feature:11

        ### An empty cart cannot be paid
        [no example] — specs/REQ-cart.feature:14

        ### Does a cart expire?
        [open] — specs/REQ-cart.feature:17
        """
      When I ask for the context of "DEC-0001"
      Then the output section "Rules that rest on this" contains "- [unrun] A cart holds each item once (decided-by) — REQ-cart specs/REQ-cart.feature:7"

    Scenario: A spec below ready says what keeps it from ready
      Given a file "specs/REQ-checkout.feature" containing:
        """
        @id=REQ-checkout @maturity=specified
        Feature: Checkout

          Shoppers pay for their cart.

          @open
          Rule: Do we accept invoices?
        """
      When I ask for the context of "REQ-checkout"
      Then the output section "Not ready yet" contains "1 open question(s), e.g. \"Do we accept invoices?\" (line 7)"

    Scenario: A spec whose content already meets the criteria of ready is told to raise its maturity
      Given a file "specs/REQ-checkout.feature" containing:
        """
        @id=REQ-checkout @maturity=draft
        Feature: Checkout

          Shoppers pay for their cart.

          Rule: A payment creates an order

            Scenario: Pay by card
              Then an order is created
        """
      When I ask for the context of "REQ-checkout"
      Then the output section "Not ready yet" contains "already meets the criteria of ready"

  Rule: The bundle says which steps are still to write, and runs nothing to know

    Background:
      Given a file "specs/REQ-cart.feature" containing:
        """
        @id=REQ-cart
        Feature: Cart

          Rule: A cart holds what was added

            Scenario: Add an item
              Given an empty cart
              When I add a lamp
              Then the cart holds 1 item
        """

    Scenario: A step without a definition is listed before any run, with a suggested definition and the step files to add it to
      Given a file "specs/steps/cart.steps.ts" containing:
        """
        import { defineSteps } from "sdp/steps"

        export default defineSteps(() => ({}), ({ Given }) => {
          Given("an empty cart", () => {})
        })
        """
      When I run "sdp context REQ-cart"
      Then the output section "Contract" contains "[unrun] Add an item — specs/REQ-cart.feature:6"
      And the output section "Contract" contains 'suggested: `When("I add a lamp", ({ world }) => pending())`'
      And the output section "Contract" does not contain "an empty cart"
      And the output section "Step definitions" contains "Step files: specs/steps/cart.steps.ts"

    Scenario: After a run, each scenario has its status and only the steps still undefined are listed
      Given a step definition "an empty cart" that passes
      When the workspace is run
      And I ask for the context of "REQ-cart"
      Then the output section "Contract" contains "[undefined] Add an item — specs/REQ-cart.feature:6"
      And the output section "Contract" contains "undefined: When I add a lamp"
      And the output section "Contract" contains 'suggested: `When("I add a lamp", ({ world }) => pending())`'
      And the output section "Contract" contains 'suggested: `Then("the cart holds {int} item", ({ world, args: [int] }) => pending())`'
      And the output section "Contract" does not contain "an empty cart"

    Scenario: A step that failed in the last run is listed with its error and where it is defined
      Given a file "specs/steps/cart.steps.ts" containing:
        """
        import { defineSteps } from "sdp/steps"

        export default defineSteps(() => ({}), ({ Given }) => {
          Given("an empty cart", () => {
            throw new Error("the cart service is down")
          })
        })
        """
      When I run "sdp run"
      Then the exit code is 1
      When I run "sdp context REQ-cart"
      Then the output section "Contract" contains "- [failed] Add an item — specs/REQ-cart.feature:6"
      And the output section "Contract" contains "failed: Given an empty cart — the cart service is down (defined at specs/steps/cart.steps.ts:4)"

    Scenario: A registration that cannot be read is named and leaves the bundle incomplete, so its step is not mistaken for undefined
      Given a file "specs/steps/cart.steps.ts" containing:
        """
        import { defineSteps } from "sdp/steps"

        const phrases = ["an empty cart"]
        export default defineSteps(() => ({}), ({ Given }) => {
          for (const phrase of phrases) Given(phrase, () => {})
        })
        """
      When I run "sdp context REQ-cart"
      Then the exit code is 2
      And the output section "Contract" contains "undefined: Given an empty cart"
      And the output section "Step definitions" contains "specs/steps/cart.steps.ts:5: this statement registers steps under a condition, in a loop or through another name"

  Rule: Reach follows links, two hops unless --depth says otherwise, and never through the plan

    Scenario: Two hops reach an element's pattern and neighbour, three its neighbour's
      Given these specs:
        | tags                                                            | Feature  |
        | @id=REQ-checkout @realized-by:ARCH-orders                       | Checkout |
        | @id=ARCH-orders @instance-of:PAT-saga @publishes-to:ARCH-ledger | Orders   |
        | @id=ARCH-ledger @replicates-to:ARCH-archive                     | Ledger   |
        | @id=ARCH-archive                                                | Archive  |
        | @id=PAT-saga                                                    | Saga     |
      When I ask for the context of "REQ-checkout"
      Then the output section "Architecture within" contains "ARCH-orders"
      And the output section "Architecture within" contains "ARCH-ledger"
      And the output section "Architecture within" contains "PAT-saga"
      And the output section "Architecture within" does not contain "ARCH-archive"
      When I run "sdp context REQ-checkout --depth 3"
      Then the output section "Architecture within" contains "ARCH-archive"

    Scenario: What is planned into the same iteration is not within reach
      Given these specs:
        | tags                           | Feature  |
        | @id=REQ-checkout @iteration:E1 | Checkout |
        | @id=E1 @kind=iteration         | E1       |
        | @id=ARCH-search @iteration:E1  | Search   |
      When I ask for the context of "REQ-checkout"
      Then the output section "Relationships" contains "REQ-checkout -iteration-> E1"
      And the output does not contain "ARCH-search"

  Rule: What is in reach comes with its own words, so none of it needs opening

    Scenario: An element in reach that has no description is described by the code anchored to it
      Given these specs:
        | tags                                      | Feature  |
        | @id=REQ-checkout @realized-by:ARCH-orders | Checkout |
      And a file "src/orders.ts" containing:
        """
        import { annotate } from "sdp/annotations"

        /** Owns the order aggregate and its transaction boundary. */
        export class Orders {}
        annotate(Orders, { is: "ARCH-orders" })
        """
      When I ask for the context of "REQ-checkout"
      Then the output contains:
        """
        - ARCH-orders — ARCH-orders (element)
        Owns the order aggregate and its transaction boundary.
        """

    Scenario: A quality requirement in reach comes with its measure: the outcome steps of its scenarios
      Given these specs:
        | tags                                                 | Feature  |
        | @id=REQ-checkout @realized-by:ARCH-orders            | Checkout |
        | @id=ARCH-orders @constrained-by:NFR-checkout-latency | Orders   |
      And a file "specs/NFR-checkout-latency.feature" containing:
        """
        @id=NFR-checkout-latency
        Feature: Checkout latency

          Rule: Checkout keeps up with load

            Scenario: Confirmation under load
              Given 500 shoppers checking out at once
              When a shopper pays
              Then the confirmation shows within 300 ms at p95
              And no payment is lost
        """
      When I ask for the context of "REQ-checkout"
      Then the output section "Quality requirements" contains "NFR-checkout-latency — Checkout latency"
      And the output section "Quality requirements" contains "measure: the confirmation shows within 300 ms at p95; no payment is lost"

    Scenario: A decision in reach comes with its text whole
      Given these specs:
        | tags                                  | Feature  |
        | @id=REQ-checkout @decided-by:DEC-0001 | Checkout |
      And a file "specs/DEC-0001.feature" containing:
        """
        @id=DEC-0001
        Feature: One payments provider for cards and invoices

          Not a provider for each, although each alone is cheaper: two integrations mean two sets of
          refunds, chargebacks and reconciliation reports to keep in step, and the finance team reads one
          statement a month. The price is the higher card fee of the one provider that does both, which
          we accept until volume makes the difference worth a second integration.
        """
      When I ask for the context of "REQ-checkout"
      Then the output section "Decisions" contains "Not a provider for each, although each alone is cheaper"
      And the output section "Decisions" contains "worth a second integration."
