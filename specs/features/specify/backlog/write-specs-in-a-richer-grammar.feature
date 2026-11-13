@id=write-specs-in-a-richer-grammar @maturity=idea
Feature: Write specs in a richer grammar

  Alternatives to the official Gherkin parser, kept for the day a spec needs what tags cannot say:
  typed example spaces, alternatives within a scenario, values with spaces. Each costs the tools
  that read Gherkin today.

  Rule: Specs may use the keywords of a dialect of sdp's own — Question, Requirement, Decision — read by the official parser

    The parser takes such a dialect unchanged; every tool without it fails on the file.

  Rule: Specs may use a fork of the Gherkin grammar with fields of their own

    A fork that stays compatible is tags again; one that does not loses every Gherkin tool, and its
    generated parser is sdp's to keep.

  Rule: Specs may be written in a language of sdp's own and compiled to Gherkin for runners
