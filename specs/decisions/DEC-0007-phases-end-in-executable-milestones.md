---
id: DEC-0007
kind: decision
title: Risk-driven phases, each closed by a milestone whose gate is scenarios
status: accepted
category: process
date: 2026-11-02
deciders: [team]
iteration: I1
---

# Risk-driven phases, each closed by a milestone whose gate is scenarios

## Context

A process decision, not an architectural one. The order of the work should follow risk: what
could still change the architecture is settled before features are built on it. We want that
without RUP's document load, and with milestones that are checked rather than declared.

## Options

1. **A backlog ordered by priority**, in a tracker. Nothing in it says "prove the architecture
   first", and its status lives outside the repository, where no scenario can read it.
2. **Sprints with one definition of done.** A regular cadence, but every sprint has the same
   goal: nothing tells proving the architecture from building on it.
3. **The RUP phases** — Inception, Elaboration, Construction, Transition — split into iterations,
   all of them nodes of the graph, each phase closed by a milestone whose objectives are scenarios.

## Decision

Option 3. Phases and two-week iterations are nodes of the [[PLAN]]. Each phase ends in one
milestone spec — LCO, LCA, IOC, PR — and the milestone's scenarios are its gate: queries over the
graph that say what the phase must have achieved. A milestone is met when its gate passes. The
calendar says where today is, never that something was achieved.

## Consequences

- What "done" means for a phase is written down, as queries, when the phase is planned.
- Elaboration cannot end while a risk due at it is open or the architecture baseline is not
  curated ([[MS-LCA]], [[DEC-0015]]).
- How work gets into an iteration is [[DEC-0013]]; when a gate is enforced is [[DEC-0014]].

~~~gherkin
Scenario: Every phase has iterations and ends in a milestone
  Then the query "phase" returns at least 1 result
  And the query "phase !<-phase- iteration" returns no results
  And the query "phase !<-phase- milestone" returns no results
~~~
