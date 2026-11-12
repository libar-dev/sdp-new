---
id: NFR-no-build-step
kind: nfr
title: Runs from source
maturity: ready
type: quality
quality: modifiability
iteration: C3
links:
  decided-by: DEC-0004
---

# Runs from source

The tool runs directly from its TypeScript sources on Node.js 24+, with no build step. An agent
that edits a source file can run the result immediately; there is no stale `dist/` to forget.

## Scenarios

~~~gherkin
Scenario: The CLI starts straight from TypeScript sources
  When I run "sdp --version" in the repository
  Then the output contains "0.1.0"
~~~
