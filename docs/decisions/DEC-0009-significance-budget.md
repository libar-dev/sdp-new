---
id: DEC-0009
kind: decision
title: At most 10% of abstractions are marked architecturally significant
status: accepted
category: architecture
date: 2026-10-02
deciders: [architecture]
iteration: E2
links:
  affects: [REQ-significance-curation, ARCH-significance]
---

# At most 10% of abstractions are marked architecturally significant

## Context

Architecture documentation fails in two ways: it is missing, or it lists everything and so says
nothing. Experience says a small fraction of abstractions — those that carry quality attributes,
are costly to change, or constrain many others — shape a system's architecture.

## Decision

Significance is opt-in (`significant: true`), needs a `rationale`, must link to a decision or a
quality requirement, and the significant share of all abstractions (counted from code) stays at or
below 10%. Exceeding it is a warning by default (`enforceBudget: true` makes it an error).

## Consequences

Adding a significant element is a conversation, sometimes demoting another one. The curated view
(`sdp arch`) stays small enough to read in a minute and to fit into an agent's context.

~~~gherkin
Scenario: This repository stays within its own budget
  Then the significance ratio is at most 10%
  And the query "*[significant] !-*- decision|nfr" returns no results
~~~
