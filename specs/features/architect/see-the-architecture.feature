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

  Rule: Each element is shown with what it is for, its links, the shape of what its code exports, and the work on it, live and still to come

    Scenario: The mailer and the orders
      When I run "sdp arch"
      Then the exit code is 0
      And the output contains "Sends receipts, and retries while the provider is down."
      And the output contains "class Mailer"
      And the output contains "ARCH-orders -imports-> ARCH-mailer"
      And the output contains "ARCH-orders -applies-> PAT-outbox"
      And the output contains "Transactional outbox"
      And the output contains "still to come: receipts (idea)  Receipts"

  Rule: sdp derives which element imports which from the code: an import of a value calls the other's code, one of types alone does not

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
        | import                                    | imports     |
        | import { Mailer } from "./mailer.ts"      | ARCH-mailer |
        | import type { Mailer } from "./mailer.ts" | nothing     |

  Rule: An import means the file its name resolves to, as TypeScript or Deno resolve it, by the repository's files whether or not its packages are installed

    Scenario Outline: A name resolved by <config>
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
        | config                    | says                                                                                                     | unanchored            | anchored                  | name      |
        | tsconfig.json             | { "compilerOptions": { "paths": { "@/*": ["./src/*"] } } }                                               | lib/tax.ts            | src/tax.ts                | @/tax     |
        | packages/tax/package.json | { "name": "@shop/tax", "exports": { ".": { "types": "./src/index.ts", "default": "./dist/index.js" } } } | packages/tax/index.ts | packages/tax/src/index.ts | @shop/tax |
        | deno.json                 | { "imports": { "@/": "./src/" } }                                                                        | lib/tax.ts            | src/tax.ts                | @/tax.ts  |

  Rule: An import sdp cannot follow is reported where it is written, and makes the answer incomplete when it could name the workspace's code

    Scenario Outline: An import of <case>
      Given a file "package.json" containing:
        """
        <says>
        """
      And a file "src/billing.ts" containing:
        """
        import { rate } from "<name>"

        /** @sdp is ARCH-billing */
        export const bill = (): number => rate
        """
      When I run "sdp q '#ARCH-billing -imports-> *' --ids"
      Then the exit code is <exit code>
      And the output contains "not read: src/billing.ts:1 [import-unresolved]" <reported>

      Examples:
        | case                              | says                                                      | name  | exit code | reported |
        | a name no package.json declares   | { "name": "shop" }                                        | tax   | 2         | 1 time   |
        | a library a package.json declares | { "name": "shop", "dependencies": { "rates": "^1.0.0" } } | rates | 0         | 0 times  |

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
      Then the workspace graph has nodes:
        | id          | source          | owner    |
        | ARCH-ledger | src/ledger.ts:1 | payments |
      And sdp reports:
        | rule             | at                          |
        | declared-in-spec | specs/ARCH-ledger.feature:1 |

  @decided-by:architecture-is-declared-in-doc-comments
  Rule: Code that applies a pattern says so with `@sdp applies`, and each element the code is part of applies it too

    Scenario Outline: The retry pattern applied by <code>
      Given a file "src/retry.ts" containing:
        """
        /** @sdp is PAT-retry */
        export const retry = <A>(call: () => Promise<A>): Promise<A> => call()
        """
      And a file "src/billing.ts" containing:
        """
        <billing>
        """
      When I query "#PAT-retry <-applies- element"
      Then the result is "<elements>"

      Examples:
        | code                                      | billing                                                                                                                               | elements     |
        | a declaration of the file that is billing | /** @sdp is ARCH-billing */\nimport { retry } from "./retry.ts"\n\n/** @sdp applies PAT-retry */\nexport const charge = (): number => 0 | ARCH-billing |
        | code of no element                        | /** @sdp applies PAT-retry */\nexport const charge = (): number => 0                                                                    | nothing      |

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
