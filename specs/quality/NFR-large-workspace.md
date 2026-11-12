---
id: NFR-large-workspace
kind: nfr
title: Interactive commands on large repositories
maturity: draft
quality: performance
iteration: E1
activity:
  analysis-design: E1
  implementation: E2
  test: [E2, T1]
links:
  refines: CAP-agent-collaboration
  decided-by: DEC-0003
---

# Interactive commands on large repositories

Every command and every MCP call reads the workspace from disk and rebuilds the graph
([[DEC-0003]]). [[NFR-query-performance]] measures building and querying in memory; reading the
files is not measured. In a large monorepo — thousands of specs, tens of thousands of source files
scanned for annotations — reading alone could make each call slow enough that agents stop asking
and start guessing.

A quality attribute scenario will state it: an agent, in a generated repository of that size on
disk, runs `sdp status`, and it answers within an interactive budget.

## Open questions

- [ ] Which budget, and is it measured with a cold or a warm file system cache?
- [ ] If reading is the bottleneck, is a cache of parsed files keyed by content hash enough? It
  would be derived and disposable, never a second source of truth.
