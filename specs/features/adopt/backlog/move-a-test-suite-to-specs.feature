@id=move-a-test-suite-to-specs @maturity=idea
Feature: Move a test suite to specs

  A team that adopts sdp in a repository with tests, or with the specs of an earlier sdp, replaces
  them area by area while both keep running, and loses no check on the way.

  Not a converter: a scenario is written from the rule it proves, not generated from a test.

  Rule: A test is deleted only once scenarios cover what it checked, and one of them was seen to fail on a fault the test catches

  Rule: A test stays a test where no rule a user could observe names what it checks
