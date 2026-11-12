---
id: MS-LCA
kind: milestone
title: Lifecycle Architecture
phase: PH-elaboration
links:
  decided-by: [DEC-0008, DEC-0015]
---

# Lifecycle Architecture

End of Elaboration: the requirements written in it are ready, what it set out to build runs, the
risks due here are retired, and the architecture baseline is curated — every element and pattern
rests on a decision or a quality requirement. Which elements, and how many, is the architects'
call ([[DEC-0008]]); the gate checks only that each one is justified.

~~~gherkin
Scenario: Requirements written in Elaboration are ready
  Then the query "requirement|nfr ?-iteration-> iteration[phase=PH-elaboration]" returns at least 1 result
  And the query "requirement|nfr[maturity<ready] ?-iteration-> iteration[phase=PH-elaboration]" returns no results

Scenario: What Elaboration builds is verified
  Then the query "requirement|nfr ?-activity.implementation-> iteration[phase=PH-elaboration]" returns at least 1 result
  And the query "requirement|nfr[stage!=verified] ?-activity.implementation-> iteration[phase=PH-elaboration]" returns no results

Scenario: The risks due at this milestone are retired, by verified work
  Then the query "risk ?-due-> #MS-LCA" returns at least 1 result
  And the query "risk[status!=retired] ?-due-> #MS-LCA" returns no results
  And the query "risk ?-due-> #MS-LCA -mitigated-by-> *[stage!=verified]" returns no results

Scenario: The architecture baseline is curated
  Then the query "element|pattern" returns at least 1 result
  And the query "element|pattern !-*- decision|nfr" returns no results

Scenario: No architectural decision is left open
  Then the query "decision[category=architecture, status=proposed]" returns no results
~~~
