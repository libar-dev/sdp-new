@id=RISK-0002 @status=tolerated
@price-of:DEC-0001 @affects:REQ-executable-specs @mitigated-by:REQ-builtin-steps @mitigated-by:REQ-executable-specs
Feature: Step definitions sprawl

  Step text is untyped prose. As specs multiply, authors write near-duplicate phrases for one
  behaviour, each with its own definition. Definitions grow hard to find, two of them start
  matching the same step, and the cost of a change moves from the specs into the glue code.

  Tolerated: it comes with Gherkin, and nothing planned makes it go away.

  **Watch for:** step modules that grow faster than the specs, and families of steps that say one
  thing in several ways.

  @open
  Rule: Would matching a step only against definitions of its keyword, or step libraries scoped to some specs, hold sprawl back enough to plan?
