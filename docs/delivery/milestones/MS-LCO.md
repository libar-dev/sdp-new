---
id: MS-LCO
kind: milestone
title: Lifecycle Objectives
phase: PH-inception
---

# Lifecycle Objectives

End of Inception: we know what we are building and why, a prototype shows that it can be built,
every open risk has the work that retires it planned, and the decisions taken so far are accepted.

~~~gherkin
Scenario: The vision is broken down into capabilities and requirements
  Then the query "vision" returns 1 result
  And the query "capability" returns at least 1 result
  And the query "capability !-refines-> vision" returns no results
  And the query "capability !<-refines- requirement|nfr" returns no results
  And the query "requirement|nfr !-refines-> capability" returns no results

Scenario: What the prototype built is verified
  Then the query "requirement|nfr ?-activity.implementation-> iteration[phase=PH-inception]" returns at least 1 result
  And the query "requirement|nfr[stage!=verified] ?-activity.implementation-> iteration[phase=PH-inception]" returns no results

Scenario: The work that retires each open risk is planned
  Then the query "risk[status=open]" returns at least 1 result
  And the query "risk[status=open] -mitigated-by-> * !-iteration-> iteration" returns no results

Scenario: Decisions taken in Inception are accepted
  Then the query "decision ?-iteration-> iteration[phase=PH-inception]" returns at least 1 result
  And the query "decision[status!=accepted] ?-iteration-> iteration[phase=PH-inception]" returns no results
~~~
