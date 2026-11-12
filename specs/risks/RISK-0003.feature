@id=RISK-0003
@price-of:DEC-0003 @affects:CAP-agent-collaboration @mitigated-by:NFR-query-performance @mitigated-by:NFR-large-workspace @due:MS-LCA
Feature: Rebuilding the graph on every command does not scale

  Every command, and every MCP call, reads and parses the whole workspace. In a large monorepo —
  thousands of specs, tens of thousands of source files scanned for annotations — each call could
  become slow enough that agents stop asking and start guessing.

  Due in Elaboration because the remedy, if one is needed, is a cache of parsed files, and that
  changes the derived index (PAT-derived-index).

  **Watch for:** `sdp status` taking more than a second on a real repository.
