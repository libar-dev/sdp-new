---
id: REQ-lifecycle-view
kind: requirement
title: Lifecycle view
maturity: ready
iteration: C3
tags: [lifecycle]
links:
  refines: CAP-living-specs
  realized-by: ARCH-lifecycle
  decided-by: DEC-0008
---

# Lifecycle view

The delivery lifecycle is part of the graph: phases split into iterations and end in milestones,
and any spec, decision or element can be planned into an iteration. `sdp lifecycle` shows phases,
milestone gates (whose scenarios decide whether the milestone is met) and how much work of each
discipline — business modelling, requirements, analysis & design, implementation, test,
deployment — each iteration carries. The discipline chart is computed from the plan, not drawn.

## Scenarios

~~~gherkin
Background:
  Given a file "plan.md" containing:
    """
    ---
    id: PLAN
    kind: plan
    nodes:
      - { id: inception, kind: phase, order: 1 }
      - { id: elaboration, kind: phase, order: 2 }
      - { id: I1, kind: iteration, phase: inception }
      - { id: E1, kind: iteration, phase: elaboration, start: "2026-02-01" }
      - { id: E2, kind: iteration, phase: elaboration, start: "2026-02-15" }
    ---
    # Plan
    """
  And a file "LCA.md" containing:
    """
    ---
    id: LCA
    kind: milestone
    phase: elaboration
    ---
    # Lifecycle architecture
    """
  And a file "specs/REQ-a.md" containing:
    """
    ---
    id: REQ-a
    maturity: ready
    iteration: E1
    ---
    # Alpha
    """
  And a file "docs/DEC-1.md" containing:
    """
    ---
    id: DEC-1
    kind: decision
    status: accepted
    iteration: E1
    ---
    # A decision
    """

Scenario: Iterations and milestones hang off their phase
  When the lifecycle is computed
  Then phase "elaboration" has iterations "E1, E2"
  And phase "elaboration" has milestone "LCA"

Scenario: Discipline activity is computed from planned work
  When the lifecycle is computed
  Then "requirements" activity in iteration "E1" is 1
  And "analysis-design" activity in iteration "E1" is 1
  And "requirements" activity in iteration "E2" is 0
~~~
