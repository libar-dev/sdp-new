@id=move-a-test-suite-to-specs @maturity=idea
Feature: Move a test suite to specs

  A team that adopts sdp in a repository with tests, or with the specs of an earlier sdp, replaces
  them area by area while both keep running, and loses no check on the way.

  Not a converter: a scenario is written from the rule it proves, not generated from a test.

  Rule: A test is deleted only once scenarios cover each case and environment it checked, and one of them was seen to fail on a fault the test catches

    A scenario that passes says nothing of what it would catch, and one fault shown is a sample, not
    a proof that nothing was lost: the cases, backends and environments the test ran in are kept, as
    examples, as ways a scenario runs, or as the test itself.

  Rule: While an earlier sdp is installed beside this one, each runs under a command of its own

    Both install a command named `sdp`, and a script that says `sdp` runs whichever was installed
    last.

  Rule: Where several backends keep one contract, a test that ran against each becomes one scenario tagged for each, not a copy for each

    Where a backend's contract differs, its scenarios say how.

  Rule: A test stays a test where no rule a user could observe names what it checks

    A helper below the level of any requirement gains nothing from a scenario, and a check of types,
    of a property over generated input or of concurrency keeps the tool that checks it until a
    scenario checks as much.
