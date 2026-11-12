@id=CAP-curated-architecture
@refines:VISION
@iteration:I1
Feature: Curated architecture knowledge

  The few elements, patterns and decisions that shape the system are named, justified and linked to
  the decisions and quality requirements behind them. Architects decide which ones they are;
  everything else stays design detail in the code, out of the graph.

  Rule: Every element is anchored in the code it describes

    An element that no code stands behind is a diagram that stopped being true.

    Scenario: The elements of sdp's own architecture
      Then the query "element" returns at least 1 result
      And the query "element !<-is- code" returns no results
