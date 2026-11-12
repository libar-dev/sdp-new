---
id: REQ-agent-context
kind: requirement
title: Context bundles for agents
maturity: ready
iteration: I1
activity: { implementation: I1, test: I1 }
tags: [agents]
links:
  refines: CAP-agent-collaboration
  realized-by: ARCH-reports
---

# Context bundles for agents

Before changing anything, an agent asks for one node's context — `sdp context <id>`, or the MCP
tool `sdp_context` — and gets one Markdown document with everything needed to work on it, so one
call replaces a dozen greps. It leads with the contract: for a spec that is built, the names of
its scenarios are the reference, and the text explains them.

## The node itself

~~~gherkin
Scenario: One call gives the node, its spec text, its relationships, and the architecture, decisions and code in reach
  Given a file "specs/REQ-checkout.md" containing:
    """
    ---
    id: REQ-checkout
    maturity: ready
    links:
      realized-by: ARCH-orders
    ---
    # Checkout

    Shoppers pay for their cart.
    """
  And a file "specs/ARCH-orders.md" containing:
    """
    ---
    id: ARCH-orders
    kind: element
    links:
      decided-by: DEC-0001
    ---
    # Orders

    Owns the order aggregate and its transaction boundary.
    """
  And a file "specs/DEC-0001.md" containing:
    """
    ---
    id: DEC-0001
    ---
    # One database transaction per order
    """
  And a file "src/orders.ts" containing:
    """
    // @sdp implements REQ-checkout
    export function checkout() {}
    """
  When I ask for the context of "REQ-checkout"
  Then the output contains "kind: requirement, maturity: ready  ·  source: specs/REQ-checkout.md:1"
  And the output section "Specification" contains "Shoppers pay for their cart."
  And the output contains "REQ-checkout -realized-by-> ARCH-orders — Orders"
  And the output section "Architecture within" contains "Owns the order aggregate"
  And the output contains "DEC-0001 — One database transaction per order"
  And the output section "Code" contains "src/orders.ts:1 checkout — implements REQ-checkout"

Scenario: The bundle leads with the contract, before the spec text: the scenario names with their status, under each rule and what it says must hold
  Given a file "specs/REQ-cart.md" containing:
    """
    ---
    id: REQ-cart
    maturity: ready
    ---
    # Cart

    Shoppers collect items before paying.

    ```gherkin
    Scenario: A new cart is empty
      Then the cart holds 0 items

    Rule: A cart holds each item once

      Two lines for one item would be charged twice.

      Scenario: Adding an item twice raises its quantity
        Then the cart holds 1 item

    Rule: An empty cart cannot be paid

      Scenario: Paying for nothing is refused
        Then the payment is refused
    ```
    """
  When I ask for the context of "REQ-cart"
  Then the sections of the output are "Scenarios (3), Specification"
  And the output section "Scenarios" contains:
    """
    - [unrun] A new cart is empty — specs/REQ-cart.md:10

    ### A cart holds each item once

    Two lines for one item would be charged twice.

    - [unrun] Adding an item twice raises its quantity — specs/REQ-cart.md:17

    ### An empty cart cannot be paid

    - [unrun] Paying for nothing is refused — specs/REQ-cart.md:22
    """

Scenario: A spec below ready says what keeps it from ready
  Given a file "specs/REQ-checkout.md" containing:
    """
    ---
    id: REQ-checkout
    maturity: specified
    ---
    # Checkout

    Shoppers pay for their cart.

    ## Open questions

    - [ ] Do we accept invoices?

    ```gherkin
    Scenario: Pay by card
      Then an order is created
    ```
    """
  When I ask for the context of "REQ-checkout"
  Then the output section "Not ready yet" contains "1 open question(s), e.g. \"Do we accept invoices?\" (line 11)"

Scenario: A spec whose content already meets the criteria of ready is told to raise its maturity
  Given a file "specs/REQ-checkout.md" containing:
    """
    ---
    id: REQ-checkout
    maturity: draft
    ---
    # Checkout

    Shoppers pay for their cart.

    ```gherkin
    Scenario: Pay by card
      Then an order is created
    ```
    """
  When I ask for the context of "REQ-checkout"
  Then the output section "Not ready yet" contains "set `maturity: ready` if the team agrees"

