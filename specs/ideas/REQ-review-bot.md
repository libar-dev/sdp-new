---
id: REQ-review-bot
kind: requirement
title: Spec-aware pull request review
maturity: draft
iteration: C2
links:
  refines: CAP-living-specs
---

# Spec-aware pull request review

Reviewers of a pull request see the code diff, but not what it does to the delivery state. A spec
that claims `ready` with a placeholder scenario, or a requirement that silently stopped being
verified, passes review unnoticed ([[RISK-0004]]). A check on each pull request reports the
delivery delta between its base and its head:

- maturity transitions, and specs that changed maturity without changing content;
- scenarios whose status changed, and specs whose stage changed;
- elements newly marked or unmarked significant;
- the decisions within reach of the changed specs and code.

## Open questions

- [ ] Computed by `sdp` from two checkouts, or from the two `.sdp/results.json` files a CI run
  already has?
- [ ] Published as a pull request comment, a check summary, or both?
