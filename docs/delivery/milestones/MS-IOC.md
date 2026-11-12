---
id: MS-IOC
kind: milestone
title: Initial Operational Capability
phase: construction
---

# Initial Operational Capability

End of Construction: everything planned for Construction is implemented — which here means its
scenarios pass — and the specification graph is consistent. Work left below `ready` is not
implemented either, so it keeps the gate unmet.

~~~gherkin
Scenario: Construction work is verified
  Then the query "requirement|nfr[stage!=verified] ?-iteration-> iteration[phase=construction]" returns no results

Scenario: The specification graph is consistent
  Then there are no error diagnostics
  And the query "scenario[status=failed] -verifies-> *[kind!=milestone]" returns no results
~~~
