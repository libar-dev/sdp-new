@id=link-specs @maturity=ready
@realized-by:ARCH-graph-builder @realized-by:ARCH-graph @realized-by:ARCH-code-annotations @realized-by:ARCH-vocabulary
@decided-by:files-are-the-source-of-truth
Feature: Link specs into one graph

  Teams write specs, decisions, the architecture and the plan in their own words, and anchor code
  to them; people and agents then need to follow any link from one to the next. What the files say
  and link becomes one graph: a node for each spec, rule and scenario, an edge for each link, each
  at the file and line that declares it, with the kinds and relations the authors wrote. What would
  make the graph say two things at once cannot be written.

  Not a metamodel: sdp reads meaning into a few words only, which `sdp vocabulary` lists and a
  workspace may rename. Nothing writes the graph but the files, and every command rebuilds it.

  Rule: Each spec, rule and scenario is a node at the line it is declared on, and a scenario verifies its rule and its spec

    A query or a jq filter over the export finds what a rule rests on and what verifies it, the
    same way it finds a spec's.

    Scenario: A rule with an example, a rule without one and an open question
      Given a file "specs/REQ-pay.feature" containing:
        """
        @id=REQ-pay
        Feature: Pay

          Shoppers pay by card.

          Rule: A wallet is charged once

            Charging twice is the one error a shopper does not forgive.

            @decided-by:DEC-charge-once
            Scenario: Retry
              The network failed after the charge.

              When the payment is retried
              Then one charge is made

          @decided-by:DEC-charge-once
          Rule: A refund returns the whole amount

          @open
          Rule: Are wallets charged too?
        """
      And these specs:
        | tags                | Feature     |
        | @id=DEC-charge-once | Charge once |
      When the workspace is loaded
      Then the workspace graph has exactly these nodes:
        | id                                        | kind        | title                             | source                          |
        | REQ-pay                                   | requirement | Pay                               | specs/REQ-pay.feature:1         |
        | REQ-pay#a-wallet-is-charged-once          | rule        | A wallet is charged once          | specs/REQ-pay.feature:6         |
        | REQ-pay#retry                             | scenario    | Retry                             | specs/REQ-pay.feature:11        |
        | REQ-pay#a-refund-returns-the-whole-amount | rule        | A refund returns the whole amount | specs/REQ-pay.feature:18        |
        | REQ-pay#are-wallets-charged-too           | rule        | Are wallets charged too?          | specs/REQ-pay.feature:21        |
        | DEC-charge-once                           | decision    | Charge once                       | specs/DEC-charge-once.feature:1 |
      And the workspace graph has edges:
        | from                                      | rel        | to                               | source                   |
        | REQ-pay#a-wallet-is-charged-once          | rule-of    | REQ-pay                          | specs/REQ-pay.feature:6  |
        | REQ-pay#retry                             | verifies   | REQ-pay#a-wallet-is-charged-once | specs/REQ-pay.feature:11 |
        | REQ-pay#retry                             | verifies   | REQ-pay                          | specs/REQ-pay.feature:11 |
        | REQ-pay#retry                             | decided-by | DEC-charge-once                  | specs/REQ-pay.feature:10 |
        | REQ-pay#a-refund-returns-the-whole-amount | decided-by | DEC-charge-once                  | specs/REQ-pay.feature:17 |
      And node "REQ-pay" has attribute summary = "Shoppers pay by card."
      And node "REQ-pay" has attribute scenarios = "1"
      And node "REQ-pay" has attribute openQuestions = "1"
      And node "REQ-pay#a-wallet-is-charged-once" has attribute description = "Charging twice is the one error a shopper does not forgive."
      And node "REQ-pay#a-wallet-is-charged-once" has attribute scenarios = "1"
      And node "REQ-pay#a-refund-returns-the-whole-amount" has attribute verification = "none"
      And node "REQ-pay#retry" has attribute rule = "REQ-pay#a-wallet-is-charged-once"
      And node "REQ-pay#retry" has attribute description = "The network failed after the charge."
      When I query "#DEC-charge-once <-decided-by- rule -rule-of-> *"
      Then the result is "REQ-pay"

  @decided-by:free-vocabulary
  Rule: Kinds, relations and attributes are whatever the authors write

    A team's words need no translation into sdp's, and a word that names something in JavaScript
    is a word like any other.

    Scenario: A bounded context that publishes to an event bus
      Given these specs:
        | tags                                                                                                   | Feature           |
        | @id=ARCH-orders @kind=bounded-context @publishes-to:ARCH-event-bus @guarded-by:DEC-events-over-calls | Orders            |
        | @id=ARCH-event-bus @kind=element                                                                       | Event bus         |
        | @id=DEC-events-over-calls                                                                              | Events over calls |
      When the workspace is loaded
      Then node "ARCH-orders" has attribute kind = "bounded-context"
      And the workspace graph has edges:
        | from        | rel          | to                    |
        | ARCH-orders | publishes-to | ARCH-event-bus        |
        | ARCH-orders | guarded-by   | DEC-events-over-calls |

    Scenario: constructor, toString and __proto__ are words like any other
      Given a file "sdp.config.yaml" containing:
        """
        vocabulary: { maturity: [constructor, toString] }
        """
      And these specs:
        | tags                                                                                            | Feature |
        | @id=REQ-a @kind=constructor @maturity=toString @owner.__proto__.valueOf=1 @hasOwnProperty:REQ-a | A       |
      When the workspace is checked
      Then sdp reports nothing
      And sdp status counts the stages "toString:1"
      When I query "constructor[maturity>constructor]"
      Then the result is "REQ-a"
      When I query "*[owner.__proto__.valueOf=1, hasOwnProperty=REQ-a]"
      Then the result is "REQ-a"
      When I query "*[toString]"
      Then the result is "nothing"
      When the graph is exported
      Then the output contains '"owner":{"__proto__":{"valueOf":1}}'
      And the output contains '"rel":"hasOwnProperty","to":"REQ-a"'
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
        | @id=REQ-a <links>             | A       |
      When I query "*[<rel>=IT-beta]"
      Then the result is "REQ-a"
      And the workspace graph has edges:
        | from  | rel   | to      | source                |
        | REQ-a | <rel> | IT-beta | specs/REQ-a.feature:1 |

      Examples:
        | links                                   | rel                     |
        | @iteration:IT-beta                      | iteration               |
        | @iteration:IT-launch @iteration:IT-beta | iteration               |
        | @activity.implementation:IT-beta        | activity.implementation |

    Scenario: An id in a description is text
      Given these specs:
        | tags                  | Feature       |
        | @id=ARCH-orders       | Orders        |
        | @id=DEC-refund-policy | Refund policy |
      And a file "specs/REQ-refunds.feature" containing:
        """
        @id=REQ-refunds @realized-by:ARCH-orders
        Feature: Refunds

          Follows the policy of DEC-refund-policy.
        """
      When the workspace is loaded
      Then the edges from "REQ-refunds" are "REQ-refunds -realized-by-> ARCH-orders"

  Rule: Whether a tag or a key links is a property of how it is written, never of its value

    Were the value to decide, a reference to a renamed node would turn into text without a word.

    Scenario Outline: In a feature file the separator decides; in code, the key
      Given these specs:
        | tags                        | Feature |
        | @id=IT-beta @kind=iteration | Beta    |
        | @id=ARCH-orders             | Orders  |
      And a file "<file>" containing:
        """
        <content>
        """
      When the workspace is loaded
      Then the edges from "REQ-pay" are "<edges>"
      And sdp reports "<reported>"

      Examples:
        | file                  | content                                                                                                                 | edges                        | reported      |
        | specs/REQ-pay.feature | @id=REQ-pay @owner:ARCH-orders\nFeature: Pay                                                                            | REQ-pay -owner-> ARCH-orders | nothing       |
        | specs/REQ-pay.feature | @id=REQ-pay @owner=ARCH-orders\nFeature: Pay                                                                            | nothing                      | nothing       |
        | src/pay.py            | # @sdp is REQ-pay iteration=IT-beta\ndef pay(): pass                                                                    | REQ-pay -iteration-> IT-beta | nothing       |
        | src/pay.py            | # @sdp is REQ-pay iteration=IT-gone\ndef pay(): pass                                                                    | REQ-pay -iteration-> IT-gone | dangling-link |
        | src/pay.py            | # @sdp is REQ-pay owner=IT-beta\ndef pay(): pass                                                                        | nothing                      | nothing       |
        | specs/REQ-pay.feature | @id=REQ-pay @iteration=IT-beta\nFeature: Pay                                                                            | nothing                      | link-syntax   |
        | src/pay.ts            | import { annotate } from "sdp/annotations"\nexport const pay = 0\nannotate(pay, { is: "REQ-pay" }, { iteration: true }) | nothing                      | link-syntax   |

  Rule: A link stated more than once is one edge that keeps every declaration, and where their attributes disagree the first holds

    So every place that states it is found from the edge, and stating a link again is no error.

    Scenario: The same link in two tags, and in two annotations that disagree
      Given a file "specs/REQ-a.feature" containing:
        """
        @id=REQ-a @iteration:IT-beta
        @iteration:IT-beta
        Feature: A
        """
      And these specs:
        | tags                        | Feature |
        | @id=IT-beta @kind=iteration | Beta    |
        | @id=ARCH-ledger             | Ledger  |
      And a file "src/billing.ts" containing:
        """
        // @sdp uses ARCH-ledger via=events
        // @sdp uses ARCH-ledger via=http since=2026
        export class Billing {}
        """
      When the workspace is loaded
      Then the workspace graph has edges:
        | from                        | rel       | to          | sources                                      | attributes              |
        | REQ-a                       | iteration | IT-beta     | specs/REQ-a.feature:1, specs/REQ-a.feature:2 |                         |
        | code:src/billing.ts#Billing | uses      | ARCH-ledger | src/billing.ts:1, src/billing.ts:2           | via="events" since=2026 |
      And sdp reports:
        | rule          | at               | message                                             |
        | link-conflict | src/billing.ts:2 | via is "http" here but "events" at src/billing.ts:1 |

  Rule: An id is declared once: a second declaration is an error, and the first holds

    So a link always reaches one node.

    Scenario: Two files declare REQ-pay
      Given a file "specs/a.feature" containing:
        """
        @id=REQ-pay
        Feature: Pay by card
        """
      And a file "specs/b.feature" containing:
        """
        @id=REQ-pay
        Feature: Pay by wallet
        """
      When the workspace is loaded
      Then node "REQ-pay" has attribute title = "Pay by card"
      And sdp reports:
        | rule         | severity | at                | message                               |
        | duplicate-id | error    | specs/b.feature:1 | already declared at specs/a.feature:1 |

  Rule: A reference to an id nothing declares is an error where it is written, and the id is a missing node

    So a node renamed or deleted is found from every place that still names it.

    Scenario: Two specs and a code annotation refer to ids nothing declares
      Given these specs:
        | tags                                                         | Feature |
        | @id=REQ-sync @depends-on:ARCH-queue @realized-by:ARCH-worker | Sync    |
        | @id=REQ-backup @depends-on:ARCH-queue                        | Backup  |
      And a file "src/sync.ts" containing:
        """
        // @sdp implements REQ-sink
        export function sync() {}
        """
      When the workspace is loaded
      Then sdp reports:
        | rule          | severity | at                         | message                                      |
        | dangling-link | error    | specs/REQ-backup.feature:1 | REQ-backup -depends-on-> ARCH-queue          |
        | dangling-link | error    | specs/REQ-sync.feature:1   | REQ-sync -depends-on-> ARCH-queue            |
        | dangling-link | error    | specs/REQ-sync.feature:1   | REQ-sync -realized-by-> ARCH-worker          |
        | dangling-link | error    | src/sync.ts:1              | code:src/sync.ts#sync -implements-> REQ-sink |
      And the workspace graph has exactly these nodes:
        | id                    | kind        | source                     |
        | REQ-backup            | requirement | specs/REQ-backup.feature:1 |
        | REQ-sync              | requirement | specs/REQ-sync.feature:1   |
        | code:src/sync.ts#sync | code        | src/sync.ts:1              |
        | ARCH-queue            | missing     |                            |
        | ARCH-worker           | missing     |                            |
        | REQ-sink              | missing     |                            |

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
        | file              | content                                                                                     | at                  |
        | src/pay.py        | # @sdp is REQ-pay kind=requirement stage=verified\ndef pay(): pass                          | src/pay.py:1        |
        | specs/pay.feature | @id=REQ-f @stage=verified\nFeature: Pay                                                     | specs/pay.feature:1 |
        | specs/pay.feature | @id=REQ-f\nFeature: Pay\n\n  @stage=verified\n  Rule: A card is charged once                | specs/pay.feature:4 |
        | specs/pay.feature | @id=REQ-f\nFeature: Pay\n\n  Rule: R\n\n    @stage=verified\n    Scenario: S\n      Then ok | specs/pay.feature:6 |

    Scenario: A kind sdp makes itself, written in a spec and in code
      Given a file "specs/REQ-a.feature" containing:
        """
        @id=REQ-a @kind=missing
        Feature: A
        """
      And a file "src/pay.py" containing:
        """
        # @sdp is REQ-pay kind=code
        def pay(): pass
        """
      When the workspace is loaded
      Then sdp reports:
        | rule              | node    | at                    | message                                    |
        | derived-attribute | REQ-a   | specs/REQ-a.feature:1 | sdp makes the nodes of kind missing itself |
        | derived-attribute | REQ-pay | src/pay.py:1          | sdp makes the nodes of kind code itself    |
      And node "REQ-a" has attribute kind = "requirement"
      And node "REQ-pay" has attribute kind = "element"

    Scenario: A link sdp makes itself, written in a spec and in code
      Given a file "specs/ARCH-a.feature" containing:
        """
        @id=ARCH-a @imports:ARCH-b
        Feature: A
        """
      And a file "src/b.py" containing:
        """
        # @sdp is ARCH-b
        # @sdp rule-of ARCH-a
        def b(): pass
        """
      When the workspace is loaded
      Then sdp reports:
        | rule              | node            | at                     | message                            |
        | derived-attribute | ARCH-a          | specs/ARCH-a.feature:1 | sdp makes the imports links itself |
        | derived-attribute | code:src/b.py#b | src/b.py:2             | sdp makes the rule-of links itself |
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
        | file                | content                                                                    | at                    | name     | message                                | hint                               |
        | specs/REQ-a.feature | @id=REQ-a @maturity:verified\nFeature: A                                   | specs/REQ-a.feature:1 | maturity | no link can be named maturity          | written with =: @maturity=verified |
        | specs/REQ-a.feature | @id=REQ-a\nFeature: A\n\n  Rule: R\n\n    @stage:verified\n    Scenario: S | specs/REQ-a.feature:6 | stage    | no link can be named stage             | written with =: @stage=verified    |
        | src/a.py            | # @sdp status verified\ndef a(): pass                                      | src/a.py:1            | status   | no link can be named status            | written with =                     |
        | specs/REQ-a.feature | @id=REQ-a @owner=payments @owner:verified\nFeature: A                      | specs/REQ-a.feature:1 | owner    | owner is already an attribute of REQ-a | give the relation another name     |
