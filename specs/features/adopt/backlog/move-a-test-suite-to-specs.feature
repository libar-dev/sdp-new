@id=move-a-test-suite-to-specs @maturity=idea
Feature: Move a test suite to specs

  A team that adopts sdp in a repository with tests, or with the specs of an earlier sdp, replaces
  them area by area while both keep running, and loses no check on the way.

  Not a converter: a scenario is written from the rule it proves, not generated from a test.

  Rule: A test is deleted only once scenarios cover each case and environment it checked, and one of them was seen to fail on a fault the test catches

    A scenario that passes says nothing of what it would catch.

  Rule: While an earlier sdp is installed beside this one, each runs under a command of its own

    Both install a command named `sdp`.

  Rule: Where several backends keep one contract, a test that ran against each becomes one scenario tagged for each, not a copy for each

  Rule: A test stays a test where no rule a user could observe names what it checks

    A check of types, of a property over generated input or of concurrency keeps its tool until a
    scenario checks as much.
