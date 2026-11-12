@id=MS-LCO
@closes:PH-inception
Feature: Lifecycle Objectives

  Rule: The vision is broken down into capabilities, and every requirement refines one

    Scenario: No capability and no requirement stands alone
      Then the query "vision" returns 1 result
      And the query "capability" returns at least 1 result
      And the query "capability !-refines-> vision" returns no results
      And the query "capability !<-refines- requirement|nfr" returns no results
      And the query "requirement|nfr !-refines-> capability" returns no results

  Rule: What the prototype built is verified

    Scenario: The work implemented in Inception
      Then the query "requirement|nfr ?-activity.implementation-> iteration[phase=PH-inception]" returns at least 1 result
      And the query "requirement|nfr[stage!=verified] ?-activity.implementation-> iteration[phase=PH-inception]" returns no results

  Rule: The work that retires each risk is planned

    Scenario: Every mitigation of a risk due at a milestone has an iteration
      Then the query "risk ?-due-> milestone" returns at least 1 result
      And the query "risk ?-due-> milestone -mitigated-by-> * !-iteration-> iteration" returns no results

  Rule: Nothing written in Inception is still undecided

    Scenario: No spec of Inception has an open question
      Then the query "*[openQuestions>0] ?-iteration-> iteration[phase=PH-inception]" returns no results
