---
id: ARCH-runner
kind: element
title: Scenario runner
significant: true
rationale: >-
  Turns specifications into evidence. The delivery stage of every spec and every milestone gate
  is derived from its results (DEC-0005), so its semantics (undefined vs. failed) are load-bearing.
iteration: C1
links:
  decided-by: [DEC-0005, DEC-0004]
  reads: ARCH-graph
---

# Scenario runner

Matches pickle steps to step definitions (Cucumber Expressions), runs handlers as Effects with
timeouts, one world per step module per scenario, and records results keyed by scenario hash.
Built-in steps assert against the graph, which is how gates and guards execute.

Code: `src/run/`.
