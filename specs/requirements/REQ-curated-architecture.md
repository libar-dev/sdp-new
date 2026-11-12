---
id: REQ-curated-architecture
kind: requirement
title: Curated architecture
maturity: ready
iteration: I1
activity: { implementation: I1, test: I1 }
tags: [architecture]
links:
  refines: CAP-curated-architecture
  realized-by: ARCH-architecture-view
  decided-by: DEC-0008
---

# Curated architecture

Most abstractions in a codebase — classes, modules, functions — are design detail. A small share
carry quality attributes, are expensive to change, or constrain many other parts; those are the
architecture, and listing everything else next to them buries them. So the graph holds only what
an architect declared, and `sdp arch`, the context bundle and the MCP tool show exactly that.

## Scenarios

~~~gherkin
Background:
  Given a file "specs/architecture.md" containing:
    """
    ---
    id: ARCH-VIEW
    kind: view
    nodes:
      - { id: ARCH-orders, kind: element, title: Orders, links: { decided-by: DEC-1, instance-of: PAT-outbox, constrained-by: NFR-latency } }
      - { id: ARCH-mailer, kind: element, title: Mailer }
      - { id: PAT-outbox, kind: pattern, title: Transactional outbox }
      - { id: DEC-1, kind: decision, title: Orders publish events through an outbox }
      - { id: DEC-2, kind: decision, title: Logs are JSON }
      - { id: NFR-latency, kind: nfr, title: Checkout latency }
      - { id: REQ-receipts, kind: requirement, maturity: idea, links: { realized-by: [ARCH-orders, ARCH-mailer] } }
    ---
    # Architecture
    """
  And a file "specs/ARCH-billing.md" containing:
    """
    ---
    id: ARCH-billing
    kind: element
    title: Billing
    ---
    # Billing

    Owns invoices; tax rules are regulated and costly to change.

    It writes logs, as [[DEC-2]] says.
    """

Scenario: The view is every declared element and pattern, each with what it is for and its links
  When I ask for the architecture view
  Then the output contains "ARCH-orders — Orders (element)"
  And the output contains "ARCH-mailer — Mailer (element)"
  And the output contains "PAT-outbox — Transactional outbox (pattern)"
  And the output contains "ARCH-orders -instance-of-> PAT-outbox"
  And the output contains "ARCH-orders -decided-by-> DEC-1"
  And the output contains "ARCH-orders -constrained-by-> NFR-latency"
  And the line after the output line with "ARCH-billing — Billing (element)" contains "Owns invoices; tax rules are regulated and costly to change."
  And the output does not contain "REQ-receipts"

Scenario: A decision or quality requirement is shown when a link joins it to the architecture; a mention is no link
  When an agent calls the MCP tool "sdp_architecture" with:
    """
    { "json": true }
    """
  Then the JSON output has:
    | data.architecture | ARCH-billing, ARCH-mailer, ARCH-orders, PAT-outbox |
    | data.drivers      | DEC-1, NFR-latency                                 |

Scenario: An element anchored in code is part of the architecture, with or without a spec
  Given a file "src/quiet.ts" containing:
    """
    // @sdp is ARCH-quiet
    export class Quiet {}
    """
  When I ask for the architecture view
  Then the output contains "ARCH-quiet — ARCH-quiet (element)"
  And the output contains "ARCH-quiet <-is- code:src/quiet.ts#Quiet"

Scenario: An element declared without a description is described by the code anchored to it
  Given a file "src/mailer.ts" containing:
    """
    import { annotate } from "sdp/annotations"

    /** Sends receipts, and retries while the provider is down. */
    export class Mailer {}
    annotate(Mailer, { is: "ARCH-mailer" })
    """
  When I ask for the architecture view
  Then the line after the output line with "ARCH-mailer — Mailer (element)" contains "Sends receipts, and retries while the provider is down."
  When an agent calls the MCP tool "sdp_architecture" with:
    """
    { "json": true }
    """
  Then the JSON output has:
    | data.anchors | code:src/mailer.ts#Mailer |

Scenario: However much code there is, the architecture is what an architect declared or anchored
  Given a file "src/orders.ts" containing:
    """
    import { annotate } from "sdp/annotations"
    export class Orders {}
    export class OrderMapper {}
    export class OrderValidator {}
    annotate(Orders, { is: "ARCH-orders" })
    """
  When I query "element|pattern"
  Then the result is "ARCH-billing, ARCH-mailer, ARCH-orders, PAT-outbox"

Scenario: What belongs in the architecture is never checked
  When the workspace is checked
  Then the check reports nothing
~~~
