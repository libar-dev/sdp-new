@id=browse-the-graph-in-obsidian @maturity=idea
Feature: Browse the graph in Obsidian

  Product owners, architects and reviewers read the delivery state more than they query it: they
  follow a feature to its rules, decisions and code, and return to the same place the next day.

  Not an editor, and not committed: a note says which file to change, and nothing reads it back.

  Rule: A note is written for each feature, decision, element, epic, iteration and milestone, with its facts, stage and links as properties, its text, its diagram and where it is written; a rule is a heading of its feature's note

  Rule: A link is a wikilink to the id, and no text of a spec becomes a link, a tag or a block id

  Rule: The vault is laid out as the specs are, with standing views of work still to come by maturity, open questions, each epic with its work, and unplanned work

  Rule: The same run writes each note as a page of a static site that opens from its folder, which CI publishes to GitHub Pages for the default branch and each pull request

  Rule: sdp writes only into a folder it owns, and never overwrites a note edited by hand

  @quality
  Rule: A vault of 500 specs and its pages are regenerated within 3 seconds
