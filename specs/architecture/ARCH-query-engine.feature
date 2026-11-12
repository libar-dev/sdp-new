@id=ARCH-query-engine
@uses:ARCH-vocabulary
Feature: Query engine (SDPQ)

  Parses path patterns and evaluates them over the graph: a pure function of a graph, a query and
  the workspace's ordering ladders. It is architecture because gates, guards and agents' scripts in
  every workspace embed its syntax, and because it must stay interactive on large graphs.
