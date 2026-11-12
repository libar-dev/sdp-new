@id=REQ-shared-evidence @maturity=idea
@refines:CAP-living-specs @decided-by:DEC-0010
Feature: Evidence shared between machines

  `.sdp/results.json` is evidence about one checkout (DEC-0010): a colleague, or a reviewer of a
  pull request, sees `verified` only after running everything again. A team should be able to take
  the evidence a CI run produced — for exactly the inputs it fingerprinted — and read it wherever
  those inputs are the same.

  @open
  Rule: What is exchanged: the results file as it is, or one immutable artifact per run with an index derived from them?

  @open
  Rule: Which run counts when several cover the same scenario: the latest, a named CI run, or only results that agree?

  @open
  Rule: Is a result from another machine evidence at all when the toolchain fingerprint differs only by operating system, which is not fingerprinted today?

  @open
  Rule: Where do the artifacts live — the repository, the CI's artifact store, a branch — and who prunes them?

  @open
  Rule: Does `verified` say whose evidence it rests on (`local`, `ci`), so that a gate can require one of them?
