---
id: REQ-cucumber-compatibility
kind: requirement
title: Hooks and parameter types for existing Cucumber suites
maturity: draft
iteration: E1
activity:
  analysis-design: E1
  implementation: [E1, E2]
  test: E2
links:
  refines: CAP-living-specs
---

# Hooks and parameter types for existing Cucumber suites

Teams that already have a Cucumber suite rely on Before and After hooks to set up and tear down
what their steps use, and on custom parameter types (`{money}`, `{date}`) to keep step text typed.
Their `.feature` files join the graph today, but their steps only run after adapting both
([[REQ-executable-specs]]). sdp should run such suites with at most a change of imports.

Both shape the step definition API that every workspace's step modules depend on, so they are
settled before Construction.

## Open questions

- [ ] Hooks as part of `defineSteps`, next to the world factory, or as separate registrations?
- [ ] Which hook scopes: per scenario only, or also once per run (`BeforeAll`, `AfterAll`)?
- [ ] Tagged hooks (`Before({ tags: "@db" }, …)`), as Cucumber has them?
- [ ] A compatibility module that accepts Cucumber-JS imports, or a documented migration only?
