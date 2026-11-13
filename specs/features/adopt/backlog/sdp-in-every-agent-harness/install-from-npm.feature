@id=install-from-npm @maturity=draft
@iteration:IT-packaging
Feature: Install sdp from npm

  Teams that adopt sdp install it as a development dependency of their repository, as they install
  any tool, not from a clone of this one.

  Rule: The package `@libar-dev/software-delivery-protocol` gives the command `sdp`, and programs and step modules import its entries from where it is installed, typed

  Rule: A release is published by CI, with provenance, from a tag on a commit that passed npm run verify and the command-line scenarios run against the packed package

  Rule: The published package depends on the exact versions of Effect its checks passed with, and runs on Node.js 24 and later
