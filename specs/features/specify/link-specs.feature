@id=link-specs
@realized-by:ARCH-graph-builder @realized-by:ARCH-graph @realized-by:ARCH-code-annotations @realized-by:ARCH-vocabulary
@decided-by:files-are-the-source-of-truth
Feature: Link specs into one graph

  People and agents follow any link from a spec, a decision, the architecture or the plan to the
  next, in the words their authors wrote: a node for each spec, rule and scenario, an edge for each
  link, each at the line that declares it.

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
      Then the workspace graph has nodes:
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

    Scenario: A bounded context that publishes to an event bus
      Given these specs:
        | tags                                                         | Feature   |
        | @id=ARCH-orders @kind=bounded-context @publishes-to:ARCH-bus | Orders    |
        | @id=ARCH-bus @kind=broker                                    | Event bus |
      When the workspace is loaded
      Then the workspace node "ARCH-orders" has attribute kind = "bounded-context"
      And the workspace graph has edges:
        | from        | rel          | to       |
        | ARCH-orders | publishes-to | ARCH-bus |

  Rule: A tag written @rel:id is a link to one target, an edge with a declaration at each line that states it; one written @key=value is a fact

    Scenario: The same link in two tags, and a fact that names a node
      Given a file "specs/a.feature" containing:
        """
        @id=a @iteration:IT-beta @owner=orders-team
        @iteration:IT-beta
        Feature: A
        """
      And these specs:
        | tags                        | Feature     |
        | @id=IT-beta @kind=iteration | Beta        |
        | @id=orders-team @kind=team  | Orders team |
      When the workspace is loaded
      Then the edges from "a" are "a -iteration-> IT-beta"
      And the workspace graph has edges:
        | from | rel       | to      | sources                              |
        | a    | iteration | IT-beta | specs/a.feature:1, specs/a.feature:2 |
      And sdp reports "nothing"

  Rule: An id names one node: one declared twice, or named where nothing declares it, is an error where it is written

    Scenario Outline: An id declared twice, and one nothing declares
      Given a file "specs/a.feature" containing:
        """
        @id=pay
        Feature: Pay
        """
      And a file "specs/b.feature" containing:
        """
        <content>
        """
      When the workspace is loaded
      Then sdp reports:
        | rule   | severity | at                |
        | <rule> | error    | specs/b.feature:1 |

      Examples:
        | content                                        | rule          |
        | @id=pay\nFeature: Pay by wallet                | duplicate-id  |
        | @id=sync @depends-on:ARCH-queue\nFeature: Sync | dangling-link |

  Rule: A tag cannot write what sdp derives, nor a link take the name of an attribute

    Scenario Outline: A derived fact, a derived link and a link named like a fact, written by hand
      Given a file "specs/a.feature" containing:
        """
        <content>
        """
      When the workspace is loaded
      Then sdp reports "<rule>"

      Examples:
        | content                           | rule              |
        | @id=a @stage=verified\nFeature: A | derived-attribute |
        | @id=a @imports:a\nFeature: A      | derived-attribute |
        | @id=a @maturity:a\nFeature: A     | link-syntax       |

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
