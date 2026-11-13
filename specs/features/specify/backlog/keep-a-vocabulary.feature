@id=keep-a-vocabulary @maturity=idea
@realized-by:ARCH-vocabulary @realized-by:ARCH-checker @realized-by:ARCH-application
Feature: Keep a vocabulary

  Teams and their agents write kinds, relations, fact keys and Cucumber tags in words sdp leaves
  free, and an agent that finds no word for what it means coins one, which the next reader must
  guess. A team needs a catalog to choose from, each word with what it means, and to be told by the
  commands it already runs when a word joins without that or stays listed after it fell out of use.

  Not a metamodel: a team still chooses its words, and a workspace that does not ask for the
  catalog has no word reported that is not reported today.

  Rule: sdp comes with a base vocabulary: the kinds, relations, fact keys and tags a workspace starts with, each with one line of what it means

    Those sdp interprets and those the way of working teaches, such as `realized-by` and `decided-by`.

  Rule: sdp vocabulary prints the whole catalog: every word of the base and of the workspace, with what it means and whether sdp makes, interprets or carries it

  @decided-by:free-vocabulary
  Rule: A team adds a word of its own by listing it once, in one place, with what it means

    The word is the team's to choose; listing it is where a reviewer sees it join.

  @open @iteration:IT-agent-plugin
  Rule: Are a workspace's words and their meanings written in its configuration, or in a spec of its own?

    In the configuration, beside `vocabulary.words`, they are read before any spec; in a spec, they
    are reviewed beside the specs that use them, and the listing is a test.

  @open @iteration:IT-agent-plugin
  Rule: Is the catalog of a workspace's words its vocabulary or its taxonomy, one word in the commands, the specs and the skill?

    A second word for one thing is what this feature exists to prevent.

  @decided-by:free-vocabulary
  Rule: In a workspace that asks for it, sdp check reports a word used and not listed, with the closest listed word, and a word of its own listed and used nowhere

    A word of the base used nowhere is not reported: the base is a catalog to choose from.

  @open
  Rule: Are a workspace's Cucumber tags listed and reported as its kinds, relations and fact keys are?

    A test suite's tags are often many and its runner's; left out, a tag an agent coins is the one
    word nothing guards.

  Rule: A workspace sdp init starts asks for it: its words are the base's, and the place to list its own is written, empty

  Rule: The skill tells an agent to choose a word from the catalog, and to list a word it coins, with its meaning, in the same change
