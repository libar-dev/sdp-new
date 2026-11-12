---
id: REQ-npm-package
kind: requirement
title: Install sdp from npm
maturity: draft
iteration: E2
links:
  refines: CAP-living-specs
  decided-by: DEC-0004
---

# Install sdp from npm

Teams install sdp the way they install any tool: `npm install --save-dev sdp`, then `npx sdp`,
and step definitions `import { defineSteps } from "sdp"`. Today the package is private and runs
only from a clone of this repository.

Running from TypeScript sources ([[DEC-0004]], [[NFR-no-build-step]]) has a known limit here:
Node.js does not strip types from files under `node_modules`, so an installed copy cannot run the
way a clone does. How sdp is published is therefore settled in Elaboration, while the decision it
may change is still cheap to revisit.

## Open questions

- [ ] Publish compiled JavaScript produced only when packing, and keep running from source in
  the repository?
- [ ] Which Node.js versions does the published package support?
- [ ] Is the package name `sdp` available on the registry, or does it need a scope?
