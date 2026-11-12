@id=every-answer-is-a-projection-of-the-graph @maturity=draft
@changes:ask-the-graph @changes:check-specs
Feature: Every answer is a projection of the graph

  Many views of one delivery state — the architecture around a set of specs, diagrams, an explorer,
  an editor — agree only when each is computed from the graph alone, sdp's own answers included.

  Today the graph lacks much of what is written: a spec's description after its first paragraph, a
  scenario's steps, Backgrounds and tables, and which step of a run failed. So `check`, `status`
  and `context` read the files and the stored results instead.

  Not a store of views: each is computed when asked for and never kept.

  @decided-by:files-are-the-source-of-truth
  Rule: Every answer is computed from the graph alone

  Rule: The graph holds each spec as written

  Rule: The graph holds each step a run recorded, with its outcome and error

  Rule: The graph says which files it could not read, and why

  Rule: What sdp check reports is computed from the graph, never kept in it

    A problem is what one view says of what was written, not something anyone wrote.

  Rule: Each record of the exported graph names the version of its format

    Programs outside sdp will read it, and a format that changes without a word breaks them.
