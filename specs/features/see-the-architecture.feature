@id=see-the-architecture @maturity=ready
@realized-by:ARCH-architecture-view @realized-by:ARCH-reports @realized-by:ARCH-graph-builder @realized-by:ARCH-code-annotations
Feature: See the architecture

  Architects, and anyone designing a change, person or agent, need the few elements and patterns
  that shape the system, the decisions and quality requirements around them, the code that is
  each of them and which of them it calls, in one view: `sdp arch`, or the MCP tool
  `sdp_architecture`.

  Not a discovery of the architecture: sdp never judges what belongs in it. Nor are quality
  requirements a document apart: they are specs, and their scenarios run with the rest.

  Background:
    Given these specs:
      | tags                                                                                                       | Feature                                 |
      | @id=ARCH-orders @decided-by:publish-through-an-outbox @instance-of:PAT-outbox @constrained-by:order-latency | Orders                                  |
      | @id=PAT-outbox                                                                                             | Transactional outbox                    |
      | @id=publish-through-an-outbox @kind=decision                                                               | Orders publish events through an outbox |
      | @id=json-logs @kind=decision                                                                               | Logs are JSON                           |
      | @id=order-latency @kind=nfr                                                                                | Order latency                           |
      | @id=numbered-receipts @kind=decision                                                                       | Receipts are numbered without gaps      |
      | @id=refunds @depends-on:receipts @decided-by:credit-notes                                                  | Refunds                                 |
      | @id=credit-notes @kind=decision                                                                            | A refund is a credit note               |
    And a file "specs/receipts.feature" containing:
      """
      @id=receipts @realized-by:ARCH-orders
      Feature: Receipts

        @decided-by:numbered-receipts
        Rule: Every receipt is numbered

        @type=quality
        Rule: A receipt is sent within a minute
      """
    And a file "specs/ARCH-billing.feature" containing:
      """
      @id=ARCH-billing
      Feature: Billing

        Owns invoices; tax rules are regulated and costly to change. It writes logs as json-logs says.
      """
    And a file "src/mailer.ts" containing:
      """
      import { annotate } from "sdp/annotations"

      /** Sends receipts, and retries while the provider is down. */
      export class Mailer {}
      export class MailTemplates {}
      annotate(Mailer, { is: "ARCH-mailer" })
      """
    And a file "src/orders.ts" containing:
      """
      import { annotate } from "sdp/annotations"
      import { Mailer } from "./mailer.ts"

      export const place = () => new Mailer()
      annotate(place, { is: "ARCH-orders" })
      """

  Rule: The architecture is every element and pattern declared in a spec or anchored in code, with the decisions and quality requirements linked to it, to a feature linked to it or to a rule of that feature, and nothing else

    Which few parts are significant — they carry quality attributes, are costly to change or
    constrain many others — is a judgement, not a metric of the code, and a list of every
    abstraction buries them. A feature names the elements that realize it, and a rule the
    decision it rests on: what shaped the feature shaped them, and the view gives the route. A
    decision only named in a description is not linked, and one linked further away — to a
    feature that depends on that one — shaped that other feature, not the element.

    Scenario: Elements and patterns from specs and code, with the decisions and quality requirements that shaped them, and the links among them
      When I run "sdp arch --json"
      Then the exit code is 0
      And the JSON output has:
        | data.architecture          | ARCH-billing, ARCH-mailer, ARCH-orders, PAT-outbox                                                                 |
        | data.drivers               | publish-through-an-outbox, order-latency, receipts#a-receipt-is-sent-within-a-minute, numbered-receipts            |
        | data.drivers.through.nodes | ARCH-orders, receipts, receipts#a-receipt-is-sent-within-a-minute, ARCH-orders, receipts, receipts#every-receipt-is-numbered, numbered-receipts |
        | data.anchors               | code:src/mailer.ts#Mailer, code:src/orders.ts#place                                                                |
        | data.edges.rel             | constrained-by, decided-by, imports, instance-of, is, is                                                           |

  Rule: Each element is shown with what it is for, from its spec or else from the doc comment of its code, and with its links

    An element declared by its code alone has no title of its own, so it is named by its id alone.

    Scenario: One element described by its spec, one by its code, one by its links alone
      When I run "sdp arch"
      Then the exit code is 0
      And the output contains:
        """
        Architecture: 4 node(s) of the kinds element, pattern

        ARCH-billing — Billing (element)
        Owns invoices; tax rules are regulated and costly to change. It writes logs as json-logs says.

        ARCH-orders — Orders (element)
        ARCH-orders -decided-by-> publish-through-an-outbox  Orders publish events through an outbox
        ARCH-orders -instance-of-> PAT-outbox  Transactional outbox
        ARCH-orders -constrained-by-> order-latency  Order latency
        ARCH-orders -imports-> ARCH-mailer
        ARCH-orders <-is- code:src/orders.ts#place  place
        receipts#a-receipt-is-sent-within-a-minute, through receipts  A receipt is sent within a minute
        numbered-receipts, through receipts  Receipts are numbered without gaps

        PAT-outbox — Transactional outbox (pattern)
        PAT-outbox <-instance-of- ARCH-orders  Orders

        ARCH-mailer (element)
        Sends receipts, and retries while the provider is down.
        ARCH-mailer <-imports- ARCH-orders  Orders
        ARCH-mailer <-is- code:src/mailer.ts#Mailer  Mailer
        """
      And the output does not contain "ARCH-mailer — ARCH-mailer"
      And the output does not contain "ARCH-mailer  ARCH-mailer"

    Scenario: An element anchored in two places is described by each, in the order of their files
      Given a file "src/outbox.ts" containing:
        """
        import { annotate } from "sdp/annotations"

        /** Keeps each receipt until the provider has taken it. */
        export const outbox = new Set<string>()
        annotate(outbox, { is: "ARCH-mailer" })
        """
      When I run "sdp arch"
      Then the exit code is 0
      And the output contains:
        """
        ARCH-mailer (element)
        Sends receipts, and retries while the provider is down.
        Keeps each receipt until the provider has taken it.
        """

  Rule: sdp derives which element imports which from the code

    An element imports another when a module anchored to it imports a function, a class or a
    constant from a module anchored to the other; an import of types alone calls no code of it.
    Derived, the dependencies cannot drift from the code, and none is written by hand (link-specs).
    Only TypeScript and JavaScript are read for imports: code in any other language imports no
    element.

    Scenario Outline: The billing module imports from the mailer's module
      Given a file "src/billing.ts" containing:
        """
        import { annotate } from "sdp/annotations"
        <import>

        export const bill = () => 0
        annotate(bill, { is: "ARCH-billing" })
        """
      When I query "#ARCH-billing -imports-> *"
      Then the result is "<imports>"

      Examples:
        | import                                          | imports     |
        | import { Mailer } from "./mailer.ts"            | ARCH-mailer |
        | import { Mailer } from "./mailer.js"            | ARCH-mailer |
        | import { Mailer } from "./mailer"               | ARCH-mailer |
        | export { Mailer } from "./mailer.ts"            | ARCH-mailer |
        | import Mailer = require("./mailer.ts")          | ARCH-mailer |
        | const mailer = () => import("./mailer.ts")      | ARCH-mailer |
        | const mailer = () => import("./mailer\u002ets") | ARCH-mailer |
        | const mailer = () => import(`./mailer\u002ets`) | ARCH-mailer |
        | import type { Mailer } from "./mailer.ts"       | nothing     |
        | import { type Mailer } from "./mailer.ts"       | nothing     |
        | import type {} from "./mailer.ts"               | nothing     |

    Scenario Outline: A name means the file TypeScript resolves it to, whether or not that file anchors an element
      Given a file "src/<unanchored>" containing:
        """
        export const rate = 0.2
        """
      And a file "src/<anchored>" containing:
        """
        import { annotate } from "sdp/annotations"

        export const rate = 0.25
        annotate(rate, { is: "ARCH-tax" })
        """
      And a file "src/billing.ts" containing:
        """
        import { annotate } from "sdp/annotations"
        import { rate } from "<name>"

        export const bill = () => rate
        annotate(bill, { is: "ARCH-billing" })
        """
      When I query "#ARCH-billing -imports-> *"
      Then the result is "<imports>"

      Examples:
        | unanchored | anchored     | name     | imports  |
        | tax.ts     | tax/index.ts | ./tax    | nothing  |
        | tax.ts     | tax.js       | ./tax.js | nothing  |
        | tax.js     | tax.tsx      | ./tax.js | ARCH-tax |

  Rule: The architecture and its links can be drawn as a Mermaid flowchart

    Scenario: The flowchart of the architecture
      When I run "sdp arch --mermaid"
      Then the exit code is 0
      And the output contains "flowchart LR"
      And the output contains "-->|decided-by|"
      And the output contains "-->|realized-by|"
      And the output contains "-->|imports|"
      And the output contains '["ARCH-mailer"]'

  Rule: A quality requirement, of kind nfr or of any kind whose type says so, is shown beside what it constrains

    A quality requirement is most often a rule of the feature it constrains, with a measurable
    example; `@type=quality` on that rule shows it beside the elements that realize the feature, as
    the receipts' delivery time is in the view above. A team that writes them as specs of their own
    marks them by kind or by type.

    Scenario Outline: Marked by its kind or by its type
      Given these specs:
        | tags                                           | Feature               |
        | @id=ARCH-search @constrained-by:search-latency | Search                |
        | @id=search-latency <marker>                    | Results within 200 ms |
      When I ask for the architecture view
      Then the output contains "ARCH-search -constrained-by-> search-latency"

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
