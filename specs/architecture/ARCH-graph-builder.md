---
id: ARCH-graph-builder
kind: element
title: Graph builder
links:
  decided-by: DEC-0003
  instance-of: { to: PAT-pipes-and-filters, role: filter }
  uses: [ARCH-spec-parser, ARCH-code-annotations, ARCH-graph, ARCH-vocabulary]
---

# Graph builder

Builds the system graph from what the workspace read — specs, annotations and the last scenario
results — and from nothing else. It is pure and runs on every command ([[PAT-derived-index]]). It
never fails on content: a problem becomes a diagnostic, and the graph stays complete enough to
query it, with unresolved references visible as nodes.

Whether a key links is a property of the key, never of its value: were the value to decide, a
reference to a renamed node would turn into text without a word.

## Scenarios

~~~gherkin
Scenario: A spec, each of its scenarios and each inline node is a node at the line it is declared on, with the facts sdp derives
  Given a file "specs/plan.md" containing:
    """
    ---
    id: PLAN
    kind: plan
    nodes:
      - { id: E1, kind: iteration }
      - id: ARCH-cache
        links: { speeds-up: REQ-pay }
    ---
    # Plan
    """
  And a file "specs/REQ-pay.md" containing:
    """
    ---
    id: REQ-pay
    maturity: specified
    iteration: E1
    ---
    # Pay

    Shoppers pay by card.

    ## Open questions
    - [ ] Which cards?
    - [x] Wallets? Later.

    ```gherkin
    Scenario: Card payment
      When the shopper pays by card
      Then an order is created
    ```
    """
  When the workspace is loaded
  Then the workspace graph has exactly these nodes:
    | id                   | kind        | source              |
    | PLAN                 | plan        | specs/plan.md:1      |
    | E1                   | iteration   | specs/plan.md:5      |
    | ARCH-cache           | element     | specs/plan.md:6      |
    | REQ-pay              | requirement | specs/REQ-pay.md:1  |
    | REQ-pay#card-payment | scenario    | specs/REQ-pay.md:15 |
  And the workspace graph has edges:
    | from                 | rel       | to      | source              | attributes    |
    | REQ-pay#card-payment | verifies  | REQ-pay | specs/REQ-pay.md:15 |               |
    | ARCH-cache           | speeds-up | REQ-pay | specs/plan.md:7      |               |
    | REQ-pay              | iteration | E1      | specs/REQ-pay.md:4  |               |
  And node "REQ-pay" has attribute file = "specs/REQ-pay.md"
  And node "REQ-pay" has attribute summary = "Shoppers pay by card."
  And node "REQ-pay" has attribute scenarios = "1"
  And node "REQ-pay" has attribute openQuestions = "1"
  And node "E1" has attribute declaredIn = "PLAN"
  And the edges from "E1" are "nothing"

Scenario: A rule is a node of its spec, and a scenario verifies its rule and its spec
  A query or a jq filter over the export finds what a rule rests on and what verifies it, the
  same way it finds a spec's.

  Given a file "specs/REQ-pay.feature" containing:
    """
    @id=REQ-pay
    Feature: Pay

      Rule: A wallet is charged once

        Charging twice is the one error a shopper does not forgive.

        @decided-by:DEC-0001
        Scenario: Retry
          The network failed after the charge.

          When the payment is retried
          Then one charge is made

      @decided-by:DEC-0001
      Rule: A refund returns the whole amount
    """
  And these specs:
    | tags         | Feature     |
    | @id=DEC-0001 | Charge once |
  When the workspace is loaded
  Then the workspace graph has exactly these nodes:
    | id                                        | kind        | title                            | source                   |
    | REQ-pay                                   | requirement | Pay                              | specs/REQ-pay.feature:1  |
    | REQ-pay#a-wallet-is-charged-once          | rule        | A wallet is charged once         | specs/REQ-pay.feature:4  |
    | REQ-pay#retry                             | scenario    | Retry                            | specs/REQ-pay.feature:9  |
    | REQ-pay#a-refund-returns-the-whole-amount | rule        | A refund returns the whole amount | specs/REQ-pay.feature:16 |
    | DEC-0001                                  | decision    | Charge once                      | specs/DEC-0001.feature:1 |
  And the workspace graph has edges:
    | from                                      | rel        | to                               | source                   |
    | REQ-pay#a-wallet-is-charged-once          | rule-of    | REQ-pay                          | specs/REQ-pay.feature:4  |
    | REQ-pay#retry                             | verifies   | REQ-pay#a-wallet-is-charged-once | specs/REQ-pay.feature:9  |
    | REQ-pay#retry                             | verifies   | REQ-pay                          | specs/REQ-pay.feature:9  |
    | REQ-pay#retry                             | decided-by | DEC-0001                         | specs/REQ-pay.feature:8  |
    | REQ-pay#a-refund-returns-the-whole-amount | decided-by | DEC-0001                         | specs/REQ-pay.feature:15 |
  And node "REQ-pay#a-wallet-is-charged-once" has attribute description = "Charging twice is the one error a shopper does not forgive."
  And node "REQ-pay#a-wallet-is-charged-once" has attribute scenarios = "1"
  And node "REQ-pay#a-refund-returns-the-whole-amount" has attribute verification = "none"
  And node "REQ-pay#retry" has attribute rule = "REQ-pay#a-wallet-is-charged-once"
  And node "REQ-pay#retry" has attribute description = "The network failed after the charge."
  When I query "#DEC-0001 <-decided-by- rule -rule-of-> *"
  Then the result is "REQ-pay"

