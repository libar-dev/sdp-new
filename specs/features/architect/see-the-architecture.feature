@id=see-the-architecture
@realized-by:ARCH-architecture-view @realized-by:ARCH-application @realized-by:ARCH-reports @realized-by:ARCH-graph-builder @realized-by:ARCH-code-annotations
Feature: See the architecture

  Architects, and anyone designing a change, person or agent, need in one view the few elements and
  patterns that shape the system, the decisions and quality requirements around them, the code that
  is each with its surface, and the work on each: `sdp arch`, or the MCP tool `sdp_architecture`.

  Not a discovery of the architecture: sdp never judges what belongs in it.

  Background:
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
    And a file "src/outbox.ts" containing:
      """
      /**
       * Keeps each event with the change that raised it, until it is published.
       *
       * @sdp is PAT-outbox title="Transactional outbox"
       */
      export const outbox = new Set<string>()
      """
    And a file "src/mailer.ts" containing:
      """
      /**
       * Sends receipts, and retries while the provider is down.
       *
       * @sdp is ARCH-mailer
       */
      export class Mailer {}
      export interface Receipt {
        readonly number: string
      }
      """
    And a file "src/orders.ts" containing:
      """
      import { Mailer } from "./mailer.ts"

      /**
       * @sdp is ARCH-orders
       * @sdp applies PAT-outbox
       */
      export const place = (): Mailer => new Mailer()
      """

  Rule: The architecture is every element and pattern its code declares, with the decisions and the quality requirements, rules tagged `@quality`, linked to it or to the features that realize it

    Scenario: Elements and patterns from code, with the decisions and quality requirements that shaped them
      When I run "sdp arch --json"
      Then the exit code is 0
      And the JSON output has:
        | data.architecture | ARCH-mailer, ARCH-orders, PAT-outbox                                                     |
        | data.drivers      | receipts#a-receipt-is-sent-within-a-minute, numbered-receipts, publish-through-an-outbox |

  Rule: Each element is shown with what it is for, its links, the shape of what its code exports, and the work on it, live and still to come, the furthest along first

    What is furthest along is built next. A question is no work: it waits on a decision, not on the
    element.

    Scenario: The mailer and the orders
      Given a file "specs/refunds.feature" containing:
        """
        @id=refunds @maturity=ready @realized-by:ARCH-orders
        Feature: Refunds
        """
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
      And the output contains "Sends receipts, and retries while the provider is down."
      And the output contains "class Mailer"
      And the output contains "ARCH-orders -imports-> ARCH-mailer"
      And the output contains "ARCH-orders -applies-> PAT-outbox"
      And the output contains "Transactional outbox"
      And the output contains:
        """
        live: invoices  Invoices
        still to come: refunds (ready)  Refunds
        still to come: invoices#an-invoice-is-paid-by-card (draft)  An invoice is paid by card
        still to come: receipts (idea)  Receipts
        """
      And the output does not contain "Is an invoice ever cancelled?"

  Rule: sdp derives which element imports which from the code, through any code of no element: an import of a value calls the other's code, one of types alone does not

    Code no element claims, a helper or a file that passes names on, is followed to the code of the
    elements it imports, so a dependency through it, and a cycle, is in the graph.

    Scenario Outline: The billing module imports <what>
      Given a file "src/send.ts" containing:
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

  Rule: sdp reads what TypeScript and JavaScript import, and an answer that shows what elements import says so when code of an element is in another language

    What that element imports is then missing from the answer. It is a note, and the answer stays
    complete: nothing in the workspace can be fixed so that sdp reads it.

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
        | TypeScript | src/pay.ts | //     | sdp arch                             | 0 times |

  Rule: An import means the file its name resolves to, as TypeScript or Deno resolve it, by the repository's files whether or not its packages are installed

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

    Scenario: A name the paths of a tsconfig.json map, which a package of the workspace holds and the repository's tsconfig.json extends, not installed
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

  Rule: An import sdp cannot follow is reported where it is written, as is a file it depends on that sdp cannot read, and makes the answer incomplete when it could name the workspace's code

    A library a package.json declares, a module of Node.js and a file that is not code are no element;
    any other name sdp cannot follow could hide a dependency from the architecture's rules, and so
    could any package's name while the list of the workspace's packages cannot be read.

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

    Scenario Outline: A pnpm-workspace.yaml that does not parse, which could list the package an import names, <declared>
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

  Rule: The architecture and its links can be drawn as a Mermaid flowchart

    Scenario: The flowchart of the architecture
      When I run "sdp arch --mermaid"
      Then the exit code is 0
      And the output contains "flowchart LR"
      And the output contains "-->|imports|"
      And the output contains '["ARCH-mailer"]'

  @decided-by:architecture-is-declared-in-doc-comments
  Rule: An element or a pattern is declared only in the doc comments of its code: a spec that declares one is reported, and what it says is not read

    Scenario: An anchor that disagrees with the spec
      Given these specs:
        | tags                           | Feature |
        | @id=ARCH-ledger @owner=finance | Ledger  |
      And a file "src/ledger.ts" containing:
        """
        /** @sdp is ARCH-ledger owner=payments */
        export class Ledger {}
        """
      When the workspace is loaded
      Then the workspace graph has at least these nodes:
        | id          | source          | owner    |
        | ARCH-ledger | src/ledger.ts:1 | payments |
      And sdp reports:
        | rule             | at                          |
        | declared-in-spec | specs/ARCH-ledger.feature:1 |

  @decided-by:architecture-is-declared-in-doc-comments
  Rule: Code that applies a pattern says so with `@sdp applies`, and each element the code is part of applies it too

    Scenario: The retry pattern applied by a declaration of the file that is billing, and by code of no element
      Given a file "src/retry.ts" containing:
        """
        /** @sdp is PAT-retry */
        export const retry = <A>(call: () => Promise<A>): Promise<A> => call()
        """
      And a file "src/billing.ts" containing:
        """
        /** @sdp is ARCH-billing */
        import { retry } from "./retry.ts"

        /** @sdp applies PAT-retry */
        export const charge = (): number => 0
        """
      And a file "src/refund.ts" containing:
        """
        /** @sdp applies PAT-retry */
        export const refund = (): number => 0
        """
      When I query "#PAT-retry <-applies- element"
      Then the result is "ARCH-billing"

  Rule: An element that only work still to come names is shown as still to come, and one that live work names must be in the code

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
