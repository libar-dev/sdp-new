---
id: NFR-query-performance
kind: nfr
title: Interactive queries on large graphs
maturity: ready
type: quality
quality: performance
iteration: C1
links:
  refines: CAP-agent-collaboration
---

# Interactive queries on large graphs

Agents issue many small queries while they work, and the graph is rebuilt from files on every
command (see [[DEC-0003]]), so a query must stay interactive on graphs far larger than a typical
repository's: tens of thousands of nodes.

## Scenarios

~~~gherkin
@slow
Scenario: Two-hop query on a graph of 20,000 nodes
  Given a generated graph of 20000 nodes and 60000 edges
  When the query "requirement[maturity=ready] -realized-by-> element -decided-by-> decision" runs on it
  Then the median run completes within 250 ms

@slow
Scenario: Negative filter across the whole graph
  Given a generated graph of 20000 nodes and 60000 edges
  When the query "element[significant] !-*- decision" runs on it
  Then the median run completes within 250 ms
~~~
