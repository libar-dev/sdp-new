@id=PLAN @kind=plan
@decided-by:DEC-0007 @decided-by:DEC-0013
Feature: Delivery plan for sdp 1.0

  Rule: Whatever has left the idea stage is planned

    Scenario: No requirement beyond an idea is without an iteration
      Then the query "requirement|nfr[maturity>=draft] !-iteration-> iteration" returns no results

  @gate
  Rule: An iteration recorded after the fact holds no work that is still to be done

    Scenario: Everything in I1 is verified
      Then the query "requirement|nfr ?-iteration-> iteration[planned=after-the-fact]" returns at least 1 result
      And the query "requirement|nfr[stage!=verified] ?-iteration|activity.implementation-> iteration[planned=after-the-fact]" returns no results
