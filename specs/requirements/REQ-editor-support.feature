@id=REQ-editor-support @maturity=draft
@refines:CAP-living-specs
@iteration:E2 @activity.analysis-design:E2 @activity.analysis-design:C1 @activity.implementation:C1 @activity.test:C1 @activity.test:C2
Feature: Editor support

  Authors write specs in their editor, and today the editor knows nothing about them: an id typed
  wrong or a relation spelled differently shows up only when `sdp check` runs, and finding the spec
  behind `DEC-0003` means a search. A language server would give every editor the same help:

  - completion for ids in front matter and in `…`, and for relation names from those already in
  use in the workspace, most used first — which keeps the free-form vocabulary from drifting
  (RISK-0001);
  - go to definition on an id in front matter, a `ID` link or an `@sdp` comment;
  - `sdp check` diagnostics inline, at their `file:line`, with their hint.

  # TODO(convert): resolved, make it a rule or delete it: Which relation names to suggest when the vocabulary is free-form? Those already used in the workspace, most used first.

  @open
  Rule: Served by `sdp lsp` next to `sdp mcp`, or as a separate package?

  @open
  Rule: Does a long-running server rebuild the graph on every change, or keep it and patch it per file (DEC-0003)?
