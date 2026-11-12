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
  - { id: E1, kind: iteration, title: Scale and compatibility, phase: elaboration,  start: "2026-11-16", end: "2026-11-27" }
  - { id: E2, kind: iteration, title: Packaging,               phase: elaboration,  start: "2026-11-30", end: "2026-12-11" }
  - { id: C1, kind: iteration, title: Editor support,          phase: construction, start: "2027-01-04", end: "2027-01-15" }
  - { id: C2, kind: iteration, title: Spec-aware review,       phase: construction, start: "2027-01-18", end: "2027-01-29" }
  - { id: C3, kind: iteration, title: Graph explorer,          phase: construction, start: "2027-02-01", end: "2027-02-12" }
  - { id: C4, kind: iteration, title: Lifecycle from history,  phase: construction, start: "2027-02-15", end: "2027-02-26" }
  - { id: T1, kind: iteration, title: Beta,                    phase: transition,   start: "2027-03-01", end: "2027-03-12" }
  - { id: T2, kind: iteration, title: Release,                 phase: transition,   start: "2027-03-15", end: "2027-03-26" }
  - { id: REL-0.9, kind: release, title: "0.9 beta", iteration: T1, activity: { test: T1 } }
  - { id: REL-1.0, kind: release, title: "1.0",      iteration: T2 }
---

# Delivery plan for sdp 1.0

Risk-driven phases with two-week iterations ([[DEC-0007]]). A spec's `iteration:` plans the work of
its own discipline — a requirement is written, a decision taken, a release shipped — and its
`activity:` plans the other disciplines' work on it, so one requirement can be specified in E2,
built in C1 and tested again in the beta. `sdp lifecycle` charts that plan per discipline and shows
the evidence for it apart. `sdp q 'requirement|nfr !-iteration-> iteration'` lists what is not
planned yet, and `sdp q 'requirement|nfr[activity.implementation=C1]'` what C1 builds.

**We are in Inception (I1).** I1 built an executable prototype. What it verified is planned in
I1: the requirements and quality requirements, the decisions, and the significant architecture.
Everything still to do is planned in the iterations after it, so each later gate stays unmet until
its phase's work is done.

| Phase | Iterations | Milestone | The gate checks |
| --- | --- | --- | --- |
| Inception | I1 | [[MS-LCO]] Lifecycle Objectives | the vision, capabilities refined by requirements, risks with planned mitigations, accepted decisions |
| Elaboration | E1, E2 | [[MS-LCA]] Lifecycle Architecture | elaboration requirements ready; what elaboration builds verified; architecture curated and justified; no high-exposure risk open |
| Construction | C1–C4 | [[MS-IOC]] Initial Operational Capability | everything built by the end of construction verified; no errors, no failing scenarios |
| Transition | T1, T2 | [[MS-PR]] Product Release | everything planned is verified |

**Gates and `sdp run`.** No gate fails `sdp run`, whatever its phase and whatever the date: the run
reports every gate, met or not. `sdp gate MS-…` enforces one; it is what the pipeline runs when a
phase is to close. The calendar meets nothing: `sdp lifecycle` marks a gate of a later phase *not
due*, and one whose phase is over without it passing *overdue*.

**Elaboration** retires the risks that threaten the architecture: reading large workspaces from
disk ([[RISK-0003]]), running existing Cucumber suites, whose hooks and parameter types would
change the step definition API ([[RISK-0006]]), and publishing a package that Node.js will run
([[RISK-0008]]). Each is specified and designed in E1 or E2 and built and tested before
[[MS-LCA]], so the architecture baseline is executable; when a mitigation is verified, its risk can
be marked `mitigated`. The construction features are specified alongside, in E2, while their
requirements can still change the architecture.

**Construction** builds what keeps the specifications honest and readable as more people and
agents write them, one feature per iteration: editor support in C1 ([[RISK-0001]]), a spec-aware
pull request review in C2 ([[RISK-0004]]), a graph explorer in C3 ([[RISK-0005]]) and lifecycle
activity read from git history in C4 ([[RISK-0007]]). Each is designed in the iteration before
it is built — the last two also specified there — and tested in the iteration that builds it.

**Transition** ships 0.9 as a beta in T1, where the features are tested again by their first users
and the package is published, and 1.0 as the release in T2.

`sdp q 'risk -mitigated-by-> * -iteration-> iteration' --paths` shows where each risk's
mitigation is specified.
