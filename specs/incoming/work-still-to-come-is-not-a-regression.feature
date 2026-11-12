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
  Rule: A Feature or a Rule declares its maturity where it is written, and `implemented`, the rung above ready, says it is built; nothing moves when it is

    A change to a built feature is then rules of that feature at the maturity they have reached,
    and specs/incoming and the kind `change` go: nothing is copied into a feature and deleted
    when it is built.

  Rule: A Rule without a maturity of its own has its Feature's

    So one rule can be implemented in a feature still to come, and one still to come in a feature
    that is implemented. Only the Feature and the Rule declare one: a maturity on a Scenario or
    an Examples block is an error, since it would switch single examples off.

  Rule: A spec that declares no maturity is implemented, and sdp check asks for its maturity to be declared

    Failing safe: an example nobody marked is enforced, as it is under Cucumber, and someone else's
    suite without an id runs as it does there.

  Rule: The rung that says built is a word of the vocabulary profile, which a workspace may rename

    A workspace that configures its own ladder names which of its rungs is built, and sdp reads
    no other.

  Rule: An example of work still to come runs and reports what it did, and none of its outcomes fails the run

    Its stage stays the maturity it declares; its verification is what its examples did.

  @decided-by:files-are-the-source-of-truth
  Rule: A run fails when, among the examples it ran, the graph after it shows implemented work that does not pass: an example that failed, is ambiguous, is pending, or has a step without a definition

    The verdict is a question asked of the graph, not a count the runner keeps, so `sdp run`, a
    query and every report agree. It is the question this repository's GUIDE gate asks of every
    feature today, so that built work cannot stop being tested without a word. An example that
    `--tags` left out does not fail that run, and is no evidence either.

  Rule: Implemented work is held to what ready asks: every rule has an example, and none is open

    Being built must not excuse a rule from the checks that make it testable.

  Rule: An implemented feature is verified when its implemented rules pass, and says how many of its rules are still to come

    A failing implemented rule makes the feature failing, whatever its rules still to come do.

  Rule: Work still to come whose examples all ran and passed is pointed out after the run, so that it is declared implemented

    Only on complete, current evidence: every example of the rule or feature ran in this run or
    still counts, and none of its rules is open or without an example. It is a note of the run,
    not of sdp check, since the evidence is one checkout's.

  Rule: Declaring work implemented keeps the results of its examples, so a failure it was allowed becomes one that fails the run

    Maturity is an annotation and no part of an example's hash: what ran against unchanged code
    still counts, and a result that reads the graph goes stale as it does on any change to a spec.

  Rule: A rule still to come names the implemented rule it replaces with `@replaces:<feature>#<rule>`, and the replaced rule stays enforced until the edit that implements its replacement deletes it

    A replacement never switches the old rule's examples off: until it is built both run, and the
    edit that declares it implemented deletes the old rule and the link. Removing behaviour is
    written as what happens instead, such as an operation that is refused.

  Rule: An open question is still to come, whatever maturity it would inherit, and has no examples

    A question cannot switch off the examples of a rule that holds: an `@open` rule with examples
    is an error.

  Rule: A rule still to come can be planned into an iteration, and work still to come at every maturity is unplanned until it is planned

    Today a plan tag on a Rule plans nothing, and work at the top of the ladder is not listed as
    unplanned.
