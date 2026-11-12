@id=CAP-curated-architecture
@refines:VISION
@iteration:I1
Feature: Curated architecture knowledge

  The few elements, patterns and decisions that shape the system are named, justified and linked to
  the decisions and quality requirements behind them. Architects decide which ones they are;
  everything else stays design detail in the code, out of the graph.

  The README shows an element anchored in code next to its decision. sdp holds its own
  architecture to that: a description that no code stands behind is a diagram that stopped being
  true.

  Scenario: Every element of sdp's own architecture is anchored in its code
    Then the query "element" returns at least 1 result
    And the query "element !<-is- code" returns no results
