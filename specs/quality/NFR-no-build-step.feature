@id=NFR-no-build-step @maturity=ready @quality=modifiability
@refines:CAP-agent-collaboration
@iteration:I1 @activity.implementation:I1 @activity.test:I1
Feature: Runs from source in development

  In this repository the tool runs directly from its TypeScript sources on Node.js 24 or later: an
  agent that edits a source file runs the result with the next command, and there is no stale
  `dist/` to forget. What gets installed is a release, which is built (REQ-npm-package).

  Scenario: With nothing built, the package's entry points are its TypeScript sources
    Given this repository has no build output
    When a fresh Node process imports "sdp/steps"
    Then the output contains "/src/steps.ts"
    When I run "node bin/sdp.js --version" in the repository
    Then the exit code is 0
