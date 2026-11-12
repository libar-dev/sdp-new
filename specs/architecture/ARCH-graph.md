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

Nodes (`id`, `kind`, `title`, attributes, source) and edges (`from`, `rel`, `to`, attributes, every
declaration's source), with in/out adjacency indexes. It owns its data: what it is built from is
copied and frozen, and every read is a method, so a step handler or a caller cannot change the graph
another reader sees. Attributes are JSON data, under any key — `__proto__` is a key like `owner` —
and a graph refuses to be built from anything else, which it could not copy. Knows nothing about
requirements, decisions or architecture — the words sdp interprets are its vocabulary profile
([[ARCH-vocabulary]]).

Every command, check, gate and agent reads it; its free-form shape (DEC-0002) is the product's main
modifiability bet, and changing it touches every feature.

Code: `src/model/Graph.ts`.

## Scenarios

~~~gherkin
Scenario: A built graph cannot be changed, through what it was built from or what it returns
  Given a graph built from a node "a" linked to "b" by "uses"
  When the nodes and edges it was built from are changed
  Then the graph still has "a" -uses-> "b" via "http"
  And nothing read from the graph can be changed

Scenario Outline: A graph is built from JSON data only
  Then no graph can be built from a node whose attribute is <value>

  Examples:
    | value      |
    | a Date     |
    | a Map      |
    | a function |
~~~
