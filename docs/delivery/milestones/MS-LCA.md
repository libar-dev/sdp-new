---
id: MS-LCA
kind: milestone
title: Lifecycle Architecture
phase: PH-elaboration
links:
  decided-by: DEC-0008
---

# Lifecycle Architecture

End of Elaboration: the requirements planned for it are ready, what it planned to build runs and
is verified, the risks that threatened the architecture are retired, and the architecture baseline
is curated — the architects have declared its elements and patterns, each connected to the
decisions or quality requirements behind it ([[DEC-0008]]). Which and how many is their call; this
gate only checks that the curation happened and is connected, which is this team's own definition
of done.

A high-exposure risk is retired when it is mitigated, by work that is verified ([[DEC-0007]]), or
consciously accepted. How exposed a risk is, like what belongs in the architecture, is a judgement
the gate does not make.

~~~gherkin
Scenario: Requirements planned for elaboration are ready
  Then the query "requirement|nfr[maturity<ready] ?-iteration-> iteration[phase=PH-elaboration]" returns no results

Scenario: What Elaboration builds is verified
  Then the query "requirement|nfr[stage!=verified] ?-activity.implementation-> iteration[phase=PH-elaboration]" returns no results

Scenario: No high-exposure risk is left open
  Then the query "risk[exposure=high, status=open]" returns no results

Scenario: The architecture baseline is curated
  Then the query "element|pattern" returns at least 1 result
  And the query "element|pattern !-*- decision|nfr" returns no results

Scenario: No architectural decision is left open
  Then the query "decision[category=architecture, status=proposed]" returns no results
~~~
