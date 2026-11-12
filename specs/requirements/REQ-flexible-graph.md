---
id: REQ-flexible-graph
kind: requirement
title: A free-form system graph
maturity: ready
iteration: I1
tags: [graph]
links:
  refines: CAP-living-specs
  realized-by: [ARCH-graph, ARCH-graph-builder, ARCH-code-annotations]
  decided-by: [DEC-0002, DEC-0003]
---

# A free-form system graph

The full state of the system — specs, scenarios, decisions, architecture, plan, code links — is
one graph. Node kinds and relation names are whatever the authors write ([[DEC-0002]]); the tool
attaches no meaning to a fixed vocabulary, so teams model what matters to them and agents can
follow any edge. The graph is derived from the files on every command ([[DEC-0003]]), and every
node and edge records the `file:line` it came from.

Authors link nodes where they write: in front matter (`links:`, or an attribute whose value is a
node id), in prose (`[[ID]]`, or `rel:: [[ID]]` to name the relation), and in code comments
(`@sdp <relation> <ID>`, [[ARCH-code-annotations]]). How each of these becomes nodes and edges is
the contract of [[ARCH-graph-builder]].

## Scenarios

~~~gherkin
Scenario: Kinds and relations are named by their author
  Given a file "docs/ARCH-orders.md" containing:
    """
    ---
    id: ARCH-orders
    kind: bounded-context
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
  Then the workspace graph has node "ARCH-orders" of kind "bounded-context"
  And there is an edge "ARCH-orders" -publishes-to-> "ARCH-event-bus"
  And there is an edge "ARCH-orders" -guarded-by-> "DEC-0001"

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
~~~
