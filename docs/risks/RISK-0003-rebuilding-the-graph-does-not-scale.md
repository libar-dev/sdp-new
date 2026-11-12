---
id: RISK-0003
kind: risk
title: Rebuilding the graph on every command does not scale
status: open
exposure: low
links:
  affects: CAP-agent-collaboration
  mitigated-by: [NFR-query-performance, NFR-large-workspace]
---

# Rebuilding the graph on every command does not scale

Every command, and every MCP call, reads and parses the whole workspace ([[DEC-0003]]). In a large
monorepo — thousands of specs, tens of thousands of source files scanned for annotations — each
call could become slow enough that agents stop asking and start guessing.

## Mitigation

[[NFR-query-performance]] measures building and querying generated workspaces in every `sdp run`,
so a regression fails the build. It runs in memory; reading a large workspace from disk is
[[NFR-large-workspace]], planned for Elaboration because a cache of parsed files, if one is
needed, changes the derived index ([[PAT-derived-index]]).

**Watch for:** `sdp status` taking more than a second on a real repository.
