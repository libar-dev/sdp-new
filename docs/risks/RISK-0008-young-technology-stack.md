---
id: RISK-0008
kind: risk
title: Young technology stack
status: accepted
exposure: medium
iteration: I1
links:
  affects: NFR-no-build-step
---

# Young technology stack

sdp runs on Effect 4, TypeScript's erasable syntax and Node.js 24 type stripping
([[DEC-0004]]). All three are recent: APIs may still move, documentation and examples are
thin, and few contributors know Effect 4. An upgrade can break the tool, and newcomers — human or
agent — may write Effect 2 or 3 idioms that no longer exist.

Accepted: the stack is what makes the tool run from source with typed IO at the edges. Versions
are pinned, the pure core stays plain functions, and Effect's own documentation ships in
`node_modules/effect`, where agents are pointed to it.
