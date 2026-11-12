@id=markdown-where-specs-live @kind=change @maturity=draft
@changes:check-specs
Feature: Every answer notes Markdown where specs live

  A Markdown file where specs live is read by nothing, and only `sdp check` says so. Agents ask
  questions far more often than they run the check, and an answer that carries no note reads as
  complete although a spec may be written in that file. If every answer noted it, the rule of
  check-specs about such a file would say so too.

  @open
  Rule: Does a Markdown file where specs live make every answer incomplete, as a spec that cannot be read does, or is the warning from sdp check enough?

    The final review found that today only `sdp check` says so: a query of the same workspace is
    complete and carries no note, so an agent that never runs check never hears of the file.
