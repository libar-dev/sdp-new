@id=nothing-unverified-reaches-main @kind=epic
@includes:GUIDE#work-reaches-main-through-a-pull-request-that-passed-npm-run
@includes:GUIDE#ci-runs-npm-run-verify-on-node-js-24-for-every-pull-request-and
@includes:GUIDE#a-commit-runs-sdp-check-and-a-push-runs-npm-run-verify-through
@includes:install-from-npm#a-release-runs-the-command-line-scenarios-again-against-the
@includes:install-from-npm#a-release-is-published-by-ci-from-a-tag-on-a-commit-that-passed
@includes:know-what-is-verified#a-result-ci-recorded-counts-in-every-checkout-that-matches-what
Feature: Nothing unverified reaches main

  Whatever reaches main, and whatever is released from it, passed the checks and scenarios a
  developer runs, and a result CI recorded spares every checkout from running them again.
