---
id: REQ-flexible-graph
kind: requirement
title: A free-form system graph
maturity: ready
iteration: E1
tags: [graph]
links:
  refines: CAP-curated-architecture
  realized-by: [ARCH-graph, ARCH-graph-builder]
  decided-by: [DEC-0002, DEC-0003]
---

# A free-form system graph

The full state of the system — specs, scenarios, decisions, architecture, plan, code links — is
one graph. Node kinds and relation names are whatever the authors write ([[DEC-0002]]); the tool
attaches no meaning to a fixed vocabulary, so teams model what matters to them and agents can
follow any edge. The graph is derived from the files on every command ([[DEC-0003]]), and every
node and edge records the `file:line` it came from.

| Source | Becomes |
| --- | --- |
| a Markdown file with `id` in its front matter | a node; the other front matter keys are its attributes |
| an entry of a `nodes:` list in front matter | an inline node, for things too small for a file of their own (phases, iterations, terms) |
| `links: { uses: ARCH-x }` in front matter | an edge named by its key, `-uses->`, optionally with attributes (`{ to: ARCH-x, note: … }`) |
| an attribute whose value is a node id (`iteration: E2`) | an implicit edge named after the key, `-iteration->` |
| `[[DEC-0001]]` in prose | a `-mentions->` edge |
| `realized-by:: [[ARCH-x]]` in prose | an edge named by the prefix, `-realized-by->` |
| each Gherkin scenario | a `scenario` node with `-verifies->` to its spec |
| `@sdp implements REQ-x` in a code comment | a `code` node for the declaration below it (or the file) with `-implements->` to the id |
| `@sdp is ARCH-x key=value` in a code comment | the code anchors that node, and declares it if no spec does |
| a reference to an unknown id | a `missing` node and a `dangling-link` error |

## Scenarios

~~~gherkin
Scenario: Relations are named by their author
  Given a file "docs/ARCH-orders.md" containing:
    """
    ---
    id: ARCH-orders
    kind: element
    links:
      publishes-to: ARCH-event-bus
      guarded-by: { to: DEC-0001, since: "2026-03" }
    ---
    # Orders
    """
  And a file "docs/ARCH-event-bus.md" containing:
    """
    ---
    id: ARCH-event-bus
    kind: element
    ---
    # Event bus
    """
  And a file "docs/DEC-0001.md" containing:
    """
    ---
    id: DEC-0001
    kind: decision
    status: accepted
    ---
    # Events over calls
    """
  When the workspace is loaded
  Then there is an edge "ARCH-orders" -publishes-to-> "ARCH-event-bus"
  And there is an edge "ARCH-orders" -guarded-by-> "DEC-0001"

Scenario: Attributes that name a node become edges
  Given a file "plan.md" containing:
    """
    ---
    id: PLAN
    kind: plan
    nodes:
      - { id: E2, kind: iteration }
    ---
    # Plan
    """
  And a file "specs/REQ-export.md" containing:
    """
    ---
    id: REQ-export
    maturity: idea
    iteration: E2
    ---
    # Export
    """
  When the workspace is loaded
  Then the workspace graph has node "E2" of kind "iteration"
  And there is an edge "REQ-export" -iteration-> "E2"

Scenario: Prose links, plain and typed
  Given a file "specs/REQ-refunds.md" containing:
    """
    ---
    id: REQ-refunds
    maturity: draft
    ---
    # Refunds

    Follows the policy in [[DEC-0001]].

    realized-by:: [[ARCH-orders]]
    """
  And a file "docs/ARCH-orders.md" containing:
    """
    ---
    id: ARCH-orders
    kind: element
    ---
    # Orders
    """
  And a file "docs/DEC-0001.md" containing:
    """
    ---
    id: DEC-0001
    kind: decision
    status: accepted
    ---
    # Refund policy
    """
  When the workspace is loaded
  Then there is an edge "REQ-refunds" -mentions-> "DEC-0001"
  And there is an edge "REQ-refunds" -realized-by-> "ARCH-orders"

Scenario: Code comments link code into the graph
  Given a file "specs/REQ-checkout.md" containing:
    """
    ---
    id: REQ-checkout
    maturity: idea
    ---
    # Checkout
    """
  And a file "src/orders/OrderService.ts" containing:
    """
    // @sdp implements REQ-checkout
    export class OrderService {}
    """
  When the workspace is loaded
  Then the workspace graph has node "code:src/orders/OrderService.ts#OrderService" of kind "code"
  And there is an edge "code:src/orders/OrderService.ts#OrderService" -implements-> "REQ-checkout"

Scenario: Code can declare an architectural element
  Given a file "src/billing.ts" containing:
    """
    // @sdp is ARCH-billing kind=element title="Billing engine"
    export class Billing {}
    """
  When the workspace is loaded
  Then the workspace graph has node "ARCH-billing" of kind "element"
  And node "ARCH-billing" has attribute title = "Billing engine"
  And there is an edge "code:src/billing.ts#Billing" -is-> "ARCH-billing"

Scenario: Unresolved references stay visible and fixable
  Given a file "specs/REQ-sync.md" containing:
    """
    ---
    id: REQ-sync
    maturity: idea
    links:
      depends-on: ARCH-ghost
    ---
    # Sync
    """
  When the workspace is checked
  Then the check reports "dangling-link" for "REQ-sync"
  And the workspace graph has node "ARCH-ghost" of kind "missing"
~~~
