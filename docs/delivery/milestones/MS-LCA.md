---
id: MS-LCA
kind: milestone
title: Lifecycle Architecture
phase: elaboration
---

# Lifecycle Architecture

End of Elaboration: the requirements that drive the architecture are ready, and the architecture
baseline is curated — few significant elements, each justified.

~~~gherkin
Scenario: Requirements planned for elaboration are ready
  Then the query "requirement|nfr[maturity<ready] ?-iteration-> iteration[phase=elaboration]" returns no results

Scenario: The architecture baseline is curated and justified
  Then the significance ratio is at most 10%
  And the query "*[significant] !-*- decision" returns no results
  And there are no diagnostics for rule "significance-rationale"

Scenario: No architectural decision is left open
  Then the query "decision[category=architecture, status=proposed]" returns no results
~~~
