---
id: DEC-0007
kind: decision
title: Lightweight RUP lifecycle with executable milestone gates
status: accepted
category: process
date: 2026-11-02
deciders: [team]
iteration: I1
---

# Lightweight RUP lifecycle with executable milestone gates

## Context

A process decision, not an architectural one. We want risk-driven phases (Inception, Elaboration,
Construction, Transition) without RUP's document load, disciplines whose work overlaps and varies
across iterations as in the RUP picture — planned, not drawn — milestones that are checked rather
than declared, and a record that shows the current state rather than how it was reached.

## Decision

- Two-week iterations: I1 · E1 E2 · C1–C4 · T1 T2 ([[PLAN]]). Work is planned by setting
  `iteration:` on it: capabilities and the vision, requirements, quality requirements, decisions,
  significant architecture, releases.
- Each phase ends in a milestone — LCO, LCA, IOC, PR — whose gate is a set of scenarios over the
  graph (`sdp gate MS-LCA`).
- Discipline activity is planned on the work itself, as graph data. `iteration:` plans the work of
  the node's own discipline — a requirement is written, a decision taken, a release shipped — and
  `activity:` plans the other disciplines' work on it into iterations of their own:
  `activity: { implementation: C1, test: [C1, T1] }`. Only these relations plan; a mention does
  not ([[REQ-lifecycle-view]]).
- The lifecycle chart shows that plan and nothing else. Evidence — stages, scenario results — is
  reported next to it, never counted into it, and the calendar says where today is, never that a
  milestone was met.
- No gate fails `sdp run`, whatever its phase and whatever the date: the run reports every gate,
  and `sdp gate <milestone>` is what enforces one.
- Risks are specs of kind `risk` with a `status` (open, mitigated, accepted) and an `exposure`
  (high, medium, low), linked with `affects` to what they threaten and with `mitigated-by` to
  what reduces them. A risk is not planned work; its mitigation is. A risk is `mitigated` only
  once that work is verified, and Elaboration ends with no high-exposure risk open.
- While the project is in Inception, a decision that changes is rewritten, and one that no longer
  applies is deleted; neither is kept as superseded or deprecated. Git keeps the history.

## Consequences

- Elaboration ends only when the architecture baseline is curated and justified, by construction.
- `sdp run` stays green while milestones are unmet, as most are for most of the project; a team
  that wants a gate enforced runs `sdp gate` for it, typically in the pipeline when a phase is to
  close. `sdp lifecycle` marks a gate of a later phase *not due* and an unmet one of a past phase
  *overdue*. A later gate that already passes has no unfinished work planned, which is worth a
  look at the plan.
- A requirement can be specified in Elaboration, built in Construction and tested again in
  Transition, so the chart shows the overlapping disciplines of the RUP picture from data. Gates
  that care about one discipline query it: `requirement[activity.implementation=C1]`.
- The graph holds no decision history during Inception; the decision records read as the current
  state.

~~~gherkin
Scenario: No decision is kept only as history
  Then the query "decision[status=superseded|deprecated]" returns no results

Scenario: Work is planned only into declared iterations and disciplines
  Then there are no diagnostics for rule "plan-reference"

@gate
Scenario: A risk is mitigated only by verified work
  Then the query "risk[status=mitigated] -mitigated-by-> requirement|nfr[stage!=verified]" returns no results
~~~
