@id=scenarios-run-in-a-host-runner @kind=epic
@includes:know-what-is-verified#a-scenario-that-runs-in-several-ways-passes-only-while-every-way
@includes:know-what-is-verified#a-scenario-or-a-run-whose-cleanup-failed-has-not-passed
@includes:know-what-is-verified#a-result-says-each-attempt-of-a-retried-scenario
@includes:write-step-definitions#a-step-module-says-what-runs-after-each-scenario-passed-or
@includes:run-specs-in-another-runner
Feature: Scenarios run in a host runner

  A team whose code only its test runner can load runs its scenarios there, and sdp still knows what
  is verified.
