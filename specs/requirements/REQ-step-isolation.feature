@id=REQ-step-isolation @maturity=idea
@refines:CAP-living-specs
Feature: Steps that hang are stopped

  A step's timeout is cooperative (REQ-executable-specs): code that never yields — an endless
  loop, a blocking call — cannot be interrupted, so it fails only once it returns, and never if it
  does not. Running scenarios in a worker or a child process that sdp can terminate would make the
  timeout a hard limit, and would keep one scenario's global state from another's.

  @open
  Rule: A worker thread or a child process — per run, per scenario, or only for a scenario that overran?

  @open
  Rule: How do worlds, the `project` a step reads and the results cross that boundary?

  @open
  Rule: Does isolation become the default, or an option for suites that need it?
