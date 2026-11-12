---
id: MS-PR
kind: milestone
title: Product Release
phase: PH-transition
---

# Product Release

End of Transition: everything that was planned is verified — including [[REQ-npm-package]], so
users can install what was built.

~~~gherkin
Scenario: Everything planned is verified
  Then the query "requirement|nfr[stage!=verified] ?-iteration-> iteration" returns no results
~~~
