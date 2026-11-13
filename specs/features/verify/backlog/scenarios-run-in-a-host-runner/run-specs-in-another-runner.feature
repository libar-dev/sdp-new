@id=run-specs-in-another-runner @maturity=idea
@realized-by:ARCH-runner
@decided-by:a-host-runner-runs-application-suites
Feature: Run specs in another runner

  A team whose code only its own test runner can load keeps that runner, and sdp still knows what is
  verified.

  Rule: A feature file runs in the host runner as a suite of its rules and examples, binding the same steps, world and outcomes as under sdp run

  Rule: What ran under the host runner is recorded as sdp run records it

  Rule: An example runs only in the ways of running its tags name
