---
id: RISK-0007
kind: risk
title: The plan drifts from what happened
status: open
exposure: low
links:
  affects: REQ-lifecycle-view
  mitigated-by: REQ-history-lifecycle
---

# The plan drifts from what happened

Discipline activity is what is planned (`iteration:` and `activity:`), not what was done
([[REQ-lifecycle-view]]). When people stop moving work between iterations, the lifecycle chart
turns back into a drawing, and the milestone gates that filter by iteration check the wrong work.

## Mitigation

Gates check evidence, not plans, wherever they can, and `sdp lifecycle` shows the evidence for
each iteration's planned work right below the plan, so a column of drafts in a past iteration
stands out. Deriving activity from git history ([[REQ-history-lifecycle]]) would show what
happened next to what was planned.

**Watch for:** iterations that end with planned specs still at `draft` or `idea`.
