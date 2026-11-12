---
id: REQ-shared-evidence
kind: requirement
title: Evidence shared between machines
maturity: idea
links:
  refines: CAP-living-specs
  decided-by: DEC-0011
---

# Evidence shared between machines

`.sdp/results.json` is evidence about one checkout ([[DEC-0011]]): a colleague, or a reviewer of a
pull request, sees `verified` only after running everything again. A team should be able to take
the evidence a CI run produced — for exactly the inputs it fingerprinted — and read it wherever
those inputs are the same.

## Open questions

- [ ] What is exchanged: the results file as it is, or one immutable artifact per run with an
  index derived from them?
- [ ] Which run counts when several cover the same scenario: the latest, a named CI run, or only
  results that agree?
- [ ] Is a result from another machine evidence at all when the toolchain fingerprint differs
  only by operating system, which is not fingerprinted today?
- [ ] Where do the artifacts live — the repository, the CI's artifact store, a branch — and who
  prunes them?
- [ ] Does `verified` say whose evidence it rests on (`local`, `ci`), so that a gate can require
  one of them?
