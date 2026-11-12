---
id: DEC-0013
kind: decision
title: Discipline activity is planned on the work itself
status: accepted
category: process
date: 2026-11-10
deciders: [team]
iteration: I1
links:
  refines: DEC-0007
---

# Discipline activity is planned on the work itself

## Context

In the RUP picture the disciplines overlap: a requirement is written in one iteration, designed
and built in another and tested again later. A tracker gives a piece of work one sprint, and a
chart of the overlap drawn by hand is a picture, not data a gate can query.

## Options

1. **One iteration per spec.** Simple, but it cannot say that a requirement is written in E2 and
   built in C1, so no gate can tell what a phase builds from what it specifies.
2. **A task node per spec and discipline.** Everything is a node, and most nodes are bookkeeping.
3. **Activity read from what happened** — git history, results. True, but it is not a plan: it
   cannot say what is intended ([[REQ-history-lifecycle]] would show it next to the plan).
4. **Two keys on the work.** `iteration:` plans the work of the node's own discipline, and
   `activity:` maps the other disciplines to iterations of their own.

## Decision

Option 4: `iteration: E2` on a requirement says when it is written, and
`activity: { implementation: C1, test: [C1, T1] }` when it is built and tested. Both are link
keys ([[DEC-0010]]), so each entry is an edge a query can follow. Only these plan; a mention does
not. The lifecycle chart draws that plan and nothing else: evidence is shown next to it, never
counted into it ([[REQ-lifecycle-view]]).

## Consequences

- A gate asks about one discipline:
  `requirement ?-activity.implementation-> iteration[phase=PH-elaboration]`.
- The plan can drift from what happened ([[RISK-0007]]).
- A plan written down after the work is a record, not a forecast. The iteration says so
  (`planned: after-the-fact`), so nobody reads its column of the chart as a plan that came true.

~~~gherkin
Scenario: Work is planned only into declared iterations and disciplines
  Then there are no diagnostics for rule "plan-reference"
~~~