Scenario Outline: A link key always links and any other key never does, whatever its value
  Given a file "specs/model.md" containing:
    """
    ---
    id: MODEL
    kind: model
    nodes:
      - { id: E1, kind: iteration }
      - { id: ARCH-orders, kind: element }
      - { id: REQ-pay, kind: requirement, <attribute> }
    ---
    # Model
    """
  When the workspace is loaded
  Then the edges from "REQ-pay" are "<edges>"
  And sdp reports "<reported>"

  Examples:
    | attribute                                                 | edges                                                                                                   | reported      |
    | iteration: E1                                             | REQ-pay -iteration-> E1                                                                                 | nothing       |
    | iteration: E9                                             | REQ-pay -iteration-> E9                                                                                 | dangling-link |
    | links: { owner: ARCH-orders }                             | REQ-pay -owner-> ARCH-orders                                                                            | nothing       |
    | owner: ARCH-orders                                        | nothing                                                                                                 | nothing       |
    | status: E1                                                | nothing                                                                                                 | nothing       |
    | activity: { implementation: E1, test: [E1, ARCH-orders] } | REQ-pay -activity.implementation-> E1, REQ-pay -activity.test-> ARCH-orders, REQ-pay -activity.test-> E1 | nothing       |
    | activity: { test: [] }                                    | nothing                                                                                                 | nothing       |

Scenario: A link stated more than once is one edge that keeps every declaration; attributes that disagree are a conflict, and the first holds
  Given a file "specs/REQ-a.md" containing:
    """
    ---
    id: REQ-a
    links:
      iteration: { to: E1, why: planned }
    iteration: { to: E1, why: promised, since: 2026 }
    ---
    # A

    iteration:: [[E1]]
    """
  And a file "specs/plan.md" containing:
    """
    ---
    id: PLAN
    nodes:
      - { id: E1, kind: iteration }
    ---
    # Plan
    """
  When the workspace is loaded
  Then the workspace graph has edges:
    | from  | rel       | to | sources                                              | attributes                 |
    | REQ-a | iteration | E1 | specs/REQ-a.md:4, specs/REQ-a.md:5, specs/REQ-a.md:9 | why="planned" since=2026 |
  And sdp reports:
    | rule          | at               | message                                            |
    | link-conflict | specs/REQ-a.md:5 | why is "promised" here but "planned" at specs/REQ-a.md:4 |

Scenario: A mention adds nothing between nodes a link already joins, nor does a spec that mentions itself
  Given a file "specs/REQ-a.md" containing:
    """
    ---
    id: REQ-a
    links:
      decided-by: DEC-1
    ---
    # A

    Follows [[DEC-1]], weighs [[RISK-1]] and keeps [[DEC-2]] in mind, says [[REQ-a]] of itself.
    """
  And a file "specs/model.md" containing:
    """
    ---
    id: MODEL
    nodes:
      - { id: DEC-1, kind: decision }
      - { id: DEC-2, kind: decision }
      - { id: RISK-1, kind: risk, links: { affects: REQ-a } }
    ---
    # Model
    """
  When the workspace is loaded
  Then the edges from "REQ-a" are "REQ-a -decided-by-> DEC-1, REQ-a -mentions-> DEC-2"

