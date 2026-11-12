@id=REQ-npm-package @maturity=draft
@refines:CAP-living-specs
@iteration:E1 @activity.analysis-design:E2 @activity.implementation:E2 @activity.test:E2 @activity.test:T1 @activity.deployment:T1 @activity.deployment:T2
Feature: Install sdp from npm

  Teams install sdp the way they install any tool. Today the package is private and runs only from
  a clone of this repository.

  Rule: `npm install --save-dev sdp` installs a command that `npx sdp` runs

  Rule: Step modules and code import `sdp/steps` and `sdp/annotations` from the installed package, typed

  @constrained-by:NFR-no-build-step
  Rule: The package is JavaScript and declarations, built only when packing; the repository runs from its sources

    Node.js strips no types from files under `node_modules`, so an installed copy cannot run from
    sources as a clone does. A build between an edit and its effect is output that can be stale.

  @open
  Rule: How is a release shown to behave like the sources that were verified: the scenarios run again against the packed package, or a smoke test of it?

  @open
  Rule: Which Node.js versions does the published package support?

  @open
  Rule: Is the package name `sdp` available on the registry, or does it need a scope?
