---
id: NFR-query-performance
kind: nfr
title: Interactive queries on large graphs
maturity: ready
quality: performance
iteration: I1
activity: { implementation: I1, test: I1 }
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
Scenario: A two-hop query over 20,000 nodes answers within 250 ms
  Given a generated graph of 20000 nodes and 60000 edges
  When the query "requirement[maturity=ready] -realized-by-> element -decided-by-> decision" runs on it
  Then the median run completes within 250 ms

@slow @serial
Scenario: A negative filter over 20,000 nodes answers within 250 ms
  Given a generated graph of 20000 nodes and 60000 edges
  When the query "element !-*- decision" runs on it
  Then the median run completes within 250 ms

@slow @serial
Scenario: The graph of 5,000 specs builds within a second
  Given a generated workspace of 5000 specs
  When the graph is built from it
  Then the median run completes within 1000 ms
~~~
