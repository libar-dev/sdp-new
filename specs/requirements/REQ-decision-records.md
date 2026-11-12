---
id: REQ-decision-records
kind: requirement
title: Decision records for any decision
maturity: ready
iteration: I1
tags: [decisions]
links:
  refines: CAP-curated-architecture
  realized-by: ARCH-checker
---

# Decision records for any decision

Teams record decisions the way they record requirements: a spec with `kind: decision`, linked
into the graph. Architecture decisions are one category among many — `category` is free text:
`architecture`, `product`, `process`, `technology`, `organization`, …

A record follows MADR-like sections — Context, Options, Decision, Consequences — and has a
`status`: `proposed`, `accepted`, `rejected`, `deprecated` or `superseded`. What a decision shapes
links to it, conventionally with `decided-by`; the link is written once, on the shaped node, and
the decision's context lists those nodes as incoming links. A record may `supersede` an older
decision. `sdp check` keeps records consistent: a known status (`decision-status`), `supersedes`
links and `superseded` statuses that agree (`decision-supersede`), and an accepted decision that
states what was decided (`decision-content`). Rejected, deprecated and superseded records keep
their text but no longer guard anything: `sdp run` skips their scenarios.

When a decision can be checked mechanically, its record carries the check as a guard scenario —
[[DEC-0001]] asserts that all Gherkin parses, [[DEC-0002]] that every reference resolves. Whether
a changed decision is superseded or rewritten in place is the team's policy; sdp supports both, and
this repository rewrites them while in Inception ([[DEC-0007]]).

## Scenarios

~~~gherkin
Scenario: Product and process decisions are first-class
  Given a file "docs/DEC-0001.md" containing:
    """
    ---
    id: DEC-0001
    kind: decision
    category: product
    status: accepted
    ---
    # Free tier limited to three projects

    ## Decision
    Free accounts get three projects.
    """
  When the workspace is checked
  Then node "DEC-0001" has attribute category = "product"
  And the check does not report "decision-status"
  And the check does not report "decision-content"

Scenario: Superseding keeps the record consistent
  Given a file "docs/DEC-0001.md" containing:
    """
    ---
    id: DEC-0001
    kind: decision
    status: accepted
    ---
    # Weekly releases
    """
  And a file "docs/DEC-0002.md" containing:
    """
    ---
    id: DEC-0002
    kind: decision
    status: accepted
    links:
      supersedes: DEC-0001
    ---
    # Continuous delivery
    """
  When the workspace is checked
  Then the check reports "decision-supersede" for "DEC-0001"

Scenario: A decision can guard itself
  Given a file "docs/DEC-0003.md" containing:
    """
    ---
    id: DEC-0003
    kind: decision
    category: architecture
    status: accepted
    ---
    # Retire legacy billing

    ## Decision
    New code must not call the legacy billing module.

    ```gherkin
    Scenario: Nothing depends on legacy billing
      Then the query "code -uses-> #ARCH-legacy-billing" returns no results
    ```
    """
  And a file "docs/ARCH-legacy-billing.md" containing:
    """
    ---
    id: ARCH-legacy-billing
    kind: element
    ---
    # Legacy billing
    """
  And a file "src/invoices.ts" containing:
    """
    // @sdp uses ARCH-legacy-billing
    export function invoice() {}
    """
  When the scenarios are run
  Then scenario "DEC-0003#nothing-depends-on-legacy-billing" has status "failed"
~~~
