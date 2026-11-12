@id=REQ-review-bot @maturity=draft
@refines:CAP-living-specs
@iteration:E2 @activity.analysis-design:C1 @activity.implementation:C2 @activity.test:C2 @activity.test:T1
Feature: Spec-aware pull request review

  Reviewers of a pull request see the code diff, but not what it does to the delivery state. A spec
  that claims `ready` with a placeholder scenario, or a requirement that silently stopped being
  verified, passes review unnoticed (RISK-0004). A check on each pull request reports the
  delivery delta between its base and its head:

  - maturity transitions, and specs that changed maturity without changing content;
  - scenarios whose status changed, and specs whose stage changed;
  - elements and patterns added to or removed from the architecture;
  - the decisions within reach of the changed specs and code.

  @open
  Rule: Computed by `sdp` from two checkouts, or from the two `.sdp/results.json` files a CI run already has?

  @open
  Rule: Published as a pull request comment, a check summary, or both?
