---
id: REQ-agent-context
kind: requirement
title: Context bundles for agents
maturity: ready
iteration: I1
tags: [agents]
links:
  refines: CAP-agent-collaboration
  realized-by: ARCH-reports
---

# Context bundles for agents

Before changing anything, an agent asks for one node's context — `sdp context <id>`, or the MCP
tool `sdp_context` — and gets a single Markdown document with everything needed to work on it:

1. the node's kind, maturity, stage, source and attributes;
2. for a spec below `ready`, why it is not ready: what the ready gate still misses
   ([[REQ-maturity-gates]]), or that the content already meets it;
3. the spec text;
4. its relationships, each with the other node's title, status and `file:line`;
5. the status of each scenario; for each step that failed or is pending in the last run, its error
   and the `file:line` of its definition; and each step that no step definition — or more than one —
   matches, with a suggested definition. Steps are matched against the step definitions as they are
   now, so this needs no run; the step files are named, to add the definitions to;
6. the significant architecture within two hops (`--depth`), with the rationale for each element,
   and the patterns it applies;
7. the quality requirements within reach, each with its measure: the outcome (`Then`) steps of its
   scenarios;
8. the decisions within reach that still apply, each with what was decided — its `## Decision`
   section — while superseded, rejected and deprecated records are left out;
9. the code linked by `@sdp` annotations within reach, each with its `file:line`, symbol and what it
   links to.

Only curated architecture is included. An element or pattern that no architect marked significant
is design detail: it shows up as a direct relationship, never as architecture — the bundle does not
list every class nearby.

## Scenarios

~~~gherkin
Scenario: One call gives an agent the whole picture
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
  And a file "docs/ARCH-orders.md" containing:
    """
    ---
    id: ARCH-orders
    kind: element
    significant: true
    rationale: owns the order aggregate and its transaction boundary
    links:
      decided-by: DEC-0001
    ---
    # Orders
    """
  And a file "docs/DEC-0001.md" containing:
    """
    ---
    id: DEC-0001
    kind: decision
    status: accepted
    ---
    # One database transaction per order
    """
  And a file "src/orders.ts" containing:
    """
    // @sdp implements REQ-checkout
    export function checkout() {}
    """
  When I ask for the context of "REQ-checkout"
  Then the output contains "Shoppers pay for their cart."
  And the output contains "REQ-checkout -realized-by-> ARCH-orders — Orders"
  And the output contains "rationale: owns the order aggregate"
  And the output contains "DEC-0001 — One database transaction per order"
  And the output section "Code" contains "src/orders.ts:1 checkout — implements REQ-checkout"

Scenario: Only curated architecture within two hops is included
  Given a file "specs/REQ-checkout.md" containing:
    """
    ---
    id: REQ-checkout
    maturity: idea
    links:
      realized-by: [ARCH-orders, ARCH-cache]
    ---
    # Checkout
    """
  And a file "docs/architecture.md" containing:
    """
    ---
    id: ARCH-overview
    kind: view
    nodes:
      - { id: ARCH-orders, kind: element, significant: true, rationale: owns the order aggregate, links: { instance-of: PAT-saga, publishes-to: ARCH-ledger } }
      - { id: ARCH-ledger, kind: element, significant: true, rationale: the books must balance, links: { replicates-to: ARCH-archive } }
      - { id: ARCH-archive, kind: element, significant: true, rationale: kept for ten years }
      - { id: ARCH-cache, kind: element, links: { instance-of: PAT-memo } }
      - { id: PAT-saga, kind: pattern }
      - { id: PAT-memo, kind: pattern }
    ---
    # Architecture
    """
  When I ask for the context of "REQ-checkout"
  Then the output section "Significant architecture" contains "ARCH-orders"
  And the output section "Significant architecture" contains "ARCH-ledger"
  And the output section "Significant architecture" does not contain "ARCH-archive"
  And the output section "Significant architecture" does not contain "ARCH-cache"
  And the output section "Patterns" contains "PAT-saga"
  And the output section "Patterns" does not contain "PAT-memo"
  And the output section "Relationships" contains "ARCH-cache"

Scenario: Only decisions that still apply are included
  Given a file "specs/REQ-checkout.md" containing:
    """
    ---
    id: REQ-checkout
    maturity: idea
    links:
      decided-by: [DEC-1, DEC-2]
    ---
    # Checkout
    """
  And a file "docs/decisions.md" containing:
    """
    ---
    id: DECISIONS
    kind: log
    nodes:
      - { id: DEC-1, kind: decision, title: Card payments only, status: rejected }
      - { id: DEC-2, kind: decision, title: Cards and invoices, status: accepted }
    ---
    # Decisions
    """
  When I ask for the context of "REQ-checkout"
  Then the output section "Decisions" contains "DEC-2"
  And the output section "Decisions" does not contain "DEC-1"

Scenario: Scenario status comes with the step definitions still to write
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

Scenario: Decisions in reach say what was decided
  Given a file "specs/REQ-checkout.md" containing:
    """
    ---
    id: REQ-checkout
    links:
      decided-by: DEC-0001
    ---
    # Checkout
    """
  And a file "docs/DEC-0001.md" containing:
    """
    ---
    id: DEC-0001
    kind: decision
    status: accepted
    ---
    # Payments provider

    ## Context

    Card payments need a provider we can trust.

    ## Decision

    We use one provider for cards and invoices.
    """
  When I ask for the context of "REQ-checkout"
  Then the output section "Decisions" contains "We use one provider for cards and invoices."
  And the output section "Decisions" does not contain "Card payments need a provider"

Scenario: Quality requirements in reach come with their measure
  Given a file "specs/REQ-checkout.md" containing:
    """
    ---
    id: REQ-checkout
    links:
      realized-by: ARCH-orders
    ---
    # Checkout
    """
  And a file "docs/ARCH-orders.md" containing:
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

Scenario: Steps without a definition are listed before any run, with the step files to add them to
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
    import { defineSteps } from "sdp"

    export default defineSteps(() => ({}), ({ Given }) => {
      Given("an empty cart", () => {})
    })
    """
  When I run "sdp context REQ-cart"
  Then the output section "Scenarios" contains "[unrun] Add an item — specs/REQ-cart.md:10"
  And the output section "Scenarios" contains 'suggested: `When("I add a lamp", ({ world }) => pending())`'
  And the output section "Scenarios" does not contain "an empty cart"
  And the output section "Step definitions" contains "Step files: specs/steps/cart.steps.ts"
~~~
