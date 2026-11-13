@id=link-specs
@realized-by:ARCH-graph-builder @realized-by:ARCH-graph @realized-by:ARCH-code-annotations @realized-by:ARCH-vocabulary
@decided-by:files-are-the-source-of-truth
Feature: Link specs into one graph

  People and agents follow any link from a spec, a decision, the architecture or the plan to the
  next, in the words their authors wrote. What the files say and link is one graph: a node for each
  spec, rule and scenario, an edge for each link, each at the line that declares it.

  Not a metamodel: sdp reads meaning into the few words `sdp vocabulary` lists, and nothing writes
  the graph but the files.

  Rule: Each spec, rule and scenario is a node at the line it is declared on, and a scenario verifies its rule and its spec

    Scenario: A rule with an example, and the decision it rests on
      Given a file "specs/pay.feature" containing:
        """
        @id=pay
        Feature: Pay

          @decided-by:charge-once
          Rule: A wallet is charged once

            Scenario: Retry
              Then one charge is made
        """
      And these specs:
        | tags                           | Feature     |
        | @id=charge-once @kind=decision | Charge once |
      When the workspace is loaded
      Then the workspace graph has exactly these nodes:
        | id                           | kind     | source                      |
        | pay                          | feature  | specs/pay.feature:1         |
        | pay#a-wallet-is-charged-once | rule     | specs/pay.feature:5         |
        | pay#retry                    | scenario | specs/pay.feature:7         |
        | charge-once                  | decision | specs/charge-once.feature:1 |
      And the workspace graph has edges:
        | from                         | rel        | to                           | source              |
        | pay#a-wallet-is-charged-once | rule-of    | pay                          | specs/pay.feature:5 |
        | pay#a-wallet-is-charged-once | decided-by | charge-once                  | specs/pay.feature:4 |
        | pay#retry                    | verifies   | pay#a-wallet-is-charged-once | specs/pay.feature:7 |
        | pay#retry                    | verifies   | pay                          | specs/pay.feature:7 |

  @decided-by:free-vocabulary
  Rule: Kinds, relations and attributes are whatever the authors write

    A team's words need no translation into sdp's.

    Scenario: A bounded context that publishes to an event bus
      Given these specs:
        | tags                                                         | Feature   |
        | @id=ARCH-orders @kind=bounded-context @publishes-to:ARCH-bus | Orders    |
        | @id=ARCH-bus @kind=broker                                    | Event bus |
      When the workspace is loaded
      Then node "ARCH-orders" has attribute kind = "bounded-context"
      And the workspace graph has edges:
        | from        | rel          | to       |
        | ARCH-orders | publishes-to | ARCH-bus |

  Rule: In a spec, a link is a tag, one per target: an edge at the tag's line, and an attribute of the node that writes it

    An id written in a description is text: a link is what the spec states, never what its prose
    mentions.

    Scenario Outline: One target, and a dotted relation
      Given these specs:
        | tags                        | Feature |
        | @id=IT-beta @kind=iteration | Beta    |
        | @id=a <links>               | A       |
      When I query "*[<rel>=IT-beta]"
      Then the result is "a"
      And the workspace graph has edges:
        | from | rel   | to      | source            |
        | a    | <rel> | IT-beta | specs/a.feature:1 |

      Examples:
        | links                            | rel                     |
        | @iteration:IT-beta               | iteration               |
        | @activity.implementation:IT-beta | activity.implementation |

  Rule: Whether a tag or a key links is a property of how it is written, never of its value

    Were the value to decide, a reference to a renamed node would turn into text without a word.

    Scenario Outline: In a feature file the separator decides; in code, the key
      Given these specs:
        | tags                        | Feature     |
        | @id=IT-beta @kind=iteration | Beta        |
        | @id=orders-team @kind=team  | Orders team |
      And a file "<file>" containing:
        """
        <content>
        """
      When the workspace is loaded
      Then the edges from "pay" are "<edges>"
      And sdp reports nothing

      Examples:
        | file              | content                                          | edges                    |
        | specs/pay.feature | @id=pay @owner:orders-team\nFeature: Pay         | pay -owner-> orders-team |
        | specs/pay.feature | @id=pay @owner=orders-team\nFeature: Pay         | nothing                  |
        | src/pay.py        | # @sdp is pay iteration=IT-beta\ndef pay(): pass | pay -iteration-> IT-beta |

  Rule: Stating a link again adds a declaration to its one edge

    So every place that states it is found from the edge.

    Scenario: The same link in two tags
      Given a file "specs/a.feature" containing:
        """
        @id=a @iteration:IT-beta
        @iteration:IT-beta
        Feature: A
        """
      And these specs:
        | tags                        | Feature |
        | @id=IT-beta @kind=iteration | Beta    |
      When the workspace is loaded
      Then the workspace graph has edges:
        | from | rel       | to      | sources                              |
        | a    | iteration | IT-beta | specs/a.feature:1, specs/a.feature:2 |
      And sdp reports nothing

  Rule: An id is declared once: a second declaration is an error, and the first holds

    So a link always reaches one node.

    Scenario: Two files declare pay
      Given a file "specs/a.feature" containing:
        """
        @id=pay
        Feature: Pay by card
        """
      And a file "specs/b.feature" containing:
        """
        @id=pay
        Feature: Pay by wallet
        """
      When the workspace is loaded
      Then node "pay" has attribute title = "Pay by card"
      And sdp reports:
        | rule         | severity | at                |
        | duplicate-id | error    | specs/b.feature:1 |

  Rule: A reference to an id nothing declares is an error where it is written, and the id is a missing node

    So a node renamed or deleted is found from every place that still names it.

    Scenario: A spec depends on an id nothing declares
      Given these specs:
        | tags                            | Feature |
        | @id=sync @depends-on:ARCH-queue | Sync    |
      When the workspace is loaded
      Then sdp reports:
        | rule          | severity | at                   |
        | dangling-link | error    | specs/sync.feature:1 |
      And the workspace graph has exactly these nodes:
        | id         | kind    | source               |
        | sync       | feature | specs/sync.feature:1 |
        | ARCH-queue | missing |                      |

  Rule: What sdp derives cannot be written, wherever a node is declared

    A stage is read from what ran, and a kind such as `missing` or `code` or a link such as
    `imports` from what sdp found: written by hand, any of them would claim what nothing showed.

    Scenario Outline: A stage, a kind and a link sdp derives, written by hand
      Given a file "<file>" containing:
        """
        <content>
        """
      When the workspace is loaded
      Then sdp reports at least:
        | rule              | at   | message   |
        | derived-attribute | <at> | <message> |

      Examples:
        | file              | content                                  | at                  | message                                 |
        | specs/pay.feature | @id=pay @stage=verified\nFeature: Pay    | specs/pay.feature:1 | stage is derived by sdp                 |
        | src/pay.py        | # @sdp is pay kind=code\ndef pay(): pass | src/pay.py:1        | sdp makes the nodes of kind code itself |
        | specs/a.feature   | @id=a @imports:pay\nFeature: A           | specs/a.feature:1   | sdp makes the imports links itself      |

  Rule: A link cannot take the name of an attribute, wherever it is declared

    A link reads as an attribute of the node it starts from, so `[key=value]` must mean one thing.

    Scenario Outline: A link named like a fact sdp derives, or like an attribute of its node
      Given these specs:
        | tags                     | Feature  |
        | @id=verified @kind=label | Verified |
      And a file "specs/a.feature" containing:
        """
        <content>
        """
      When the workspace is loaded
      Then sdp reports:
        | rule        | severity | at                |
        | link-syntax | error    | specs/a.feature:1 |
      When I query "* -<name>-> *"
      Then the result is "nothing"

      Examples:
        | content                                           | name     |
        | @id=a @maturity:verified\nFeature: A              | maturity |
        | @id=a @owner=payments @owner:verified\nFeature: A | owner    |

  Rule: The relations and facts sdp types are these: the kinds each end of a typed link may be, and the value of a typed fact and what it is written on

    The type table is the contract of every check of a link and of what an agent reads before it
    writes a tag, so a change to it is a change here. A word bound to a role takes the role's type,
    in the workspace's words, and loses any type of its own; a relation the table does not list
    joins any nodes.

    Scenario: The types, in a workspace that renames nothing
      When I run "sdp vocabulary --json"
      Then the exit code is 0
      And the link types are:
        | relation    | from                    | to                      |
        | iteration   | work, rule              | iteration               |
        | phase       | iteration               | phase                   |
        | closes      | milestone               | iteration, phase        |
        | replaces    | feature, rule, scenario | feature, rule, scenario |
        | is          | code                    | spec                    |
        | realized-by | feature                 | element                 |
        | decided-by  | spec, rule              | decision                |
        | depends-on  | feature                 | feature                 |
        | includes    | epic                    | feature, rule           |
        | applies     | code, element           | pattern                 |
        | verifies    | scenario                | spec, rule              |
      And the fact types are:
        | fact     | value | on         |
        | maturity | rung  | work, rule |
        | start    | day   | iteration  |
        | end      | day   | iteration  |
        | met      | day   | milestone  |

    Scenario: A workspace's words take the types of the roles it binds them to
      Given a file "sdp.config.yaml" containing:
        """
        vocabulary:
          kinds: { decision: [adr, decision], iteration: [sprint] }
          relations: { plan: [scheduled, depends-on], closes: [ends], scenario: applies }
          attributes: { end: date, met: date }
        """
      When I run "sdp vocabulary --json"
      Then the exit code is 0
      And the link types are:
        | relation    | from                    | to                      |
        | scheduled   | work, rule              | sprint                  |
        | depends-on  | work, rule              | sprint                  |
        | phase       | sprint                  | phase                   |
        | ends        | milestone               | sprint, phase           |
        | replaces    | feature, rule, scenario | feature, rule, scenario |
        | is          | code                    | spec                    |
        | realized-by | feature                 | element                 |
        | decided-by  | spec, rule              | adr, decision           |
        | includes    | epic                    | feature, rule           |
        | applies     | scenario                | spec, rule              |
      And the fact types are:
        | fact     | value | on                |
        | maturity | rung  | work, rule        |
        | start    | day   | sprint            |
        | date     | day   | sprint, milestone |

  Rule: A link the vocabulary types joins the kinds its type names, and one that joins others is reported

    A feature realized by a decision reads as an answer and is none. A relation the vocabulary does
    not type joins any nodes.

    Scenario Outline: Typed links, <what>
      Given these specs:
        | tags                            | Feature  |
        | @id=use-postgres @kind=decision | Postgres |
        | <source>                        | Source   |
      And a file "src/orders.ts" containing:
        """
        /** @sdp is ARCH-orders */
        export const orders = (): void => {}
        """
      When the workspace is checked
      Then sdp reports "<reported>"

      Examples:
        | what                             | source                                            | reported  |
        | A feature realized by an element | @id=cart @maturity=idea @realized-by:ARCH-orders  | nothing   |
        | A feature realized by a decision | @id=cart @maturity=idea @realized-by:use-postgres | link-kind |
        | A relation of the team's own     | @id=cart @maturity=idea @uses:use-postgres        | nothing   |
