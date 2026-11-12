---
id: RISK-0008
kind: risk
title: Young technology stack
status: accepted
exposure: medium
links:
  affects: NFR-no-build-step
  mitigated-by: REQ-npm-package
---

# Young technology stack

sdp runs on Effect 4, TypeScript's erasable syntax and Node.js 24 type stripping
([[DEC-0004]]). All three are recent: APIs may still move, documentation and examples are
thin, and few contributors know Effect 4. An upgrade can break the tool, and newcomers — human or
agent — may write Effect 2 or 3 idioms that no longer exist. Type stripping also has a known
limit: Node.js does not strip types from files under `node_modules`, so an installed package
cannot run from source the way this repository does ([[REQ-npm-package]]).

Accepted: the stack is what makes the tool run from source with typed IO at the edges.
`package-lock.json` pins the versions this repository is verified with, while `package.json`
admits newer minor versions; the pure core stays plain functions, and Effect's own documentation
ships in `node_modules/effect`, where agents are pointed to it.

**Watch for:** `npm run verify` failing after a dependency update, and Effect 2 or 3 idioms in
new code.
