@id=every-answer-is-a-projection-of-the-graph @kind=change @maturity=draft
@changes:ask-the-graph @changes:check-specs
Feature: Every answer is a projection of the graph

  Tools built outside sdp — an explorer in a browser, an editor, a script over `sdp graph` — want to
  show what sdp shows from the graph alone, so that they cannot disagree with it. Today some answers
  read more than the graph sdp exports: `sdp status` works out from the specs which scenarios are
  gates and which belong to a milestone that is met, `sdp check` derives its diagnostics from the
  specs, and `sdp context` reads a failing step's error from the stored results and a decision's
  whole text from its spec. A tool given the graph would have to work these out again.

  Rule: What sdp check reports is in the graph, at the node it concerns

  Rule: Whether a scenario is a gate, and whether its milestone is met, are attributes of the scenario

  Rule: A scenario that failed carries its failing step and that step's error

  Rule: A spec carries its whole description, not only its first paragraph

  Rule: The graph as data has a schema and a version, which a program decodes before it reads it

  @open
  Rule: Is a diagnostic a node of its own, linked to what it concerns, or an attribute of that node?
