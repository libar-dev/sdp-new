---
id: RISK-0006
links:
  affects: [REQ-executable-specs, REQ-progressive-specs]
  mitigated-by: REQ-cucumber-compatibility
  due: MS-LCA
---

# Existing Cucumber suites cannot run unchanged

Teams with a Cucumber suite rely on custom parameter types and on Before and After hooks, which
sdp does not support. Their `.feature` files join the graph, but their steps need adapting before
they run — friction exactly where executable specifications already exist, and a reason for such
teams not to adopt sdp at all.

Due in Elaboration because hooks and parameter types change the step definition API that every
workspace's step modules are written against.

**Watch for:** teams that try sdp on an existing suite and give up while adapting its steps.
