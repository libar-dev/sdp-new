---
id: ARCH-query-engine
kind: element
title: Query engine (SDPQ)
iteration: I1
links:
  decided-by: DEC-0006
  constrained-by: NFR-query-performance
  uses: ARCH-vocabulary
---

# Query engine (SDPQ)

Parses the path patterns of [[REQ-graph-query]] and evaluates them over the graph. It is a pure
function of a graph, a query and the ordering ladders of the workspace's configuration (maturity,
stage, verification).

Public contract used by agents, milestone gates and decision guards; its syntax is embedded in specs
across workspaces, and it carries the interactive-latency requirement.

- **Parsing first.** A query is parsed completely before evaluation, so a malformed one fails with
  its reason and touches no node.
- **A frontier of paths.** Evaluation starts with one path per node matching the first selector.
  Each moving edge extends every path by the routes it opens and keeps the extensions whose end
  matches the next selector; a `?` or `!` filter keeps or drops whole paths without extending
  them. The result is the distinct end nodes in the order they were first reached, and the paths.
- **A path is a route that exists.** It is the nodes it visits and, between each two of them, the
  edge of the graph that was walked, kept as it points (`from`, `rel`, `to`). Two paths are the
  same when they visit the same nodes over the same edges, so two edges between a pair of nodes
  are two paths and one edge found in both directions is one.
- **Closure.** A `+` edge walks breadth-first, at most 12 hops from where it starts, and walks on
  from each node once. Every node the walk reaches is an end — the start too, when an edge leads
  back to it — with the route that reached it first, which is a shortest one. So a closure adds one
  path per node reached, not one per route there.
- **Limits.** Each step keeps at most 10 000 paths. A result cut short by either limit is marked
  truncated and names the limit, so a caller never mistakes it for the whole answer — an empty
  result too, since a match may lie beyond the limit. A `?` or `!` filter is cut short only when
  its search hit the hop limit without finding a neighbour; one it found decides the filter.
  Callers that draw conclusions from a result refuse a truncated one: the built-in steps fail
  ([[REQ-builtin-steps]]); every other answer made from it is marked incomplete ([[REQ-cli]],
  [[REQ-mcp-server]]).

Code: `src/graph/Query.ts`.

## Scenarios

~~~gherkin
Scenario: A closure stops after twelve hops and says so
  Given a chain of 15 nodes linked by "next"
  When I query "#N1 -next+-> *"
  Then the result has 12 nodes
  And the result is truncated because "a + edge reaches further than 12 hops"

Scenario: An empty result cut short says so too
  Given a chain of 14 nodes linked by "next"
  When I query "#N1 -next+-> #N14"
  Then the result has 0 nodes
  And the result is truncated because "a + edge reaches further than 12 hops"

Scenario Outline: A filter is cut short only when the limit leaves it undecided
  Given a chain of 15 nodes linked by "next"
  When I query "<query>"
  Then the result is "<result>"
  And the result is <completeness>

  Examples:
    | query               | result  | completeness |
    | #N1 ?-next+-> #N2   | N1      | complete     |
    | #N1 !-next+-> #N2   | nothing | complete     |
    | #N1 ?-next+-> #N15  | nothing | truncated    |
    | #N1 !-next+-> #N15  | N1      | truncated    |

Scenario: A closure adds one path per node it reaches, by a shortest route
  Given a file "model.md" containing:
    """
    ---
    id: MODEL
    kind: model
    nodes:
      - { id: A, kind: stop, links: { next: [B, C] } }
      - { id: B, kind: stop, links: { next: D } }
      - { id: C, kind: stop, links: { next: D } }
      - { id: D, kind: stop, links: { next: A } }
    ---
    # Two routes from A to D, and a way back
    """
  When I query "#A -next+-> *"
  Then the paths are:
    | A -next-> B                       |
    | A -next-> C                       |
    | A -next-> B -next-> D             |
    | A -next-> B -next-> D -next-> A   |

Scenario: Path expansion stops at a limit and says so
  Given a generated graph of 200 nodes and 12000 edges
  When the query "* -*-> * -*-> *" runs on it with at most 1000 paths
  Then the result has 1000 paths
  And the result is truncated because "a step has more than 1000 paths"

Scenario: The default path limit is 10 000 per step
  Given 25 nodes, each linked to all the others by "knows"
  When I query "member -knows-> member -knows-> member"
  Then the result has 25 nodes
  And the result is truncated because "a step has more than 10000 paths"
~~~
