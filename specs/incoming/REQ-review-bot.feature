@id=REQ-review-bot @maturity=draft
Feature: Spec-aware pull request review

  Reviewers of a pull request see the code diff, but not what it does to the delivery state. A spec
  that claims `ready` with a placeholder scenario, or a requirement that silently stopped being
  verified, passes review unnoticed. A check on each pull request reports the delivery delta
  between its base and its head.

  Rule: The review lists each change of maturity, and flags a spec whose maturity changed while its content did not

  Rule: The review lists each scenario whose status changed and each spec whose stage changed

  Rule: The review lists the elements and patterns added to or removed from the architecture

  Rule: The review lists the decisions within reach of the specs and code that changed
