---
id: ARCH-graph-builder
kind: element
title: Graph builder
links:
  instance-of: { to: PAT-pipes-and-filters, role: filter }
  feeds: ARCH-graph
---

# Graph builder

Builds the system graph from what the workspace read — specs from [[ARCH-spec-parser]], annotations
from [[ARCH-code-annotations]] and the last scenario results — and from nothing else. It is pure
and runs on every command ([[PAT-derived-index]]). It never fails on content: problems become
diagnostics, and the graph stays complete enough to query them, with unresolved references visible
as nodes.

| Source | Becomes |
| --- | --- |
| a spec | A node of its kind at `file:1`, with its attributes and derived facts: `file`, `summary`, `scenarios`, `openQuestions` (unresolved only), and `verification` and `stage` from the results. |
| a scenario | A `scenario` node at its line that `-verifies->` its spec. |
| an inline node | A node at the line of its `id`; `declaredIn` names its spec and is an attribute, not an edge. |
| a link | An edge named by its relation, at the line of its target, with the link's attributes. |
| a prose link | `-mentions->`, or the typed relation; a spec mentioning itself adds nothing. |
| an attribute whose value is a node's id | An implicit edge named after the key, marked `implicit`. Values that are not ids stay values; `id`, `kind`, `title`, `summary`, `maturity`, `status`, `stage`, `verification`, `tags`, `file`, `type` and `declaredIn` never link. |
| an annotation | A `code` node for its symbol (`code:<file>#<symbol>`) or file (`code:<file>`), with an edge to each target carrying the annotation's attributes. |
| `@sdp is <ID>` | Anchors the node in code. Declares it (kind `element` unless given) when no spec does; otherwise adds only the attributes the spec does not set. |
| an id declared again | A `duplicate-id` error at the later declaration; the first, in path order, is kept. |
| a reference to an unknown id | A `missing` node without a source, and a `dangling-link` error at the reference. |

The configuration decides what is read: the spec, feature and code globs, and the id prefixes that
kinds are inferred from.

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
    | ARCH-cache           | speeds-up | REQ-pay | docs/plan.md:6      |               |
    | REQ-pay              | iteration | E1      | specs/REQ-pay.md:1  | implicit=true |
  And node "REQ-pay" has attribute file = "specs/REQ-pay.md"
  And node "REQ-pay" has attribute summary = "Shoppers pay by card."
  And node "REQ-pay" has attribute scenarios = "1"
  And node "REQ-pay" has attribute openQuestions = "1"
  And node "E1" has attribute declaredIn = "PLAN"
  And the workspace graph has no "declaredIn" edges

Scenario Outline: An attribute naming a node becomes an implicit edge
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
  Then the implicit edges are "<edges>"
  And building the graph reports nothing

  Examples:
    | attribute                 | edges                                               |
    | iteration: E1             | REQ-pay -iteration-> E1                             |
    | owners: [ARCH-orders, E1] | REQ-pay -owners-> ARCH-orders, REQ-pay -owners-> E1 |
    | owner: ARCH-unknown       | nothing                                             |
    | owner: REQ-pay            | nothing                                             |
    | status: E1                | nothing                                             |
    | tags: [E1]                | nothing                                             |

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

Scenario: Unknown ids become missing nodes, with an error at each reference
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
  And a file "src/sync.ts" containing:
    """
    // @sdp implements REQ-sink
    export function sync() {}
    """
  When the workspace is loaded
  Then building the graph reports:
    | rule          | severity | at                   | message                                      |
    | dangling-link | error    | specs/REQ-sync.md:4  | REQ-sync -depends-on-> ARCH-queue            |
    | dangling-link | error    | specs/REQ-sync.md:6  | ARCH-sync -uses-> ARCH-clock                 |
    | dangling-link | error    | specs/REQ-sync.md:10 | REQ-sync -mentions-> DEC-0042                |
    | dangling-link | error    | specs/REQ-sync.md:11 | REQ-sync -realized-by-> ARCH-worker          |
    | dangling-link | error    | src/sync.ts:1        | code:src/sync.ts#sync -implements-> REQ-sink |
  And the workspace graph has exactly these nodes:
    | id                    | kind        | source              |
    | REQ-sync              | requirement | specs/REQ-sync.md:1 |
    | ARCH-sync             | element     | specs/REQ-sync.md:6 |
    | code:src/sync.ts#sync | code        | src/sync.ts:1       |
    | ARCH-queue            | missing     |                     |
    | ARCH-clock            | missing     |                     |
    | DEC-0042              | missing     |                     |
    | ARCH-worker           | missing     |                     |
    | REQ-sink              | missing     |                     |

Scenario: The configuration selects the spec files and the id prefixes
  Given a file "sdp.config.yaml" containing:
    """
    specs: ["product/**/*.md"]
    ids: { requirement: STORY }
    """
  And a file "product/STORY-12.md" containing:
    """
    ---
    id: STORY-12
    ---
    # Saved carts
    """
  And a file "notes/REQ-old.md" containing:
    """
    ---
    id: REQ-old
    ---
    # Not selected
    """
  When the workspace is loaded
  Then the workspace graph has exactly these nodes:
    | id       | kind        |
    | STORY-12 | requirement |
~~~
