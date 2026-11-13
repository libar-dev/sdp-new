@id=scenarios-run-in-a-host-runner @kind=epic
@includes:know-what-is-verified#a-scenario-that-runs-in-several-ways-such-as-against-a-simulator
@includes:know-what-is-verified#a-run-of-one-way-leaves-the-results-of-the-others-as-it-found
@includes:know-what-is-verified#a-gate-knows-every-scenario-it-needs-and-each-way-that-scenario
@includes:know-what-is-verified#a-scenario-s-cleanup-runs-whether-it-passed-failed-or-was
@includes:know-what-is-verified#a-run-whose-last-cleanup-failed-fails-though-every-scenario
@includes:know-what-is-verified#a-result-says-each-attempt-of-a-retried-scenario-and-a-scenario
@includes:know-what-is-verified#an-earlier-result-counts-again-only-where-the-workspace-allows
@includes:write-step-definitions#a-step-module-says-what-runs-after-each-scenario-passed-or
@includes:run-specs-in-another-runner
Feature: Scenarios run in a host runner

  A team whose code only its test runner can load runs its scenarios there, and sdp still knows what
  is verified. In this order: a result for each way a scenario runs, so that one way's pass cannot
  hide another's failure; cleanup after each scenario; then the adapter for Vitest.
