---
id: MS-LCO
kind: milestone
title: Lifecycle Objectives
phase: PH-inception
---

# Lifecycle Objectives

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

Scenario: The work that retires each risk is planned
  Then the query "risk ?-due-> milestone" returns at least 1 result
  And the query "risk ?-due-> milestone -mitigated-by-> * !-iteration-> iteration" returns no results

Scenario: Nothing written in Inception is still undecided
  Then the query "*[openQuestions>0] ?-iteration-> iteration[phase=PH-inception]" returns no results
~~~
