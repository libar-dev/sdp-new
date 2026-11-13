@id=run-specs-in-another-runner @maturity=draft
@decided-by:a-host-runner-runs-application-suites
Feature: Run specs in another runner

  Large codebases adopt sdp with suites they already run in Vitest, Cucumber-JS or Playwright, and
  some can run nowhere else. The first adopter's code imports `./x.js` for a file `x.ts`, which
  Node.js alone does not resolve, its simulator tests rest on Vite's `import.meta.glob` and Vitest's
  edge-runtime environment, and one suite runs against a simulator and a real backend as two Vitest
  projects: `sdp run` fails there on the first import. Such a team keeps its runner, and sdp keeps
  the graph, the binding of steps and the evidence.

  Not a second way to write step definitions: a step module runs unchanged under either runner. Not
  a test framework of sdp's own: suite setup, the isolation of files, mocking and coverage are the
  host's.

  Rule: In a Vitest suite a feature file is a test file: its Feature and its Rules are groups, and each scenario, or row of an outline, is one test

    Vitest then collects, schedules, watches and reports scenarios as it does tests, and its suite
    setup starts once what they need. Shown on Vitest 5.0.3 and Node.js 24.22, where scenarios ran
    against the first adopter's real code in two Vitest projects; the prototype and the probe of
    sdp's own runner are on the branch `archive/organize-specs-2026-11`.

  Rule: A scenario under Vitest binds the steps sdp run binds, with the same world, arguments and outcomes: an undefined, ambiguous or pending step is there what it is here

    One core matches and runs the steps for both, or the two runners drift apart.

  Rule: A failing live scenario fails the Vitest run, and an example of work still to come runs and fails none, reported with what it did

  Rule: A scenario runs in the Vitest projects its tags name, and is left out of the others, not reported there as skipped

    A project is one way of running, against a simulator or against a real backend, and a scenario
    tagged for one is no test of another.

  Rule: What ran under Vitest is recorded as sdp run records it: each scenario's result with what it ran against, taken no narrower than what Vitest loaded for its file

    Without it, status, stages, gates and staleness see nothing of a suite that passed. Taken from the
    file's modules and the host's configuration rather than each scenario's, a change may make a
    result stale that did not need to be, but never leaves one current that should not be.

  Rule: A scenario gets a fresh world and its cleanup under Vitest as under sdp: isolating files gives the scenarios of one file no fresh state, and removes nothing they made outside the process

  Rule: A scenario tagged `@serial` runs alone under Vitest too, across files and projects

    sdp runs such scenarios after all the others, one at a time; a host's sequential group orders
    only the tests inside it.

  @maturity=idea
  Rule: A team that runs Cucumber-JS keeps it: a plugin of sdp's picks the scenarios from the graph and records their results

    Cucumber-JS reads sdp's facts and links as plain tags, and can only leave out the examples of work
    still to come, never run them without failing the run.

  @maturity=idea
  Rule: sdp says how far another runner is compatible: whether it reads the specs, binds the same steps, runs them alike, and reports what sdp records
