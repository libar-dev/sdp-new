---
id: PAT-pipes-and-filters
kind: pattern
title: Pipes and filters
links:
  decided-by: DEC-0004
---

# Pipes and filters

Workspace IO → parse → build graph → analyse (query, check, run, lifecycle). Each stage after IO
is a pure function of its input, which is what lets executable specs run the real pipeline against
an in-memory file system.

~~~gherkin
Scenario: The core does no IO
  When I run "grep -rlE FileSystem|node:fs src/parse src/model src/graph src/check" in the repository
  Then the exit code is 1
~~~
