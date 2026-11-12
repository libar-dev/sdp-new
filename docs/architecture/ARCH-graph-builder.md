---
id: ARCH-graph-builder
kind: element
title: Graph builder
links:
  decided-by: [DEC-0003, DEC-0010]
  instance-of: { to: PAT-pipes-and-filters, role: filter }
  uses: [ARCH-spec-parser, ARCH-code-annotations, ARCH-graph, ARCH-vocabulary]
---

# Graph builder

Builds the system graph from what the workspace read — specs from [[ARCH-spec-parser]], annotations
from [[ARCH-code-annotations]] and the last scenario results — and from nothing else. It is pure
and runs on every command ([[PAT-derived-index]]). It never fails on content: problems become
diagnostics, and the graph stays complete enough to query them, with unresolved references visible
as nodes. The words it interprets come from the vocabulary profile ([[ARCH-vocabulary]]).

| Source | Becomes |
| --- | --- |
| a spec | A node of its kind at `file:1`, with its attributes and derived facts: `file`, `summary`, `scenarios`, `openQuestions` (unresolved only), and `verification` and `stage` from the results. |
| a scenario | A `scenario` node at its line that `-verifies->` its spec. |
| an inline node | A node at the line of its `id`; `declaredIn` names its spec and is an attribute, not an edge. |
| a link key: an entry of `links:`, a plan or phase relation, an entry of `activity`, a key under `vocabulary.links` | An edge named by its relation (`activity.implementation` for an entry of `activity`), at the line of its target, with the link's attributes ([[DEC-0010]]). Every other key is a value and never links. |
| a link named like an attribute: one of `stage`, `verification`, `scenarios`, `summary`, `file`, `openQuestions`, `declaredIn`, `maturity`, `status`, or an attribute the node it starts from has | A `link-syntax` error where it is written, and no edge: a link reads as an attribute of its node, so it would pass for that fact. In front matter, in prose (`stage:: [[ID]]`) and in code alike. |
| a prose link | `-mentions->`, or the typed relation. A spec mentioning itself, or a node a link already joins it to, adds nothing. |
| an annotation | A `code` node for its symbol (`code:<file>#<symbol>`) or file (`code:<file>`) — at the declaration's line, with its JSDoc as `doc` for typed annotations — with an edge to each target carrying the annotation's attributes. |
| `@sdp is <ID>` | Anchors the node in code. Declares it (kind `element` unless given) when no spec does; otherwise adds only the attributes the spec does not set. Either way the node's stage follows from all its attributes, a `maturity` given in code included. |
| a link stated more than once | One edge with every declaration (`sources`) and the union of their attributes; declarations that give an attribute different values are a `link-conflict`. |
| a derived attribute written by an author, or a kind sdp makes itself (`scenario`, `code`, `missing`) | A `derived-attribute` error where it is written; the value is ignored, on a spec, an inline node or a node declared in code alike. |
| an id declared again | A `duplicate-id` error at the later declaration; the first, in path order, is kept. |
| a reference to an unknown id | A `missing` node without a source, and a `dangling-link` error at every reference. |

What is read, and the id prefixes that kinds are inferred from, is configured
([[REQ-configuration]]).

Code: `src/graph/Build.ts`.

## Scenarios

~~~gherkin
Scenario: Specs, scenarios and inline nodes become nodes at their lines
  Given a file "docs/plan.md" containing:
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
    | PLAN                 | plan        | docs/plan.md:1      |
    | E1                   | iteration   | docs/plan.md:5      |
    | ARCH-cache           | element     | docs/plan.md:6      |
    | REQ-pay              | requirement | specs/REQ-pay.md:1  |
    | REQ-pay#card-payment | scenario    | specs/REQ-pay.md:15 |
  And the workspace graph has edges:
    | from                 | rel       | to      | source              | attributes    |
    | REQ-pay#card-payment | verifies  | REQ-pay | specs/REQ-pay.md:15 |               |
    | ARCH-cache           | speeds-up | REQ-pay | docs/plan.md:7      |               |
    | REQ-pay              | iteration | E1      | specs/REQ-pay.md:4  |               |
  And node "REQ-pay" has attribute file = "specs/REQ-pay.md"
  And node "REQ-pay" has attribute summary = "Shoppers pay by card."
  And node "REQ-pay" has attribute scenarios = "1"
  And node "REQ-pay" has attribute openQuestions = "1"
  And node "E1" has attribute declaredIn = "PLAN"
  And the workspace graph has no "declaredIn" edges

