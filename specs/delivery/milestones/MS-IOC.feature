@id=MS-IOC
@closes:PH-construction
Feature: Initial Operational Capability

  Scenario: Requirements written in Construction are ready
    Then the query "requirement|nfr ?-iteration-> iteration[phase=PH-construction]" returns at least 1 result
    And the query "requirement|nfr[maturity<ready] ?-iteration-> iteration[phase=PH-construction]" returns no results

  Scenario: Everything built up to the end of Construction is verified
    Then the query "requirement|nfr ?-activity.implementation-> iteration[phase=PH-construction]" returns at least 1 result
    And the query "requirement|nfr[stage!=verified] ?-activity.implementation-> iteration[phase=PH-inception|PH-elaboration|PH-construction]" returns no results

  Scenario: The risks due at this milestone are retired: the work that mitigates them is verified
    Then the query "risk ?-due-> #MS-IOC" returns at least 1 result
    And the query "risk ?-due-> #MS-IOC -mitigated-by-> *[stage!=verified]" returns no results

  Scenario: The specification graph is consistent
    Then there are no error diagnostics
    And the query "scenario[status=failed]" returns no results
