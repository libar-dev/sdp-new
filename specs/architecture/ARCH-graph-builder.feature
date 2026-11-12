@id=ARCH-graph-builder
@decided-by:DEC-0003 @instance-of:PAT-pipes-and-filters @instance-of:PAT-derived-index @uses:ARCH-spec-parser @uses:ARCH-code-annotations @uses:ARCH-graph @uses:ARCH-vocabulary
Feature: Graph builder

  Builds the system graph from what the workspace read — specs, annotations and the last scenario
  results — and from nothing else, on every command. It never fails on content: a problem becomes
  a diagnostic, and the graph is still built.

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

            @decided-by:DEC-0001
            Scenario: Retry
              The network failed after the charge.

              When the payment is retried
              Then one charge is made

          @decided-by:DEC-0001
          Rule: A refund returns the whole amount

          @open
          Rule: Are wallets charged too?
        """
      And these specs:
        | tags         | Feature     |
        | @id=DEC-0001 | Charge once |
      When the workspace is loaded
      Then the workspace graph has exactly these nodes:
        | id                                        | kind        | title                             | source                   |
        | REQ-pay                                   | requirement | Pay                               | specs/REQ-pay.feature:1  |
        | REQ-pay#a-wallet-is-charged-once          | rule        | A wallet is charged once          | specs/REQ-pay.feature:6  |
        | REQ-pay#retry                             | scenario    | Retry                             | specs/REQ-pay.feature:11 |
        | REQ-pay#a-refund-returns-the-whole-amount | rule        | A refund returns the whole amount | specs/REQ-pay.feature:18 |
        | REQ-pay#are-wallets-charged-too           | rule        | Are wallets charged too?          | specs/REQ-pay.feature:21 |
        | DEC-0001                                  | decision    | Charge once                       | specs/DEC-0001.feature:1 |
      And the workspace graph has edges:
        | from                                      | rel        | to                               | source                   |
        | REQ-pay#a-wallet-is-charged-once          | rule-of    | REQ-pay                          | specs/REQ-pay.feature:6  |
        | REQ-pay#retry                             | verifies   | REQ-pay#a-wallet-is-charged-once | specs/REQ-pay.feature:11 |
        | REQ-pay#retry                             | verifies   | REQ-pay                          | specs/REQ-pay.feature:11 |
        | REQ-pay#retry                             | decided-by | DEC-0001                         | specs/REQ-pay.feature:10 |
        | REQ-pay#a-refund-returns-the-whole-amount | decided-by | DEC-0001                         | specs/REQ-pay.feature:17 |
      And node "REQ-pay" has attribute summary = "Shoppers pay by card."
      And node "REQ-pay" has attribute scenarios = "1"
      And node "REQ-pay" has attribute openQuestions = "1"
      And node "REQ-pay#a-wallet-is-charged-once" has attribute description = "Charging twice is the one error a shopper does not forgive."
      And node "REQ-pay#a-wallet-is-charged-once" has attribute scenarios = "1"
      And node "REQ-pay#a-refund-returns-the-whole-amount" has attribute verification = "none"
      And node "REQ-pay#retry" has attribute rule = "REQ-pay#a-wallet-is-charged-once"
      And node "REQ-pay#retry" has attribute description = "The network failed after the charge."
      When I query "#DEC-0001 <-decided-by- rule -rule-of-> *"
      Then the result is "REQ-pay"

  Rule: Whether a tag or a key links is a property of how it is written, never of its value

    Were the value to decide, a reference to a renamed node would turn into text without a word.

    Scenario Outline: In a feature file the separator decides; in code, the key
      Given these specs:
        | tags                   | Feature |
        | @id=E1 @kind=iteration | E1      |
        | @id=ARCH-orders        | Orders  |
      And a file "<file>" containing:
        """
        <content>
        """
      When the workspace is loaded
      Then the edges from "REQ-pay" are "<edges>"
      And sdp reports "<reported>"

      Examples:
        | file                  | content                                         | edges                        | reported      |
        | specs/REQ-pay.feature | @id=REQ-pay @owner:ARCH-orders\nFeature: Pay    | REQ-pay -owner-> ARCH-orders | nothing       |
        | specs/REQ-pay.feature | @id=REQ-pay @owner=ARCH-orders\nFeature: Pay    | nothing                      | nothing       |
        | src/pay.py            | # @sdp is REQ-pay iteration=E1\ndef pay(): pass | REQ-pay -iteration-> E1      | nothing       |
        | src/pay.py            | # @sdp is REQ-pay iteration=E9\ndef pay(): pass | REQ-pay -iteration-> E9      | dangling-link |
        | src/pay.py            | # @sdp is REQ-pay owner=E1\ndef pay(): pass     | nothing                      | nothing       |

  Rule: A link stated more than once is one edge that keeps every declaration, and where their attributes disagree the first holds

    Scenario: The same link in two tags, and in two annotations that disagree
      Given a file "specs/REQ-a.feature" containing:
        """
        @id=REQ-a @iteration:E1
        @iteration:E1
        Feature: A
        """
      And these specs:
        | tags                   | Feature |
        | @id=E1 @kind=iteration | E1      |
        | @id=ARCH-ledger        | Ledger  |
      And a file "src/billing.ts" containing:
        """
        // @sdp uses ARCH-ledger via=events
        // @sdp uses ARCH-ledger via=http since=2026
        export class Billing {}
        """
      When the workspace is loaded
      Then the workspace graph has edges:
        | from                        | rel       | to          | sources                                      | attributes              |
        | REQ-a                       | iteration | E1          | specs/REQ-a.feature:1, specs/REQ-a.feature:2 |                         |
        | code:src/billing.ts#Billing | uses      | ARCH-ledger | src/billing.ts:1, src/billing.ts:2           | via="events" since=2026 |
      And sdp reports:
        | rule          | at               | message                                             |
        | link-conflict | src/billing.ts:2 | via is "http" here but "events" at src/billing.ts:1 |

  Rule: What sdp derives cannot be written, wherever a node is declared

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
        | file                | content                                                                         | at                    | name     | message                                | hint                               |
        | specs/REQ-a.feature | @id=REQ-a @maturity:verified\nFeature: A                                        | specs/REQ-a.feature:1 | maturity | no link can be named maturity          | written with =: @maturity=verified |
        | specs/REQ-a.feature | @id=REQ-a\nFeature: A\n\n  Rule: R\n\n    @stage:verified\n    Scenario: S      | specs/REQ-a.feature:6 | stage    | no link can be named stage             | written with =: @stage=verified    |
        | src/a.py            | # @sdp status verified\ndef a(): pass                                           | src/a.py:1            | status   | no link can be named status            | written with =                     |
        | specs/REQ-a.feature | @id=REQ-a @owner=payments @owner:verified\nFeature: A                           | specs/REQ-a.feature:1 | owner    | owner is already an attribute of REQ-a | give the relation another name     |

  Rule: Annotated code is a code node linked to what it names, and an is link adds to its node only what no spec says

    Scenario: An element a spec declares and one only code declares
      Given these specs:
        | tags                             | Feature |
        | @id=REQ-pay                      | Pay     |
        | @id=ARCH-billing @owner=payments | Billing |
      And a file "src/billing.ts" containing:
        """
        // @sdp is ARCH-billing owner=platform tier=1

        // @sdp implements REQ-pay
        // @sdp uses ARCH-ledger via=events
        export class Billing {}
        """
      And a file "src/ledger.ts" containing:
        """
        // @sdp is ARCH-ledger title="Ledger"
        export class Ledger {}
        """
      When the workspace is loaded
      Then the workspace graph has exactly these nodes:
        | id                          | kind        | title          | source                       |
        | REQ-pay                     | requirement | Pay            | specs/REQ-pay.feature:1      |
        | ARCH-billing                | element     | Billing        | specs/ARCH-billing.feature:1 |
        | code:src/billing.ts         | code        | src/billing.ts | src/billing.ts:1             |
        | code:src/billing.ts#Billing | code        | Billing        | src/billing.ts:3             |
        | code:src/ledger.ts#Ledger   | code        | Ledger         | src/ledger.ts:1              |
        | ARCH-ledger                 | element     | Ledger         | src/ledger.ts:1              |
      And the workspace graph has edges:
        | from                        | rel        | to           | attributes   |
        | code:src/billing.ts         | is         | ARCH-billing |              |
        | code:src/billing.ts#Billing | implements | REQ-pay      |              |
        | code:src/billing.ts#Billing | uses       | ARCH-ledger  | via="events" |
        | code:src/ledger.ts#Ledger   | is         | ARCH-ledger  |              |
      And node "ARCH-billing" has attribute owner = "payments"
      And node "ARCH-billing" has attribute tier = "1"
      And node "ARCH-ledger" has attribute declaredIn = "code"

    Scenario: A maturity given in code decides the stage like one written in the spec
      Given these specs:
        | tags        | Feature |
        | @id=REQ-pay | Pay     |
      And a file "src/pay.py" containing:
        """
        # @sdp is REQ-pay maturity=idea
        def pay(): pass
        """
      When the workspace is loaded
      Then node "REQ-pay" has attribute maturity = "idea"
      And node "REQ-pay" has attribute stage = "idea"

  Rule: An id is declared once: a second declaration is an error, and the first holds

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
