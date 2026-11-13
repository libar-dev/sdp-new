@id=write-specs-in-a-richer-grammar @maturity=idea
@realized-by:ARCH-spec-parser
Feature: Write specs in a richer grammar

  Kept for the day a spec needs what tags cannot say: typed example spaces, alternatives within a
  scenario, values with spaces. Each way costs the tools that read Gherkin today.

  Rule: Specs may use keywords of sdp's own: Question, Requirement, Decision

    Every Gherkin tool that does not know them fails on the file.

  Rule: A scenario may carry fields of its own beyond tags

    Fields that every Gherkin tool still reads are tags again; any others lose those tools.

  Rule: Specs may be written in a language of sdp's own, which runners still receive as Gherkin