Scenario Outline: What sdp derives cannot be written, wherever a node is declared
  Given a file "<file>" containing:
    """
    <content>
    """
  When the workspace is loaded
  Then sdp reports:
    | rule              | at   | message                                         |
    | derived-attribute | <at> | stage is derived by sdp, so the value written here is ignored |
  When I query "*[stage=verified]"
  Then the result is "nothing"

  Examples:
    | file              | content                                                                       | at                  |
    | specs/REQ-a.md    | ---\nid: REQ-a\nmaturity: idea\nstage: verified\n---\n# A                   | specs/REQ-a.md:4    |
    | specs/plan.md      | ---\nid: PLAN\nnodes:\n  - { id: REQ-b, kind: requirement, stage: verified }\n---\n# Plan | specs/plan.md:4      |
    | src/pay.py        | # @sdp is REQ-pay kind=requirement stage=verified\ndef pay(): pass               | src/pay.py:1        |
    | specs/pay.feature | @id=REQ-f @stage=verified\nFeature: Pay                                         | specs/pay.feature:1 |
    | specs/pay.feature | @id=REQ-f\nFeature: Pay\n\n  @stage=verified\n  Rule: A card is charged once      | specs/pay.feature:4 |
    | specs/pay.feature | @id=REQ-f\nFeature: Pay\n\n  Rule: R\n\n    @stage=verified\n    Scenario: S\n      Then ok | specs/pay.feature:6 |

Scenario Outline: A link cannot take the name of an attribute, wherever it is declared
  Given a file "specs/model.md" containing:
    """
    ---
    id: MODEL
    nodes:
      - { id: verified, kind: label }
    ---
    # Model
    """
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
    | file                | content                                                                | at                    | name     | message                           | hint                                   |
    | specs/REQ-a.feature | @id=REQ-a @maturity:verified\nFeature: A                               | specs/REQ-a.feature:1 | maturity | no link can be named maturity     | written with =: @maturity=verified     |
    | specs/REQ-a.md | ---\nid: REQ-a\nlinks: { stage: verified }\n---\n# A                   | specs/REQ-a.md:3 | stage    | no link can be named stage        | written with =: @stage=verified |
    | specs/REQ-a.md | ---\nid: REQ-a\nnodes:\n  - id: REQ-b\n    links:\n      verification: verified\n---\n# A | specs/REQ-a.md:6 | verification | no link can be named verification | written with = |
    | specs/REQ-a.md | ---\nid: REQ-a\n---\n# A\n\nmaturity:: [[verified]]                     | specs/REQ-a.md:6 | maturity | no link can be named maturity     | written with = |
    | src/a.py       | # @sdp status verified\ndef a(): pass                                  | src/a.py:1       | status   | no link can be named status       | written with = |
    | specs/REQ-a.md | ---\nid: REQ-a\nowner: payments\nlinks: { owner: verified }\n---\n# A   | specs/REQ-a.md:4 | owner    | owner is already an attribute of REQ-a | give the relation another name |

Scenario: A kind sdp makes itself cannot be written; the node has the kind its id says
  Given a file "specs/REQ-a.md" containing:
    """
    ---
    id: REQ-a
    kind: missing
    maturity: ready
    nodes:
      - { id: REQ-b, kind: scenario }
    ---
    # A
    """
  And a file "src/pay.py" containing:
    """
    # @sdp is REQ-pay kind=code
    def pay(): pass
    """
  When the workspace is checked
  Then sdp reports:
    | rule              | node    | at               | message                                     |
    | derived-attribute | REQ-a   | specs/REQ-a.md:3 | sdp makes the nodes of kind missing itself  |
    | derived-attribute | REQ-b   | specs/REQ-a.md:6 | sdp makes the nodes of kind scenario itself |
    | derived-attribute | REQ-pay | src/pay.py:1     | sdp makes the nodes of kind code itself     |
    | maturity-criteria | REQ-a   | specs/REQ-a.md:1 |                                             |
  And node "REQ-a" has attribute kind = "requirement"
  And node "REQ-b" has attribute kind = "requirement"
  And node "REQ-pay" has attribute kind = "element"

Scenario: A maturity given in code decides the stage like one written in the spec
  Given a file "specs/REQ-pay.md" containing:
    """
    ---
    id: REQ-pay
    ---
    # Pay
    """
  And a file "src/pay.py" containing:
    """
    # @sdp is REQ-pay maturity=idea
    def pay(): pass
    """
  When the workspace is loaded
  Then node "REQ-pay" has attribute maturity = "idea"
  And node "REQ-pay" has attribute stage = "idea"

