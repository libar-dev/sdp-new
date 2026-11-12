---
id: PLAN
kind: plan
title: Delivery plan for sdp 1.0
links:
  decided-by: DEC-0008
nodes:
  - { id: inception,    kind: phase, title: Inception,    order: 1 }
  - { id: elaboration,  kind: phase, title: Elaboration,  order: 2 }
  - { id: construction, kind: phase, title: Construction, order: 3 }
  - { id: transition,   kind: phase, title: Transition,   order: 4 }
  - { id: I1, kind: iteration, title: Vision and scope,      phase: inception,    start: "2026-09-01", end: "2026-09-12" }
  - { id: E1, kind: iteration, title: Spec format and graph, phase: elaboration,  start: "2026-09-15", end: "2026-09-26" }
  - { id: E2, kind: iteration, title: Gates and curation,    phase: elaboration,  start: "2026-09-29", end: "2026-10-10" }
  - { id: C1, kind: iteration, title: Execution and query,   phase: construction, start: "2026-10-13", end: "2026-10-24" }
  - { id: C2, kind: iteration, title: Agent access,          phase: construction, start: "2026-10-27", end: "2026-11-07" }
  - { id: C3, kind: iteration, title: Lifecycle,             phase: construction, start: "2026-11-10", end: "2026-11-21" }
  - { id: C4, kind: iteration, title: Exploration,           phase: construction, start: "2026-11-24", end: "2026-12-05" }
  - { id: T1, kind: iteration, title: Beta,                  phase: transition,   start: "2026-12-08", end: "2026-12-19" }
  - { id: T2, kind: iteration, title: Release,               phase: transition,   start: "2027-01-05", end: "2027-01-16" }
  - { id: REL-0.9, kind: release, title: "0.9 beta", iteration: T1 }
  - { id: REL-1.0, kind: release, title: "1.0",      iteration: T2 }
---

# Delivery plan for sdp 1.0

Risk-driven phases with two-week iterations ([[DEC-0008]]). Work is planned by setting
`iteration:` on a spec, decision or element; `sdp lifecycle` shows the result.

| Phase | Iterations | Milestone | The gate checks |
| --- | --- | --- | --- |
| Inception | I1 | [[MS-LCO]] Lifecycle Objectives | capabilities and initial requirements exist; foundational decisions accepted |
| Elaboration | E1, E2 | [[MS-LCA]] Lifecycle Architecture | elaboration requirements ready; architecture curated, justified, within budget |
| Construction | C1–C4 | [[MS-IOC]] Initial Operational Capability | ready construction requirements verified; no errors, no failing scenarios |
| Transition | T1, T2 | [[MS-PR]] Product Release | everything planned is verified; package published |
