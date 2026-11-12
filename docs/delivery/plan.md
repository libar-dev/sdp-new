---
id: PLAN
kind: plan
title: Delivery plan for sdp 1.0
links:
  decided-by: DEC-0007
nodes:
  - { id: inception,    kind: phase, title: Inception,    order: 1 }
  - { id: elaboration,  kind: phase, title: Elaboration,  order: 2 }
  - { id: construction, kind: phase, title: Construction, order: 3 }
  - { id: transition,   kind: phase, title: Transition,   order: 4 }
  - { id: I1, kind: iteration, title: "Vision, scope and prototype", phase: inception, start: "2026-11-02", end: "2026-11-13" }
  - { id: E1, kind: iteration, title: Spec format and graph, phase: elaboration,  start: "2026-11-16", end: "2026-11-27" }
  - { id: E2, kind: iteration, title: Gates and curation,    phase: elaboration,  start: "2026-11-30", end: "2026-12-11" }
  - { id: C1, kind: iteration, title: Execution and query,   phase: construction, start: "2027-01-04", end: "2027-01-15" }
  - { id: C2, kind: iteration, title: Agent access,          phase: construction, start: "2027-01-18", end: "2027-01-29" }
  - { id: C3, kind: iteration, title: Lifecycle,             phase: construction, start: "2027-02-01", end: "2027-02-12" }
  - { id: C4, kind: iteration, title: Exploration,           phase: construction, start: "2027-02-15", end: "2027-02-26" }
  - { id: T1, kind: iteration, title: Beta,                  phase: transition,   start: "2027-03-01", end: "2027-03-12" }
  - { id: T2, kind: iteration, title: Release,               phase: transition,   start: "2027-03-15", end: "2027-03-26" }
  - { id: REL-0.9, kind: release, title: "0.9 beta", iteration: T1 }
  - { id: REL-1.0, kind: release, title: "1.0",      iteration: T2 }
---

# Delivery plan for sdp 1.0

Risk-driven phases with two-week iterations ([[DEC-0007]]). Work is planned by setting
`iteration:` on a spec, decision or element; `sdp lifecycle` shows the result.

**We are in Inception (I1).** I1 produced an executable prototype that already verifies several
requirements planned for later iterations; their `iteration` marks when they are hardened and
accepted, not when they were first built. Gates of later milestones are shown as *not due*.

| Phase | Iterations | Milestone | The gate checks |
| --- | --- | --- | --- |
| Inception | I1 | [[MS-LCO]] Lifecycle Objectives | vision, capabilities, requirements and main risks identified; foundational decisions accepted |
| Elaboration | E1, E2 | [[MS-LCA]] Lifecycle Architecture | elaboration requirements ready; architecture curated and justified |
| Construction | C1–C4 | [[MS-IOC]] Initial Operational Capability | ready construction requirements verified; no errors, no failing scenarios |
| Transition | T1, T2 | [[MS-PR]] Product Release | everything planned is verified; package published |
