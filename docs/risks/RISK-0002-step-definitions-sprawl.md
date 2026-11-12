---
id: RISK-0002
kind: risk
title: Step definitions sprawl
status: tolerated
exposure: medium
links:
  affects: REQ-executable-specs
  mitigated-by: [REQ-builtin-steps, REQ-executable-specs]
---

# Step definitions sprawl

Step text is untyped prose ([[DEC-0001]]). As specs multiply, authors write near-duplicate phrases
for one behaviour, each with its own definition. Definitions grow hard to find, two of them start
matching the same step, and the cost of a change moves from the specs into the glue code.

Tolerated: it comes with Gherkin, and nothing planned makes it go away. What keeps it small is
built: rules over the graph need no glue code at all ([[REQ-builtin-steps]]), an ambiguous match
fails instead of picking one, and `sdp steps <text>` finds the definition to extend before
another is written ([[REQ-executable-specs]], [[AGENTS]]).

**Watch for:** step modules that grow faster than the specs, and families of steps that say one
thing in several ways.
