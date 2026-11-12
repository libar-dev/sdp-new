@id=steps-that-hang-are-stopped @kind=change @maturity=idea
@changes:write-step-definitions
Feature: Steps that hang are stopped

  Developers whose step code can hang want a run to stop it at its timeout and go on. Today a
  step's timeout is cooperative: code that never yields, an endless loop or a blocking call, cannot
  be interrupted, so it fails only once it returns, and never if it does not.

  When it is built, its rules change what write-step-definitions promises a handler: a fresh world,
  and a deadline it is only asked to keep.

  Rule: A step that overruns its timeout is stopped, whether or not it yields

  Rule: No scenario sees the global state another scenario left
