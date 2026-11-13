@id=install-from-npm @maturity=draft
@iteration:IT-packaging
Feature: Install sdp from npm

  Teams that adopt sdp install it the way they install any tool, as a development dependency of
  their repository, not from a clone of this one.

  Rule: The package, installed as a development dependency, gives the command `sdp`, which `npx sdp` runs

  Rule: Programs import the package and its `effect` entry, and step modules its `steps` entry, from where it is installed, typed

  Rule: The package is JavaScript and declarations, built only when packing; the repository runs from its sources

    Node.js strips no types from files under `node_modules`, so an installed copy cannot run from
    sources as a clone does. A build between an edit and its effect is output that can be stale.

  Rule: A release runs the command-line scenarios again against the packed package, installed in a temporary directory

    Every scenario that runs `sdp` reaches it through one path, so pointing that path at the installed
    package tests it as fully as the sources.

  Rule: A release is published by CI from a tag on a commit that passed npm run verify, with provenance

  Rule: The published package depends on the exact versions of Effect its checks passed with

    Its command line, process and platform modules are marked unstable, so a version range would let
    an untested release of them in.

  Rule: The package runs on Node.js 24 and later

  Rule: The package is published as `@libar-dev/software-delivery-protocol`, and its command is `sdp`

    `sdp` on npm is another project's. The name is the earlier implementation's, never published:
    only one of the two implementations will be.
