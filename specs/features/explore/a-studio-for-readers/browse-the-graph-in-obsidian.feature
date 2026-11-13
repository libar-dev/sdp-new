@id=browse-the-graph-in-obsidian @maturity=idea
Feature: Browse the graph in Obsidian

  Product owners, architects and reviewers read the delivery state more than they query it: they
  follow a feature to its rules, decisions and code, see what an epic still needs, and return to the
  same place the next day. sdp generates their studio: an Obsidian vault of the graph, a note per
  node, linked as the graph is, with standing views of the work.

  Not an editor: a note says which file to change, and nothing reads the vault back. Not pages of
  sdp's own: a team that wants the vault on the web publishes it with a renderer of its choice. Not
  committed: the vault is generated in each checkout, and git ignores it.

  Rule: A note is written for each feature, decision, element, epic, iteration and milestone, and a rule is a heading of its feature's note

  Rule: A note holds its node's facts, stage and links as properties, its text, and the file and line it is written at

  Rule: A link is a wikilink to the id; one to a node no spec declares is text, and no text of a spec becomes a link, a tag or a block id

  Rule: The vault is laid out as the specs are: features by area, epics beside their work

  Rule: Standing views list work still to come by maturity, open questions, each epic with its work, and unplanned work, each selecting what the query of the same name selects

  Rule: The note of an epic, an element or a feature shows its diagram

  Rule: sdp writes only into a folder it owns, refuses to overwrite a note edited by hand, and rewrites only what changed: an unchanged graph writes nothing

  Rule: Two ids that differ only in case refuse the vault, naming both

  @type=quality
  Rule: A vault of 500 specs is regenerated within 3 seconds
