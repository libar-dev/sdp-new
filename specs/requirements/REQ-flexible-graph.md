---
id: REQ-flexible-graph
kind: requirement
title: A free-form system graph
maturity: ready
iteration: I1
activity: { implementation: I1, test: I1 }
tags: [graph]
links:
  refines: CAP-living-specs
  realized-by: [ARCH-graph, ARCH-graph-builder, ARCH-code-annotations, ARCH-vocabulary]
  decided-by: [DEC-0002, DEC-0003, DEC-0010]
---

# A free-form system graph

The full state of the system — specs, scenarios, decisions, architecture, plan, code links — is
one graph. Node kinds, relation names and attributes are whatever the authors write
([[DEC-0002]]), so teams model what matters to them and agents can follow any edge; any word is
just a word, `constructor` included. The few words sdp itself interprets are named in its
vocabulary profile, and a workspace can rename them ([[ARCH-vocabulary]]). The graph is derived
from the files on every command ([[DEC-0003]]), and every node and edge records the `file:line` it
came from.

Authors link nodes where they write: in front matter (`links:`, or a key the vocabulary names as a
link, such as `iteration:`), in prose (`rel:: [[ID]]`), and in code (`annotate(…)` or
`@sdp <relation> <ID>`, [[ARCH-code-annotations]]). Whether a front matter key links depends on the
key, never on its value ([[DEC-0010]]), and a link is also an attribute of the node it starts
from. A plain `[[ID]]` in prose is a mention: it is recorded, but it is not a link. How each of
these becomes nodes and edges is the contract of [[ARCH-graph-builder]].

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

Scenario Outline: A link reads the same whichever way it is written
  Given a file "docs/plan.md" containing:
    """
    ---
    id: PLAN
    nodes:
      - { id: I1, kind: iteration }
      - { id: I2, kind: iteration }
    ---
    # Plan
    """
  And a file "specs/REQ-a.md" containing:
    """
    ---
    id: REQ-a
    <plan>
    ---
    # A
    """
  When I query "*[<key>=I1]"
  Then the result is "REQ-a"
  When I query "* ?-<key>-> #I1"
  Then the result is "REQ-a"

  Examples:
    | plan                                    | key                     |
    | iteration: I1                           | iteration               |
    | iteration: [I2, I1]                     | iteration               |
    | links: { iteration: I1 }                | iteration               |
    | links: { iteration: { to: I1, why: x } } | iteration              |
    | activity: { implementation: [I1] }      | activity.implementation |

Scenario: Any word is just a word
  Given a file "sdp.config.yaml" containing:
    """
    vocabulary: { maturity: [constructor, toString] }
    """
  And a file "specs/REQ-a.md" containing:
    """
    ---
    id: REQ-a
    kind: constructor
    maturity: toString
    ---
    # A
    """
  When the workspace is checked
  Then the check reports nothing
  And sdp status counts the stages "toString:1"
  When I query "constructor[maturity>constructor]"
  Then the result is "REQ-a"
  When I run "sdp new constructor 'Odd one'"
  Then the exit code is 0
~~~
