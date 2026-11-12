@id=MS-PR @version=1.0.0
@closes:PH-transition
Feature: Product Release

  Rule: Everything planned is verified

    Scenario: The work planned into any iteration, in any discipline
      Then the query "requirement|nfr[stage!=verified] ?-iteration|activity.analysis-design|activity.implementation|activity.test|activity.deployment-> iteration" returns no results

  Rule: The version that runs is 1.0

    Scenario: sdp --version
      When I run "sdp --version" in the repository
      Then the output contains "v1.0."

  Rule: The specification graph is consistent

    Scenario: No error and no failed scenario
      Then there are no error diagnostics
      And the query "scenario[status=failed]" returns no results
