@id=nothing-unverified-reaches-main @kind=epic
@includes:everything-built-is-verified#work-reaches-main-through-a-pull-request-that-passed-npm-run
@includes:everything-built-is-verified#ci-runs-npm-run-verify-for-every-pull-request-and-every-push-to
@includes:everything-built-is-verified#a-commit-runs-sdp-check-and-a-push-runs-npm-run-verify-through
@includes:install-from-npm#a-release-is-published-by-ci-with-provenance-from-a-tag-on-a
@includes:know-what-is-verified#a-result-ci-recorded-counts-in-every-checkout-that-matches-what
Feature: Nothing unverified reaches main

  Whatever reaches main, and whatever is released from it, passed the checks a developer runs, and a
  result CI recorded counts in every checkout.
