@id=MS-LCA
@closes:PH-elaboration
Feature: Lifecycle Architecture

  Rule: Requirements written in Elaboration are ready

    Scenario: The requirements planned into Elaboration's iterations
      Then the query "requirement|nfr ?-iteration-> iteration[phase=PH-elaboration]" returns at least 1 result
      And the query "requirement|nfr[maturity<ready] ?-iteration-> iteration[phase=PH-elaboration]" returns no results

  Rule: What Elaboration builds is verified

    Scenario: The work implemented in Elaboration
      Then the query "requirement|nfr ?-activity.implementation-> iteration[phase=PH-elaboration]" returns at least 1 result
      And the query "requirement|nfr[stage!=verified] ?-activity.implementation-> iteration[phase=PH-elaboration]" returns no results

  Rule: Every risk due at this milestone is retired

    A risk is retired when the work that mitigates it is verified: that is read from the graph, never
    written.

    Scenario: The mitigations of the risks due at MS-LCA
      Then the query "risk ?-due-> #MS-LCA" returns at least 1 result
      And the query "risk ?-due-> #MS-LCA -mitigated-by-> *[stage!=verified]" returns no results

  Rule: Every element and pattern has a description

    Scenario: The architecture's elements and patterns
      Then the query "element|pattern" returns at least 1 result
      And the query "element|pattern[!summary]" returns no results

  Rule: No element or pattern has an open question

    Scenario: The architecture's open questions
      Then the query "element|pattern[openQuestions>0]" returns no results
