@id=check-a-rule-against-generated-examples @maturity=idea
@realized-by:ARCH-runner
Feature: Check a rule against generated examples

  A rule holds for every input it covers, and a handful of examples samples a few. A scenario that
  states the rule once, over generated inputs, finds the case nobody wrote down.

  Rule: A scenario tagged as a property runs with generated inputs, and a failure is shrunk to its smallest case
