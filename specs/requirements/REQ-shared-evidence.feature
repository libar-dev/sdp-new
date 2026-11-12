@id=REQ-shared-evidence @maturity=idea
@refines:CAP-living-specs
Feature: Evidence shared between machines

  `.sdp/results.json` is evidence about one checkout: a colleague, or a reviewer of a pull request,
  sees `verified` only after running everything again.

  @decided-by:DEC-0010
  Rule: Evidence a CI run produced counts wherever the inputs it fingerprinted are the same

  @open
  Rule: What is exchanged: the results file as it is, one immutable artifact per run with an index derived from them, or Cucumber Messages that existing reporters render?

  @open
  Rule: Which run counts when several cover the same scenario: the latest, a named CI run, or only results that agree?

  @open
  Rule: Is a result from another machine evidence at all when the toolchain fingerprint differs only by operating system, which is not fingerprinted today?

  @open
  Rule: Where do the artifacts live — the repository, the CI's artifact store, a branch — and who prunes them?

  @open
  Rule: Does `verified` say whose evidence it rests on (`local`, `ci`), so that a gate can require one of them?
