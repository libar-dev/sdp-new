---
id: PLAN
kind: plan
title: Delivery plan for sdp 1.0
links:
  decided-by: [DEC-0007, DEC-0013]
nodes:
  - { id: PH-inception, title: Inception,    order: 1 }
  - { id: PH-elaboration, title: Elaboration,  order: 2 }
  - { id: PH-construction, title: Construction, order: 3 }
  - { id: PH-transition, title: Transition,   order: 4 }
  - { id: I1, kind: iteration, title: "Vision, scope and prototype", phase: PH-inception, start: "2026-11-02", end: "2026-11-13", planned: after-the-fact }
  - { id: E1, kind: iteration, title: Scale and compatibility, phase: PH-elaboration,  start: "2026-11-16", end: "2026-11-27" }
  - { id: E2, kind: iteration, title: Packaging,               phase: PH-elaboration,  start: "2026-11-30", end: "2026-12-11" }
  - { id: C1, kind: iteration, title: Editor support,          phase: PH-construction, start: "2027-01-04", end: "2027-01-15" }
  - { id: C2, kind: iteration, title: Spec-aware review,       phase: PH-construction, start: "2027-01-18", end: "2027-01-29" }
  - { id: C3, kind: iteration, title: Graph explorer,          phase: PH-construction, start: "2027-02-01", end: "2027-02-12" }
  - { id: C4, kind: iteration, title: Lifecycle from history,  phase: PH-construction, start: "2027-02-15", end: "2027-02-26" }
  - { id: T1, kind: iteration, title: Beta,                    phase: PH-transition,   start: "2027-03-01", end: "2027-03-12" }
  - { id: T2, kind: iteration, title: Release,                 phase: PH-transition,   start: "2027-03-15", end: "2027-03-26" }
  - { id: REL-0.9, kind: release, title: "0.9 beta", iteration: T1, activity: { test: T1 } }
  - { id: REL-1.0, kind: release, title: "1.0",      iteration: T2 }
---

# Delivery plan for sdp 1.0

The plan is data: the phases, iterations and releases above, and the `iteration:` and `activity:`
keys of each piece of work ([[DEC-0013]]). Ask it rather than read about it:

```sh
sdp lifecycle                                             # where we are, what is planned when, which gates are met
sdp q 'requirement|nfr ?-activity.implementation-> #C1'   # what an iteration builds
sdp q 'risk -due-> milestone' --paths                     # which risk is to be retired by which milestone
sdp q 'requirement|nfr !-iteration-> iteration'           # what is not planned yet
sdp q 'iteration[planned=after-the-fact]'                 # iterations written down after the work
```

What the data cannot say is why each phase takes what it takes ([[DEC-0007]]):

- **Inception** was a prototype built in one go. Its plan was written down afterwards, so I1 is
  marked `planned: after-the-fact`: its column of the chart is a record, not a forecast that came
  true.
- **Elaboration** takes the work that could still change the architecture — how a large workspace
  is read, the step definition API, how the tool is packaged — so that Construction builds on a
  baseline that has run.
- **Construction** builds what keeps specifications honest and readable once more people and
  agents write them, one feature per iteration.
- **Transition** puts a beta in front of its first users, then ships the release.

## Scenarios

~~~gherkin
Scenario: Whatever has left the idea stage is planned
  Then the query "requirement|nfr[maturity>=draft] !-iteration-> iteration" returns no results

@gate
Scenario: An iteration recorded after the fact holds no work that is still to be done
  Then the query "requirement|nfr ?-iteration-> iteration[planned=after-the-fact]" returns at least 1 result
  And the query "requirement|nfr[stage!=verified] ?-iteration|activity.implementation-> iteration[planned=after-the-fact]" returns no results
~~~
