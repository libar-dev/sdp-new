@id=keep-a-vocabulary @maturity=idea
@realized-by:ARCH-vocabulary @realized-by:ARCH-checker @realized-by:ARCH-application
Feature: Keep a vocabulary

  An agent that finds no word for what it means coins one, which the next reader must guess. A team
  needs a catalog of kinds, relations, fact keys and tags to choose from, each with what it means,
  and to be told when a word joins without one.

  Not a metamodel: a team still chooses its words.

  Rule: sdp vocabulary prints the base vocabulary sdp comes with and the workspace's own words, each with what it means and whether sdp makes, interprets or carries it

  @decided-by:free-vocabulary
  Rule: A team adds a word of its own by listing it once, in one place, with what it means

  @decided-by:free-vocabulary
  Rule: In a workspace that asks for it, as one sdp init starts does, sdp check reports a word used and not listed, with the closest listed word, and a word of its own listed and used nowhere

  @open @iteration:IT-agent-plugin
  Rule: Are a workspace's words and their meanings written in its configuration, or in a spec of its own?

    In the configuration they are read before any spec; in a spec they are reviewed with its users.

  @open @iteration:IT-agent-plugin
  Rule: Is the catalog of a workspace's words its vocabulary or its taxonomy, one word in the commands, the specs and the skill?

    A second word for one thing is what this feature prevents.

  @open
  Rule: Are a workspace's Cucumber tags listed and reported as its kinds, relations and fact keys are?

    Left out, a tag an agent coins is the one word nothing guards.
