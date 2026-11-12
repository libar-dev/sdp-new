---
id: ARCH-query-engine
kind: element
title: Query engine (SDPQ)
significant: true
rationale: >-
  Public contract used by agents, milestone gates and decision guards; its syntax is embedded in
  specs across workspaces, and it carries the interactive-latency requirement.
iteration: C1
links:
  decided-by: DEC-0007
  constrained-by: NFR-query-performance
  reads: ARCH-graph
---

# Query engine (SDPQ)

Parses one-line path patterns and evaluates them as a frontier of paths over the graph. See
[[REQ-graph-query]] for the language.

Code: `src/graph/Query.ts`.
