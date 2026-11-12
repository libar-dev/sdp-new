@id=ARCH-graph
@decided-by:free-vocabulary @decided-by:files-are-the-source-of-truth @instance-of:PAT-derived-index
Feature: System graph

  Nodes and edges with in and out adjacency indexes, each with the `file:line` it came from, and
  nothing about requirements, decisions or architecture. It is architecture because every command,
  check, gate and agent reads it: its free-form shape is the product's main modifiability bet, and
  changing it touches every feature.

  Rule: A built graph cannot be changed, through what it was built from or what it returns

    It keeps a frozen copy of what it is given. What is not JSON data would stay shared with whoever
    passed it, so a graph refuses it.

    Scenario: The nodes and edges it was built from are changed afterwards
      Given a graph built from a node "a" linked to "b" by "uses"
      When the nodes and edges it was built from are changed
      Then the graph still has "a" -uses-> "b" via "http"
      And nothing read from the graph can be changed

    Scenario Outline: An attribute that is not JSON data
      Then no graph can be built from a node whose attribute is <value>

      Examples:
        | value      |
        | a Date     |
        | a Map      |
        | a function |
