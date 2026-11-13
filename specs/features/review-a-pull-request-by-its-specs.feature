@id=review-a-pull-request-by-its-specs @maturity=draft
Feature: Review a pull request by its specs

  Reviewers of a pull request, people and agents, need to see what it does to the specs and the
  architecture, not only to the code. The diff shows the lines that changed: it does not say that a
  feature became live, that a rule replaces another, that an example was renamed or merged into
  another, that one element now imports another, or which decisions rest on what changed. A review
  compares the graph at the pull request's head with the graph at its base, and lists what changed
  in it.

  Not `sdp check`, which already fails a pull request that turns a live test off: the review lists
  what changed, judges none of it and fails nothing. Not a report of what is verified: a result is
  one checkout's, so the review compares what is written, not what ran.

  Rule: The review lists the work that became live, and the work still to come that was added, removed or given another maturity

  Rule: The review lists the open questions asked and those answered

  Rule: The review lists what replaces what — each rule, feature and example named by `@replaces:` — and each example renamed or moved

    There a test goes on under another name or in another place, and the reviewer confirms that it
    is the same test.

  Rule: The review lists the elements and patterns added to or removed from the architecture, and each link among them that came or went, imports included

    Which element imports which is derived from the code, so no diff of a spec shows a new
    dependency.

  Rule: The review lists the decisions within reach of the specs and code that changed
