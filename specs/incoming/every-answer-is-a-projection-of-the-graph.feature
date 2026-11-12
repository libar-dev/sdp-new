@id=every-answer-is-a-projection-of-the-graph @kind=change @maturity=draft
@changes:ask-the-graph @changes:check-specs
Feature: Every answer is a projection of the graph

  Architects, reviewers and agents look at one delivery state through many views: the architecture
  around the specs a change touches, the decisions in reach, diagrams, the plan, an explorer in a
  browser, an editor. The views agree only when each is computed from the graph alone, sdp's own
  commands included, and anyone can add one only when the graph holds what it needs.

  Today some answers read more than the graph holds. `sdp status` works out from the parsed specs
  which scenarios are gates and which belong to a milestone that is met; `sdp context` reads a
  failing step and its error from the stored results, and a decision's text beyond its first
  paragraph and why a spec is not ready from the parsed spec; the diagnostics of `sdp check` are in
  no graph at all.

  Not a store of views: a projection is computed when it is asked for and never kept. Not the
  views themselves: each belongs to the feature of what it shows.

  @decided-by:files-are-the-source-of-truth
  Rule: Whatever an answer of sdp shows is in the graph, so a program given the graph as data computes the same answer

    A view outside sdp then needs to know nothing of how sdp reads files, and cannot disagree with
    one of sdp's own.

  Rule: A scenario says whether it is a gate, and whether the milestone it belongs to is met

    Both decide how `sdp status` counts it, and a gate's query needs them as much as a report does.

  Rule: A scenario whose result counts says which step failed or is pending, with its error and where that step is defined

    What failed is what a reader of the scenario needs first, and today only the stored results
    hold it.

  Rule: A spec carries its whole description, not only the first paragraph that is its summary

    A decision's reason and its price follow its first sentence: its summary alone drops them.

  Rule: What sdp check reports is in the graph, at the node it concerns, so that a workspace without errors is a question of the graph

    A gate, an explorer and an editor then find a problem where it is, and agree with `sdp check`.

  Rule: Every record of the graph as data names the version of its format, which changes when a reader of the version before would misread a record

    Once sdp is published, programs outside it read this export, and a format that changes
    without a word breaks them silently.

  @open
  Rule: Is a diagnostic a node of its own, linked to the node it concerns, or an attribute of that node?

    Proposed: a node. `sdp check` is then the query `diagnostic`, a gate asks
    `diagnostic[severity=error]`, and one node can have several.

  @open
  Rule: Does the graph carry each spec's text as written, so that the context bundle is computed from the graph too?

    The bundle shows the rest of a spec as written, its Background and examples included, from the
    parsed file. Carrying the text makes the graph as large as the specs; not carrying it leaves
    showing a file as the one answer that is not a projection.
