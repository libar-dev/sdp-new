@id=REQ-web-explorer @maturity=draft
@refines:CAP-curated-architecture
@iteration:C1 @activity.analysis-design:C2 @activity.implementation:C3 @activity.test:C3 @activity.test:T1
Feature: Interactive graph explorer

  Stakeholders who do not live in a terminal need to browse the curated architecture, follow a
  requirement to its decisions and code, and see the lifecycle chart (RISK-0005). A static page
  generated from the graph would cover reading; editing stays in the files.

  @open
  Rule: Static HTML export or a local server that watches files?

  @open
  Rule: Should the explorer show the code nodes behind each element at all, or only on demand?

  # TODO(convert): resolved, make it a rule or delete it: Editing in the browser? No — files stay the source of truth (DEC-0003).
