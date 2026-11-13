@id=specs-are-gherkin-files @kind=decision
Feature: A spec is a Gherkin file; its tags say what it is and what it links to

  Not Markdown with Gherkin in fences: the prose around the fences is the path of least resistance,
  and an agent takes it in every session. Not front matter above a Feature, which is two syntaxes
  for one fact and a wrapper no Gherkin tool reads; nor Cucumber's Markdown dialect (`.feature.md`),
  whose parser returns no description for a Feature, a Rule or a Scenario, where a feature's need
  and a rule's reason are written. The price is the parser's sharp edges: in a description, a line
  that starts with `#` is dropped, and one that starts with a keyword can silently become a block or
  a step.
