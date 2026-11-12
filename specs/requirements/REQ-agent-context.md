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

Before changing anything, an agent asks for one node's context and gets a single Markdown
document: the spec text, its relationships, scenario status (with suggested step definitions for
what is not automated), the significant architecture and decisions within two hops, and the code
already linked to it. Only curated architecture is included — not every class nearby.

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
  And the output contains "rationale: owns the order aggregate"
  And the output contains "DEC-0001 — One database transaction per order"
  And the output contains "src/orders.ts"
~~~