Scenario Outline: A key links or it does not, whatever its value
  Given a file "docs/model.md" containing:
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
  And building the graph reports "<reported>"

  Examples:
    | attribute                                                 | edges                                                                                                   | reported      |
    | iteration: E1                                             | REQ-pay -iteration-> E1                                                                                 | nothing       |
    | iteration: E9                                             | REQ-pay -iteration-> E9                                                                                 | dangling-link |
    | links: { owner: ARCH-orders }                             | REQ-pay -owner-> ARCH-orders                                                                            | nothing       |
    | owner: ARCH-orders                                        | nothing                                                                                                 | nothing       |
    | status: E1                                                | nothing                                                                                                 | nothing       |
    | activity: { implementation: E1, test: [E1, ARCH-orders] } | REQ-pay -activity.implementation-> E1, REQ-pay -activity.test-> ARCH-orders, REQ-pay -activity.test-> E1 | nothing       |
    | activity: { test: [] }                                    | nothing                                                                                                 | nothing       |

Scenario: A link stated twice is one edge that keeps both declarations
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
  And a file "docs/plan.md" containing:
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
  And building the graph reports:
    | rule          | at               | message                                            |
    | link-conflict | specs/REQ-a.md:5 | why is "promised" here but "planned" at specs/REQ-a.md:4 |

Scenario: A mention adds nothing between nodes a link already joins
  Given a file "specs/REQ-a.md" containing:
    """
    ---
    id: REQ-a
    links:
      decided-by: DEC-1
    ---
    # A

    Follows [[DEC-1]], weighs [[RISK-1]] and keeps [[DEC-2]] in mind.
    """
  And a file "docs/model.md" containing:
    """
    ---
    id: MODEL
    nodes:
      - { id: DEC-1, kind: decision, status: accepted }
      - { id: DEC-2, kind: decision, status: accepted }
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
  Then building the graph reports:
    | rule              | at   | message                                         |
    | derived-attribute | <at> | stage is derived by sdp, so the value written here is ignored |
  When I query "*[stage=verified]"
  Then the result is "nothing"

  Examples:
    | file              | content                                                                       | at                  |
    | specs/REQ-a.md    | ---\nid: REQ-a\nmaturity: idea\nstage: verified\n---\n# A                   | specs/REQ-a.md:4    |
    | docs/plan.md      | ---\nid: PLAN\nnodes:\n  - { id: REQ-b, kind: requirement, stage: verified }\n---\n# Plan | docs/plan.md:4      |
    | src/pay.py        | # @sdp is REQ-pay kind=requirement stage=verified\ndef pay(): pass               | src/pay.py:1        |
    | specs/pay.feature | @id:REQ-f @stage:verified\nFeature: Pay                                         | specs/pay.feature:1 |

Scenario Outline: A link cannot take the name of an attribute, wherever it is declared
  Given a file "docs/model.md" containing:
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
  Then building the graph reports:
    | rule        | severity | at   | message   |
    | link-syntax | error    | <at> | <message> |
  And the workspace graph has no "<name>" edges
  When I query "*[<name>=verified]"
  Then the result is "nothing"

  Examples:
    | file           | content                                                                | at               | name     | message                           |
    | specs/REQ-a.md | ---\nid: REQ-a\nlinks: { stage: verified }\n---\n# A                   | specs/REQ-a.md:3 | stage    | no link can be named stage        |
    | specs/REQ-a.md | ---\nid: REQ-a\nnodes:\n  - id: REQ-b\n    links:\n      verification: verified\n---\n# A | specs/REQ-a.md:6 | verification | no link can be named verification |
    | specs/REQ-a.md | ---\nid: REQ-a\n---\n# A\n\nmaturity:: [[verified]]                     | specs/REQ-a.md:6 | maturity | no link can be named maturity     |
    | src/a.py       | # @sdp status verified\ndef a(): pass                                  | src/a.py:1       | status   | no link can be named status       |
    | specs/REQ-a.md | ---\nid: REQ-a\nowner: payments\nlinks: { owner: verified }\n---\n# A   | specs/REQ-a.md:4 | owner    | owner is an attribute of REQ-a    |

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
  Then building the graph reports:
    | rule              | at               | message                                    |
    | derived-attribute | specs/REQ-a.md:3 | sdp makes the nodes of kind missing itself  |
    | derived-attribute | specs/REQ-a.md:6 | sdp makes the nodes of kind scenario itself |
    | derived-attribute | src/pay.py:1     | sdp makes the nodes of kind code itself     |
  And the workspace graph has node "REQ-a" of kind "requirement"
  And the workspace graph has node "REQ-b" of kind "requirement"
  And the workspace graph has node "REQ-pay" of kind "element"
  And the check reports "maturity-criteria" for "REQ-a"

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

Scenario: Annotated code becomes code nodes linked to what it names
  Given a file "specs/REQ-pay.md" containing:
    """
    ---
    id: REQ-pay
    ---
    # Pay
    """
  And a file "docs/ARCH-billing.md" containing:
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
    | ARCH-billing                | element     | Billing        | docs/ARCH-billing.md:1 |
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
  And building the graph reports:
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
  Then building the graph reports:
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
