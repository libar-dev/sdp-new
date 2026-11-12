---
id: RISK-0003
kind: risk
title: Rebuilding the graph on every command does not scale
exposure: low
links:
  affects: CAP-agent-collaboration
  mitigated-by: [NFR-query-performance, NFR-large-workspace]
  due: MS-LCA
---

# Rebuilding the graph on every command does not scale

Every command, and every MCP call, reads and parses the whole workspace ([[DEC-0003]]). In a
large monorepo — thousands of specs, tens of thousands of source files scanned for annotations —
each call could become slow enough that agents stop asking and start guessing.

Due in Elaboration because the remedy, if one is needed, is a cache of parsed files, and that
changes the derived index ([[PAT-derived-index]]). Building and querying in memory is measured
already ([[NFR-query-performance]]); reading a large workspace from disk is not
([[NFR-large-workspace]]).

**Watch for:** `sdp status` taking more than a second on a real repository.
