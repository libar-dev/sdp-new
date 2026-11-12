@id=REQ-npm-package @maturity=draft
@refines:CAP-living-specs
@iteration:E1 @activity.analysis-design:E2 @activity.implementation:E2 @activity.test:E2 @activity.test:T1 @activity.deployment:T1 @activity.deployment:T2
Feature: Install sdp from npm

  Teams install sdp the way they install any tool: `npm install --save-dev sdp`, then `npx sdp`,
  and step definitions `import { defineSteps } from "sdp/steps"`. Today the package is private and runs
  only from a clone of this repository.

  Running from TypeScript sources (NFR-no-build-step) stops at `node_modules`: Node.js does not
  strip types from files there, so an installed copy cannot run the way a clone does. A release
  therefore emits JavaScript and declarations; this requirement is building and
  publishing it.

  # TODO(convert): resolved, make it a rule or delete it: Publish compiled JavaScript produced only when packing, and keep running from source in the repository? Yes: a build between an edit and its effect is output that can be stale.

  @open
  Rule: How is a release shown to behave like the sources that were verified: the scenarios run again against the packed package, or a smoke test of it?

  @open
  Rule: Which Node.js versions does the published package support?

  @open
  Rule: Is the package name `sdp` available on the registry, or does it need a scope?
