@id=RISK-0008 @status=tolerated
@price-of:DEC-0004 @affects:NFR-no-build-step
Feature: Young technology stack

  sdp runs on Effect 4, TypeScript's erasable syntax and the type stripping of Node.js 24. All
  three are recent: APIs may still move, documentation and examples are thin, and few contributors
  know Effect 4. An upgrade can break the tool, and newcomers, human or agent, may write Effect 2 or
  3 idioms that no longer exist.

  Tolerated: the stack is what lets the tool run from source with typed IO at the edges, and
  nothing planned replaces it.

  **Watch for:** `npm run verify` failing after a dependency update, and Effect 2 or 3 idioms in
  new code.
