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

  @iteration:IT-agent-plugin
  Rule: A workspace's words and their meanings are written in its configuration, and its specs say how words are used, not the words again

    sdp reads the words before any spec, and an author reviews them in one place.

  @iteration:IT-agent-plugin
  Rule: The catalog of a workspace's words is its vocabulary, one word in the commands, the specs and the skill, and taxonomy is no second name for it

    A second word for one thing is what this feature prevents.

  Rule: A workspace's Cucumber tags are listed and reported with their meanings as its kinds, relations and fact keys are, each said to be made, interpreted or carried

    Left out, a tag an agent coins is the one word nothing guards.
