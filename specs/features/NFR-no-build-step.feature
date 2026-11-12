@id=NFR-no-build-step @maturity=ready
Feature: Runs from source in development

  In this repository the tool runs directly from its TypeScript sources on Node.js 24 or later.
  What gets installed is a release, which is built.

  Rule: With nothing built, the package runs from its TypeScript sources

    An agent that edits a source file runs the result with the next command, and there is no stale
    `dist/` to forget.

    Scenario: The entry points of a checkout with no build output
      Given this repository has no build output
      When a fresh Node process imports "sdp/steps"
      Then the output contains "/src/steps.ts"
      When I run "node bin/sdp.js --version" in the repository
      Then the exit code is 0
