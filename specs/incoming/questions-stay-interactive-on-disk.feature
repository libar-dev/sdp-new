@id=questions-stay-interactive-on-disk @kind=change @maturity=draft
@changes:ask-the-graph
@iteration:IT-scale-and-compatibility
Feature: Questions stay interactive on large repositories on disk

  Ask the graph promises interactive answers on large workspaces, but measures only the graph in
  memory. Every question also reads the workspace from disk, and in a monorepo of thousands of
  specs and tens of thousands of source files the reading alone could make an answer slow enough
  that agents stop asking and start guessing.

  When it is built, its rule replaces the one about large workspaces in ask-the-graph.

  Rule: A question on a repository of 5,000 specs and 20,000 source files on disk answers within the budget

  @open
  Rule: Which budget, and measured with a cold or a warm file system cache?

    Proposed: one second, warm; a cold cache measures the disk more than sdp.
