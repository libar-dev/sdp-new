---
id: MS-LCO
kind: milestone
title: Lifecycle Objectives
phase: inception
---

# Lifecycle Objectives

End of Inception: we know what we are building and why, and the decisions everything else rests on
are made.

~~~gherkin
Scenario: Vision and scope are captured
  Then the query "capability" returns at least 3 results
  And the query "requirement" returns at least 5 results

Scenario: Foundational decisions are accepted
  Then the query "decision[iteration=I1, status!=accepted]" returns no results
~~~
