---
id: REQ-history-lifecycle
kind: requirement
title: Lifecycle from git history
maturity: draft
iteration: C4
links:
  refines: CAP-living-specs
---

# Lifecycle from git history

The discipline activity chart of [[REQ-lifecycle-view]] shows the plan: what is planned into each
iteration. When people stop moving work between iterations, the chart turns back into a drawing
([[RISK-0007]]). Git history knows what actually happened — which specs, decisions and code
changed during each iteration's dates — so the chart can show actual activity next to planned
activity, and an iteration whose planned work saw no change stands out.

## Open questions

- [ ] Does a change to a spec count for its discipline in the iteration of the commit, whatever
  the spec's `iteration:` says?
- [ ] How much history to read by default, and how to keep it fast on long-lived repositories?
