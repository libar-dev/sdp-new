---
id: REQ-significance-curation
kind: requirement
title: Curated architectural significance
maturity: ready
iteration: E2
tags: [architecture]
links:
  refines: CAP-curated-architecture
  realized-by: ARCH-significance
  decided-by: DEC-0009
---

# Curated architectural significance

Only a small share of a system's abstractions and patterns — typically 10% or fewer — are
architecturally significant: they carry quality attributes, are expensive to change, or constrain
many other parts. Those are the ones worth naming in the architecture; listing everything buries
them. So significance is an explicit, curated choice:

- An element or pattern becomes significant only with `significant: true` **and** a `rationale`.
- It must be linked to what justifies it: a decision or a quality requirement.
- The share of significant abstractions is measured against an inventory of the abstractions in
  code and must stay within a budget (10% by default).
- `sdp arch --candidates` *suggests* promotions from graph signals; people decide.

## Scenarios

~~~gherkin
Background:
  Given a file "docs/architecture.md" containing:
    """
    ---
    id: ARCH-VIEW
    kind: view
    nodes:
      - { id: ARCH-ledger, kind: element, significant: true, rationale: "audit trail; regulated", links: { decided-by: DEC-1 } }
      - { id: ARCH-cache, kind: element, significant: true }
      - { id: DEC-1, kind: decision, status: accepted }
    ---
    # Architecture
    """

Scenario: Significance needs a rationale
  When the workspace is checked
  Then the check reports "significance-rationale" for "ARCH-cache"

Scenario: Significance needs a justification
  When the workspace is checked
  Then the check reports "significance-justification" for "ARCH-cache"

Scenario: The budget keeps the curated set small
  Given 10 exported abstractions in "src/model.ts"
  When the workspace is checked
  Then the check reports "significance-budget"
  And the "significance-budget" diagnostic has severity "warning"

Scenario: Within budget there is nothing to report
  Given 40 exported abstractions in "src/model.ts"
  When the workspace is checked
  Then the check does not report "significance-budget"
~~~
