@id=ask-by-recipe @maturity=idea
Feature: Ask by recipe

  Agents ask the same questions every session: what is next, what does this change touch, which
  rules have no example, what is undecided. Each agent writes each as a query again, a little
  differently, at a cost in calls and tokens. A recipe is such a question written once, named for the
  job it answers, with its subject as a parameter.

  Not a second query language: a recipe is answered from the graph as a query is. Not a catalogue that
  grows by itself: a recipe is added when agents keep asking its question.

  Rule: sdp lists its recipes by the job each answers, in at most 20 lines

  Rule: An agent holding a set of changed files gets the specs, rules and decisions in reach of them in one call

  @type=quality
  Rule: An answer fits one tool call by default, under 8,000 characters, names what it left out, and gives all of it when asked

  @maturity=specified
  Rule: The open questions are the recipe questions: it takes the targets and the grouping sdp questions takes, and answers as it does

    The first recipe is the one the owner and agents both reach for: what waits on a decision, in the
    part of the project at hand.
