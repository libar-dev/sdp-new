@id=REQ-curated-architecture @maturity=ready @architecture
@refines:CAP-curated-architecture @realized-by:ARCH-architecture-view @decided-by:DEC-0008
@iteration:I1 @activity.implementation:I1 @activity.test:I1
Feature: Curated architecture

  Most abstractions in a codebase — classes, modules, functions — are design detail. A small share
  carry quality attributes, are expensive to change, or constrain many other parts; those are the
  architecture, and listing everything else next to them buries them. So the graph holds only what
  an architect declared, and `sdp arch`, the context bundle and the MCP tool show exactly that.

  Background:
    Given these specs:
      | tags                                                                                  | Feature                                 |
      | @id=ARCH-orders @decided-by:DEC-1 @instance-of:PAT-outbox @constrained-by:NFR-latency | Orders                                  |
      | @id=ARCH-mailer                                                                       | Mailer                                  |
      | @id=PAT-outbox                                                                        | Transactional outbox                    |
      | @id=DEC-1                                                                             | Orders publish events through an outbox |
      | @id=DEC-2                                                                             | Logs are JSON                           |
      | @id=NFR-latency                                                                       | Checkout latency                        |
      | @id=REQ-receipts @realized-by:ARCH-orders                                             | Receipts                                |
    And a file "specs/ARCH-billing.feature" containing:
      """
      @id=ARCH-billing
      Feature: Billing

        Owns invoices; tax rules are regulated and costly to change. It writes logs as DEC-2 says.
      """

  Rule: The architecture is every element and pattern declared in a spec or anchored in code, and nothing else

    Scenario: Every declared element and pattern, with its links
      When I ask for the architecture view
      Then the output contains "ARCH-orders — Orders (element)"
      And the output contains "ARCH-mailer — Mailer (element)"
      And the output contains "ARCH-billing — Billing (element)"
      And the output contains "PAT-outbox — Transactional outbox (pattern)"
      And the output contains "ARCH-orders -instance-of-> PAT-outbox"
      And the output contains "ARCH-orders -decided-by-> DEC-1"
      And the output contains "ARCH-orders -constrained-by-> NFR-latency"
      And the output does not contain "REQ-receipts"

    Scenario: An element anchored in code, without a spec
      Given a file "src/quiet.ts" containing:
        """
        // @sdp is ARCH-quiet
        export class Quiet {}
        """
      When I ask for the architecture view
      Then the output contains "ARCH-quiet — ARCH-quiet (element)"
      And the output contains "ARCH-quiet <-is- code:src/quiet.ts#Quiet"

    Scenario: Code nobody anchored stays out, however much of it there is
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

  Rule: An element is described by its spec, or else by the doc comment of the code anchored to it

    Scenario: One element described by its spec, one by its code
      Given a file "src/mailer.ts" containing:
        """
        import { annotate } from "sdp/annotations"

        /** Sends receipts, and retries while the provider is down. */
        export class Mailer {}
        annotate(Mailer, { is: "ARCH-mailer" })
        """
      When I ask for the architecture view
      Then the output contains:
        """
        ARCH-billing — Billing (element)
        Owns invoices; tax rules are regulated and costly to change. It writes logs as DEC-2 says.
        """
      And the output contains:
        """
        ARCH-mailer — Mailer (element)
        Sends receipts, and retries while the provider is down.
        """
      When an agent calls the MCP tool "sdp_architecture" with:
        """
        { "json": true }
        """
      Then the JSON output has:
        | data.anchors | code:src/mailer.ts#Mailer |

  Rule: A decision or a quality requirement is part of the view when a link joins it to the architecture

    Scenario: A decision only named in a description is left out
      When an agent calls the MCP tool "sdp_architecture" with:
        """
        { "json": true }
        """
      Then the JSON output has:
        | data.architecture | ARCH-billing, ARCH-mailer, ARCH-orders, PAT-outbox |
        | data.drivers      | DEC-1, NFR-latency                                 |

  Rule: What belongs in the architecture is never checked

    Scenario: An element without links or code, and a decision nothing links to
      When the workspace is checked
      Then sdp reports nothing
