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

Agents issue many small queries while they work, and every command rebuilds the graph from the
files (see [[DEC-0003]]). Both halves must stay interactive on workspaces far larger than a typical
repository's: building the graph from thousands of specs, and querying graphs of tens of thousands
of nodes.

## Scenarios

~~~gherkin
@slow @serial
Scenario: Two-hop query on a graph of 20,000 nodes
  Given a generated graph of 20000 nodes and 60000 edges
  When the query "requirement[maturity=ready] -realized-by-> element -decided-by-> decision" runs on it
  Then the median run completes within 250 ms

@slow @serial
Scenario: Negative filter across the whole graph
  Given a generated graph of 20000 nodes and 60000 edges
  When the query "element[significant] !-*- decision" runs on it
  Then the median run completes within 250 ms

@slow @serial
Scenario: Building the graph from 5,000 specs
  Given a generated workspace of 5000 specs
  When the graph is built from it
  Then the median run completes within 1000 ms
~~~
