@id=ARCH-runner
@decided-by:declared-maturity-derived-stage @decided-by:effect-for-io @uses:ARCH-spec-parser @uses:ARCH-graph @uses:ARCH-vocabulary @uses:ARCH-query-engine @uses:ARCH-checker
Feature: Scenario runner

  Turns specifications into evidence: it matches the steps of the selected examples to step
  definitions, runs their handlers and records what happened, with what it ran against. It is
  architecture because the stage of every spec and every milestone gate is derived from its
  results, so its semantics — undefined is not failed — are load-bearing.
