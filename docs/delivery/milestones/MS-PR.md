---
id: MS-PR
kind: milestone
title: Product Release
phase: transition
---

# Product Release

End of Transition: everything that was planned is verified, and users can install it.

~~~gherkin
Scenario: Everything planned is verified
  Then the query "requirement|nfr[stage!=verified] ?-iteration-> iteration" returns no results

Scenario: The package is published
  Given the release candidate is tagged
  Then the package is available on the npm registry
~~~
