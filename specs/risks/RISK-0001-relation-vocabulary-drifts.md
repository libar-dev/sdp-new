---
id: RISK-0001
links:
  price-of: DEC-0002
  affects: [REQ-flexible-graph, REQ-graph-query]
  mitigated-by: REQ-editor-support
  due: MS-IOC
---

# Relation vocabulary drifts

One author writes `realized-by`, another `implemented-in`, a third `realised-by`. Each spelling is
valid, so nothing reports it, and a query for one silently misses the others: a gate written as a
query can then pass for the wrong reason. Agents add to the drift when they invent a plausible
name instead of reusing the one in use.

**Watch for:** a relation used once or twice next to a near-synonym used often.
