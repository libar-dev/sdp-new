---
id: RISK-0006
kind: risk
title: Existing Cucumber suites cannot run unchanged
status: accepted
exposure: medium
iteration: I1
links:
  affects: [REQ-executable-specs, REQ-progressive-specs]
---

# Existing Cucumber suites cannot run unchanged

Teams with a Cucumber suite rely on custom parameter types, Before and After hooks, and parallel
execution. sdp supports none of them yet: the runner can run scenarios concurrently, but the CLI
does not. Such suites join the graph as `.feature` files, but their steps need adapting before
they run — friction exactly where executable specifications already exist.

Accepted for Inception: the first users write new specs. Revisit when Construction hardens
execution (C1).
