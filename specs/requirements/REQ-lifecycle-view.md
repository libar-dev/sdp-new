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
  decided-by: DEC-0007
---

# Lifecycle view

The delivery lifecycle is part of the graph, not tool configuration ([[DEC-0007]]): phases split
into iterations and end in milestones, and any spec, decision or element is planned by naming its
iteration. `sdp lifecycle` shows the phases with their milestone gates, the iterations with their
work by stage, and how much work of each discipline every iteration carries.

| RUP concept | In sdp |
| --- | --- |
| Phase (Inception, Elaboration, Construction, Transition) | `kind: phase` nodes, ordered by `order` |
| Iteration (I1, E1, E2, C1, …) | `kind: iteration` nodes with `phase:`, `start:` and `end:` |
| Milestone (LCO, LCA, IOC, PR) | `kind: milestone` specs with `phase:`; their scenarios are the gate |
| Planned work | any node with `iteration: <id>` |
| Discipline (business modeling … deployment) | a set of node kinds (`lifecycle.disciplines`, see [[REQ-configuration]]) |

**Where we are.** The iteration whose `start…end` contains today is the current one; it is marked
`*` and its phase `◀ now`. A milestone gate of a later phase is shown as *not due* next to its
status: a future milestone is expected to be unmet. When today falls in no iteration, every gate
shows its status.

**Discipline activity** is computed from the plan, not drawn: the familiar RUP "hump" chart, one
row per discipline, one column per iteration, shaded relative to the busiest iteration of that
row. Implementation counts planned specs that are in progress or verified; test counts executed
scenarios (passed, failed or pending) of planned specs; every other discipline counts planned
nodes of its kinds. The chart shows the plan, not what happened; [[REQ-history-lifecycle]] would
derive activity from git history instead.

```text
DISCIPLINE ACTIVITY (relative per discipline)
                     I1  E1  E2  C1  C2  C3  C4  T1  T2
  business-modeling  ███
  requirements           ▒▒▒ ███ ▓▓▓ ▒▒▒ ▒▒▒ ░░░
  analysis-design    ▒▒▒ ███ ▒▒▒ ▒▒▒
  implementation     ░░░ ▒▒▒ ███ ▒▒▒ ▒▒▒ ▒▒▒
  test               ░░░ ▓▓▓ ███ ▓▓▓ ░░░ ░░░
  deployment                                     ███ ███
```

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
      - { id: I1, kind: iteration, phase: inception, start: "2026-01-05", end: "2026-01-30" }
      - { id: E1, kind: iteration, phase: elaboration, start: "2026-02-02", end: "2026-02-13" }
      - { id: E2, kind: iteration, phase: elaboration, start: "2026-02-16", end: "2026-02-27" }
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

Scenario: The current iteration is marked and later gates are not due
  When the lifecycle is computed on "2026-01-20"
  Then the current iteration is "I1"
  And the output line with "inception" contains "◀ now"
  And the output line with "◆ LCA" contains "not due"

Scenario: A gate falls due when its phase starts
  When the lifecycle is computed on "2026-02-20"
  Then the current iteration is "E2"
  And the output line with "elaboration" contains "E2*"
  And the output line with "elaboration" contains "◀ now"
  And the output line with "◆ LCA" does not contain "not due"

Scenario: Discipline activity is computed from planned work
  When the lifecycle is computed
  Then "requirements" activity in iteration "E1" is 1
  And "analysis-design" activity in iteration "E1" is 1
  And "requirements" activity in iteration "E2" is 0

Scenario: Implementation and test activity come from evidence
  Given a file "specs/REQ-b.md" containing:
    """
    ---
    id: REQ-b
    maturity: ready
    iteration: E2
    ---
    # Beta

    Something worth testing.

    ```gherkin
    Scenario: It works
      Then it works
    ```
    """
  And a step definition "it works" that passes
  When the scenarios are run
  And the lifecycle is computed
  Then "implementation" activity in iteration "E2" is 1
  And "test" activity in iteration "E2" is 1
  And "implementation" activity in iteration "E1" is 0
~~~
