---
id: REQ-lifecycle-view
kind: requirement
title: Lifecycle view
maturity: ready
iteration: I1
activity: { implementation: I1, test: I1 }
tags: [lifecycle]
links:
  refines: CAP-living-specs
  realized-by: ARCH-lifecycle
  decided-by: [DEC-0007, DEC-0013]
---

# Lifecycle view

The delivery lifecycle is part of the graph, not tool configuration ([[DEC-0007]]): phases split
into iterations and end in milestones, and any spec, decision or element is planned by naming its
iteration. `sdp lifecycle` shows the phases with their milestone gates, the work planned into each
iteration, how much work of each discipline every iteration is planned to carry, and — apart from
the plan — the evidence for that work.

| RUP concept | In sdp |
| --- | --- |
| Phase (Inception, Elaboration, Construction, Transition) | `kind: phase` nodes, ordered by `order` |
| Iteration (I1, E1, E2, C1, …) | `kind: iteration` nodes with `phase:`, `start:` and `end:` |
| Milestone (LCO, LCA, IOC, PR) | `kind: milestone` specs with `phase:`; their scenarios are the gate |
| Planned work | any node with `iteration: <id>`, or with an iteration in its `activity:` |
| Discipline (business modeling … deployment) | a set of node kinds (`vocabulary.disciplines`, see [[REQ-configuration]]) |
| Discipline activity on a piece of work | `activity:`, iterations per discipline |

**What plans work.** Only the plan relations do — `iteration`, unless `vocabulary.relations.plan`
says otherwise — and only the phase relations (`phase`) put iterations and milestones into a phase
([[REQ-configuration]]). They are link keys, so they plan the same whichever way they are written
and must name declared nodes ([[DEC-0010]]). A `[[E2]]` mention in prose plans nothing, a node is
counted once in an iteration however many relations lead there, and the plan's own phases,
iterations and milestones are not planned work. Every node with a maturity that is planned nowhere
is listed as unplanned.

**Discipline activity is planned, per piece of work.** A node's `iteration:` plans the work of its
own kind's discipline — a requirement is written, a decision taken, a release deployed — in that
iteration. Work of other disciplines on it, and work that falls in other iterations, is planned
with `activity:`, which maps disciplines to an iteration or a list of them:

```yaml
id: REQ-editor-support
iteration: E2                       # requirements work: specified in E2
activity:
  analysis-design: [E2, C1]
  implementation: C1
  test: [C1, C2]
```

Keyed by discipline, it reads like the chart's rows. Each entry is a link named by its path —
`-activity.implementation-> C1` — and, like every link, also an attribute:
`sdp q 'requirement[activity.implementation=C1]'` and `sdp q 'requirement -activity.implementation-> #C1'`
find the same nodes. A discipline that `activity:` names takes exactly the iterations listed there
(an empty list plans none); the others keep the default. `sdp check` reports an `activity` value
that names no iteration, a key that names no discipline, and a node whose kind belongs to no
discipline planned with `iteration:` alone, which no row of the chart would show
(`plan-reference`, [[REQ-check-rules]]).

The chart is the familiar RUP "hump" chart, one row per discipline and one column per iteration:
each cell counts the nodes with that discipline's work planned there, shaded `░ ▒ ▓ █` relative to
the busiest iteration of its row. It is the plan, nothing else: running scenarios does not change
it. [[REQ-history-lifecycle]] would set what actually happened next to it.

**Evidence is shown apart.** Under its own heading, each iteration's planned work is counted by
stage (derived from maturity and scenario results, [[REQ-executable-specs]]) and its scenarios by
the status of their last run.

**Where we are.** The iteration whose `start…end` contains today is the current one; it is marked
`*`. The current phase, marked `◀ now`, is the phase of the latest iteration that has started, so a
break between iterations stays in the phase just worked on. Both are the calendar, not progress: a
milestone is met only when its gate passes. A gate of a later phase is shown as *not due* next to
its status, since a future milestone is expected to be unmet; before the first iteration starts,
no gate is due. A gate whose phase the calendar has left behind and that does not pass is
*overdue* — never met by the passing of time. `sdp lifecycle` prints all of it for this
repository's [[PLAN]].

## Scenarios

