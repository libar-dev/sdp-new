---
id: MS-LCA
kind: milestone
title: Lifecycle Architecture
phase: elaboration
---

# Lifecycle Architecture

End of Elaboration: the requirements that drive the architecture are ready, and the architecture
baseline is curated — the architects have named the significant elements and recorded why
([[DEC-0008]]). Which and how many is their call; this gate only checks that the curation happened
and is connected to the decisions behind it, which is this team's own definition of done.

~~~gherkin
Scenario: Requirements planned for elaboration are ready
  Then the query "requirement|nfr[maturity<ready] ?-iteration-> iteration[phase=elaboration]" returns no results

Scenario: The architecture baseline is curated
  Then the query "*[significant]" returns at least 1 result
  And the query "*[significant, !rationale]" returns no results
  And the query "*[significant] !-*- decision|nfr" returns no results

Scenario: No architectural decision is left open
  Then the query "decision[category=architecture, status=proposed]" returns no results
~~~
