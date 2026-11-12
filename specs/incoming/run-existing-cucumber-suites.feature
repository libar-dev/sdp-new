@id=run-existing-cucumber-suites @kind=feature @maturity=draft
@iteration:IT-scale-and-compatibility
Feature: Run an existing Cucumber suite

  Teams that already have a Cucumber suite want its specs in the graph and its scenarios as their
  evidence, without rewriting it first. Its feature files join the graph today, but its step code
  relies on Before and After hooks and on custom parameter types, which sdp does not run. Done
  means such a suite runs under sdp with at most a change of imports.

  Not every Cucumber option: only what a typical suite's step code needs in order to run.

  @open
  Rule: Does sdp run a suite with its own runner, or through Cucumber-JS as a plugin of it?

    A Cucumber-JS plugin (12.5 and later) can filter and order pickles and read the message stream,
    nothing more: step definitions, hooks and parameter types stay Cucumber's, TypeScript step files
    need a loader such as tsx, and sdp's own step API and built-in steps would become support code.

  Rule: A suite's feature files are read as they are

  Rule: Before and After hooks run around each scenario, and a hook that fails fails its scenario

    sdp's own suite needs it too: a scenario whose last step runs a command cannot be held to
    stating its outcome while nothing runs after its last step.

  Rule: A step gets the arguments it gets under Cucumber, custom parameter types included

  Rule: A scenario's outcome means what it means under Cucumber, so a suite keeps its reporters

  Rule: A suite written with another language's keywords is read the same