Scenario: Annotated code is a code node linked to what it names; an is link declares its node when no spec does, and overrides nothing a spec says
  Given a file "specs/REQ-pay.md" containing:
    """
    ---
    id: REQ-pay
    ---
    # Pay
    """
  And a file "specs/ARCH-billing.md" containing:
    """
    ---
    id: ARCH-billing
    kind: element
    owner: payments
    ---
    # Billing
    """
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
    | id                          | kind        | title          | source                 |
    | REQ-pay                     | requirement | Pay            | specs/REQ-pay.md:1     |
    | ARCH-billing                | element     | Billing        | specs/ARCH-billing.md:1 |
    | code:src/billing.ts         | code        | src/billing.ts | src/billing.ts:1       |
    | code:src/billing.ts#Billing | code        | Billing        | src/billing.ts:3       |
    | code:src/ledger.ts#Ledger   | code        | Ledger         | src/ledger.ts:1        |
    | ARCH-ledger                 | element     | Ledger         | src/ledger.ts:1        |
  And the workspace graph has edges:
    | from                        | rel        | to           | attributes   |
    | code:src/billing.ts         | is         | ARCH-billing |              |
    | code:src/billing.ts#Billing | implements | REQ-pay      |              |
    | code:src/billing.ts#Billing | uses       | ARCH-ledger  | via="events" |
    | code:src/ledger.ts#Ledger   | is         | ARCH-ledger  |              |
  And node "ARCH-billing" has attribute owner = "payments"
  And node "ARCH-billing" has attribute tier = "1"
  And node "ARCH-ledger" has attribute declaredIn = "code"

Scenario: An id declared twice is an error; the first declaration is kept
  Given a file "specs/a.md" containing:
    """
    ---
    id: REQ-pay
    ---
    # Pay by card
    """
  And a file "specs/b.md" containing:
    """
    ---
    id: REQ-pay
    ---
    # Pay by wallet
    """
  And a file "specs/plan.md" containing:
    """
    ---
    id: PLAN
    nodes:
      - { id: REQ-pay, kind: requirement }
    ---
    # Plan
    """
  When the workspace is loaded
  Then node "REQ-pay" has attribute title = "Pay by card"
  And sdp reports:
    | rule         | severity | at              | message                          |
    | duplicate-id | error    | specs/b.md:1    | already declared at specs/a.md:1 |
    | duplicate-id | error    | specs/plan.md:4 | already declared at specs/a.md:1 |

Scenario: Unknown ids become missing nodes, with an error at every reference
  Given a file "specs/REQ-sync.md" containing:
    """
    ---
    id: REQ-sync
    links:
      depends-on: ARCH-queue
    nodes:
      - { id: ARCH-sync, kind: element, links: { uses: ARCH-clock } }
    ---
    # Sync

    Mirrors [[DEC-0042]].
    realized-by:: [[ARCH-worker]]
    """
  And a file "specs/REQ-backup.md" containing:
    """
    ---
    id: REQ-backup
    links:
      depends-on: ARCH-queue
    ---
    # Backup
    """
  And a file "src/sync.ts" containing:
    """
    // @sdp implements REQ-sink
    export function sync() {}
    """
  When the workspace is loaded
  Then sdp reports:
    | rule          | severity | at                    | message                                      |
    | dangling-link | error    | specs/REQ-backup.md:4 | REQ-backup -depends-on-> ARCH-queue          |
    | dangling-link | error    | specs/REQ-sync.md:4  | REQ-sync -depends-on-> ARCH-queue            |
    | dangling-link | error    | specs/REQ-sync.md:6  | ARCH-sync -uses-> ARCH-clock                 |
    | dangling-link | error    | specs/REQ-sync.md:10 | REQ-sync -mentions-> DEC-0042                |
    | dangling-link | error    | specs/REQ-sync.md:11 | REQ-sync -realized-by-> ARCH-worker          |
    | dangling-link | error    | src/sync.ts:1        | code:src/sync.ts#sync -implements-> REQ-sink |
  And the workspace graph has exactly these nodes:
    | id                    | kind        | source              |
    | REQ-backup            | requirement | specs/REQ-backup.md:1 |
    | REQ-sync              | requirement | specs/REQ-sync.md:1 |
    | ARCH-sync             | element     | specs/REQ-sync.md:6 |
    | code:src/sync.ts#sync | code        | src/sync.ts:1       |
    | ARCH-queue            | missing     |                     |
    | ARCH-clock            | missing     |                     |
    | DEC-0042              | missing     |                     |
    | ARCH-worker           | missing     |                     |
    | REQ-sink              | missing     |                     |
~~~
