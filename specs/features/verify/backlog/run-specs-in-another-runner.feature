@id=run-specs-in-another-runner @maturity=idea
Feature: Run specs in another runner

  Large codebases adopt sdp with suites they already run in Cucumber-JS, Playwright or Vitest. They
  keep their runner, and sdp keeps the graph and the evidence.

  Rule: A team that runs Cucumber-JS keeps it: a plugin of sdp's picks the scenarios from the graph and records their results

    Cucumber-JS reads sdp's facts and links as plain tags, and can only leave out the examples of work
    still to come, never run them without failing the run.

  Rule: Specs compile to the tests of a host runner, as Playwright-BDD compiles them to Playwright's

  Rule: sdp says how far another runner is compatible: whether it reads the specs, binds the same steps, runs them alike, and reports what sdp records
