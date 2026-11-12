---
id: REQ-curated-architecture
kind: requirement
title: Curated architecture
maturity: ready
iteration: E2
tags: [architecture]
links:
  refines: CAP-curated-architecture
  realized-by: ARCH-architecture-view
  decided-by: DEC-0008
---

# Curated architecture

Only a small share of a system's abstractions and patterns are architecturally significant: they
carry quality attributes, are expensive to change, or constrain many other parts. Those are the
ones worth naming in the architecture; listing everything buries them.

Which ones they are is the architect's call ([[DEC-0008]]). Architects mark elements and patterns
`significant: true` and record why in `rationale`. sdp does not compute, limit or check
significance. It shows the curated set — in `sdp arch`, in context bundles and over MCP — together
with the patterns it applies and the decisions and quality requirements linked to it, and leaves
everything else out. `sdp arch --candidates` can suggest elements worth a look; it never marks
anything.

## Scenarios

~~~gherkin
Background:
  Given a file "docs/architecture.md" containing:
    """
    ---
    id: ARCH-VIEW
    kind: view
    nodes:
      - { id: ARCH-orders, kind: element, title: Orders, significant: true, rationale: owns the order transaction boundary, links: { decided-by: DEC-1, instance-of: PAT-outbox, constrained-by: NFR-latency } }
      - { id: ARCH-mailer, kind: element, title: Mailer }
      - { id: PAT-outbox, kind: pattern, title: Transactional outbox }
      - { id: DEC-1, kind: decision, title: Orders publish events through an outbox, status: accepted }
      - { id: NFR-latency, kind: nfr, title: Checkout latency }
      - { id: REQ-receipts, kind: requirement, maturity: idea, links: { realized-by: [ARCH-orders, ARCH-mailer] } }
    ---
    # Architecture
    """

Scenario: The view shows what architects marked significant, and what surrounds it
  When I ask for the architecture view
  Then the output contains "ARCH-orders — Orders (element)"
  And the output contains "rationale: owns the order transaction boundary"
  And the output contains "ARCH-orders -instance-of-> PAT-outbox"
  And the output contains "ARCH-orders -decided-by-> DEC-1"
  And the output contains "ARCH-orders -constrained-by-> NFR-latency"
  And the output does not contain "ARCH-mailer"
  And the output does not contain "REQ-receipts"

Scenario: Significance is never checked
  Given a file "docs/more.md" containing:
    """
    ---
    id: ARCH-MORE
    kind: view
    nodes:
      - { id: ARCH-a, kind: element, significant: true }
      - { id: ARCH-b, kind: element, significant: true }
      - { id: ARCH-c, kind: element, significant: true }
    ---
    # Three more, without rationale or links
    """
  When the workspace is checked
  Then the check reports nothing

Scenario: Candidates are suggestions, never decisions
  When I ask for architecture candidates
  Then the output contains "ARCH-mailer"
  And node "ARCH-mailer" has attribute significant = "undefined"
~~~
