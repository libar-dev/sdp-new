@id=install-from-npm @maturity=draft
@iteration:IT-packaging
Feature: Install sdp from npm

  Teams that adopt sdp install it the way they install any tool, as a development dependency of
  their repository, not from a clone of this one.

  Rule: The package `@libar-dev/software-delivery-protocol`, installed as a development dependency, gives the command `sdp`, which `npx sdp` runs

    `sdp` on npm is another project's.

  Rule: Programs import the package and its `effect` entry, and step modules its `steps` entry, from where it is installed, typed

  Rule: A release runs the command-line scenarios against the packed package, installed as a user installs it

  Rule: A release is published by CI from a tag on a commit that passed npm run verify, with provenance

  Rule: The published package depends on the exact versions of Effect its checks passed with

    Parts of Effect it uses are marked unstable, and a version range would let an untested release in.

  Rule: The package runs on Node.js 24 and later
