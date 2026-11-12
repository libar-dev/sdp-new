---
id: ARCH-query-engine
kind: element
title: Query engine (SDPQ)
significant: true
rationale: >-
  Public contract used by agents, milestone gates and decision guards; its syntax is embedded in
  specs across workspaces, and it carries the interactive-latency requirement.
iteration: I1
links:
  decided-by: DEC-0006
  constrained-by: NFR-query-performance
  reads: ARCH-graph
---

# Query engine (SDPQ)

Parses the path patterns of [[REQ-graph-query]] and evaluates them over the graph. It is a pure
function of a graph, a query and the ordering ladders of the workspace's configuration (maturity,
stage, verification).

- **Parsing first.** A query is parsed completely before evaluation, so a malformed one fails with
  its reason and touches no node.
- **A frontier of paths.** Evaluation starts with one path per node matching the first selector.
  Each moving edge extends every path by the hops it allows and keeps the extensions whose end
  matches the next selector; a `?` or `!` filter keeps or drops whole paths without extending
  them. The result is the distinct end nodes in the order they were first reached, and the paths.
- **Closure.** A `+` edge walks breadth-first without revisiting nodes, at most 12 hops from where
  it starts.
- **Limits.** Each step keeps at most 10 000 paths. A result cut short by either limit is marked
  truncated, so a caller never mistakes it for the whole answer.

Code: `src/graph/Query.ts`.

## Scenarios

~~~gherkin
Scenario: A closure stops after twelve hops and says so
  Given a chain of 15 nodes linked by "next"
  When I query "#N1 -next+-> *"
  Then the result has 12 nodes
  And the result is truncated

Scenario: Path expansion stops at a limit and says so
  Given a generated graph of 200 nodes and 12000 edges
  When the query "* -*-> * -*-> *" runs on it with at most 1000 paths
  Then the result has 1000 paths
  And the result is truncated
~~~
