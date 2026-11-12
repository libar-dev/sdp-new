@id=install-from-npm @kind=feature @maturity=draft
@iteration:IT-packaging
Feature: Install sdp from npm

  Teams that adopt sdp install it the way they install any tool, as a development dependency of
  their repository. Today the package is private and runs only from a clone of this repository.

  Rule: `npm install --save-dev sdp` installs a command that `npx sdp` runs

  Rule: Step modules and code import `sdp/steps` and `sdp/annotations` from the installed package, typed

  @constrained-by:GUIDE#the-sources-run-as-they-are-with-no-build-step
  Rule: The package is JavaScript and declarations, built only when packing; the repository runs from its sources

    Node.js strips no types from files under `node_modules`, so an installed copy cannot run from
    sources as a clone does. A build between an edit and its effect is output that can be stale.

  @open
  Rule: How is a release shown to behave like the sources that were verified: the scenarios run again against the packed package, or a smoke test of it?

  @open
  Rule: Which Node.js versions does the published package support?

  @open
  Rule: The name `sdp` is taken on npm: is the package published as `@libar-dev/sdp`, or under another name?

    `sdp` on the registry is an SDP parsing library, maintained as of November 2026; the scope
    `@libar-dev` holds no `sdp` package yet.
