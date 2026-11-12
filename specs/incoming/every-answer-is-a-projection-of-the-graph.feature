@id=every-answer-is-a-projection-of-the-graph @kind=change @maturity=draft
@changes:ask-the-graph @changes:check-specs
Feature: Every answer is a projection of the graph

  Architects, reviewers and agents look at one delivery state through many views: the architecture
  around the specs a change touches, the decisions in reach, diagrams, the plan, an explorer in a
  browser, an editor. The views agree only when each is computed from the graph alone, sdp's own
  commands included, and anyone can add one only when the graph holds what it needs.

  Today the graph holds much less than is written. Of a spec it holds the first paragraph, so a
  decision's reason and its price are missing; of a scenario it holds how many steps it has but
  not the steps, and no Background, example table or doc string; of a run, each scenario's outcome
  but not which step failed and why. So `sdp check`, `sdp status` and `sdp context` read the parsed
  files and the stored results instead, and a view built on the graph would have to read them too.

  Not a store of views: a view is computed when it is asked for and never kept. Not the views
  themselves: each belongs to the feature of what it shows.

  @decided-by:files-are-the-source-of-truth
  Rule: Every answer of sdp is computed from the graph alone, so a program given the graph as data has all that any answer was computed from

    A view outside sdp then needs to know nothing of how sdp reads files, and cannot disagree with
    one of sdp's own.

  Rule: The graph carries the specs as written: every Feature, Background, Rule, Scenario and Examples, with their descriptions, tags and steps, doc strings and tables included

    The graph is what the files say, so whatever a view shows of a spec it finds in the graph.

  Rule: The graph carries what the runs recorded, step by step: each step's outcome, its error, and where its definition is

    What failed is what a reader of a scenario needs first, and today only the stored results
    hold it.

  Rule: The graph says which files it could not read, where and why, so that every answer computed from it knows it is incomplete

    A file that does not parse adds nothing to the graph but the fact that it could not be read.

  Rule: What sdp check reports is a view of the graph: computed from it when it is asked for, and never kept in it

    A problem in the specs is nothing anyone wrote or decided, but what one view says of what was
    written: like any view, it is computed from the graph when asked for.

  Rule: Every record of the graph as data names the version of its format, which changes when a reader of the version before would misread a record

    Once sdp is published, programs outside it read this export, and a format that changes
    without a word breaks them silently.
