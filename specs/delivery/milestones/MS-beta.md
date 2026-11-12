---
id: MS-beta
closes: T1
version: "0.9.0"
---

# 0.9 beta

~~~gherkin
Scenario: Nothing that is built is failing or half automated
  Then the query "requirement|nfr[stage=failing|in-progress]" returns no results

Scenario: What the beta tests is verified
  Then the query "requirement|nfr ?-activity.test-> #T1" returns at least 1 result
  And the query "requirement|nfr[stage!=verified] ?-activity.test-> #T1" returns no results

Scenario: 0.9 is what runs
  When I run "sdp --version" in the repository
  Then the output contains "v0.9."
~~~
