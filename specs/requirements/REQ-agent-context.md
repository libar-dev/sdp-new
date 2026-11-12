---
id: REQ-agent-context
kind: requirement
title: Context bundles for agents
maturity: ready
iteration: C2
tags: [agents]
links:
  refines: CAP-agent-collaboration
  realized-by: ARCH-graph
---

# Context bundles for agents

Before changing anything, an agent asks for one node's context — `sdp context <id>`, or the MCP
tool `sdp_context` — and gets a single Markdown document with everything needed to work on it:

1. the node's kind, maturity, stage, source and attributes;
2. the spec text;
3. its relationships, each with the other node's title, status and `file:line`;
4. the status of each scenario and, for every step that did not pass, its status and error — with a
   suggested step definition for each undefined step;
5. the significant architecture within two hops (`--depth`), with the rationale for each element,
   and the patterns it applies;
6. the decisions within reach that still apply, with their summaries — superseded, rejected and
   deprecated records are left out;
7. the code linked by `@sdp` annotations within reach.

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
  And the output contains "src/orders.ts"

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
~~~
