@id=ARCH-spec-parser
@decided-by:specs-are-gherkin-files @instance-of:PAT-pipes-and-filters @uses:ARCH-vocabulary
Feature: Spec parser

  Reads one `.feature` file into one spec, and what it cannot read into a diagnostic. It reads what
  the official Gherkin parser returns and adds no syntax of its own. It is a pure function of the
  file and the configuration, never throws on content, and keeps the line of every fact, so each
  node, edge and diagnostic built from it points at a greppable `file:line`.

  It is architecture because it defines the one specification format: a change here changes what
  every spec in every workspace means, the highest cost of change in the system.
