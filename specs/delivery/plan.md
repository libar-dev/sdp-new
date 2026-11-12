---
id: PLAN
kind: plan
links:
  decided-by: DEC-0007
nodes:
  - { id: PH-inception,    title: Inception,    order: 1 }
  - { id: PH-elaboration,  title: Elaboration,  order: 2 }
  - { id: PH-construction, title: Construction, order: 3 }
  - { id: PH-transition,   title: Transition,   order: 4 }
  - { id: I1, kind: iteration, title: "Vision, scope and prototype", phase: PH-inception, start: "2026-11-02", end: "2026-11-13", planned: after-the-fact }
  - { id: E1, kind: iteration, title: Scale and compatibility, phase: PH-elaboration,  start: "2026-11-16", end: "2026-11-27" }
  - { id: E2, kind: iteration, title: Packaging,               phase: PH-elaboration,  start: "2026-11-30", end: "2026-12-11" }
  - { id: C1, kind: iteration, title: Editor support,          phase: PH-construction, start: "2027-01-04", end: "2027-01-15" }
  - { id: C2, kind: iteration, title: Spec-aware review,       phase: PH-construction, start: "2027-01-18", end: "2027-01-29" }
  - { id: C3, kind: iteration, title: Graph explorer,          phase: PH-construction, start: "2027-02-01", end: "2027-02-12" }
  - { id: C4, kind: iteration, title: Lifecycle from history,  phase: PH-construction, start: "2027-02-15", end: "2027-02-26" }
  - { id: T1, kind: iteration, title: Beta,                    phase: PH-transition,   start: "2027-03-01", end: "2027-03-12" }
  - { id: T2, kind: iteration, title: Release,                 phase: PH-transition,   start: "2027-03-15", end: "2027-03-26" }
---

# Delivery plan for sdp 1.0

~~~gherkin
Scenario: Whatever has left the idea stage is planned
  Then the query "requirement|nfr[maturity>=draft] !-iteration-> iteration" returns no results

Scenario: Work is planned only into declared iterations and disciplines
  Then there are no diagnostics for rule "plan-reference"

Scenario: Every phase has iterations and a milestone that closes it
  Then the query "phase !<-phase- iteration" returns no results
  And the query "phase !<-phase- milestone" returns no results

Scenario: A risk names what it threatens, and the work that retires it by a milestone unless it is tolerated
  Then the query "risk !-affects-> *" returns no results
  And the query "risk[status!=tolerated] !-mitigated-by-> *" returns no results
  And the query "risk[status!=tolerated] !-due-> milestone" returns no results
  And the query "risk[status=tolerated] ?-due-> milestone" returns no results
~~~
