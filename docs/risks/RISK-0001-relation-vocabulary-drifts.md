---
id: RISK-0001
kind: risk
title: Relation vocabulary drifts
status: open
exposure: medium
links:
  affects: [REQ-flexible-graph, REQ-graph-query]
  mitigated-by: REQ-editor-support
  due: MS-IOC
---

# Relation vocabulary drifts

Kinds and relation names are free text ([[DEC-0002]]). One author writes `realized-by`, another
`implemented-in`, a third `realised-by`. Each spelling is valid, so nothing reports it, and a
query for one silently misses the others: a gate written as a query can then pass for the wrong
reason. Agents add to the drift when they invent a plausible name instead of reusing the one in
use.

Completion from the relations already in use would stop most drift where it starts
([[REQ-editor-support]]). Until then `sdp status` lists the relations with their counts, and the
built-in steps refuse a relation nothing uses ([[REQ-builtin-steps]]).

**Watch for:** a relation used once or twice next to a near-synonym used often.
