@id=every-word-is-defined-and-used @kind=guide
Feature: Every word this repository's specs and code use is listed here, with what it means

  The words of this repository, few, and each with one meaning a reader needs nothing else to
  understand. Kinds and relations are free, so a word can join without anyone deciding it should:
  here a word used and not listed fails the run, and so does a word listed and used nowhere, so
  the list grows and shrinks only where a reviewer sees it. The example workspace in examples/shop
  counts as this repository: adopters copy it, so its words are taught here too.

  The column sdp says what sdp does with a word. It `makes` it, and nobody writes it; it
  `interprets` it, giving it the meaning `sdp vocabulary` or the format of a spec gives it; or it
  `carries` it as written, reading no meaning into it, so only this repository does.

  Rule: The kinds are these

    A kind is what a node is: a spec says it with its id's prefix or with `@kind=`, sdp makes the rest.

    Scenario: The kinds of the nodes in the graph
      Then the kinds of this repository are:
        | kind         | sdp        | meaning                                                                                                                     |
        | feature      | interprets | What a user can do with sdp: its requirements as rules and their examples as its tests, one file under specs/features.      |
        | rule         | makes      | A `Rule:` of a spec: one requirement, its reason under it, and the scenarios that are its examples.                         |
        | scenario     | makes      | An example of a rule: a test that runs, its last result its status.                                                         |
        | code         | makes      | A declaration or a file in src that an `@sdp` annotation names.                                                             |
        | element      | interprets | A part of sdp's architecture, declared with `@sdp is ARCH-…` in the code that is it, whose doc comment says what it is for. |
        | pattern      | interprets | A design several pieces of code apply, declared with `@sdp is PAT-…` in the code they share.                                |
        | decision     | interprets | A choice that spans features and is hard to reverse: what was chosen over what, why, and the cost accepted.                 |
        | architecture | interprets | The rules this repository's code keeps that no user observes, such as which element may import which.                       |
        | guide        | interprets | The rules this repository is worked by, such as where a spec is filed, as examples that run against it.                     |
        | vision       | interprets | Why sdp exists, for whom, and how it differs from the tools beside it.                                                      |
        | epic         | carries    | Work still to come grouped toward one outcome, each feature or rule linked with `@includes:`; deleted once it is all live.  |
        | iteration    | interprets | The days from `@start=` to `@end=`, into which work still to come is planned.                                               |
        | milestone    | interprets | A gate: scenarios that must pass when the iteration it closes ends, `@met=` written once they did.                          |

  Rule: The relations are these

    A relation is what an edge says from one node to another: a spec writes `@rel:ID`, code writes
    `@sdp rel ID`, and sdp makes the rest.

    Scenario: The relations of the edges in the graph
      Then the relations of this repository are:
        | relation    | sdp        | meaning                                                                                                                                     |
        | rule-of     | makes      | From a rule to its spec.                                                                                                                    |
        | verifies    | makes      | From a scenario to its rule and to its spec.                                                                                                |
        | imports     | makes      | From an element to each element whose code its code imports.                                                                                |
        | is          | interprets | From code to the node it declares, written `@sdp is` in its doc comment: an element or a pattern, unless it names another kind.             |
        | applies     | carries    | From code to a pattern it is an instance of, written `@sdp applies PAT-…` in its doc comment, and so from the element that code is part of. |
        | realized-by | carries    | From a feature to the element whose code makes it work.                                                                                     |
        | depends-on  | carries    | From a feature to another feature it cannot work without, so a change to that one is a change to it too.                                    |
        | decided-by  | carries    | From a rule, or a whole spec, to the decision it rests on.                                                                                  |
        | includes    | carries    | From an epic to each feature or rule it groups.                                                                                             |
        | iteration   | interprets | From work still to come to the iteration it is planned into.                                                                                |
        | closes      | interprets | From a milestone to the iteration or phase whose last day dates it.                                                                         |

  Rule: The facts written on specs, rules and scenarios are these

    A fact is `@key=value` on the tag line of a Feature, a Rule or a Scenario. What sdp derives,
    such as a stage or a status, is no fact anyone writes: `sdp vocabulary` lists it. The ladder of
    maturity is idea, draft, specified and ready, not idea, scoped, defined and ready: `defined`
    collides with a step being defined or undefined, and `scoped` with a step definition scoped to
    an area, while `draft` is the common word for a document that is not finished.

    Scenario: The keys of the facts written in the specs
      Then the facts of this repository are:
        | fact     | sdp        | meaning                                                                                               |
        | id       | interprets | The name of a spec, unique in the repository, that every link to it uses.                             |
        | kind     | interprets | What a spec is, written when its id has no prefix that says it.                                       |
        | maturity | interprets | How far work still to come has come, one of idea, draft, specified and ready; what is built has none. |
        | start    | interprets | The first day of an iteration.                                                                        |
        | end      | interprets | The last day of an iteration.                                                                         |

  Rule: The facts written on code annotations are none

    What code is and what it applies are relations, and what it is for is its doc comment: a
    `key=value` after the ids of an `@sdp` tag would be a second place to say either.

    Scenario: The keys of the facts written after the ids of an @sdp tag
      Then the facts of this repository's code annotations are:
        | fact | sdp | meaning |

  Rule: The Cucumber tags are these

    A Cucumber tag is a bare `@word` on a Feature, a Rule, a Scenario or its Examples: it is
    inherited, and `--tags` selects by it.

    Scenario: The Cucumber tags written in the specs
      Then the tags of this repository are:
        | tag      | sdp        | meaning                                                                                                                                                               |
        | @gate    | interprets | On a scenario that asserts on delivery state: a run reports it apart and never fails on it, `sdp gate` does.                                                          |
        | @open    | interprets | On a rule whose name is a question that waits on the owner's answer.                                                                                                  |
        | @serial  | interprets | On a scenario that runs alone, as one that measures time must.                                                                                                        |
        | @quality | interprets | On a rule, or a whole spec, that is a quality requirement: `sdp arch` shows it beside the elements that realize its feature, and `--tags @quality` runs its examples. |
