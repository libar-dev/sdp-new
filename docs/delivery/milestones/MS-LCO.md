---
id: MS-LCO
kind: milestone
title: Lifecycle Objectives
phase: inception
---

# Lifecycle Objectives

End of Inception: we know what we are building and why ([[VISION]]), every capability is broken
down into requirements, the risks are named with a mitigation planned for each open one, and the
decisions made so far are accepted.

~~~gherkin
Scenario: Vision and scope are captured
  Then the query "vision" returns 1 result
  And the query "#VISION -*|mentions-> capability" returns at least 1 result
  And the query "capability !<-refines- requirement|nfr" returns no results
  And the query "requirement|nfr !-refines-> capability" returns no results

Scenario: Every open risk is understood and its mitigation planned
  Then the query "risk" returns at least 1 result
  And the query "risk[status=open] !-affects-> *" returns no results
  And the query "risk[status=open] !-mitigated-by-> *" returns no results
  And the query "risk[status=open] -mitigated-by-> * !-iteration-> iteration" returns no results

Scenario: Decisions made in Inception are accepted
  Then the query "decision[iteration=I1, status!=accepted]" returns no results
~~~
