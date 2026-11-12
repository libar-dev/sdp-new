---
id: RISK-0004
kind: risk
title: Teams do not keep maturity honest
status: open
exposure: medium
links:
  affects: REQ-maturity-gates
  mitigated-by: [REQ-executable-specs, REQ-review-bot]
---

# Teams do not keep maturity honest

Maturity gates check the shape of a spec — a description exists, a scenario states an outcome, no
question is open — not whether the content is any good. Under pressure a team can satisfy `ready`
with a placeholder paragraph and a token scenario, or leave specs at `draft` long after they are
understood. Plans and milestone gates built on maturity then mislead.

## Mitigation

- Implementation is never declared: stage comes from scenario results ([[DEC-0005]]), so a weak
  `ready` spec shows up as a spec nothing verifies.
- `sdp check` reports content ahead of its label as promotable.
- `ready` is documented as structural only; a team that needs more writes its Definition of
  Ready as a gate ([[REQ-maturity-gates]]).
- Maturity changes are visible in pull requests; a spec-aware review ([[REQ-review-bot]]) would
  make every transition explicit.

**Watch for:** ready specs whose scenarios stay undefined for several iterations.