~~~gherkin
Background:
  Given a file "plan.md" containing:
    """
    ---
    id: PLAN
    kind: plan
    nodes:
      - { id: PH-inception, kind: phase, order: 1 }
      - { id: PH-elaboration, kind: phase, order: 2 }
      - { id: I1, kind: iteration, phase: PH-inception, start: "2026-01-05", end: "2026-01-30" }
      - { id: E1, kind: iteration, phase: PH-elaboration, start: "2026-02-02", end: "2026-02-13" }
      - { id: E2, kind: iteration, phase: PH-elaboration, start: "2026-02-16", end: "2026-02-27" }
    ---
    # Plan
    """
  And a file "LCA.md" containing:
    """
    ---
    id: LCA
    kind: milestone
    phase: PH-elaboration
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
  Then phase "PH-elaboration" has iterations "E1, E2"
  And phase "PH-elaboration" has milestone "LCA"

Scenario: The current iteration is marked and later gates are not due
  When the lifecycle is computed on "2026-01-20"
  Then the current iteration is "I1"
  And the output line with "PH-inception" contains "◀ now"
  And the output line with "◆ LCA" contains "not due"

Scenario: A gate falls due when its phase starts
  When the lifecycle is computed on "2026-02-20"
  Then the current iteration is "E2"
  And the output line with "PH-elaboration" contains "E2*"
  And the output line with "PH-elaboration" contains "◀ now"
  And the output line with "◆ LCA" does not contain "not due"
  And the output line with "◆ LCA" does not contain "overdue"

Scenario: A break between iterations stays in the phase just worked on
  When the lifecycle is computed on "2026-01-31"
  Then the current iteration is "none"
  And the output line with "PH-inception" contains "◀ now"
  And the output line with "◆ LCA" contains "not due"

Scenario: Before the plan starts no gate is due
  When the lifecycle is computed on "2025-12-15"
  Then the current iteration is "none"
  And the output line with "◆ LCA" contains "not due"

Scenario: The calendar never marks a milestone met
  Given a file "LCO.md" containing:
    """
    ---
    id: LCO
    kind: milestone
    phase: PH-inception
    ---
    # Lifecycle objectives

    ```gherkin
    Scenario: The vision is written
      Then the query "vision" returns 1 result
    ```
    """
  When the lifecycle is computed on "2026-02-20"
  Then the output line with "◆ LCO" contains "overdue"
  And the output line with "◆ LCO" does not contain "✔"

Scenario: An iteration plans each node once, and mentions and the plan's own nodes are no work
  Given a file "specs/REQ-m.md" containing:
    """
    ---
    id: REQ-m
    maturity: idea
    iteration: E1
    ---
    # Mentioned

    Discussed in [[E1]]; see also [[E2]].
    """
  And a file "MS-demo.md" containing:
    """
    ---
    id: MS-demo
    kind: milestone
    phase: PH-elaboration
    iteration: E2
    ---
    # Demo
    """
  When the lifecycle is computed
  Then iteration "E1" plans "DEC-1, REQ-a, REQ-m"
  And iteration "E2" plans "nothing"
  And "requirements" activity in iteration "E1" is 2

Scenario: Only nodes with a maturity can be unplanned
  Given a file "specs/REQ-later.md" containing:
    """
    ---
    id: REQ-later
    maturity: idea
    ---
    # Later
    """
  And a file "docs/ARCH-cache.md" containing:
    """
    ---
    id: ARCH-cache
    kind: element
    ---
    # Cache
    """
  When the lifecycle is computed on "2026-01-20"
  Then the output line with "unplanned" contains "REQ-later"
  And the output line with "unplanned" does not contain "ARCH-cache"

Scenario: Discipline activity defaults to the kind's discipline in the node's iteration
  When the lifecycle is computed
  Then "requirements" activity in iteration "E1" is 1
  And "analysis-design" activity in iteration "E1" is 1
  And "requirements" activity in iteration "E2" is 0
  And "implementation" activity in iteration "E1" is 0

Scenario: activity plans other disciplines into iterations of their own
  Given a file "specs/REQ-b.md" containing:
    """
    ---
    id: REQ-b
    maturity: idea
    iteration: E1
    activity:
      analysis-design: E1
      implementation: [E1, E2]
      test: E2
    ---
    # Beta
    """
  When the lifecycle is computed
  Then "requirements" activity in iteration "E1" is 2
  And "analysis-design" activity in iteration "E1" is 2
  And "implementation" activity in iteration "E1" is 1
  And "implementation" activity in iteration "E2" is 1
  And "test" activity in iteration "E1" is 0
  And "test" activity in iteration "E2" is 1
  And iteration "E2" plans "REQ-b"

Scenario Outline: A discipline activity names takes only the iterations listed there
  Given a file "specs/REQ-b.md" containing:
    """
    ---
    id: REQ-b
    maturity: idea
    iteration: E1
    activity: { requirements: <iterations> }
    ---
    # Beta
    """
  When the lifecycle is computed
  Then "requirements" activity in iteration "E1" is 1
  And "requirements" activity in iteration "E2" is <in E2>
  And iteration "E1" plans "DEC-1, REQ-a, REQ-b"

  Examples:
    | iterations | in E2 |
    | E2         | 1     |
    | []         | 0     |

Scenario: The chart shades each discipline relative to its busiest iteration
  Given a file "specs/REQ-b.md" containing:
    """
    ---
    id: REQ-b
    maturity: idea
    iteration: E2
    ---
    # Beta
    """
  And a file "specs/REQ-c.md" containing:
    """
    ---
    id: REQ-c
    maturity: idea
    iteration: E2
    ---
    # Gamma
    """
  When the lifecycle is computed on "2026-01-20"
  Then the output line with "requirements" contains "    ▒▒▒ ███"

Scenario: Evidence is shown apart from the planned activity
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
  And the lifecycle is computed on "2026-02-20"
  Then "implementation" activity in iteration "E2" is 0
  And "test" activity in iteration "E2" is 0
  And the output line with "E2" under "EVIDENCE" contains "verified:1  scenarios passed:1"
  And the output line with "E1" under "EVIDENCE" contains "ready:1"
~~~
