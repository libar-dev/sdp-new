@id=PLAN @kind=plan
@decided-by:DEC-0007
Feature: Delivery plan for sdp 1.0

  Scenario: Whatever has left the idea stage is planned
    Then the query "requirement|nfr[maturity>=draft] !-iteration-> iteration" returns no results

  Scenario: Work is planned only into declared iterations and disciplines
    Then there are no diagnostics for rule "plan-reference"

  Scenario: Every phase has iterations and a milestone that closes it
    Then the query "phase !<-phase- iteration" returns no results
    And the query "phase !<-closes- milestone" returns no results

  Scenario: A risk names what it threatens, and the work that retires it by a milestone unless it is tolerated
    Then the query "risk !-affects-> *" returns no results
    And the query "risk[status!=tolerated] !-mitigated-by-> *" returns no results
    And the query "risk[status!=tolerated] !-due-> milestone" returns no results
    And the query "risk[status=tolerated] ?-due-> milestone" returns no results
