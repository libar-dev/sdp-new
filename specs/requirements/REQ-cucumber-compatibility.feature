@id=REQ-cucumber-compatibility @maturity=draft
@refines:CAP-living-specs
@iteration:E1 @activity.analysis-design:E1 @activity.implementation:E1 @activity.implementation:E2 @activity.test:E2
Feature: Hooks and parameter types for existing Cucumber suites

  Teams that already have a Cucumber suite rely on Before and After hooks to set up and tear down
  what their steps use, and on custom parameter types (`{money}`, `{date}`) to keep step text typed.
  Their `.feature` files join the graph today, but their steps only run after adapting both. sdp
  should run such suites with at most a change of imports.

  @open
  Rule: Does sdp run a suite with its own runner, or through Cucumber-JS as a plugin of it?

  Rule: A suite's feature files are read as they are

  Rule: Before and After hooks run around each scenario as under Cucumber, and a hook that fails fails its scenario

    sdp's own suite waits for it: a scenario whose last step runs a command is not held to stating
    its outcome, because nothing runs after a scenario's last step.

  @open
  Rule: Hooks as part of `defineSteps`, next to the world factory, or as separate registrations?

  @open
  Rule: Which hook scopes: per scenario only, or also once per run (`BeforeAll`, `AfterAll`)?

  @open
  Rule: Tagged hooks (`Before({ tags: "@db" }, …)`), as Cucumber has them?

  Rule: A step matches the definition and gets the arguments it gets under Cucumber, custom parameter types included

  @open
  Rule: How is a parameter type declared so that sdp still reads step definitions without running them?

  @open
  Rule: A compatibility module that accepts Cucumber-JS imports, or a documented migration only?

  Rule: A scenario's outcome means what it means under Cucumber

    So a suite keeps the reporters it has: sdp's step statuses are already those of Cucumber
    Messages, and a run exported as Messages is one any of them renders.

  Rule: A suite written with another language's keywords, as its language header says, is read the same
