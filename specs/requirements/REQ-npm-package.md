---
id: REQ-npm-package
kind: requirement
title: Install sdp from npm
maturity: draft
iteration: E1
activity:
  analysis-design: E2
  implementation: E2
  test: [E2, T1]
  deployment: [T1, T2]
links:
  refines: CAP-living-specs
  decided-by: DEC-0012
---

# Install sdp from npm

Teams install sdp the way they install any tool: `npm install --save-dev sdp`, then `npx sdp`,
and step definitions `import { defineSteps } from "sdp/steps"`. Today the package is private and runs
only from a clone of this repository.

Running from TypeScript sources ([[NFR-no-build-step]]) stops at `node_modules`: Node.js does not
strip types from files there, so an installed copy cannot run the way a clone does. A release
therefore emits JavaScript and declarations ([[DEC-0012]]); this requirement is building and
publishing it.

## Open questions

- [x] Publish compiled JavaScript produced only when packing, and keep running from source in
  the repository? Yes ([[DEC-0012]]).
- [ ] How is a release shown to behave like the sources that were verified: the scenarios run
  again against the packed package, or a smoke test of it?
- [ ] Which Node.js versions does the published package support?
- [ ] Is the package name `sdp` available on the registry, or does it need a scope?
