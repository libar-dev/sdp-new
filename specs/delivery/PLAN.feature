@id=PLAN @kind=plan
Feature: Delivery plan for sdp 1.0

  Rule: Whatever has left the idea stage is planned

    Scenario: No requirement beyond an idea is without an iteration
      Then the query "requirement|nfr[maturity>=draft] !-iteration-> iteration" returns no results

  Rule: Work is planned only into declared iterations and disciplines

    Scenario: No plan reference that names nothing
      Then there are no diagnostics for rule "plan-reference"

  @decided-by:DEC-0007
  Rule: Every phase has iterations and a milestone that closes it

    Scenario: The four phases
      Then the query "phase !<-phase- iteration" returns no results
      And the query "phase !<-closes- milestone" returns no results

  Rule: A risk names what it threatens, and the work that retires it by a milestone unless it is tolerated

    Scenario: The risks of this plan
      Then the query "risk !-affects-> *" returns no results
      And the query "risk[status!=tolerated] !-mitigated-by-> *" returns no results
      And the query "risk[status!=tolerated] !-due-> milestone" returns no results
      And the query "risk[status=tolerated] ?-due-> milestone" returns no results
