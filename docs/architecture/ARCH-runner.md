---
id: ARCH-runner
kind: element
title: Scenario runner
iteration: I1
links:
  decided-by: [DEC-0005, DEC-0004]
  reads: ARCH-graph
  uses: [ARCH-query-engine, ARCH-checker]
---

# Scenario runner

Matches pickle steps to step definitions (Cucumber Expressions), runs handlers as Effects with
cooperative timeouts, one world per world factory per scenario — made inside the step that needs
it — and runs only the selected examples. What it does for authors: [[REQ-executable-specs]]; why
evidence is shaped the way it is: [[DEC-0011]].

Turns specifications into evidence. The delivery stage of every spec and every milestone gate is
derived from its results (DEC-0005), so its semantics (undefined vs. failed) are load-bearing.

| Module | Responsibility |
| --- | --- |
| `src/steps.ts`, `src/run/Steps.ts` | the step API (`sdp/steps`): `defineSteps`, `pending`, the handler's context |
| `src/run/Match.ts` | matching step text against definitions — the loaded ones for a run, those read statically from the step files (`src/parse/StepDefinitions.ts`) for every reader — and suggesting definitions |
| `src/run/Runner.ts` | executing the selected examples; one publisher reports results in order |
| `src/run/Evidence.ts` | what a result ran against (fingerprints), whether it still counts (staleness), and which results each layer sees: none for ordinary scenarios, the ordinary ones for gates |
| `src/run/Store.ts` | the results file: read, and commit under a lock what one run executed |
| `src/run/Session.ts` | one `sdp run`: ordinary scenarios, commit, gates, commit |
| `src/run/Builtin.ts` | steps that assert against the graph through the query engine and the checker, which is how gates and guards execute |

The runner reads the graph; the graph builder never imports the runner: it is handed what the
stored results say about each scenario and places that on the nodes.
