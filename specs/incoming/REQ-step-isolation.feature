@id=REQ-step-isolation @maturity=idea
Feature: Steps that hang are stopped

  A step's timeout is cooperative: code that never yields, an endless loop or a blocking call,
  cannot be interrupted, so it fails only once it returns, and never if it does not.

  Rule: A step that overruns its timeout is stopped, whether or not it yields

  Rule: No scenario sees the global state another scenario left
