---
id: RISK-0004
kind: risk
title: Teams do not keep maturity honest
exposure: medium
links:
  affects: REQ-maturity-criteria
  mitigated-by: [REQ-executable-specs, REQ-review-bot]
  due: MS-IOC
---

# Teams do not keep maturity honest

The maturity criteria check the shape of a spec — a description exists, a scenario states an
outcome, no question is open — not whether the content is any good ([[REQ-maturity-criteria]]). Under
pressure a team can satisfy `ready` with a placeholder paragraph and a token scenario, or leave
specs at `draft` long after they are understood. Plans and gates built on maturity then mislead.

Nobody can declare that something works ([[DEC-0005]]), so a weak `ready` spec shows as a spec
nothing verifies ([[REQ-executable-specs]]). What is missing is a reviewer who sees every change
of maturity next to the change of content that earned it ([[REQ-review-bot]]).

**Watch for:** ready specs whose scenarios stay undefined for several iterations.
