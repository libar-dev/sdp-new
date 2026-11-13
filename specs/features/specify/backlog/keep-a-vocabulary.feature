@id=keep-a-vocabulary @maturity=idea
@realized-by:ARCH-vocabulary @realized-by:ARCH-checker @realized-by:ARCH-application
Feature: Keep a vocabulary

  Teams and their agents write kinds, relations, fact keys and Cucumber tags in words sdp leaves
  free, and an agent that finds no word for what it means coins one: across specs written mostly by
  agents, the vocabulary grows by additions nobody decided on, each a word the next reader must
  guess. A team needs a catalog to choose from, each word with what it means, and to be told by the
  commands it already runs when a word joins without that or stays listed after it fell out of use.

  Not a metamodel: a team still chooses its words and adds its own, and a workspace that does not
  ask for it has no word reported that is not reported today. Not the roles sdp interprets, which
  the vocabulary of the configuration already names.

  Rule: sdp comes with a base vocabulary: the kinds, relations, fact keys and tags a workspace starts with, each with one line of what it means

    The words sdp interprets and the few the way of working teaches, such as `realized-by` and
    `decided-by`, which sdp carries without reading a meaning into them. Very possibly all a
    workspace needs.

  Rule: sdp vocabulary prints the whole catalog: every word of the base and of the workspace, with what it means and whether sdp makes, interprets or carries it

    The catalog is what an agent reads before it writes a word, so it holds every word it may
    choose, not only those sdp reads meaning into.

  @decided-by:free-vocabulary
  Rule: A team adds a word of its own by listing it once, in one place, with what it means

    The word is the team's to choose; listing it is where a reviewer sees it join.

  @open
  Rule: Are a workspace's words and their meanings written in its configuration, or in a spec of its own?

    In the configuration, they sit beside the roles and words it names there today, read before any
    spec. In a spec, they are reviewed beside the specs that use them, and the listing is a test.
    The configuration already holds `vocabulary.words`, a workspace's own kinds, relations and
    attributes with no meanings, which either answer has to account for.

  @decided-by:free-vocabulary
  Rule: In a workspace that asks for it, sdp check reports a word used and not listed, with the closest listed word, and a word of its own listed and used nowhere

    A misspelt or coined word is then found where it is written, not only by a question that asks
    for it, and a word nobody uses any more leaves the list. A word of the base used nowhere is not
    reported: the base is a catalog to choose from.

  @open
  Rule: Are a workspace's Cucumber tags listed and reported as its kinds, relations and fact keys are?

    A test suite's tags are often many and its runner's, such as `@smoke` or `@wip`; left out, a word
    an agent coins as a tag is the one word nothing guards.

  Rule: A workspace sdp init starts asks for it: its words are the base's, and the place to list its own is written, empty

    A new workspace has no words of its own yet, so it is protected at no cost, and the first word
    an agent coins is the first one reported.

  Rule: The skill tells an agent to choose a word from the catalog, and to list a word it coins, with its meaning, in the same change