Scenario: A node declared inside another spec has no text to open, so its text attributes come with it
  Given a file "specs/REQ-checkout.md" containing:
    """
    ---
    id: REQ-checkout
    iteration: C1
    ---
    # Checkout
    """
  And a file "specs/TERMS.md" containing:
    """
    ---
    id: TERMS
    kind: terms
    nodes:
      - id: TERM-cart
        kind: term
        title: Cart
        definition: The items a shopper has chosen and not yet paid for.
        links: { specified-by: REQ-checkout }
      - { id: C1, kind: iteration, title: Checkout, start: "2026-11-16", end: "2026-11-27" }
    ---
    # Terms
    """
  When I ask for the context of "REQ-checkout"
  Then the output section "Relationships" contains "REQ-checkout <-specified-by- TERM-cart — Cart (term) specs/TERMS.md:5"
  And the line after the output line with "TERM-cart — Cart" contains "  definition: The items a shopper has chosen and not yet paid for."
  And the line after the output line with "REQ-checkout -iteration-> C1" contains "  start: 2026-11-16"
~~~

## The steps still to write

Steps are matched against the step definitions as read from the step files, so nothing of the
workspace runs and no run is needed.

~~~gherkin
Scenario: A step without a definition is listed before any run, with a suggested definition and the step files to add it to
  Given a file "specs/REQ-cart.md" containing:
    """
    ---
    id: REQ-cart
    maturity: ready
    ---
    # Cart

    Shoppers collect items before paying.

    ```gherkin
    Scenario: Add an item
      Given an empty cart
      When I add a lamp
      Then the cart holds 1 item
    ```
    """
  And a file "specs/steps/cart.steps.ts" containing:
    """
    import { defineSteps } from "sdp/steps"

    export default defineSteps(() => ({}), ({ Given }) => {
      Given("an empty cart", () => {})
    })
    """
  When I run "sdp context REQ-cart"
  Then the output section "Scenarios" contains "[unrun] Add an item — specs/REQ-cart.md:10"
  And the output section "Scenarios" contains 'suggested: `When("I add a lamp", ({ world }) => pending())`'
  And the output section "Scenarios" does not contain "an empty cart"
  And the output section "Step definitions" contains "Step files: specs/steps/cart.steps.ts"

Scenario: After a run, each scenario has its status and only the steps still undefined are listed
  Given a file "specs/REQ-cart.md" containing:
    """
    ---
    id: REQ-cart
    maturity: ready
    ---
    # Cart

    Shoppers collect items before paying.

    ```gherkin
    Scenario: Add an item
      Given an empty cart
      When I add a lamp
      Then the cart holds 1 item
    ```
    """
  And a step definition "an empty cart" that passes
  When the scenarios are run
  And I ask for the context of "REQ-cart"
  Then the output section "Scenarios" contains "[undefined] Add an item — specs/REQ-cart.md:10"
  And the output section "Scenarios" contains "undefined: When I add a lamp"
  And the output section "Scenarios" contains 'suggested: `When("I add a lamp", ({ world }) => pending())`'
  And the output section "Scenarios" contains 'suggested: `Then("the cart holds {int} item", ({ world, args: [int] }) => pending())`'
  And the output section "Scenarios" does not contain "an empty cart"

Scenario: A step that failed in the last run is listed with its error and where it is defined
  Given a file "specs/REQ-cart.md" containing:
    """
    ---
    id: REQ-cart
    ---
    # Cart

    ```gherkin
    Scenario: Add an item
      Given an empty cart
    ```
    """
  And a file "specs/steps/cart.steps.ts" containing:
    """
    import { defineSteps } from "sdp/steps"

    export default defineSteps(() => ({}), ({ Given }) => {
      Given("an empty cart", () => {
        throw new Error("the cart service is down")
      })
    })
    """
  When I run "sdp run"
  And I run "sdp context REQ-cart"
  Then the output section "Scenarios" contains "- [failed] Add an item — specs/REQ-cart.md:7"
  And the output section "Scenarios" contains "failed: Given an empty cart — the cart service is down (defined at specs/steps/cart.steps.ts:4)"

Scenario: A registration that cannot be read is named and leaves the bundle incomplete, so its step is not mistaken for undefined
  Given a file "specs/REQ-cart.md" containing:
    """
    ---
    id: REQ-cart
    ---
    # Cart

    ```gherkin
    Scenario: Add an item
      Given an empty cart
    ```
    """
  And a file "specs/steps/cart.steps.ts" containing:
    """
    import { defineSteps } from "sdp/steps"

    const phrases = ["an empty cart"]
    export default defineSteps(() => ({}), ({ Given }) => {
      for (const phrase of phrases) Given(phrase, () => {})
    })
    """
  When I run "sdp context REQ-cart"
  Then the exit code is 2
  And the output section "Scenarios" contains "undefined: Given an empty cart"
  And the output section "Step definitions" contains "specs/steps/cart.steps.ts:5: this statement registers steps under a condition, in a loop or through another name"
  When I run "sdp steps cart"
  Then the exit code is 2
  And the output contains "note: not read: specs/steps/cart.steps.ts:5"
~~~

## What is in reach

Reach follows links, two hops unless `--depth` says otherwise.

