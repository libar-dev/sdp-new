@id=MS-beta @version=0.9.0
@closes:T1
Feature: 0.9 beta

  Rule: Nothing that is built is failing or half automated

    Scenario: The stages of every requirement
      Then the query "requirement|nfr[stage=failing|in-progress]" returns no results

  Rule: What the beta tests is verified

    Scenario: The work tested in T1
      Then the query "requirement|nfr ?-activity.test-> #T1" returns at least 1 result
      And the query "requirement|nfr[stage!=verified] ?-activity.test-> #T1" returns no results

  Rule: The version that runs is 0.9

    Scenario: sdp --version
      When I run "sdp --version" in the repository
      Then the output contains "v0.9."
