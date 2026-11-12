@id=REQ-web-explorer @maturity=draft
@refines:CAP-curated-architecture
@iteration:C1 @activity.analysis-design:C2 @activity.implementation:C3 @activity.test:C3 @activity.test:T1
Feature: Interactive graph explorer

  Stakeholders who do not live in a terminal have nowhere to read the graph: the curated
  architecture, the way from a requirement to its decisions and code, the lifecycle chart.

  Rule: A reader browses the architecture as sdp arch shows it

  Rule: A reader follows a requirement to its decisions and its code

  Rule: A reader sees the lifecycle chart

  @decided-by:DEC-0003
  Rule: The explorer only reads: an edit is made in the files

  @open
  Rule: A static HTML export, or a local server that watches the files?

  @open
  Rule: Is the code behind an element shown always, or only on demand?

  @open
  Rule: Would a run exported as Cucumber Messages and rendered by an existing HTML reporter serve this reader before an explorer is built?
