@id=MS-IOC
@closes:PH-construction
Feature: Initial Operational Capability

  Rule: Requirements written in Construction are ready

    Scenario: The requirements planned into Construction's iterations
      Then the query "requirement|nfr ?-iteration-> iteration[phase=PH-construction]" returns at least 1 result
      And the query "requirement|nfr[maturity<ready] ?-iteration-> iteration[phase=PH-construction]" returns no results

  Rule: Everything built up to the end of Construction is verified

    Scenario: The work implemented in Inception, Elaboration and Construction
      Then the query "requirement|nfr ?-activity.implementation-> iteration[phase=PH-construction]" returns at least 1 result
      And the query "requirement|nfr[stage!=verified] ?-activity.implementation-> iteration[phase=PH-inception|PH-elaboration|PH-construction]" returns no results

  Rule: Every risk due at this milestone is retired

    Scenario: The mitigations of the risks due at MS-IOC
      Then the query "risk ?-due-> #MS-IOC" returns at least 1 result
      And the query "risk ?-due-> #MS-IOC -mitigated-by-> *[stage!=verified]" returns no results

  Rule: The specification graph is consistent

    Scenario: No error and no failed scenario
      Then there are no error diagnostics
      And the query "scenario[status=failed]" returns no results
