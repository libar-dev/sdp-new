@id=run-specs-in-another-runner @maturity=idea
@realized-by:ARCH-runner
@decided-by:a-host-runner-runs-application-suites
Feature: Run specs in another runner

  A team whose code only its own test runner can load keeps that runner, and sdp still binds the
  steps, records the evidence and knows what is verified.

  Rule: A feature file runs in the host runner as a suite: its rules are groups and each example one test

  Rule: An example binds the same steps, world and outcomes under the host runner as under sdp run

    One core matches and runs the steps for both, or the two drift apart.

  Rule: What ran under the host runner is recorded as sdp run records it, so status, stages, gates and staleness see it

  Rule: An example runs only in the ways of running its tags name

  Rule: sdp says how far a runner is compatible: whether it reads the specs, binds the same steps, runs them alike, and reports what sdp records