~~~gherkin
Scenario: The architecture within two hops is included; a mention is listed as a relationship and leads no further
  Given a file "specs/REQ-checkout.md" containing:
    """
    ---
    id: REQ-checkout
    maturity: idea
    links:
      realized-by: ARCH-orders
    ---
    # Checkout

    Unlike the [[ARCH-cache]].
    """
  And a file "specs/architecture.md" containing:
    """
    ---
    id: ARCH-overview
    kind: view
    nodes:
      - { id: ARCH-orders, kind: element, links: { instance-of: PAT-saga, publishes-to: ARCH-ledger } }
      - { id: ARCH-ledger, kind: element, links: { replicates-to: ARCH-archive } }
      - { id: ARCH-archive, kind: element }
      - { id: ARCH-cache, kind: element, links: { instance-of: PAT-memo } }
      - { id: PAT-saga, kind: pattern }
      - { id: PAT-memo, kind: pattern }
    ---
    # Architecture
    """
  When I ask for the context of "REQ-checkout"
  Then the output section "Architecture within" contains "ARCH-orders"
  And the output section "Architecture within" contains "ARCH-ledger"
  And the output section "Architecture within" contains "PAT-saga"
  And the output section "Architecture within" does not contain "ARCH-archive"
  And the output section "Architecture within" does not contain "ARCH-cache"
  And the output section "Architecture within" does not contain "PAT-memo"
  And the output section "Relationships" contains "-mentions-> ARCH-cache"

Scenario: An element in reach that has no description is described by the code anchored to it
  Given a file "specs/REQ-checkout.md" containing:
    """
    ---
    id: REQ-checkout
    links:
      realized-by: ARCH-orders
    ---
    # Checkout
    """
  And a file "src/orders.ts" containing:
    """
    import { annotate } from "sdp/annotations"

    /** Owns the order aggregate and its transaction boundary. */
    export class Orders {}
    annotate(Orders, { is: "ARCH-orders" })
    """
  When I ask for the context of "REQ-checkout"
  Then the line after the output line with "- ARCH-orders — ARCH-orders (element)" contains "Owns the order aggregate and its transaction boundary."

Scenario: A quality requirement in reach comes with its measure: the outcome steps of its scenarios
  Given a file "specs/REQ-checkout.md" containing:
    """
    ---
    id: REQ-checkout
    links:
      realized-by: ARCH-orders
    ---
    # Checkout
    """
  And a file "specs/ARCH-orders.md" containing:
    """
    ---
    id: ARCH-orders
    kind: element
    links:
      constrained-by: NFR-checkout-latency
    ---
    # Orders
    """
  And a file "specs/NFR-checkout-latency.md" containing:
    """
    ---
    id: NFR-checkout-latency
    kind: nfr
    ---
    # Checkout latency

    ```gherkin
    Scenario: Confirmation under load
      Given 500 shoppers checking out at once
      When a shopper pays
      Then the confirmation shows within 300 ms at p95
      And no payment is lost
    ```
    """
  When I ask for the context of "REQ-checkout"
  Then the output section "Quality requirements" contains "NFR-checkout-latency — Checkout latency"
  And the output section "Quality requirements" contains "measure: the confirmation shows within 300 ms at p95; no payment is lost"

Scenario: What is planned into the same iteration is not within reach
  Given a file "specs/REQ-checkout.md" containing:
    """
    ---
    id: REQ-checkout
    maturity: idea
    iteration: E1
    ---
    # Checkout
    """
  And a file "specs/plan.md" containing:
    """
    ---
    id: PLAN
    kind: plan
    nodes:
      - { id: E1, kind: iteration }
      - { id: ARCH-search, kind: element, iteration: E1 }
    ---
    # Plan
    """
  When I ask for the context of "REQ-checkout"
  Then the output section "Relationships" contains "REQ-checkout -iteration-> E1"
  And the output does not contain "ARCH-search"

Scenario: A decision in reach comes with its text whole
  Given a file "specs/REQ-checkout.md" containing:
    """
    ---
    id: REQ-checkout
    links:
      decided-by: DEC-0001
    ---
    # Checkout
    """
  And a file "specs/DEC-0001.md" containing:
    """
    ---
    id: DEC-0001
    ---
    # One payments provider for cards and invoices

    Not a provider for each, although each alone is cheaper: two integrations mean two sets of
    refunds, chargebacks and reconciliation reports to keep in step, and the finance team reads one
    statement a month. The price is the higher card fee of the one provider that does both, which
    we accept until volume makes the difference worth a second integration.
    """
  When I ask for the context of "REQ-checkout"
  Then the output section "Decisions" contains "Not a provider for each, although each alone is cheaper"
  And the output section "Decisions" contains "worth a second integration."
~~~
