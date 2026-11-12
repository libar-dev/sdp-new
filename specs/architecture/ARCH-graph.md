---
id: ARCH-graph
kind: element
title: System graph
iteration: I1
links:
  decided-by: [DEC-0002, DEC-0003]
  instance-of: { to: PAT-derived-index, role: index }
  constrained-by: NFR-query-performance
---

# System graph

Nodes and edges with in and out adjacency indexes, each with the `file:line` it came from. It knows
nothing about requirements, decisions or architecture: what sdp reads into a word is the
vocabulary profile's business ([[ARCH-vocabulary]]).

It is architecture because every command, check, gate and agent reads it. Its free-form shape is
the product's main modifiability bet, and changing it touches every feature.

## Scenarios

~~~gherkin
Scenario: A built graph cannot be changed, through what it was built from or what it returns
  Given a graph built from a node "a" linked to "b" by "uses"
  When the nodes and edges it was built from are changed
  Then the graph still has "a" -uses-> "b" via "http"
  And nothing read from the graph can be changed

Scenario Outline: A graph is built from JSON data only, since it copies what it is given
  Then no graph can be built from a node whose attribute is <value>

  Examples:
    | value      |
    | a Date     |
    | a Map      |
    | a function |
~~~
