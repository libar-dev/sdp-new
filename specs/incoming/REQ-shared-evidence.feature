@id=REQ-shared-evidence @maturity=idea
Feature: Evidence shared between machines

  `.sdp/results.json` is evidence about one checkout: a colleague, or a reviewer of a pull request,
  sees `verified` only after running everything again.

  Rule: Evidence a CI run produced counts wherever the inputs it fingerprinted are the same
