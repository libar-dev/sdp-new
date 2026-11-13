@id=draw-diagrams-from-the-graph @maturity=idea
@realized-by:ARCH-reports @realized-by:ARCH-application @realized-by:ARCH-checker
Feature: Draw diagrams from the graph

  Readers take in a structure faster from a picture than from a list, and a diagram drawn by hand
  stops being true at the next change without anyone noticing.

  Not a drawing tool: a diagram shows what a question selects.

  Rule: sdp draws named views as Mermaid: the architecture, a node and what is around it, an epic and its work, the plan as a Gantt chart, and the open questions as a mind map, each node showing its stage

  Rule: sdp writes each diagram into a file it owns, and check fails when one no longer matches the graph

  @quality
  Rule: A diagram of more than 60 nodes is refused with a narrower question, never cut
