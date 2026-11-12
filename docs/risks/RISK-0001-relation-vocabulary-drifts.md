---
id: RISK-0001
kind: risk
title: Relation vocabulary drifts
status: open
exposure: medium
iteration: I1
links:
  affects: [REQ-flexible-graph, REQ-graph-query]
  mitigated-by: REQ-editor-support
---

# Relation vocabulary drifts

Kinds and relation names are free text ([[DEC-0002]]). Over time one author writes `realized-by`,
another `implemented-in`, a third `realised-by`. Each spelling is valid, so nothing reports it, and
a query for one silently misses the others — a gate or guard written as a query can then pass for
the wrong reason. Agents add to the drift when they invent a plausible name instead of reusing the
one in use.

## Mitigation

- `sdp status` lists the relations in use with their counts, so a rare near-synonym stands out.
- Context bundles show agents the relations around a node, which they tend to copy.
- Completion from the relations already in use ([[REQ-editor-support]]) would prevent most drift
  at the source.

**Watch for:** a relation used once or twice next to a near-synonym used often.
