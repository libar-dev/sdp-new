@id=draw-diagrams-from-the-graph @maturity=idea
@realized-by:ARCH-reports @realized-by:ARCH-application @realized-by:ARCH-checker
Feature: Draw diagrams from the graph

  Readers on GitHub, in a pull request or in a notes app take in a structure faster from a picture
  than from a list. A diagram drawn by hand stops being true at the next change and nobody notices;
  one sdp draws says what the graph says, and a stale one fails the check like a failing test.

  Not a drawing tool: a diagram shows what a question selects, never what is placed by hand.

  Rule: sdp draws named views as Mermaid: the architecture, a node and what is around it, an epic and its work, and the plan as a Gantt chart of its iterations and milestones

  Rule: sdp writes each diagram into a file it owns, the same graph draws it the same byte for byte, and check fails when one no longer matches the graph

    sdp writes no Markdown an author also edits: a page shows a diagram by linking to its file.

  Rule: A node shows its stage in its label and its colour

  @quality
  Rule: A diagram of more than 60 nodes is refused with its count and a narrower question, never cut

  Rule: The open questions are drawn as a mind map, grouped as sdp questions groups them
