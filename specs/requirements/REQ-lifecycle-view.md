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
  decided-by: DEC-0007
---

# Lifecycle view

The plan is part of the graph: iterations on a timeline, milestones that each end a stretch of it,
and work that names the iterations it is done in. `sdp lifecycle` shows where the project is — the
first milestone that is not met, which the files say and no date does — next to where the calendar
is, the work planned into each iteration, and the evidence for it.

## Milestones

~~~gherkin
Background:
  Given a file "plan.md" containing:
    """
    ---
    id: PLAN
    kind: plan
    nodes:
      - { id: PH-inception, kind: phase, title: Inception }
      - { id: PH-elaboration, kind: phase, title: Elaboration }
      - { id: I1, kind: iteration, phase: PH-inception, start: "2026-01-05", end: "2026-01-30" }
      - { id: E1, kind: iteration, phase: PH-elaboration, start: "2026-02-02", end: "2026-02-13" }
      - { id: E2, kind: iteration, phase: PH-elaboration, start: "2026-02-16", end: "2026-02-27" }
    ---
    # Plan
    """
  And a file "MS-LCO.md" containing:
    """
    ---
    id: MS-LCO
    closes: PH-inception
    ---
    # Lifecycle objectives

    ```gherkin
    Scenario: There is a plan
      Then the query "plan" returns 1 result

    Scenario: The work is planned
      Then the query "requirement !-iteration-> iteration" returns no results
    ```
    """
  And a file "MS-LCA.md" containing:
    """
    ---
    id: MS-LCA
    closes: PH-elaboration
    ---
    # Lifecycle architecture

    ```gherkin
    Scenario: There is an architecture
      Then the query "element" returns at least 1 result
    ```
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
  And a file "specs/ARCH-x.md" containing:
    """
    ---
    id: ARCH-x
    iteration: E1
    ---
    # An element
    """

Scenario: A milestone ends the iterations since the milestone before it, on the last day of what it closes
  Given a file "MS-demo.md" containing:
    """
    ---
    id: MS-demo
    closes: E1
    ---
    # Demo
    """
  When the lifecycle is computed on "2026-01-20"
  Then the output line with "MS-LCO" contains "Inception"
  And the output line with "MS-LCO" contains "I1*"
  And the output line with "MS-LCO" contains "2026-01-30"
  And the output line with "MS-demo" contains "Elaboration"
  And the output line with "MS-demo" contains "E1"
  And the output line with "MS-demo" contains "2026-02-13"
  And the line after the output line with "MS-demo" contains "MS-LCA"
  And the output line with "MS-LCA" does not contain "E1"
  And the output line with "MS-LCA" contains "E2"
  And the output line with "MS-LCA" contains "2026-02-27"

Scenario: The project is at the first milestone that is not met, wherever the calendar is
  Given a file "MS-LCO.md" containing:
    """
    ---
    id: MS-LCO
    closes: PH-inception
    met: 2026-01-30
    ---
    # Lifecycle objectives
    """
  When the lifecycle is computed on "2026-01-20"
  Then the output contains "project in Elaboration · calendar in I1"
  And the output line with "MS-LCO" contains "✔"
  And the output line with "MS-LCO" contains "met 2026-01-30"
  And the output line with "MS-LCA" contains "▶"

Scenario: The calendar marks today and lateness, and meets nothing
  When the lifecycle is computed on "2026-02-20"
  Then the current iteration is "E2"
  And the output contains "project in Inception · calendar in E2"
  And the output line with "MS-LCO" contains "▶"
  And the output line with "MS-LCO" contains "late 21d"
  And the output line with "MS-LCA" does not contain "late"

Scenario Outline: A milestone met off its date says by how many days
  Given a file "MS-LCO.md" containing:
    """
    ---
    id: MS-LCO
    closes: PH-inception
    met: <met>
    ---
    # Lifecycle objectives
    """
  When the lifecycle is computed on "2026-02-20"
  Then the output line with "MS-LCO" contains "met <met> (<off>)"

  Examples:
    | met        | off |
    | 2026-02-03 | +4d |
    | 2026-01-28 | -2d |

Scenario: The next milestone shows its gate one scenario at a time, as last run
  Given a file "specs/REQ-b.md" containing:
    """
    ---
    id: REQ-b
    maturity: idea
    ---
    # Beta
    """
  When the lifecycle is computed on "2026-01-20"
  Then the output line with "MS-LCO" contains "0/2"
  And the output contains "… There is a plan  (unrun)"
  When the workspace is run
  And the lifecycle is computed on "2026-01-20"
  Then the output line with "MS-LCO" contains "1/2"
  And the output contains "✔ There is a plan"
  And the output contains "✘ The work is planned"

Scenario: The gate of a milestone that is met does not run again
  Given a file "MS-LCO.md" containing:
    """
    ---
    id: MS-LCO
    closes: PH-inception
    met: 2026-01-30
    ---
    # Lifecycle objectives

    ```gherkin
    Scenario: There is a plan
      Then the query "plan" returns no results
    ```
    """
  When the workspace is run
  Then scenario "MS-LCO#there-is-a-plan" has no result

Scenario: A milestone has no stage, so a gate that is not met yet is no failing work
  Given a file "specs/REQ-b.md" containing:
    """
    ---
    id: REQ-b
    maturity: idea
    ---
    # Beta
    """
  When the workspace is run
  Then scenario "MS-LCO#the-work-is-planned" has status "failed"
  And sdp status counts the stages "idea:1 ready:1"

Scenario: A timeline needs no phases, and a milestone nothing but what it closes
  Given a file "plan.md" containing:
    """
    ---
    id: PLAN
    kind: plan
    nodes:
      - { id: I1, kind: iteration, start: "2026-01-05", end: "2026-01-30" }
      - { id: E1, kind: iteration, start: "2026-02-02", end: "2026-02-13" }
      - { id: E2, kind: iteration, start: "2026-02-16", end: "2026-02-27" }
    ---
    # Plan
    """
  And a file "MS-LCO.md" containing:
    """
    ---
    id: MS-LCO
    closes: I1
    ---
    # First release
    """
  And a file "MS-LCA.md" containing:
    """
    ---
    id: MS-LCA
    closes: E1
    ---
    # Second release
    """
  When the lifecycle is computed on "2026-02-20"
  Then the output contains "project at MS-LCO · calendar in E2"
  And the output line with "MS-LCA" contains "2026-02-13"
  And the output line with "no milestone" contains "E2*"

Scenario: Milestones are met in the order of their dates
  When I run "sdp gate MS-LCA --record"
  Then the exit code is 1
  And the output contains "MS-LCA cannot be met before MS-LCO"
  When I run "sdp gate MS-LCO --record"
  Then the exit code is 0
  When I run "sdp gate MS-LCA --record"
  Then the exit code is 0
  When I run "sdp q milestone[met] --ids"
  Then the output lines are "MS-LCA, MS-LCO"

Scenario: A milestone written as met before one dated earlier is reported
  Given a file "MS-LCA.md" containing:
    """
    ---
    id: MS-LCA
    closes: PH-elaboration
    met: 2026-02-27
    ---
    # Lifecycle architecture
    """
  When the workspace is checked
  Then sdp reports at least:
    | rule          | node   | at          |
    | milestone-met | MS-LCA | MS-LCA.md:4 |

~~~

## Planned work

Activity is planned on the work itself, not as a task per discipline or one iteration per spec:
a requirement is written in one iteration and built in another, and a gate has to tell the two
apart. `iteration:` plans the work of the node's own kind, `activity:` that of any discipline.

~~~gherkin
Scenario: Iterations hang off their phase, in the order of the timeline
  When the lifecycle is computed
  Then phase "PH-elaboration" has iterations "E1, E2"

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
    closes: E2
    iteration: E2
    ---
    # Demo
    """
  When the lifecycle is computed
  Then iteration "E1" plans "ARCH-x, REQ-a, REQ-m"
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
  And a file "specs/ARCH-cache.md" containing:
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
  And iteration "E1" plans "ARCH-x, REQ-a, REQ-b"

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

~~~

## Evidence

~~~gherkin
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
