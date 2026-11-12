---
id: ARCH-runner
kind: element
title: Scenario runner
significant: true
rationale: >-
  Turns specifications into evidence. The delivery stage of every spec and every milestone gate
  is derived from its results (DEC-0005), so its semantics (undefined vs. failed) are load-bearing.
iteration: I1
links:
  decided-by: [DEC-0005, DEC-0004]
  reads: ARCH-graph
  uses: [ARCH-query-engine, ARCH-checker]
---

# Scenario runner

Matches pickle steps to step definitions (Cucumber Expressions), runs handlers as Effects with
timeouts, one world per world factory per scenario, and records results keyed by scenario hash.
Built-in steps assert against the graph through the query engine and the checker, which is how
gates and guards execute. What it does for authors: [[REQ-executable-specs]].

Code: `src/run/`.
