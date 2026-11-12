@id=NFR-query-performance @maturity=ready @quality=performance
@refines:CAP-agent-collaboration @decided-by:DEC-0003
@iteration:I1 @activity.implementation:I1 @activity.test:I1
Feature: Interactive queries on large graphs

  Agents issue many small queries while they work, and every command rebuilds the graph from the
  files. Both halves must stay interactive on workspaces far larger than a typical repository's.

  Rule: A query over 20,000 nodes answers within 250 ms

    @slow @serial
    Scenario: A two-hop query
      Given a generated graph of 20000 nodes and 60000 edges
      When the query "requirement[maturity=ready] -realized-by-> element -decided-by-> decision" runs on it
      Then the median run completes within 250 ms

    @slow @serial
    Scenario: A negative filter
      Given a generated graph of 20000 nodes and 60000 edges
      When the query "element !-*- decision" runs on it
      Then the median run completes within 250 ms

  Rule: The graph of 5,000 specs builds within a second

    @slow @serial
    Scenario: A generated workspace of 5,000 specs
      Given a generated workspace of 5000 specs
      When the graph is built from it
      Then the median run completes within 1000 ms
