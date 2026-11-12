---
id: RISK-0007
kind: risk
title: The plan drifts from what happened
exposure: low
links:
  affects: REQ-lifecycle-view
  mitigated-by: REQ-history-lifecycle
  due: MS-IOC
---

# The plan drifts from what happened

Discipline activity is what is planned, not what was done ([[DEC-0013]]). When people stop moving
work between iterations, the lifecycle chart turns back into a drawing, and the gates that ask
what a phase planned check the wrong work.

`sdp lifecycle` already shows the evidence for each iteration's planned work below the plan, so a
column of drafts in a past iteration stands out. Activity read from git history would show what
happened next to what was planned ([[REQ-history-lifecycle]]).

**Watch for:** iterations that end with planned specs still at `draft` or `idea`.
