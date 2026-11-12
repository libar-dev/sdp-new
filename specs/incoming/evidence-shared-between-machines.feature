@id=evidence-shared-between-machines @kind=change @maturity=idea
@changes:know-what-is-verified
Feature: Evidence shared between machines

  A colleague, or a reviewer of a pull request, wants to know what a CI run verified without
  running everything again. Today `.sdp/results.json` is evidence about one checkout, so they see
  `verified` only after running every scenario themselves.

  When it is built, know-what-is-verified no longer keeps a result only in the checkout where it
  ran.

  Rule: A result a CI run recorded counts in any checkout where what it ran against is the same
