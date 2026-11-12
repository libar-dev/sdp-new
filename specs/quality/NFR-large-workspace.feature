@id=NFR-large-workspace @maturity=draft @quality=performance
@refines:CAP-agent-collaboration @decided-by:DEC-0003
@iteration:E1 @activity.analysis-design:E1 @activity.implementation:E2 @activity.test:E2 @activity.test:T1
Feature: Interactive commands on large repositories

  Every command and every MCP call reads the workspace from disk and rebuilds the graph. In a large
  monorepo — thousands of specs, tens of thousands of source files scanned for annotations —
  reading alone could make each call slow enough that agents stop asking and start guessing.

  Rule: In a generated repository of that size on disk, sdp status answers within an interactive budget

    Building and querying the graph in memory are measured already; reading the files is not.

  @open
  Rule: Which budget, and is it measured with a cold or a warm file system cache?

  @open
  Rule: If reading is the bottleneck, is a cache of parsed files keyed by content hash enough?

    It would be derived and disposable, never a second source of truth.
