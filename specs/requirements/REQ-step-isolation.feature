@id=REQ-step-isolation @maturity=idea
@refines:CAP-living-specs
Feature: Steps that hang are stopped

  A step's timeout is cooperative: code that never yields, an endless loop or a blocking call,
  cannot be interrupted, so it fails only once it returns, and never if it does not.

  Rule: A step that overruns its timeout is stopped, whether or not it yields

  Rule: No scenario sees the global state another scenario left

  @open
  Rule: A worker thread or a child process: per run, per scenario, or only for a scenario that overran?

  @open
  Rule: How do worlds, the `project` a step reads and the results cross that boundary?

  @open
  Rule: Is isolation the default, or an option for suites that need it?
