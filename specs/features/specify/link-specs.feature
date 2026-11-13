@id=link-specs
@realized-by:ARCH-graph-builder @realized-by:ARCH-graph @realized-by:ARCH-code-annotations @realized-by:ARCH-vocabulary
@decided-by:files-are-the-source-of-truth
Feature: Link specs into one graph

  Teams write specs, decisions, the architecture and the plan in their own words, and anchor code
  to the architecture; people and agents then need to follow any link from one to the next. What the files say
  and link becomes one graph: a node for each spec, rule and scenario, an edge for each link, each
  at the file and line that declares it, with the kinds and relations the authors wrote. What would
  make the graph say two things at once cannot be written.

  Not a metamodel: sdp reads meaning into a few words only, which `sdp vocabulary` lists and a
  workspace may rename. Nothing writes the graph but the files, and every command rebuilds it.

  Rule: Each spec, rule and scenario is a node at the line it is declared on, and a scenario verifies its rule and its spec

    A query or a jq filter over the export finds what a rule rests on and what verifies it, the
    same way it finds a spec's.

    Scenario: A rule with an example, a rule without one and an open question
      Given a file "specs/pay.feature" containing:
        """
        @id=pay
        Feature: Pay

          Shoppers pay by card.

          Rule: A wallet is charged once

            Charging twice is the one error a shopper does not forgive.

            @decided-by:charge-once
            Scenario: Retry
              The network failed after the charge.

              When the payment is retried
              Then one charge is made

          @decided-by:charge-once
          Rule: A refund returns the whole amount

          @open
          Rule: Are wallets charged too?
        """
      And these specs:
        | tags                           | Feature     |
        | @id=charge-once @kind=decision | Charge once |
      When the workspace is loaded
      Then the workspace graph has exactly these nodes:
        | id                                    | kind     | title                             | source                      |
        | pay                                   | feature  | Pay                               | specs/pay.feature:1         |
        | pay#a-wallet-is-charged-once          | rule     | A wallet is charged once          | specs/pay.feature:6         |
        | pay#retry                             | scenario | Retry                             | specs/pay.feature:11        |
        | pay#a-refund-returns-the-whole-amount | rule     | A refund returns the whole amount | specs/pay.feature:18        |
        | pay#are-wallets-charged-too           | rule     | Are wallets charged too?          | specs/pay.feature:21        |
        | charge-once                           | decision | Charge once                       | specs/charge-once.feature:1 |
      And the workspace graph has edges:
        | from                                  | rel        | to                           | source               |
        | pay#a-wallet-is-charged-once          | rule-of    | pay                          | specs/pay.feature:6  |
        | pay#retry                             | verifies   | pay#a-wallet-is-charged-once | specs/pay.feature:11 |
        | pay#retry                             | verifies   | pay                          | specs/pay.feature:11 |
        | pay#retry                             | decided-by | charge-once                  | specs/pay.feature:10 |
        | pay#a-refund-returns-the-whole-amount | decided-by | charge-once                  | specs/pay.feature:17 |
      And node "pay" has attribute summary = "Shoppers pay by card."
      And node "pay" has attribute scenarios = "1"
      And node "pay" has attribute openQuestions = "1"
      And node "pay#a-wallet-is-charged-once" has attribute description = "Charging twice is the one error a shopper does not forgive."
      And node "pay#a-wallet-is-charged-once" has attribute scenarios = "1"
      And node "pay#a-refund-returns-the-whole-amount" has attribute scenarios = "0"
      And node "pay#retry" has attribute rule = "pay#a-wallet-is-charged-once"
      And node "pay#retry" has attribute description = "The network failed after the charge."
      When I query "#charge-once <-decided-by- rule -rule-of-> *"
      Then the result is "pay"

  @decided-by:free-vocabulary
  Rule: Kinds, relations and attributes are whatever the authors write

    A team's words need no translation into sdp's, and a word that names something in JavaScript
    is a word like any other.

    Scenario: A bounded context that publishes to an event bus
      Given these specs:
        | tags                                                                                             | Feature           |
        | @id=ARCH-orders @kind=bounded-context @publishes-to:ARCH-event-bus @guarded-by:events-over-calls | Orders            |
        | @id=ARCH-event-bus @kind=broker                                                                  | Event bus         |
        | @id=events-over-calls @kind=decision                                                             | Events over calls |
      When the workspace is loaded
      Then node "ARCH-orders" has attribute kind = "bounded-context"
      And the workspace graph has edges:
        | from        | rel          | to                |
        | ARCH-orders | publishes-to | ARCH-event-bus    |
        | ARCH-orders | guarded-by   | events-over-calls |

    Scenario: constructor, toString and __proto__ are words like any other
      Given a file "sdp.config.yaml" containing:
        """
        vocabulary: { maturity: [constructor, toString, valueOf], disciplines: { valueOf: [constructor] } }
        """
      And these specs:
        | tags                                                                                    | Feature |
        | @id=a @kind=constructor @maturity=toString @owner.__proto__.valueOf=1 @hasOwnProperty:a | A       |
      When the workspace is checked
      Then sdp reports nothing
      And sdp status counts the stages "toString:1"
      When I query "constructor[maturity>constructor]"
      Then the result is "a"
      When I query "*[owner.__proto__.valueOf=1, hasOwnProperty=a]"
      Then the result is "a"
      When I query "*[toString]"
      Then the result is "nothing"
      When the graph is exported
      Then the output contains '"owner":{"__proto__":{"valueOf":1}}'
      And the output contains '"rel":"hasOwnProperty","to":"a"'
      When I run "sdp new constructor 'Odd one'"
      Then the exit code is 0

  Rule: In a spec, a link is a tag, one per target: an edge at the tag's line, and an attribute of the node that writes it

    An id written in a description is text: a link is what the spec states, never what its prose
    mentions.

    Scenario Outline: One target, two, and a dotted relation
      Given these specs:
        | tags                          | Feature |
        | @id=IT-beta @kind=iteration   | Beta    |
        | @id=IT-launch @kind=iteration | Launch  |
        | @id=a <links>                 | A       |
      When I query "*[<rel>=IT-beta]"
      Then the result is "a"
      And the workspace graph has edges:
        | from | rel   | to      | source            |
        | a    | <rel> | IT-beta | specs/a.feature:1 |

      Examples:
        | links                                   | rel                     |
        | @iteration:IT-beta                      | iteration               |
        | @iteration:IT-launch @iteration:IT-beta | iteration               |
        | @activity.implementation:IT-beta        | activity.implementation |

    Scenario: An id in a description is text
      Given these specs:
        | tags                             | Feature       |
        | @id=refund-policy @kind=decision | Refund policy |
      And a file "specs/refunds.feature" containing:
        """
        @id=refunds @maturity=idea @realized-by:ARCH-orders
        Feature: Refunds

          Follows refund-policy.
        """
      When the workspace is loaded
      Then the edges from "refunds" are "refunds -realized-by-> ARCH-orders"

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
      And sdp reports "<reported>"

      Examples:
        | file              | content                                                                                                             | edges                    | reported      |
        | specs/pay.feature | @id=pay @owner:orders-team\nFeature: Pay                                                                            | pay -owner-> orders-team | nothing       |
        | specs/pay.feature | @id=pay @owner=orders-team\nFeature: Pay                                                                            | nothing                  | nothing       |
        | src/pay.py        | # @sdp is pay iteration=IT-beta\ndef pay(): pass                                                                    | pay -iteration-> IT-beta | nothing       |
        | src/pay.py        | # @sdp is pay iteration=IT-gone\ndef pay(): pass                                                                    | pay -iteration-> IT-gone | dangling-link |
        | src/pay.py        | # @sdp is pay owner=IT-beta\ndef pay(): pass                                                                        | nothing                  | nothing       |
        | specs/pay.feature | @id=pay @iteration=IT-beta\nFeature: Pay                                                                            | nothing                  | link-syntax   |
        | src/pay.py        | # @sdp is pay iteration=true\ndef pay(): pass                                                                       | nothing                  | link-syntax   |

  Rule: Stating a link again adds a declaration to its one edge

    So every place that states it is found from the edge, and stating a link again is no error.

    Scenario: The same link in two tags, and in two annotations
      Given a file "specs/a.feature" containing:
        """
        @id=a @iteration:IT-beta
        @iteration:IT-beta
        Feature: A
        """
      And these specs:
        | tags                        | Feature |
        | @id=IT-beta @kind=iteration | Beta    |
      And a file "src/ledger.ts" containing:
        """
        // @sdp is ARCH-ledger
        export class Ledger {}
        """
      And a file "src/billing.ts" containing:
        """
        // @sdp uses ARCH-ledger
        // @sdp uses ARCH-ledger
        export class Billing {}
        """
      When the workspace is loaded
      Then the workspace graph has edges:
        | from                        | rel       | to          | sources                              |
        | a                           | iteration | IT-beta     | specs/a.feature:1, specs/a.feature:2 |
        | code:src/billing.ts#Billing | uses      | ARCH-ledger | src/billing.ts:1, src/billing.ts:2   |
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
        | rule         | severity | at                | message                               |
        | duplicate-id | error    | specs/b.feature:1 | already declared at specs/a.feature:1 |

  Rule: A reference to an id nothing declares is an error where it is written, and the id is a missing node

    So a node renamed or deleted is found from every place that still names it.

    Scenario: Two specs and a code annotation refer to ids nothing declares
      Given these specs:
        | tags                                                     | Feature |
        | @id=sync @depends-on:ARCH-queue @realized-by:ARCH-worker | Sync    |
        | @id=backup @depends-on:ARCH-queue                        | Backup  |
      And a file "src/sync.ts" containing:
        """
        // @sdp implements sink
        export function sync() {}
        """
      When the workspace is loaded
      Then sdp reports:
        | rule          | severity | at                     | message                                  |
        | dangling-link | error    | specs/backup.feature:1 | backup -depends-on-> ARCH-queue          |
        | dangling-link | error    | specs/sync.feature:1   | sync -depends-on-> ARCH-queue            |
        | dangling-link | error    | specs/sync.feature:1   | sync -realized-by-> ARCH-worker          |
        | dangling-link | error    | src/sync.ts:1          | code:src/sync.ts#sync -implements-> sink |
      And the workspace graph has exactly these nodes:
        | id                    | kind    | source                 |
        | backup                | feature | specs/backup.feature:1 |
        | sync                  | feature | specs/sync.feature:1   |
        | code:src/sync.ts#sync | code    | src/sync.ts:2          |
        | ARCH-queue            | missing |                        |
        | ARCH-worker           | missing |                        |
        | sink                  | missing |                        |

    Scenario Outline: What to write for an id nothing declares: <id>
      Given these specs:
        | tags                         | Feature |
        | @id=reports @depends-on:<id> | Reports |
      When the workspace is loaded
      Then sdp reports:
        | rule          | at                      | hint   |
        | dangling-link | specs/reports.feature:1 | <hint> |

      Examples:
        | id              | hint                                                                                                     |
        | billing         | write the spec `@id=billing` (`sdp new <kind> "<title>" --id billing`), or fix the reference             |
        | billing#invoice | write the `Rule:` or the `Scenario:` named invoice in the file of the spec billing, or fix the reference |
        | ARCH-billing    | declare it in the doc comment of its code, `@sdp is ARCH-billing`, or fix the reference                  |

  Rule: What sdp derives cannot be written, wherever a node is declared

    A stage is read from what ran, and a kind such as `missing` or `code` or a link such as
    `imports` from what sdp found: written by hand, any of them would claim what nothing showed.

    Scenario Outline: A stage written on a spec, a rule, a scenario or in code
      Given a file "<file>" containing:
        """
        <content>
        """
      When the workspace is loaded
      Then sdp reports:
        | rule              | at   | message                                                       |
        | derived-attribute | <at> | stage is derived by sdp, so the value written here is ignored |
      When I query "*[stage=verified]"
      Then the result is "nothing"

      Examples:
        | file              | content                                                                                   | at                  |
        | src/pay.py        | # @sdp is pay kind=feature stage=verified\ndef pay(): pass                                | src/pay.py:1        |
        | specs/pay.feature | @id=pay @stage=verified\nFeature: Pay                                                     | specs/pay.feature:1 |
        | specs/pay.feature | @id=pay\nFeature: Pay\n\n  @stage=verified\n  Rule: A card is charged once                | specs/pay.feature:4 |
        | specs/pay.feature | @id=pay\nFeature: Pay\n\n  Rule: R\n\n    @stage=verified\n    Scenario: S\n      Then ok | specs/pay.feature:6 |

    Scenario: Tags written as a value, on a Feature, a Rule, a Scenario and in code
      Given a file "specs/pay.feature" containing:
        """
        @id=pay @tags=custom @web
        Feature: Pay

          @tags=custom @open
          Rule: Is a refund charged too?

          Rule: A card is charged once

            @tags=custom @slow
            Scenario: Once
              Then one charge is made
        """
      And a file "src/orders.ts" containing:
        """
        /** @sdp is ARCH-orders tags=web */
        export const orders = []
        """
      When the workspace is loaded
      Then sdp reports:
        | rule              | at                  | message                                                                                                          | hint                         |
        | derived-attribute | specs/pay.feature:1 | tags holds the Cucumber tags of a Feature, a Rule or a Scenario as written, so the value written here is ignored | name the attribute otherwise |
        | derived-attribute | specs/pay.feature:4 | tags holds the Cucumber tags of a Feature, a Rule or a Scenario as written, so the value written here is ignored | name the attribute otherwise |
        | derived-attribute | specs/pay.feature:9 | tags holds the Cucumber tags of a Feature, a Rule or a Scenario as written, so the value written here is ignored | name the attribute otherwise |
        | derived-attribute | src/orders.ts:1     | tags holds the Cucumber tags of a Feature, a Rule or a Scenario as written, so the value written here is ignored | name the attribute otherwise |
      And the workspace graph has nodes:
        | id                          | tags  |
        | pay                         | @web  |
        | pay#is-a-refund-charged-too | @open |
        | pay#a-card-is-charged-once  |       |
        | pay#once                    | @slow |

    Scenario: A kind sdp makes itself, written in a spec and in code
      Given a file "specs/a.feature" containing:
        """
        @id=a @kind=missing
        Feature: A
        """
      And a file "src/pay.py" containing:
        """
        # @sdp is pay kind=code
        def pay(): pass
        """
      When the workspace is loaded
      Then sdp reports:
        | rule              | node | at                | message                                    |
        | derived-attribute | a    | specs/a.feature:1 | sdp makes the nodes of kind missing itself |
        | derived-attribute | pay  | src/pay.py:1      | sdp makes the nodes of kind code itself    |
      And node "a" has attribute kind = "feature"
      And node "pay" has attribute kind = "element"

    Scenario: A link sdp makes itself, written in a spec and in code
      Given a file "specs/a.feature" containing:
        """
        @id=a @imports:ARCH-b
        Feature: A
        """
      And a file "src/b.py" containing:
        """
        # @sdp is ARCH-b
        # @sdp rule-of a
        def b(): pass
        """
      When the workspace is loaded
      Then sdp reports:
        | rule              | node            | at                | message                            |
        | derived-attribute | a               | specs/a.feature:1 | sdp makes the imports links itself |
        | derived-attribute | code:src/b.py#b | src/b.py:2        | sdp makes the rule-of links itself |
      When I query "* -imports|rule-of-> *"
      Then the result is "nothing"

  Rule: A link cannot take the name of an attribute, wherever it is declared

    A link reads as an attribute of the node it starts from, so `[key=value]` must mean one thing.

    Scenario Outline: A link named like a fact sdp derives, or like an attribute of its node
      Given these specs:
        | tags                     | Feature  |
        | @id=verified @kind=label | Verified |
      And a file "<file>" containing:
        """
        <content>
        """
      When the workspace is loaded
      Then sdp reports:
        | rule        | severity | at   | message   | hint   |
        | link-syntax | error    | <at> | <message> | <hint> |
      When I query "* -<name>-> *"
      Then the result is "nothing"
      When I query "*[<name>=verified]"
      Then the result is "nothing"

      Examples:
        | file            | content                                                                | at                | name     | message                            | hint                               |
        | specs/a.feature | @id=a @maturity:verified\nFeature: A                                   | specs/a.feature:1 | maturity | no link can be named maturity      | written with =: @maturity=verified |
        | specs/a.feature | @id=a\nFeature: A\n\n  Rule: R\n\n    @stage:verified\n    Scenario: S | specs/a.feature:6 | stage    | no link can be named stage         | written with =: @stage=verified    |
        | src/a.py        | # @sdp status verified\ndef a(): pass                                  | src/a.py:1        | status   | no link can be named status        | written with =                     |
        | specs/a.feature | @id=a @owner=payments @owner:verified\nFeature: A                      | specs/a.feature:1 | owner    | owner is already an attribute of a | give the relation another name     |

  Rule: A link the vocabulary types joins the kinds its type names, and one that joins others is reported

    A feature realized by a decision, or a rule decided by a feature, reads as an answer and is
    none. A relation the vocabulary does not type joins any nodes; `sdp vocabulary` prints the types.

    Scenario Outline: <relation> to <to>
      Given these specs:
        | tags                                     | Feature  |
        | @id=use-postgres @kind=decision          | Postgres |
        | @id=wishlist @maturity=idea              | Wishlist |
        | @id=cart @maturity=idea @<relation>:<to> | Cart     |
      And a file "src/orders.ts" containing:
        """
        /** @sdp is ARCH-orders */
        export const orders = (): void => {}
        """
      When the workspace is checked
      Then sdp reports "<reported>"

      Examples:
        | relation    | to           | reported  |
        | realized-by | ARCH-orders  | nothing   |
        | realized-by | use-postgres | link-kind |
        | decided-by  | use-postgres | nothing   |
        | decided-by  | wishlist     | link-kind |
        | depends-on  | wishlist     | nothing   |
        | depends-on  | ARCH-orders  | link-kind |
        | uses        | use-postgres | nothing   |

    Scenario: What the report says, in the workspace's words
      Given a file "sdp.config.yaml" containing:
        """
        vocabulary:
          kinds:
            decision: [adr]
        """
      And these specs:
        | tags                                         | Feature  |
        | @id=wishlist @maturity=idea                  | Wishlist |
        | @id=cart @maturity=idea @decided-by:wishlist | Cart     |
      When the workspace is checked
      Then sdp reports:
        | rule      | severity | at                   | message                                                                            | hint                                                                             |
        | link-kind | warning  | specs/cart.feature:1 | cart -decided-by-> wishlist: wishlist is a feature, and decided-by leads to an adr | link an adr, or name the link with a relation of your own, which joins any kinds |
