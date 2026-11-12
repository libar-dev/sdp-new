---
id: MS-LCA
kind: milestone
title: Lifecycle Architecture
phase: elaboration
---

# Lifecycle Architecture

End of Elaboration: the requirements that drive the architecture are ready, and the architecture
baseline is curated — significant elements are named, each with a rationale and a justification.
How many is a judgement call; the ~10% share is a guideline ([[DEC-0010]]), not a gate.

~~~gherkin
Scenario: Requirements planned for elaboration are ready
  Then the query "requirement|nfr[maturity<ready] ?-iteration-> iteration[phase=elaboration]" returns no results

Scenario: The architecture baseline is curated and justified
  Then the query "*[significant]" returns at least 1 result
  And the query "*[significant] !-*- decision|nfr" returns no results
  And there are no diagnostics for rule "significance-rationale"

Scenario: No architectural decision is left open
  Then the query "decision[category=architecture, status=proposed]" returns no results
~~~
