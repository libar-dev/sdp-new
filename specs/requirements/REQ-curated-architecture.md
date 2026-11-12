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
architecture, and listing everything else next to them buries them. Which ones they are is the
architect's call ([[DEC-0008]]).

- **Declaring** an element or pattern is cheap: a Markdown file (`kind: element` or `kind: pattern`),
  an inline node, or a code comment `@sdp is ARCH-x kind=element`. Patterns are nodes; elements link
  to them with any relation, conventionally `instance-of` with an optional `role`. Relationships
  among elements are free-form (`feeds`, `reads`, `publishes-to`, …).
- **Marking significance** is an explicit act by an architect: `significant: true`, with a
  `rationale` saying why. sdp never computes, limits or checks it.
- **The curated view** — `sdp arch`, context bundles, MCP `sdp_architecture` — holds only the
  significant nodes, the patterns they apply, and the architectural drivers linked to them:
  decisions and quality requirements (`architecture.drivers` in [[REQ-configuration]]).
- **The tool helps, people decide.** `sdp arch --candidates` suggests nodes worth a look, ranked by
  links from decisions and quality requirements, requirements that depend on them, and fan-in. It
  never marks anything.
- **Rules are the team's.** A team that wants one writes it as a scenario, for example in a
  milestone gate: `Then the query "*[significant, !rationale]" returns no results`.

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

Scenario: Being specified, mentioned or implemented does not make an element a candidate
  Given a file "docs/ARCH-quiet.md" containing:
    """
    ---
    id: ARCH-quiet
    kind: element
    ---
    # Quiet

    ```gherkin
    Scenario: Does its job
      Then it works
    ```
    """
  And a file "specs/REQ-notes.md" containing:
    """
    ---
    id: REQ-notes
    maturity: idea
    ---
    # Notes

    Mentions [[ARCH-quiet]] in passing.
    """
  And a file "src/quiet.ts" containing:
    """
    // @sdp is ARCH-quiet
    export class Quiet {}
    """
  When I ask for architecture candidates
  Then the output does not contain "ARCH-quiet"
~~~
