@id=review-a-pull-request-by-its-specs @maturity=idea
@realized-by:ARCH-application @realized-by:ARCH-reports @realized-by:ARCH-workspace
Feature: Review a pull request by its specs

  Reviewers of a pull request, people and agents, need to see what it does to the specs and the
  architecture, which a diff of lines does not say.

  Not `sdp check`: the review compares the graph at the base and at the head, and fails nothing.

  Rule: The review lists the work that became live, the work to come that changed, and the questions asked or answered

  Rule: The review lists what replaces what, and each example renamed or moved

  Rule: The review lists what the architecture gained or lost, and the decisions in reach of what changed
