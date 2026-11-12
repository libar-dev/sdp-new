@id=see-the-architecture @maturity=ready
@realized-by:ARCH-architecture-view @realized-by:ARCH-reports
Feature: See the architecture

  Architects, and anyone designing a change, person or agent, need the few elements and patterns
  that shape the system, the decisions and quality requirements around them and the code that is
  each of them, in one view: `sdp arch`, or the MCP tool `sdp_architecture`.

  Not a discovery of the architecture: sdp never judges what belongs in it. Nor are quality
  requirements a document apart: they are specs, and their scenarios run with the rest.

  Background:
    Given these specs:
      | tags                                                                                       | Feature                                 |
      | @id=ARCH-orders @decided-by:DEC-outbox @instance-of:PAT-outbox @constrained-by:NFR-latency | Orders                                  |
      | @id=PAT-outbox                                                                             | Transactional outbox                    |
      | @id=DEC-outbox                                                                             | Orders publish events through an outbox |
      | @id=DEC-json-logs                                                                          | Logs are JSON                           |
      | @id=NFR-latency                                                                            | Order latency                           |
      | @id=REQ-receipts @realized-by:ARCH-orders                                                  | Receipts                                |
    And a file "specs/ARCH-billing.feature" containing:
      """
      @id=ARCH-billing
      Feature: Billing

        Owns invoices; tax rules are regulated and costly to change. It writes logs as DEC-json-logs says.
      """
    And a file "src/mailer.ts" containing:
      """
      import { annotate } from "sdp/annotations"

      /** Sends receipts, and retries while the provider is down. */
      export class Mailer {}
      export class MailTemplates {}
      annotate(Mailer, { is: "ARCH-mailer" })
      """

  Rule: The architecture is every element and pattern declared in a spec or anchored in code, with the decisions and quality requirements linked to it, and nothing else

    Which few parts are significant — they carry quality attributes, are costly to change or
    constrain many others — is a judgement, not a metric of the code, and a list of every
    abstraction buries them. A decision only named in a description is not linked.

    Scenario: Elements and patterns from specs and code, with the decisions and quality requirements linked to them
      When I run "sdp arch --json"
      Then the exit code is 0
      And the JSON output has:
        | data.architecture | ARCH-billing, ARCH-mailer, ARCH-orders, PAT-outbox |
        | data.drivers      | DEC-outbox, NFR-latency                            |
        | data.anchors      | code:src/mailer.ts#Mailer                          |

  Rule: Each element is shown with what it is for, from its spec or else from the doc comment of its code, and with its links

    Scenario: One element described by its spec, one by its code, one by its links alone
      When I run "sdp arch"
      Then the exit code is 0
      And the output contains:
        """
        Architecture: 4 node(s) of the kinds element, pattern

        ARCH-billing — Billing (element)
        Owns invoices; tax rules are regulated and costly to change. It writes logs as DEC-json-logs says.

        ARCH-orders — Orders (element)
        ARCH-orders -decided-by-> DEC-outbox  Orders publish events through an outbox
        ARCH-orders -instance-of-> PAT-outbox  Transactional outbox
        ARCH-orders -constrained-by-> NFR-latency  Order latency

        PAT-outbox — Transactional outbox (pattern)
        PAT-outbox <-instance-of- ARCH-orders  Orders

        ARCH-mailer — ARCH-mailer (element)
        Sends receipts, and retries while the provider is down.
        ARCH-mailer <-is- code:src/mailer.ts#Mailer  Mailer
        """

  Rule: The architecture and its links can be drawn as a Mermaid flowchart

    Scenario: The flowchart of the architecture
      When I run "sdp arch --mermaid"
      Then the exit code is 0
      And the output contains "flowchart LR"
      And the output contains "-->|decided-by|"

  Rule: A quality requirement, of kind nfr or of any kind whose type says so, is shown beside what it constrains

    A team writes a quality requirement in whatever kind it writes the others in, a story or a
    requirement, so its type marks it as well as the kind nfr does.

    Scenario Outline: Marked by its kind or by its type
      Given these specs:
        | tags                                   | Feature               |
        | @id=ARCH-search @constrained-by:Q-fast | Search                |
        | @id=Q-fast <marker>                    | Results within 200 ms |
      When I ask for the architecture view
      Then the output contains "ARCH-search -constrained-by-> Q-fast"

      Examples:
        | marker                          |
        | @kind=nfr                       |
        | @kind=requirement @type=quality |
        | @kind=story @type=constraint    |

  Rule: What belongs in the architecture is never checked

    Declaring it is the architect's call, not a rule sdp can hold anyone to.

    Scenario: An element without links or code, and a decision nothing links to
      When the workspace is checked
      Then sdp reports nothing
