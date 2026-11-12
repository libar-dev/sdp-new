@id=ARCH-query-engine
@decided-by:DEC-0006 @constrained-by:NFR-query-performance @uses:ARCH-vocabulary
@iteration:I1
Feature: Query engine (SDPQ)

  Parses the path patterns of REQ-graph-query and evaluates them over the graph: a pure function
  of a graph, a query and the workspace's ordering ladders.

  It is architecture because gates, guards and agents' scripts in every workspace embed its syntax,
  and because it must stay interactive on large graphs. So evaluation is bounded, and the bound is
  part of the contract: a caller that concludes from a result refuses a truncated one
  (REQ-builtin-steps, REQ-cli, REQ-mcp-server).

  Rule: A plus walks breadth-first, at most 12 hops, and adds one path per node it reaches

    Scenario: A closure stops after twelve hops and says so
      Given a chain of 15 nodes linked by "next"
      When I query "#N1 -next+-> *"
      Then the result has 12 nodes
      And the result is truncated because "a + edge reaches further than 12 hops"

    Scenario: The path to a node a closure reaches is a shortest one
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
        | A -next-> B                     |
        | A -next-> C                     |
        | A -next-> B -next-> D           |
        | A -next-> B -next-> D -next-> A |

  Rule: A step keeps at most 10 000 paths

    Scenario: The default path limit is 10 000 per step
      Given 25 nodes, each linked to all the others by "knows"
      When I query "member -knows-> member -knows-> member"
      Then the result has 25 nodes
      And the result is truncated because "a step has more than 10000 paths"

    Scenario: A caller may lower the limit
      Given a generated graph of 200 nodes and 12000 edges
      When the query "* -*-> * -*-> *" runs on it with at most 1000 paths
      Then the result has 1000 paths
      And the result is truncated because "a step has more than 1000 paths"

  Rule: A result cut short says so and names the limit, unless the limit could not have changed it

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
        | query              | result  | completeness                                               |
        | #N1 ?-next+-> #N2  | N1      | complete                                                   |
        | #N1 !-next+-> #N2  | nothing | complete                                                   |
        | #N1 ?-next+-> #N15 | nothing | truncated because "a + edge reaches further than 12 hops" |
        | #N1 !-next+-> #N15 | N1      | truncated because "a + edge reaches further than 12 hops" |
