---
id: NFR-no-build-step
kind: nfr
title: Runs from source in development
maturity: ready
quality: modifiability
iteration: I1
activity: { implementation: I1, test: I1 }
links:
  refines: CAP-agent-collaboration
---

# Runs from source in development

In this repository the tool runs directly from its TypeScript sources on Node.js 24 or later: an
agent that edits a source file runs the result with the next command, and there is no stale
`dist/` to forget. What gets installed is a release, which is built ([[REQ-npm-package]]).

## Scenarios

~~~gherkin
Scenario: With nothing built, the package's entry points are its TypeScript sources
  Given this repository has no build output
  When a fresh Node process imports "sdp/steps"
  Then the output contains "/src/steps.ts"
  When I run "node bin/sdp.js --version" in the repository
  Then the exit code is 0
~~~
