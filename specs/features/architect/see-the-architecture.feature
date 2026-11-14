@id=see-the-architecture
@realized-by:ARCH-architecture-view @realized-by:ARCH-application @realized-by:ARCH-reports @realized-by:ARCH-graph-builder @realized-by:ARCH-code-annotations
Feature: See the architecture

  Architects, and anyone designing a change, person or agent, need in one view the few elements and
  patterns that shape the system, the decisions and quality requirements around them, the code that
  is each with its surface, and the work on each: `sdp arch`, or the MCP tool `sdp_architecture`.

  Not a discovery of the architecture: sdp never judges what belongs in it.

  Rule: The architecture is every element and pattern, with the decisions and quality requirements linked to it or its features

    They are what shaped it, and what a change to it keeps to. A quality requirement is a rule
    tagged `@quality`; any other rule is none.

    Scenario: The orders and the outbox, with what shaped the orders
      Given these specs:
        | tags                                         | Feature                                 |
        | @id=publish-through-an-outbox @kind=decision | Orders publish events through an outbox |
        | @id=numbered-receipts @kind=decision         | Receipts are numbered without gaps      |
      And a file "specs/receipts.feature" containing:
        """
        @id=receipts @maturity=idea @realized-by:ARCH-orders
        Feature: Receipts

          @decided-by:numbered-receipts
          Rule: Every receipt is numbered

          @quality @decided-by:publish-through-an-outbox
          Rule: A receipt is sent within a minute
        """
      And a file "src/orders.ts" containing:
        """
        /** @sdp is ARCH-orders */
        export const place = (): number => 0

        /** @sdp is PAT-outbox */
        export const outbox = new Set<string>()
        """
      When I run "sdp arch --json"
      Then the exit code is 0
      And the JSON output has:
        | data.architecture | ARCH-orders, PAT-outbox                                                                  |
        | data.drivers      | receipts#a-receipt-is-sent-within-a-minute, numbered-receipts, publish-through-an-outbox |

  Rule: Each element is shown with what it is for, its links, the shape of its code and what shaped it

    Scenario: The mailer, which the orders import, shaped by a decision on receipts
      Given these specs:
        | tags                                                                               | Feature                            |
        | @id=numbered-receipts @kind=decision                                               | Receipts are numbered without gaps |
        | @id=receipts @maturity=idea @realized-by:ARCH-mailer @decided-by:numbered-receipts | Receipts                           |
      And a file "src/mailer.ts" containing:
        """
        /**
         * Sends receipts, and retries while the provider is down.
         *
         * @sdp is ARCH-mailer title="Receipt mailer"
         */
        export class Mailer {}
        """
      And a file "src/orders.ts" containing:
        """
        import { Mailer } from "./mailer.ts"

        /** @sdp is ARCH-orders */
        export const place = (): Mailer => new Mailer()
        """
      When I run "sdp arch"
      Then the exit code is 0
      And the output contains "ARCH-mailer — Receipt mailer (element)"
      And the output contains "Sends receipts, and retries while the provider is down."
      And the output contains "ARCH-mailer <-imports- ARCH-orders"
      And the output contains "class Mailer {}"
      And the output contains "numbered-receipts, through receipts"

  Rule: The work on each element is shown, live and still to come, the furthest along first

    What is furthest along is built next. A question is no work: it waits on a decision, not on the
    element.

    Scenario: Invoices, refunds and receipts on the orders
      Given a file "src/orders.ts" containing:
        """
        /** @sdp is ARCH-orders */
        export const place = (): number => 0
        """
      And these specs:
        | tags                                                 | Feature  |
        | @id=receipts @maturity=idea @realized-by:ARCH-orders | Receipts |
        | @id=refunds @maturity=ready @realized-by:ARCH-orders | Refunds  |
      And a file "specs/invoices.feature" containing:
        """
        @id=invoices @realized-by:ARCH-orders
        Feature: Invoices

          @maturity=draft
          Rule: An invoice is paid by card

          @open
          Rule: Is an invoice ever cancelled?
        """
      When I run "sdp arch"
      Then the exit code is 0
      And the output contains:
        """
        live: invoices  Invoices
        still to come: refunds (ready)  Refunds
        still to come: invoices#an-invoice-is-paid-by-card (draft)  An invoice is paid by card
        still to come: receipts (idea)  Receipts
        """
      And the output does not contain "Is an invoice ever cancelled?"

  Rule: Work still to come may name an element that no code declares yet

    The architecture shows it as still to come, named by that work. Live work may not: what is built
    is realized by code, so its link to an element nothing declares dangles.

    Scenario Outline: Exports, named by work <named by>
      Given a file "specs/export.feature" containing:
        """
        @id=export <maturity> @realized-by:ARCH-exports
        Feature: Export
        """
      When the workspace is loaded
      Then sdp reports "<reported>"
      When I ask for the architecture view
      Then the output contains "still to come, named by export" <shown>

      Examples:
        | named by      | maturity        | reported      | shown   |
        | still to come | @maturity=ready | nothing       | 1 time  |
        | that is live  |                 | dangling-link | 0 times |

  Rule: The architecture can be drawn as a Mermaid flowchart

    Decisions and patterns are drawn in shapes of their own, so that a reader tells them from the
    elements at a glance.

    Scenario: The orders, which import the mailer and apply the outbox, shaped by a decision on receipts
      Given these specs:
        | tags                                                                               | Feature                            |
        | @id=numbered-receipts @kind=decision                                               | Receipts are numbered without gaps |
        | @id=receipts @maturity=idea @realized-by:ARCH-orders @decided-by:numbered-receipts | Receipts                           |
      And a file "src/mailer.ts" containing:
        """
        /** @sdp is ARCH-mailer */
        export class Mailer {}
        """
      And a file "src/orders.ts" containing:
        """
        import { Mailer } from "./mailer.ts"

        /**
         * @sdp is ARCH-orders
         * @sdp applies PAT-outbox
         */
        export const place = (): Mailer => new Mailer()

        /** @sdp is PAT-outbox */
        export const outbox = new Set<string>()
        """
      When I run "sdp arch --mermaid"
      Then the exit code is 0
      And the output contains "flowchart LR"
      And the output contains '["ARCH-mailer"]'
      And the output contains '{{"PAT-outbox"}}'
      And the output contains '[/"numbered-receipts'
      And the output contains "-->|imports|"
      And the output contains "-->|decided-by|"

  Rule: An element imports another when its code imports a value from the other's code, through any code of no element

    An import of types alone runs none of the other's code. Code no element claims, a helper or a
    file that passes names on, is followed, so that a dependency through it is in the graph.

    Scenario Outline: The billing imports <what>
      Given a file "src/mailer.ts" containing:
        """
        /** @sdp is ARCH-mailer */
        export class Mailer {}
        export interface Receipt {}
        """
      And a file "src/send.ts" containing:
        """
        import { Mailer } from "./mailer.ts"

        export type { Receipt } from "./mailer.ts"
        export const send = (): Mailer => new Mailer()
        """
      And a file "src/billing.ts" containing:
        """
        <import>

        /** @sdp is ARCH-billing */
        export const bill = (): number => 0
        """
      When I query "#ARCH-billing -imports-> *"
      Then the result is "<imports>"

      Examples:
        | what                                      | import                                    | imports     |
        | a value of the mailer                     | import { Mailer } from "./mailer.ts"      | ARCH-mailer |
        | a type, with import type                  | import type { Mailer } from "./mailer.ts" | nothing     |
        | a name the mailer exports as a type alone | import { Receipt } from "./mailer.ts"     | nothing     |
        | a value of the mailer it passes on        | export { Mailer } from "./mailer.ts"      | ARCH-mailer |
        | a value of code of no element             | import { send } from "./send.ts"          | ARCH-mailer |
        | a type alone through code of no element   | import { Receipt } from "./send.ts"       | nothing     |

  Rule: An answer that shows what elements import notes each element whose code's imports sdp does not read

    sdp reads the imports of TypeScript and JavaScript, and what an element imports from code in
    another language is missing from the answer. It is a note, and the answer stays complete: nothing
    in the workspace can be fixed so that sdp reads it.

    Scenario Outline: Code of an element in <language>, asked with <command>
      Given a file "<file>" containing:
        """
        <marker> @sdp is ARCH-pay
        """
      When I run "<command>"
      Then the exit code is 0
      And the output contains "note:" <noted>

      Examples:
        | language   | file       | marker | command                              | noted   |
        | Python     | src/pay.py | #      | sdp arch                             | 1 time  |
        | Python     | src/pay.py | #      | sdp q '#ARCH-pay -imports-> *' --ids | 1 time  |
        | Python     | src/pay.py | #      | sdp q '#ARCH-pay -*-> *' --ids       | 1 time  |
        | Python     | src/pay.py | #      | sdp show ARCH-pay                    | 1 time  |
        | Python     | src/pay.py | #      | sdp context ARCH-pay                 | 1 time  |
        | TypeScript | src/pay.ts | //     | sdp arch                             | 0 times |

  Rule: An import means the file TypeScript or Deno resolves its name to, whether or not packages are installed

    sdp reads the configuration files of the repository as TypeScript, its package manager and Deno
    read them, and installs or runs nothing.

    Scenario Outline: A name resolved by <by>
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
      Then the result is "ARCH-tax"

      Examples:
        | by                                          | config                    | says                                                                                                     | unanchored            | anchored                  | name           |
        | the paths of a tsconfig.json                | tsconfig.json             | { "compilerOptions": { "paths": { "@/*": ["./src/*"] } } }                                               | lib/tax.ts            | src/tax.ts                | @/tax          |
        | the exports of a package of the workspace   | packages/tax/package.json | { "name": "@shop/tax", "exports": { ".": { "types": "./src/index.ts", "default": "./dist/index.js" } } } | packages/tax/index.ts | packages/tax/src/index.ts | @shop/tax      |
        | a pattern of the exports of a package       | packages/tax/package.json | { "name": "@shop/tax", "exports": { "./*": "./src/*.ts" } }                                              | packages/tax/rate.ts  | packages/tax/src/rate.ts  | @shop/tax/rate |
        | a pattern of the imports of a package.json  | package.json              | { "name": "shop", "imports": { "#lib/*": "./src/*.ts" } }                                                | lib/tax.ts            | src/tax.ts                | #lib/tax       |
        | the imports of a deno.json                  | deno.json                 | { "imports": { "@/": "./src/" } }                                                                        | lib/tax.ts            | src/tax.ts                | @/tax.ts       |

    Scenario: The paths of a tsconfig.json extended from a package of the workspace that is not installed
      Given a file "package.json" containing:
        """
        { "name": "shop", "workspaces": ["packages/*"] }
        """
      And a file "packages/tsconfig/package.json" containing:
        """
        { "name": "@shop/tsconfig" }
        """
      And a file "packages/tsconfig/tsconfig.json" containing:
        """
        { "compilerOptions": { "paths": { "@/*": ["${configDir}/src/*"] } } }
        """
      And a file "tsconfig.json" containing:
        """
        { "extends": "@shop/tsconfig" }
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

  Rule: An import that could name the workspace's code and that sdp cannot follow makes the answer incomplete

    It could hide a dependency from the architecture, so it is reported where it is written. A
    library a package.json declares, a module of Node.js and a file that is not code name none of the
    workspace's code; any other name could, and so could a package's name while the list of the
    workspace's packages cannot be read.

    Scenario Outline: An import of <case>
      Given a file "package.json" containing:
        """
        <says>
        """
      And a file "src/rates.ts" containing:
        """
        export { rate } from "<name>"
        """
      And a file "src/billing.ts" containing:
        """
        import { rate } from "<imported>"

        /** @sdp is ARCH-billing */
        export const bill = (): number => rate
        """
      When I run "sdp q '#ARCH-billing -imports-> *' --ids"
      Then the exit code is <exit code>
      And the output contains "not read: <at> [import-unresolved]" <reported>

      Examples:
        | case                                                   | says                                                      | name  | imported   | exit code | at               | reported |
        | a name no package.json declares                        | { "name": "shop" }                                        | tax   | tax        | 2         | src/billing.ts:1 | 1 time   |
        | a library a package.json declares                      | { "name": "shop", "dependencies": { "rates": "^1.0.0" } } | rates | rates      | 0         | src/billing.ts:1 | 0 times  |
        | a name no package.json declares, in code of no element | { "name": "shop" }                                        | tax   | ./rates.ts | 2         | src/rates.ts:1   | 1 time   |

    Scenario Outline: A package, while the pnpm-workspace.yaml that could list it does not parse, <declared>
      Given a file "pnpm-workspace.yaml" containing:
        """
        packages: [tools/*
        """
      And a file "package.json" containing:
        """
        <says>
        """
      And a file "tools/tax/package.json" containing:
        """
        { "name": "@shop/tax" }
        """
      And a file "src/billing.ts" containing:
        """
        import { rate } from "@shop/tax"

        /** @sdp is ARCH-billing */
        export const bill = (): number => rate
        """
      When I run "sdp q '#ARCH-billing -imports-> *' --ids"
      Then the exit code is 2
      And the output contains "not read: pnpm-workspace.yaml:1 [import-unresolved]" 1 time
      And the output contains "not read: src/billing.ts:1 [import-unresolved]" <reported>

      Examples:
        | declared                                         | says                                                               | reported |
        | which no package.json declares                   | { "name": "shop" }                                                 | 1 time   |
        | which the package.json declares with workspace:* | { "name": "shop", "dependencies": { "@shop/tax": "workspace:*" } } | 0 times  |

  @maturity=idea
  Rule: sdp check reports an element that depends on itself through others, whatever code lies between them
