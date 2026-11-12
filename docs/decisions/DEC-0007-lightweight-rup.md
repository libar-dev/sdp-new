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
Construction, Transition) without RUP's document load, milestones that are checked rather than
declared, and a record that shows the current state rather than how it was reached.

## Decision

- Two-week iterations: I1 · E1 E2 · C1–C4 · T1 T2 ([[PLAN]]). Work is planned by setting
  `iteration:` on it: capabilities and the vision, requirements, quality requirements, decisions,
  significant architecture, releases.
- Each phase ends in a milestone — LCO, LCA, IOC, PR — whose gate is a set of scenarios over the
  graph (`sdp gate MS-LCA`).
- Disciplines are not scheduled; their activity per iteration is derived from what is planned.
- Risks are specs of kind `risk` with a `status` (open, mitigated, accepted) and an `exposure`
  (high, medium, low), linked with `affects` to what they threaten and with `mitigated-by` to
  what reduces them. A risk is not planned work; its mitigation is. A risk is `mitigated` only
  once that work is verified, and Elaboration ends with no high-exposure risk open.
- While the project is in Inception, a decision that changes is rewritten, and one that no longer
  applies is deleted; neither is kept as superseded or deprecated. Git keeps the history.

## Consequences

- Elaboration ends only when the architecture baseline is curated and justified, by construction.
- A gate of a later phase is not due: `sdp run` reports it without failing, `sdp gate` enforces
  it on demand, and `sdp lifecycle` marks it *not due* until its phase starts. A later gate that
  already passes has no unfinished work planned, which is worth a look at the plan.
- The graph holds no decision history during Inception; the decision records read as the current
  state.

~~~gherkin
Scenario: No decision is kept only as history
  Then the query "decision[status=superseded|deprecated]" returns no results

Scenario: A risk is mitigated only by verified work
  Then the query "risk[status=mitigated] -mitigated-by-> requirement|nfr[stage!=verified]" returns no results
~~~
