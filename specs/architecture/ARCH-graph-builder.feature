@id=ARCH-graph-builder
@decided-by:files-are-the-source-of-truth @instance-of:PAT-pipes-and-filters @instance-of:PAT-derived-index @uses:ARCH-spec-parser @uses:ARCH-code-annotations @uses:ARCH-graph @uses:ARCH-vocabulary
Feature: Graph builder

  Builds the system graph from what the workspace read — specs, annotations and the last scenario
  results — and from nothing else, on every command. It never fails on content: a problem becomes
  a diagnostic, and the graph is still built.
