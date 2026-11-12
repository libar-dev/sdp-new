---
id: RISK-0008
kind: risk
title: Young technology stack
status: tolerated
exposure: medium
links:
  affects: NFR-no-build-step
---

# Young technology stack

sdp runs on Effect 4, TypeScript's erasable syntax and the type stripping of Node.js 24
([[DEC-0004]], [[DEC-0012]]). All three are recent: APIs may still move, documentation and
examples are thin, and few contributors know Effect 4. An upgrade can break the tool, and
newcomers, human or agent, may write Effect 2 or 3 idioms that no longer exist.

Tolerated: the stack is what lets the tool run from source with typed IO at the edges, and
nothing planned replaces it. `package-lock.json` pins the versions this repository is verified
with, the core stays plain functions, and Effect's own documentation ships in
`node_modules/effect`, where [[AGENTS]] points.

**Watch for:** `npm run verify` failing after a dependency update, and Effect 2 or 3 idioms in
new code.
