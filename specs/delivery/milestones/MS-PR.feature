@id=MS-PR @version=1.0.0
@closes:PH-transition
Feature: Product Release

  Scenario: Everything planned is verified
    Then the query "requirement|nfr[stage!=verified] ?-iteration|activity.analysis-design|activity.implementation|activity.test|activity.deployment-> iteration" returns no results

  Scenario: 1.0 is what runs
    When I run "sdp --version" in the repository
    Then the output contains "v1.0."

  Scenario: The specification graph is consistent
    Then there are no error diagnostics
    And the query "scenario[status=failed]" returns no results
