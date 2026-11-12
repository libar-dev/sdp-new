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
timeouts, one world per world factory per scenario — made inside the step that needs it — and runs
only the selected examples. A step's `signal` aborts on timeout or interruption. Each example's
result is recorded with the evidence it rests on: fingerprints of the sources it ran against.
Built-in steps assert against the graph through the query engine and the checker, which is how
gates and guards execute. Matching is separate from running (`src/run/Match.ts`): `sdp context`,
`sdp run --snippets` and the MCP tool `sdp_snippets` match steps without executing them. What it
does for authors: [[REQ-executable-specs]].

Code: `src/run/`.
