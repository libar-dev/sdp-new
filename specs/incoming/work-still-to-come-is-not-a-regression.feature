@id=work-still-to-come-is-not-a-regression @kind=change @maturity=draft
@changes:know-what-is-verified @changes:run-specs @changes:start-a-spec @changes:check-specs @changes:plan-delivery
@changes:write-a-spec @changes:configure-a-workspace
Feature: Work still to come is told from what is built

  Analysts and agents want to write a rule's examples before its code, as the acceptance test they
  are, and land them on the main line; teams want a failing example of what is built to stop the
  build. Today sdp cannot tell the two apart: an example whose steps are all defined runs, so a
  spec written ahead of its code fails `sdp run` and reads `failing`, the stage of a regression.
  The better a workspace's step vocabulary, the more often this happens, since a new example
  reuses the steps that exist. No spec in specs/incoming has an example for that reason: each
  lands in the commit that builds it.

  Not a status: that something works is still read from the run. What is declared is how far a
  feature or a rule has come, up to the promise that it is built, because no run can tell a
  regression from work not built yet.

  @decided-by:still-to-come-is-marked-where-it-is-written
  Rule: specs/incoming and the kind `change` go: a change to a built feature is rules of that feature at the maturity they have reached

    Nothing is copied into a feature and deleted when it is built, and sdp new writes a feature
    where it stays.

  Rule: A rule still to come names the implemented rule it replaces with `@replaces:<feature>#<rule>`, and the replaced rule stays enforced until the edit that implements its replacement deletes it

    A replacement never switches the old rule's examples off: until it is built both run, and the
    edit that declares it implemented deletes the old rule and the link. Removing behaviour is
    written as what happens instead, such as an operation that is refused.

  Rule: A rule still to come can be planned into an iteration, and work still to come at every maturity is unplanned until it is planned

    Today a plan tag on a Rule plans nothing, and work at the top of the ladder is not listed as
    unplanned.
