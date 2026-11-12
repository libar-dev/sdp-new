@id=REQ-web-explorer @maturity=draft
Feature: Interactive graph explorer

  Stakeholders who do not live in a terminal have nowhere to read the graph: the curated
  architecture, the way from a requirement to its decisions and code, the lifecycle chart.

  Rule: A reader browses the architecture as sdp arch shows it

  Rule: A reader follows a requirement to its decisions and its code

  Rule: A reader sees the lifecycle chart

  @decided-by:files-are-the-source-of-truth
  Rule: The explorer only reads: an edit is made in the files
