@id=link-specs
@realized-by:ARCH-graph-builder @realized-by:ARCH-graph @realized-by:ARCH-code-annotations @realized-by:ARCH-vocabulary
@decided-by:files-are-the-source-of-truth
Feature: Link specs into one graph

  People and agents follow any link from a spec, a decision, the architecture or the plan to the
  next, in the words their authors wrote.

  Not a metamodel: sdp reads meaning into the few words `sdp vocabulary` lists, and nothing writes
  the graph but the files.

  Rule: Each spec, rule and scenario is a node at its line, linked to the spec or rule it belongs to

    Scenario: A rule with an example
      Given a file "specs/pay.feature" containing:
        """
        @id=pay
        Feature: Pay

          Rule: A wallet is charged once

            Scenario: Retry
              Then one charge is made
        """
      When the workspace is loaded
      Then the workspace graph has nodes:
        | id                           | kind     | source              |
        | pay                          | feature  | specs/pay.feature:1 |
        | pay#a-wallet-is-charged-once | rule     | specs/pay.feature:4 |
        | pay#retry                    | scenario | specs/pay.feature:6 |
      And the workspace graph has edges:
        | from                         | rel      | to                           | source              |
        | pay#a-wallet-is-charged-once | rule-of  | pay                          | specs/pay.feature:4 |
        | pay#retry                    | verifies | pay#a-wallet-is-charged-once | specs/pay.feature:6 |
        | pay#retry                    | verifies | pay                          | specs/pay.feature:6 |

  @decided-by:free-vocabulary
  Rule: Kinds and relations are whatever the authors write

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

  Rule: A link written twice is one edge, declared at each line that writes it

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
      And sdp reports "nothing"

  Rule: An id names one node: one declared twice, or linked to and declared nowhere, is an error where written

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

  Rule: A tag cannot write what sdp derives

    Scenario Outline: <case>, written by hand
      Given a file "specs/a.feature" containing:
        """
        <content>
        """
      When the workspace is loaded
      Then sdp reports "derived-attribute"

      Examples:
        | case               | content                           |
        | A fact sdp derives | @id=a @stage=verified\nFeature: A |
        | A link sdp derives | @id=a @imports:a\nFeature: A      |

  Rule: A link cannot take the name of a fact, of sdp's or of its node

    A link reads as an attribute of the node it starts from, so `[key=value]` in a question must mean
    one thing.

    Scenario Outline: A link named like <case>
      Given a file "specs/a.feature" containing:
        """
        <content>
        """
      When the workspace is loaded
      Then sdp reports "link-syntax"

      Examples:
        | case                    | content                                |
        | the maturity sdp checks | @id=a @maturity:b\nFeature: A          |
        | a fact its node has     | @id=a @owner=core @owner:b\nFeature: A |

  Rule: sdp vocabulary types each link and fact sdp reads, in the words the workspace binds to its roles

    An agent reads the types before it writes a tag, and check holds every link to them: a word bound
    to a role means what the role means.

    Scenario: Decisions also called adr, iterations called sprints, and words of other roles
      Given a file "sdp.config.yaml" containing:
        """
        vocabulary:
          kinds: { decision: [adr, decision], iteration: [sprint] }
          relations: { plan: [scheduled, depends-on], scenario: applies }
          attributes: { end: date, met: date }
        """
      When I run "sdp vocabulary --json"
      Then the exit code is 0
      And the JSON output has:
        | data.types.links.decided-by.to   | adr, decision     |
        | data.types.links.scheduled.to    | sprint            |
        | data.types.links.depends-on.from | work, rule        |
        | data.types.links.applies.from    | scenario          |
        | data.types.facts.date.on         | sprint, milestone |

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

    Scenario: A feature realized by itself, whose wrong end is where the link leads
      Given these specs:
        | tags                                      | Feature |
        | @id=cart @maturity=idea @realized-by:cart | Cart    |
      When the workspace is checked
      Then sdp reports:
        | rule      | message                                                    |
        | link-kind | cart is a feature, and realized-by leads to an element     |
