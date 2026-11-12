---
id: MS-LCO
kind: milestone
title: Lifecycle Objectives
phase: inception
---

# Lifecycle Objectives

End of Inception: we know what we are building and why ([[VISION]]), the main risks are named, and
the decisions everything else rests on are made.

~~~gherkin
Scenario: Vision and scope are captured
  Then the query "vision" returns 1 result
  And the query "capability" returns at least 3 results
  And the query "requirement" returns at least 5 results

Scenario: The main risks are identified
  Then the query "risk" returns at least 3 results
  And the query "risk[status=open] !-affects-> *" returns no results

Scenario: Foundational decisions are accepted
  Then the query "decision[iteration=I1, status!=accepted]" returns no results
~~~
