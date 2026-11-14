@id=a-host-runner-runs-application-suites @kind=decision
Feature: sdp binds steps and records evidence; a host runner runs an application's suite

  Not sdp's own runner grown into a test framework, with suite setup, environments, workers, mocking
  and coverage of its own, nor a host's runner in its place: sdp matches steps, gives each scenario
  its world, cleans up after it and records what it ran against, and where a suite needs what a test
  framework has, its scenarios run inside one, Vitest first, through an adapter that shares that core.
  sdp's own runner stays for code Node.js loads as it is, as sdp's own and the shop example's, and
  for a guide, a gate, a workspace with nothing installed. The price is two front ends to keep alike;
  isolation between scenarios that stays sdp's to give, as a host that isolates files gives the
  scenarios of one file no fresh state and removes nothing they made outside it; and evidence that
  may take what a scenario ran against more broadly than it loaded, never more narrowly.
