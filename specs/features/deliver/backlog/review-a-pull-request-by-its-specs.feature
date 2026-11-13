@id=review-a-pull-request-by-its-specs @maturity=idea
@realized-by:ARCH-application @realized-by:ARCH-reports @realized-by:ARCH-workspace
Feature: Review a pull request by its specs

  Reviewers of a pull request, people and agents, need to see what it does to the specs and the
  architecture, which a diff of lines does not say: a review lists what changed between the graph at
  the pull request's base and at its head.

  Not `sdp check`, nor a report of what ran: the review compares what is written, judges none of it
  and fails nothing.

  Rule: The review lists the work that became live, and the work still to come that was added, removed or given another maturity

  Rule: The review lists the open questions asked and those answered

  Rule: The review lists what replaces what — each rule, feature and example named by `@replaces:` — and each example renamed or moved

    The reviewer confirms that a test going on under another name or in another place is the same.

  Rule: The review lists the elements and patterns added to or removed from the architecture, and each link among them that came or went, imports included

  Rule: The review lists the decisions within reach of the specs and code that changed
