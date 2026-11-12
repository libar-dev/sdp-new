---
id: RISK-0006
kind: risk
title: Existing Cucumber suites cannot run unchanged
status: open
exposure: medium
links:
  affects: [REQ-executable-specs, REQ-progressive-specs]
  mitigated-by: REQ-cucumber-compatibility
---

# Existing Cucumber suites cannot run unchanged

Teams with a Cucumber suite rely on custom parameter types and on Before and After hooks, which
sdp does not support. Their `.feature` files join the graph, but their steps need adapting before
they run — friction exactly where executable specifications already exist, and a reason for such
teams not to adopt sdp at all.

## Mitigation

Hooks and parameter types ([[REQ-cucumber-compatibility]]) are planned for Elaboration: both
change the step definition API that every workspace's step modules are written against, so they
are settled before Construction builds on it.

**Watch for:** teams that try sdp on an existing suite and give up while adapting its steps.
