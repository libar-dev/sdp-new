@id=MS-LCO
@closes:PH-inception
Feature: Lifecycle Objectives

  Scenario: What the prototype built is verified
    Then the query "requirement|nfr ?-activity.implementation-> iteration[phase=PH-inception]" returns at least 1 result
    And the query "requirement|nfr[stage!=verified] ?-activity.implementation-> iteration[phase=PH-inception]" returns no results

  Scenario: The work that retires each risk is planned
    Then the query "risk" returns at least 1 result
    And the query "risk -mitigated-by-> * !-iteration-> iteration" returns no results

  Scenario: Nothing written in Inception is still undecided
    Then the query "*[openQuestions>0] ?-iteration-> iteration[phase=PH-inception]" returns no results
