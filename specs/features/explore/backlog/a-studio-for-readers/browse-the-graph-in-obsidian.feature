@id=browse-the-graph-in-obsidian @maturity=idea
Feature: Browse the graph in Obsidian

  Product owners, architects and reviewers read the delivery state more than they query it: they
  follow a feature to its rules, decisions and code, see what an epic still needs, and return to the
  same place the next day. sdp generates their studio from the graph: an Obsidian vault, and the same
  notes as web pages for whoever reads in a browser.

  Not an editor, and not committed: a note says which file to change, nothing reads it back, and
  each checkout generates its own.

  Rule: A note is written for each feature, decision, element, epic, iteration and milestone, with its facts, stage and links as properties, its text, and the file and line it is written at; a rule is a heading of its feature's note

  Rule: A link is a wikilink to the id; one to a node no spec declares is text, and no text of a spec becomes a link, a tag or a block id

  Rule: The vault is laid out as the specs are: features by area, epics beside their work

  Rule: Standing views list work still to come by maturity, open questions, each epic with its work, and unplanned work, each selecting what the query of the same name selects

  Rule: The note of an epic, an element or a feature shows its diagram

  Rule: The run that writes the vault writes a page for each note, with the same text, links and diagram, and an index: a static site that opens from its folder, loads nothing from elsewhere, links only within itself, and is the same byte for byte from the same graph

  Rule: CI publishes the pages to GitHub Pages: the default branch's, and each pull request's beside them under its number

    A reviewer reads what a pull request changes without checking it out.

  Rule: sdp writes only into a folder it owns, refuses to overwrite a note edited by hand, and rewrites only what changed: an unchanged graph writes nothing

  Rule: Two ids that differ only in case refuse the vault, naming both

  @quality
  Rule: A vault of 500 specs and its pages are regenerated within 3 seconds
