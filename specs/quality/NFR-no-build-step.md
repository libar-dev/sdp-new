---
id: NFR-no-build-step
kind: nfr
title: Runs from source
maturity: ready
quality: modifiability
iteration: I1
activity: { implementation: I1, test: I1 }
links:
  refines: CAP-agent-collaboration
  decided-by: DEC-0004
---

# Runs from source

The tool runs directly from its TypeScript sources on Node.js 24+, with no build step. An agent
that edits a source file can run the result immediately; there is no stale `dist/` to forget.

## Scenarios

A quality attribute scenario: *Given* is the environment, *When* the stimulus, *Then* the response.
`sdp` here is `node src/cli/main.ts`.

~~~gherkin
Scenario: The command line runs straight from its TypeScript sources
  Given this repository has no build output
  When I run "sdp --version" in the repository
  Then the exit code is 0
~~~
