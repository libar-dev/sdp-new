---
id: MS-PR
kind: milestone
title: Product Release
phase: PH-transition
---

# Product Release

End of Transition: everything that was planned is verified, whichever discipline planned it — the
package included, so users can install what was built ([[REQ-npm-package]]) — and what this
repository runs is the release.

~~~gherkin
Scenario: Everything planned is verified
  Then the query "requirement|nfr[stage!=verified] ?-iteration|activity.analysis-design|activity.implementation|activity.test|activity.deployment-> iteration" returns no results

Scenario: Every release is planned, and 1.0 is what runs
  Then the query "release" returns at least 1 result
  And the query "release !-iteration-> iteration" returns no results
  When I run "sdp --version" in the repository
  Then the output contains "v1.0."

Scenario: The specification graph is consistent
  Then there are no error diagnostics
  And the query "scenario[status=failed]" returns no results
~~~
