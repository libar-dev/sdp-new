---
id: RISK-0002
kind: risk
title: Step definitions sprawl
status: open
exposure: medium
links:
  affects: REQ-executable-specs
  mitigated-by: [REQ-builtin-steps, REQ-executable-specs]
---

# Step definitions sprawl

Step text is untyped prose ([[DEC-0001]]). As specs multiply, authors write near-duplicate phrases
for the same behaviour, each with its own definition. Definitions grow hard to find, two of them
start matching the same step (an *ambiguous* result), and the cost of changing behaviour moves from
the specs into the glue code. Several people or agents writing steps in parallel make collisions
more likely.

## Mitigation

- Built-in steps cover rules over the graph, so gates, guards and architecture rules need no glue
  code at all ([[REQ-builtin-steps]]).
- Typed Cucumber Expressions and suggested definitions for undefined steps steer authors to one
  phrasing per behaviour, and ambiguous matches are reported as such, never silently resolved
  ([[REQ-executable-specs]]).
- Agents are told to extend existing steps before adding one ([[AGENTS]]).

**Watch for:** ambiguous results in `sdp run`, and step modules that grow faster than specs.
