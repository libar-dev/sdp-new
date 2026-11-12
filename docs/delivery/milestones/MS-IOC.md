---
id: MS-IOC
kind: milestone
title: Initial Operational Capability
phase: construction
---

# Initial Operational Capability

End of Construction: what was specified as ready for construction is implemented — which here
means its scenarios pass — and the specification graph is consistent.

~~~gherkin
Scenario: Ready construction work is verified
  Then the query "requirement|nfr[maturity=ready, stage!=verified] ?-iteration-> iteration[phase=construction]" returns no results

Scenario: The specification graph is consistent
  Then there are no error diagnostics
  And the query "scenario[status=failed] -verifies-> *[kind!=milestone]" returns no results
~~~
