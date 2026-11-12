@id=see-the-architecture
@realized-by:ARCH-architecture-view @realized-by:ARCH-application @realized-by:ARCH-reports @realized-by:ARCH-graph-builder @realized-by:ARCH-code-annotations
Feature: See the architecture

  Architects, and anyone designing a change, person or agent, need the few elements and patterns
  that shape the system, the decisions and quality requirements around them, the code that is
  each of them with its surface and which of them it calls, and the work built on each and still
  to come, in one view: `sdp arch`, or the MCP tool `sdp_architecture`.

  Not a discovery of the architecture: sdp never judges what belongs in it. Nor are quality
  requirements a document apart: they are specs, and their scenarios run with the rest.

  Background:
    Given these specs:
      | tags                                                                                                                       | Feature                                 |
      | @id=ARCH-orders @maturity=idea @decided-by:publish-through-an-outbox @instance-of:PAT-outbox @constrained-by:order-latency | Orders                                  |
      | @id=PAT-outbox @maturity=idea                                                                                              | Transactional outbox                    |
      | @id=publish-through-an-outbox @kind=decision                                                                               | Orders publish events through an outbox |
      | @id=json-logs @kind=decision                                                                                               | Logs are JSON                           |
      | @id=order-latency @maturity=idea @kind=nfr                                                                                 | Order latency                           |
      | @id=numbered-receipts @kind=decision                                                                                       | Receipts are numbered without gaps      |
      | @id=refunds @maturity=idea @depends-on:receipts @decided-by:credit-notes                                                   | Refunds                                 |
      | @id=credit-notes @kind=decision                                                                                            | A refund is a credit note               |
    And a file "specs/receipts.feature" containing:
      """
      @id=receipts @maturity=idea @realized-by:ARCH-orders
      Feature: Receipts

        @decided-by:numbered-receipts
        Rule: Every receipt is numbered

        @type=quality
        Rule: A receipt is sent within a minute
      """
    And a file "specs/ARCH-billing.feature" containing:
      """
      @id=ARCH-billing @maturity=idea
      Feature: Billing

        Owns invoices; tax rules are regulated and costly to change. It writes logs as json-logs says.
      """
    And a file "src/mailer.ts" containing:
      """
      /**
       * Sends receipts, and retries while the provider is down.
       *
       * @sdp is ARCH-mailer
       */
      export class Mailer {}
      export class MailTemplates {}
      export interface Receipt {
        readonly number: string
      }
      export type { Cents } from "./money.ts"
      """
    And a file "src/orders.ts" containing:
      """
      import { Mailer } from "./mailer.ts"

      /** @sdp is ARCH-orders */
      export const place = (): Mailer => new Mailer()
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

    An element declared by its code alone is named by its id, unless an anchor gives it a title.

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
        function place(): Mailer
        receipts#a-receipt-is-sent-within-a-minute, through receipts  A receipt is sent within a minute
        numbered-receipts, through receipts  Receipts are numbered without gaps
        still to come: receipts (idea)  Receipts

        PAT-outbox — Transactional outbox (pattern)
        PAT-outbox <-instance-of- ARCH-orders  Orders

        ARCH-mailer (element)
        Sends receipts, and retries while the provider is down.
        ARCH-mailer <-imports- ARCH-orders  Orders
        ARCH-mailer <-is- code:src/mailer.ts#Mailer  Mailer
        class Mailer {}
        """
      And the output does not contain "ARCH-mailer — ARCH-mailer"
      And the output does not contain "ARCH-mailer  ARCH-mailer"

    Scenario Outline: An element declared by its code alone, <titled>
      Given a file "src/mailer.ts" containing:
        """
        /**
         * Sends receipts.
         *
         * @sdp is ARCH-mailer <title>
         */
        export class Mailer {}
        """
      When I run "sdp arch"
      Then the exit code is 0
      And the output contains:
        """
        <heading>
        Sends receipts.
        """

      Examples:
        | titled                 | title             | heading                        |
        | its anchor naming none |                   | ARCH-mailer (element)          |
        | its anchor titling it  | title="Mail room" | ARCH-mailer — Mail room (element) |

    Scenario: An element anchored in two places is described by each, in the order of their files
      Given a file "src/outbox.ts" containing:
        """
        /**
         * Keeps each receipt until the provider has taken it.
         *
         * @sdp is ARCH-mailer
         */
        export const outbox = new Set<string>()
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
        <import>

        /** @sdp is ARCH-billing */
        export const bill = (): number => 0
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
        | import { Receipt } from "./mailer.ts"           | nothing     |
        | import { Receipt, Cents } from "./mailer.ts"    | nothing     |
        | import { Receipt, Mailer } from "./mailer.ts"   | ARCH-mailer |
        | const { Mailer } = require("./mailer.ts")       | ARCH-mailer |

    Scenario Outline: A name means the file TypeScript resolves it to, whether or not that file anchors an element
      Given a file "<config>" containing:
        """
        <says>
        """
      And a file "<unanchored>" containing:
        """
        export const rate = 0.2
        """
      And a file "<anchored>" containing:
        """
        /** @sdp is ARCH-tax */
        export const rate = 0.25
        """
      And a file "src/billing.ts" containing:
        """
        import { rate } from "<name>"

        /** @sdp is ARCH-billing */
        export const bill = (): number => rate
        """
      When I query "#ARCH-billing -imports-> *"
      Then the result is "<imports>"

      Examples:
        | config                    | says                                                                                                     | unanchored            | anchored                  | name      | imports  |
        | package.json              | { "name": "shop" }                                                                                       | src/tax.ts            | src/tax/index.ts          | ./tax     | nothing  |
        | package.json              | { "name": "shop" }                                                                                       | src/tax.ts            | src/tax.js                | ./tax.js  | nothing  |
        | package.json              | { "name": "shop" }                                                                                       | src/tax.js            | src/tax.tsx               | ./tax.js  | ARCH-tax |
        | package.json              | { "name": "shop" }                                                                                       | src/tax.ts            | src/tax/index.ts          | ./tax/    | ARCH-tax |
        | tsconfig.json             | {\n  // the aliases of the code\n  "compilerOptions": { "paths": { "@/*": ["./src/*"] } },\n}          | lib/tax.ts            | src/tax.ts                | @/tax     | ARCH-tax |
        | tsconfig.json             | { "compilerOptions": { "baseUrl": "./src", "paths": { "@/*": ["*"] } } }                                 | lib/tax.ts            | src/tax.ts                | @/tax     | ARCH-tax |
        | package.json              | { "name": "shop", "imports": { "#tax": "./src/tax.ts" } }                                                | lib/tax.ts            | src/tax.ts                | #tax      | ARCH-tax |
        | packages/tax/package.json | { "name": "@shop/tax", "exports": { ".": { "types": "./src/index.ts", "default": "./dist/index.js" } } } | packages/tax/index.ts | packages/tax/src/index.ts | @shop/tax | ARCH-tax |
        | package.json              | { "name": "shop" }                                                                                       | lib/tax.ts            | src/tax.ts                | tax       | nothing  |

    Scenario: A tsconfig.json maps names as the configuration it extends does, from where that configuration is
      Given a file "config/tsconfig.base.json" containing:
        """
        { "compilerOptions": { "paths": { "@/*": ["../src/*"] } } }
        """
      And a file "tsconfig.json" containing:
        """
        { "extends": "./config/tsconfig.base.json" }
        """
      And a file "src/tax.ts" containing:
        """
        /** @sdp is ARCH-tax */
        export const rate = 0.25
        """
      And a file "src/billing.ts" containing:
        """
        import { rate } from "@/tax"

        /** @sdp is ARCH-billing */
        export const bill = (): number => rate
        """
      When I query "#ARCH-billing -imports-> *"
      Then the result is "ARCH-tax"

    Scenario Outline: What sdp cannot follow, though it could name the workspace's code, is reported, and the answer is incomplete: <case>
      Given a file "<config>" containing:
        """
        <says>
        """
      And a file "packages/tax/package.json" containing:
        """
        <tax>
        """
      And a file "packages/tax/src/index.ts" containing:
        """
        /** @sdp is ARCH-tax */
        export const rate = 0.25
        """
      And a file "src/billing.ts" containing:
        """
        import { rate } from "@shop/tax"

        /** @sdp is ARCH-billing */
        export const bill = (): number => rate
        """
      When I run "sdp q '#ARCH-billing -imports-> *' --ids"
      Then the exit code is 2
      And the output contains 'note: not read: <at> [import-unresolved] <message>'
      And the output lines are "<imports>"

      Examples:
        | case                                                      | config           | says                                  | tax                                                         | imports  | at               | message                                                                                    |
        | what the tsconfig.json extends is not installed          | tsconfig.json    | { "extends": "@tsconfig/strictest" }  | { "name": "@shop/tax", "exports": "./src/index.ts" }         | ARCH-tax | tsconfig.json:1  | tsconfig.json extends @tsconfig/strictest, which is neither in the workspace nor installed |
        | the tsconfig.json does not parse                          | tsconfig.json    | { "compilerOptions": { "paths": } }   | { "name": "@shop/tax", "exports": "./src/index.ts" }         | ARCH-tax | tsconfig.json:1  | tsconfig.json does not parse                                                               |
        | a package exported only under conditions TypeScript lacks | package.json     | { "name": "shop" }                    | { "name": "@shop/tax", "exports": { "browser": "./src/index.ts" } } | nothing  | src/billing.ts:1 | "@shop/tax" is mapped by packages/tax/package.json only under the conditions browser       |
        | two packages of the workspace with one name               | src/package.json | { "name": "@shop/tax" }               | { "name": "@shop/tax", "exports": "./src/index.ts" }         | nothing  | src/billing.ts:1 | "@shop/tax" names 2 packages of the workspace                                              |

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

  Rule: Every anchor of an element declares it, and two that disagree on an attribute are reported

    An element anchored in several places is one element whichever file is read first: what each
    anchor declares holds, and where two disagree the spec's value, or else the first file's, is
    kept. A kind that no anchor writes and no prefix names is no declaration, and gives way to one
    that is written.

    Scenario Outline: Two anchors that agree, each with what it adds
      Given a file "src/courier/retry.ts" containing:
        """
        /**
         * Retries while the provider is down.
         *
         * @sdp is ARCH-courier <first>
         */
        export const retry = (): number => 3
        """
      And a file "src/courier/send.ts" containing:
        """
        /**
         * Sends receipts.
         *
         * @sdp is ARCH-courier <second>
         */
        export const send = (): number => 0
        """
      When the workspace is loaded
      Then the workspace graph has nodes:
        | id          | kind    | title   | source              | owner | tier |
        | ARCH-courier | element | <title> | src/courier/retry.ts:4 | post  | 2    |
      And sdp reports nothing

      Examples:
        | first             | second                    | title       |
        | owner=post        | tier=2                    | ARCH-courier |
        | owner=post tier=2 | owner=post                | ARCH-courier |
        | owner=post        | tier=2 title="Post room"  | Post room    |

    Scenario Outline: Two anchors that disagree
      Given a file "src/courier/retry.ts" containing:
        """
        /**
         * Retries while the provider is down.
         *
         * @sdp is ARCH-courier <first>
         */
        export const retry = (): number => 3
        """
      And a file "src/courier/send.ts" containing:
        """
        /**
         * Sends receipts.
         *
         * @sdp is ARCH-courier <second>
         */
        export const send = (): number => 0
        """
      When the workspace is loaded
      Then the workspace graph has nodes:
        | id          | kind   | title   | owner   |
        | ARCH-courier | <kind> | <title> | <owner> |
      And sdp reports:
        | rule                 | severity | at                 | message   |
        | declaration-conflict | warning  | src/courier/send.ts:4 | <message> |

      Examples:
        | first          | second           | kind    | title       | owner | message                                                                         |
        | owner=post     | owner=billing    | element | ARCH-courier | post  | ARCH-courier: owner is "billing" here but "post" at src/courier/retry.ts:4, which is kept |
        | title=Courier  | title=Post       | element | Courier      |       | ARCH-courier: title is "Post" here but "Courier" at src/courier/retry.ts:4, which is kept  |
        | kind=component |                  | component | ARCH-courier |     | ARCH-courier: kind is "element" here but "component" at src/courier/retry.ts:4, which is kept |

    Scenario Outline: One anchor writes the kind and the other none, <first> first
      Given a file "src/<plain>" containing:
        """
        /** @sdp is retry */
        export const again = (): number => 3
        """
      And a file "src/<written>" containing:
        """
        /** @sdp is retry kind=pattern */
        export const wait = (): number => 1
        """
      When the workspace is loaded
      Then the workspace graph has nodes:
        | id    | kind    |
        | retry | pattern |
      And sdp reports nothing

      Examples:
        | first                   | plain | written |
        | the one that writes none | a.ts  | b.ts    |
        | the one that writes it   | b.ts  | a.ts    |

    Scenario Outline: One anchor writes a maturity and the other the kind milestone, <first> first
      Given a file "src/<plain>" containing:
        """
        /** @sdp is launch maturity=ready */
        export const again = (): number => 3
        """
      And a file "src/<written>" containing:
        """
        /** @sdp is launch kind=milestone */
        export const wait = (): number => 1
        """
      When the workspace is loaded
      Then the workspace graph has nodes:
        | id     | kind      | maturity | stage |
        | launch | milestone | ready    |       |

      Examples:
        | first                       | plain | written |
        | the one that writes no kind | a.ts  | b.ts    |
        | the one that writes it      | b.ts  | a.ts    |

    Scenario: An anchor that disagrees with the spec
      Given these specs:
        | tags                           | Feature |
        | @id=ARCH-ledger @owner=finance | Ledger  |
      And a file "src/ledger.ts" containing:
        """
        /**
         * Books every payment.
         *
         * @sdp is ARCH-ledger owner=payments tier=1
         */
        export class Ledger {}
        """
      When the workspace is loaded
      Then the workspace graph has nodes:
        | id          | title  | source                      | owner   | tier |
        | ARCH-ledger | Ledger | specs/ARCH-ledger.feature:1 | finance | 1    |
      And sdp reports:
        | rule                 | severity | at              | message                                                                                      |
        | declaration-conflict | warning  | src/ledger.ts:4 | ARCH-ledger: owner is "payments" here but "finance" at specs/ARCH-ledger.feature:1, which is kept |

  @decided-by:architecture-is-declared-in-doc-comments
  Rule: A pattern is declared in the doc comment of the code its instances share, and code that applies it says so with `@sdp plays`

    The code every instance goes through is the pattern's, and its comment says what the pattern
    is; an anchor declares a node of the kind its id's prefix names. `plays` is the team's word, and
    like any link it only names a pattern, which an anchor declares: the view shows every link from
    code to a pattern, and the elements that code is, or the file that holds it. Elements import
    elements: a pattern imports nothing, and nothing imports it.

    Scenario: A retry pattern, declared by its code and played by billing
      Given a file "src/retry.ts" containing:
        """
        /**
         * Calls again while the provider is down, waiting longer each time.
         *
         * @sdp is PAT-retry
         */
        export const retry = <A>(call: () => Promise<A>): Promise<A> => call()
        """
      And a file "src/billing.ts" containing:
        """
        import { retry } from "./retry.ts"

        /**
         * Charges the card on file.
         *
         * @sdp is ARCH-billing
         * @sdp plays PAT-retry
         */
        export const charge = (): Promise<number> => retry(async () => 0)
        """
      When the workspace is loaded
      Then the workspace graph has nodes:
        | id        | kind    | title     | source         |
        | PAT-retry | pattern | PAT-retry | src/retry.ts:4 |
      When I query "#PAT-retry <-plays- code -is-> element"
      Then the result is "ARCH-billing"
      When I query "#ARCH-billing -imports-> *"
      Then the result is "nothing"
      When I run "sdp arch"
      Then the exit code is 0
      And the output contains:
        """
        PAT-retry (pattern)
        Calls again while the provider is down, waiting longer each time.
        """
      And the output contains "PAT-retry <-is- code:src/retry.ts#retry  retry"
      And the output contains "PAT-retry <-plays- code:src/billing.ts#charge  charge"
      And the output contains "PAT-retry <-plays- ARCH-billing, through code:src/billing.ts#charge  Billing"

    Scenario: A retry pattern played by a declaration of the file that is billing
      Given a file "src/retry.ts" containing:
        """
        /** @sdp is PAT-retry */
        export const retry = <A>(call: () => Promise<A>): Promise<A> => call()
        """
      And a file "src/billing.ts" containing:
        """
        /**
         * Charges cards.
         *
         * @sdp is ARCH-billing
         */
        import { retry } from "./retry.ts"

        /**
         * Charges the card on file.
         *
         * @sdp plays PAT-retry
         */
        export const charge = (): Promise<number> => retry(async () => 0)
        """
      When I run "sdp arch"
      Then the exit code is 0
      And the output contains "PAT-retry <-plays- code:src/billing.ts#charge  charge"
      And the output contains "PAT-retry <-plays- ARCH-billing, through code:src/billing.ts#charge  Billing"

    Scenario: A pattern that no code declares, played by billing
      Given a file "src/billing.ts" containing:
        """
        /**
         * Charges the card on file.
         *
         * @sdp is ARCH-billing
         * @sdp plays PAT-retry
         */
        export const charge = (): Promise<number> => Promise.resolve(0)
        """
      When the workspace is checked
      Then sdp reports:
        | rule          | at               | message                                             |
        | dangling-link | src/billing.ts:5 | -plays-> PAT-retry: no node has id PAT-retry        |

  Rule: Each element is shown with its public surface: the shape of what its code exports

    Scenario: Billing, anchored by the file that holds its code
      Given a file "src/billing.ts" containing:
        """
        /**
         * Charges cards and keeps the invoices.
         *
         * @sdp is ARCH-billing
         */

        export interface Invoice {
          readonly number: string
          readonly cents: number
        }

        export const charge = (invoice: Invoice): Promise<boolean> => Promise.resolve(invoice.cents > 0)

        const audit = (): void => {}
        """
      When I run "sdp arch"
      Then the exit code is 0
      And the output contains:
        """
        ARCH-billing <-is- code:src/billing.ts
        interface Invoice { readonly number: string; readonly cents: number }
        function charge(invoice: Invoice): Promise<boolean>
        """
      And the output does not contain "audit"
      When I run "sdp context ARCH-billing"
      Then the exit code is 0
      And the output contains:
        """
        - src/billing.ts:1 — is ARCH-billing
        interface Invoice { readonly number: string; readonly cents: number }
        function charge(invoice: Invoice): Promise<boolean>
        """

  Rule: Each element is shown with the live work on it and the work still to come, ready first

    The work on an element is each feature that names it, and each rule still to come of a feature
    built on it. Ready is designed and all but final: it weighs nearly what live work does.

    Scenario: The work on orders
      Given a file "specs/returns.feature" containing:
        """
        @id=returns @maturity=draft @realized-by:ARCH-orders
        Feature: Returns
        """
      And a file "specs/checkout.feature" containing:
        """
        @id=checkout @realized-by:ARCH-orders
        Feature: Checkout

          Shoppers pay for their cart.

          Rule: A paid cart is an order

            Scenario: Pay
              Then an order is placed

          @maturity=ready
          Rule: An order can be paid in instalments

            Scenario: Three instalments
              Then three payments are planned
        """
      When I run "sdp arch"
      Then the exit code is 0
      And the output contains:
        """
        live: checkout  Checkout
        still to come: checkout#an-order-can-be-paid-in-instalments (ready)  An order can be paid in instalments
        still to come: returns (draft)  Returns
        still to come: receipts (idea)  Receipts
        """
      When I run "sdp context ARCH-orders"
      Then the exit code is 0
      And the output contains:
        """
        ## Work

        - live: checkout — Checkout
        - still to come: checkout#an-order-can-be-paid-in-instalments (ready) — An order can be paid in instalments
        - still to come: returns (draft) — Returns
        - still to come: receipts (idea) — Receipts
        """

  @replaces:see-the-architecture#an-element-that-work-still-to-come-names-and-no-code-declares
  Rule: An element that only work still to come names is shown as still to come

    Once that work is live, the element must be in the code.

    Scenario Outline: Exports, named by work <named by>
      Given a file "specs/export.feature" containing:
        """
        @id=export <maturity> @realized-by:ARCH-exports
        Feature: Export
        """
      When the workspace is loaded
      Then the workspace graph has nodes:
        | id           | kind   | source |
        | ARCH-exports | <kind> |        |
      And sdp reports "<reported>"

      Examples:
        | named by          | maturity        | kind    | reported      |
        | still to come     | @maturity=ready | element | nothing       |
        | that is live      |                 | missing | dangling-link |

    Scenario: An element still to come in the view
      Given a file "specs/export.feature" containing:
        """
        @id=export @maturity=ready @realized-by:ARCH-exports
        Feature: Export
        """
      When I run "sdp arch"
      Then the exit code is 0
      And the output contains:
        """
        ARCH-exports (element)  still to come, named by export: no code declares it yet
        still to come: export (ready)  Export
        """
