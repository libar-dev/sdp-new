---
id: MS-LCA
kind: milestone
title: Lifecycle Architecture
phase: PH-elaboration
---

# Lifecycle Architecture

~~~gherkin
Scenario: Requirements written in Elaboration are ready
  Then the query "requirement|nfr ?-iteration-> iteration[phase=PH-elaboration]" returns at least 1 result
  And the query "requirement|nfr[maturity<ready] ?-iteration-> iteration[phase=PH-elaboration]" returns no results

Scenario: What Elaboration builds is verified
  Then the query "requirement|nfr ?-activity.implementation-> iteration[phase=PH-elaboration]" returns at least 1 result
  And the query "requirement|nfr[stage!=verified] ?-activity.implementation-> iteration[phase=PH-elaboration]" returns no results

Scenario: The risks due at this milestone are retired: the work that mitigates them is verified
  Then the query "risk ?-due-> #MS-LCA" returns at least 1 result
  And the query "risk ?-due-> #MS-LCA -mitigated-by-> *[stage!=verified]" returns no results

Scenario: Every element has a description
  Then the query "element|pattern" returns at least 1 result
  And the query "element|pattern[!summary]" returns no results

Scenario: No element or pattern has an open question
  Then the query "element|pattern[openQuestions>0]" returns no results
~~~
