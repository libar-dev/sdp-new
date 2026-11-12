---
id: REQ-curated-architecture
kind: requirement
title: Curated architecture
maturity: ready
iteration: I1
activity: { implementation: I1, test: I1 }
tags: [architecture]
links:
  refines: CAP-curated-architecture
  realized-by: ARCH-architecture-view
  decided-by: DEC-0008
---

# Curated architecture

Most abstractions in a codebase — classes, modules, functions — are design detail. A small share
carry quality attributes, are expensive to change, or constrain many other parts; those are the
architecture, and listing everything else next to them buries them. The graph holds only those:
what an architect declares is, by that act, significant ([[DEC-0008]]).

- **Declaring** an element or pattern is a design statement: a Markdown file (`kind: element` or
  `kind: pattern`), an inline node, or an `is` annotation in code (`annotate(x, { is: "ARCH-x" })`,
  `@sdp is ARCH-x`). Its description says why it matters; its links to decisions and quality
  requirements say what shaped it. Elements link to patterns, conventionally with `instance-of` and
  an optional `role`; relationships among elements are free-form (`uses`, `publishes-to`, …).
- **The view** — `sdp arch`, context bundles, MCP `sdp_architecture` — holds every node of an
  architectural kind and the architectural drivers linked to them: decisions and quality
  requirements (`vocabulary.kinds` in [[REQ-configuration]]). A prose mention links nothing, so it
  pulls nothing into the view.
- **People decide.** sdp never computes, ranks, limits or suggests what belongs in the
  architecture. Adding or removing an element, a pattern or an `is` annotation is the architects'
  call; agents propose it.
- **Rules are the team's.** A team that wants one writes it as a scenario, for example in a
  milestone gate: `Then the query "element !-*- decision|nfr" returns no results`.

## Scenarios

~~~gherkin
Background:
  Given a file "docs/architecture.md" containing:
    """
    ---
    id: ARCH-VIEW
    kind: view
    nodes:
      - { id: ARCH-orders, kind: element, title: Orders, links: { decided-by: DEC-1, instance-of: PAT-outbox, constrained-by: NFR-latency } }
      - { id: ARCH-mailer, kind: element, title: Mailer }
      - { id: PAT-outbox, kind: pattern, title: Transactional outbox }
      - { id: DEC-1, kind: decision, title: Orders publish events through an outbox, status: accepted }
      - { id: DEC-2, kind: decision, title: Logs are JSON, status: accepted }
      - { id: NFR-latency, kind: nfr, title: Checkout latency }
      - { id: REQ-receipts, kind: requirement, maturity: idea, links: { realized-by: [ARCH-orders, ARCH-mailer] } }
    ---
    # Architecture
    """
  And a file "docs/ARCH-billing.md" containing:
    """
    ---
    id: ARCH-billing
    kind: element
    title: Billing
    ---
    # Billing

    Owns invoices; tax rules are regulated and costly to change.

    It writes logs, as [[DEC-2]] says.
    """

Scenario: The view shows every declared element and pattern with what shaped it
  When I ask for the architecture view
  Then the output contains "ARCH-orders — Orders (element)"
  And the output contains "ARCH-mailer — Mailer (element)"
  And the output contains "PAT-outbox — Transactional outbox (pattern)"
  And the output contains "ARCH-orders -instance-of-> PAT-outbox"
  And the output contains "ARCH-orders -decided-by-> DEC-1"
  And the output contains "ARCH-orders -constrained-by-> NFR-latency"
  And the output contains "Owns invoices; tax rules are regulated and costly to change."
  And the output does not contain "REQ-receipts"

Scenario: A mention pulls nothing into the view
  When an agent calls the MCP tool "sdp_architecture" with:
    """
    { "json": true }
    """
  Then the output field "data.architecture" holds "ARCH-billing, ARCH-mailer, ARCH-orders, PAT-outbox"
  And the output field "data.drivers" holds "DEC-1, NFR-latency"

Scenario: An element anchored in code is part of the architecture
  Given a file "src/quiet.ts" containing:
    """
    // @sdp is ARCH-quiet
    export class Quiet {}
    """
  When I ask for the architecture view
  Then the output contains "ARCH-quiet — ARCH-quiet (element)"

Scenario: However much code there is, the architecture is what an architect declared or anchored
  Given a file "src/orders.ts" containing:
    """
    import { annotate } from "sdp/annotations"
    export class Orders {}
    export class OrderMapper {}
    export class OrderValidator {}
    annotate(Orders, { is: "ARCH-orders" })
    """
  When I query "element|pattern"
  Then the result is "ARCH-billing, ARCH-mailer, ARCH-orders, PAT-outbox"

Scenario: What belongs in the architecture is never checked
  When the workspace is checked
  Then the check reports nothing
~~~
