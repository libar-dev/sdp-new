@id=browse-the-graph-in-obsidian @maturity=idea
Feature: Browse the graph in Obsidian

  Product owners, architects and reviewers read the delivery state more than they query it: they
  follow a feature to its rules, decisions and code, see what an epic still needs, and return to the
  same place the next day. sdp generates their studio: an Obsidian vault of the graph, a note per
  node, linked as the graph is, with standing views of the work, and in the same run a web page per
  note for whoever reads in a browser.

  Not an editor: a note or a page says which file to change, and nothing reads them back. Not
  committed: the vault and the pages are generated in each checkout, and git ignores them.

  Rule: A note is written for each feature, decision, element, epic, iteration and milestone, and a rule is a heading of its feature's note

  Rule: A note holds its node's facts, stage and links as properties, its text, and the file and line it is written at

  Rule: A link is a wikilink to the id; one to a node no spec declares is text, and no text of a spec becomes a link, a tag or a block id

  Rule: The vault is laid out as the specs are: features by area, epics beside their work

  Rule: Standing views list work still to come by maturity, open questions, each epic with its work, and unplanned work, each selecting what the query of the same name selects

  Rule: The note of an epic, an element or a feature shows its diagram

  Rule: The run that writes the vault writes a web page for each note, with the same text, links and diagram, and an index of the pages

    Gherkin is written to be checked, and a page with headings, links and tables is read. One run
    writes both from one reading of the graph, so a page and its note never disagree.

  Rule: The pages open from the folder they are written to, with no server: a static site that loads nothing from elsewhere, whose every link stays inside it, and that the same graph writes byte for byte

    Reading a local build comes first: whoever works in a checkout reads its pages as they are. CI
    can then publish the same files, and a reader tells two runs apart only where the graph changed.

  Rule: CI publishes the pages to GitHub Pages: the default branch's, and each pull request's beside them under its number

    A reviewer reads what a pull request changes as pages, without checking it out.

  Rule: sdp writes only into a folder it owns, refuses to overwrite a note edited by hand, and rewrites only what changed: an unchanged graph writes nothing

  Rule: Two ids that differ only in case refuse the vault, naming both

  @quality
  Rule: A vault of 500 specs and its pages are regenerated within 3 seconds
