---
id: DEC-0010
kind: decision
title: The significant share of abstractions is a guideline, not a budget
status: accepted
category: architecture
date: 2026-11-12
deciders: [product, architecture]
iteration: I1
links:
  supersedes: DEC-0009
  affects: [REQ-significance-curation, ARCH-significance, MS-LCA]
---

# The significant share of abstractions is a guideline, not a budget

## Context

[[DEC-0009]] made "at most 10% of abstractions are significant" a budget: a warning when exceeded,
an error on request, and a condition of the Lifecycle Architecture milestone. Using it showed why
that is wrong:

- In inception the code inventory is tiny or absent, so the share swings wildly — the shop example
  had one significant element out of four abstractions, "25%", and nothing was wrong with it.
- The curated set is still being discovered in inception and elaboration; the number says nothing
  about whether the *right* elements were chosen.
- A hard number invites gaming: demoting a genuinely significant element to get under the line.

What carries meaning is the curation itself: every significant element has a rationale and is
linked to the decision or quality requirement that makes it significant.

## Options

1. Keep the budget, but only enforce it from elaboration on.
2. Report the share against a ~10% guideline as information; keep rationale and justification strict.
3. Drop the share entirely.

## Decision

Option 2. `sdp check` reports `significance-guideline` at severity `info` when the share is above
the guideline (configurable: `architecture.significanceGuideline`, `guidelineSeverity`). The
guideline never suggests fewer than one significant element. Rationale (`significance-rationale`,
error) and justification (`significance-justification`, warning) stay as they were. Milestone
gates check curation, not percentages. The built-in step `the significance ratio is at most {int}%`
remains available for teams that want a hard line.

## Consequences

- `sdp arch` shows the share as context for a review conversation, not as a verdict.
- The ~10% figure stays visible in docs as an expectation to calibrate against.

~~~gherkin
Scenario: Every significant element in this repository is curated
  Then there are no diagnostics for rule "significance-rationale"
  And the query "*[significant] !-*- decision|nfr" returns no results
~~~
