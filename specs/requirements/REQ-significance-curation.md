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
  decided-by: DEC-0010
---

# Curated architectural significance

Only a small share of a system's abstractions and patterns — often around 10% or fewer — are
architecturally significant: they carry quality attributes, are expensive to change, or constrain
many other parts. Those are the ones worth naming in the architecture; listing everything buries
them. So significance is an explicit, curated choice:

- An element or pattern becomes significant only with `significant: true` **and** a `rationale`.
- It must be linked to what justifies it: a decision or a quality requirement.
- The share of significant abstractions is compared with a ~10% *guideline*, measured against an
  inventory of the abstractions in code. Above it, `sdp check` gives an `info` hint to review the
  curated set — a prompt for a conversation, not a failure ([[DEC-0010]]). In inception the
  inventory is small and the curated set is still forming, so the share can be far off without
  anything being wrong. Teams that want a firmer line raise `guidelineSeverity`.
- `sdp arch --candidates` *suggests* promotions from graph signals; people decide.

## Scenarios

~~~gherkin
Rule: Every significant element earns its place

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
    And the "significance-rationale" diagnostic has severity "error"

  Scenario: Significance needs a justification
    When the workspace is checked
    Then the check reports "significance-justification" for "ARCH-cache"

Rule: The significant share is a guideline, not a limit

  Scenario: Above the guideline the check only suggests a review
    Given 2 significant elements, each justified by a decision
    And 10 exported abstractions in "src/model.ts"
    When the workspace is checked
    Then the check reports "significance-guideline"
    And the "significance-guideline" diagnostic has severity "info"

  Scenario: Teams can make the guideline firmer
    Given a file "sdp.config.yaml" containing:
      """
      architecture:
        guidelineSeverity: warning
      """
    And 2 significant elements, each justified by a decision
    And 10 exported abstractions in "src/model.ts"
    When the workspace is checked
    Then the "significance-guideline" diagnostic has severity "warning"

  Scenario: Within the guideline there is nothing to report
    Given 2 significant elements, each justified by a decision
    And 40 exported abstractions in "src/model.ts"
    When the workspace is checked
    Then the check does not report "significance-guideline"

  Scenario: A small system may always name one significant element
    Given 1 significant element, each justified by a decision
    And 3 exported abstractions in "src/core.ts"
    When the workspace is checked
    Then the check does not report "significance-guideline"
    And the check reports no errors
~~~
