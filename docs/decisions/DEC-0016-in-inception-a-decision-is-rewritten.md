---
id: DEC-0016
kind: decision
title: During Inception a decision is rewritten, not superseded
status: accepted
category: process
date: 2026-11-02
deciders: [team]
iteration: I1
---

# During Inception a decision is rewritten, not superseded

## Context

sdp lets a decision supersede another ([[REQ-decision-records]]). During Inception the concept is
still being found and decisions change by the week. Keeping every abandoned version as a
superseded record would fill the graph with history nobody acts on, and every question about
decisions would first have to filter it out.

## Options

1. **Supersede always**, as ADRs conventionally do: a record never changes once accepted.
2. **Rewrite while in Inception, supersede afterwards.** Until the first milestone nothing is
   built on a decision that its history would explain.
3. **Rewrite always.** The records always read as the current state, and lose why a baseline
   that others built on was changed.

## Decision

Option 2. Until [[MS-LCO]] is met, a decision that changes is rewritten in place, and one that no
longer applies is deleted. Git keeps the history. From Elaboration on, an accepted decision that
changes is superseded by a new record.

## Consequences

- The decision records read as the current state, and their numbers have no gaps: ids are
  renumbered when a record is split or removed.
- An option that was considered and not taken lives in the Options of the record that decided.

~~~gherkin
Scenario: No decision is kept only as history
  Then the query "decision[status=superseded|deprecated|rejected]" returns no results
~~~
