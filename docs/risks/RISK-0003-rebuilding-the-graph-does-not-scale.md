---
id: RISK-0003
kind: risk
title: Rebuilding the graph on every command does not scale
status: open
exposure: low
iteration: I1
links:
  affects: CAP-agent-collaboration
  mitigated-by: NFR-query-performance
---

# Rebuilding the graph on every command does not scale

Every command, and every MCP call, reads and parses the whole workspace ([[DEC-0003]]). In a large
monorepo — thousands of specs, tens of thousands of source files scanned for annotations — each
call could become slow enough that agents stop asking and start guessing.

## Mitigation

[[NFR-query-performance]] measures building and querying generated workspaces in every `sdp run`,
so a regression fails the build. It runs in memory: reading many files from disk is not measured
yet. If it becomes the bottleneck, parsed files can be cached by content hash — a derived cache,
never a second source of truth.

**Watch for:** `sdp status` taking more than a second on a real repository.
