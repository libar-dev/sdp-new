@id=see-the-architecture
@realized-by:ARCH-architecture-view @realized-by:ARCH-application @realized-by:ARCH-reports @realized-by:ARCH-graph-builder @realized-by:ARCH-code-annotations
Feature: See the architecture

  Architects, and anyone designing a change, person or agent, need in one view the few elements and
  patterns that shape the system, the decisions and quality requirements around them, the code that
  is each of them with its surface and which of them it calls, and the work built on each and still
  to come: `sdp arch`, or the MCP tool `sdp_architecture`.

  Not a discovery of the architecture: sdp never judges what belongs in it.

  Background:
    Given these specs:
      | tags                                                                     | Feature                                 |
      | @id=publish-through-an-outbox @kind=decision                             | Orders publish events through an outbox |
      | @id=json-logs @kind=decision                                             | Logs are JSON                           |
      | @id=numbered-receipts @kind=decision                                     | Receipts are numbered without gaps      |
      | @id=refunds @maturity=idea @depends-on:receipts @decided-by:credit-notes | Refunds                                 |
      | @id=credit-notes @kind=decision                                          | A refund is a credit note               |
    And a file "specs/receipts.feature" containing:
      """
      @id=receipts @maturity=idea @realized-by:ARCH-orders
      Feature: Receipts

        @decided-by:numbered-receipts
        Rule: Every receipt is numbered

        @quality @decided-by:publish-through-an-outbox
        Rule: A receipt is sent within a minute
      """
    And a file "src/billing.ts" containing:
      """
      /**
       * Owns invoices; tax rules are regulated and costly to change. It writes logs as json-logs says.
       *
       * @sdp is ARCH-billing
       */
      export class Billing {}
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

  Rule: The architecture is every element and pattern its code declares, with the decisions and quality requirements linked to it, to a feature linked to it or to a rule of that feature, and nothing else

    Which few parts are significant is a judgement, not a metric of the code. A decision only named in
    a description, or linked to a feature that depends on this one, did not shape the element.

    Scenario: Elements and patterns from code, with the decisions and quality requirements that shaped them, and the links among them
      When I run "sdp arch --json"
      Then the exit code is 0
      And the JSON output has:
        | data.architecture | ARCH-billing, ARCH-mailer, ARCH-orders, PAT-outbox                                       |
        | data.drivers      | receipts#a-receipt-is-sent-within-a-minute, numbered-receipts, publish-through-an-outbox |

  Rule: Each element is shown with what it is for, from the doc comment of its code, and with its links

    It is named by its id, unless an anchor gives it a title.

    Scenario: Elements described by their code, and one by its links alone
      When I run "sdp arch"
      Then the exit code is 0
      And the output contains "Owns invoices; tax rules are regulated and costly to change."
      And the output contains "ARCH-orders -imports-> ARCH-mailer"
      And the output contains "ARCH-orders -applies-> PAT-outbox"
      And the output contains "Transactional outbox"

  Rule: sdp derives which element imports which from the code

    An element imports another when its code imports a function, a class or a constant of the
    other's; an import of types alone calls no code. Only TypeScript and JavaScript are read.

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
        | import { Receipt } from "./mailer.ts"     | nothing     |

  Rule: An import means the file TypeScript resolves its name to, by the files of the code, whether or not its packages are installed

    The graph follows the files, not what an install linked: a package of the workspace is found by
    the name its package.json gives. A deno.json maps names as Deno does.

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
        | tsconfig.json             | { "compilerOptions": { "paths": { "@/*": ["./src/*"] } } }                                               | lib/tax.ts            | src/tax.ts                | @/tax     | ARCH-tax |
        | packages/tax/package.json | { "name": "@shop/tax", "exports": { ".": { "types": "./src/index.ts", "default": "./dist/index.js" } } } | packages/tax/index.ts | packages/tax/src/index.ts | @shop/tax | ARCH-tax |
        | deno.json                 | { "imports": { "@/": "./src/" } }                                                                        | lib/tax.ts            | src/tax.ts                | @/tax.ts  | ARCH-tax |

  Rule: What an import means is read from the repository, and from outside it only what a tsconfig.json of it extends, which is said

    The same commit gives the same graph wherever it is checked out. The repository ends at git's top
    level, or at the workspace's root outside git.

    Scenario Outline: A file above the repository that no file of it names changes no answer: <file>
      Given a file "<file>" containing:
        """
        <says>
        """
      And a file "apps/shop/src/tax.ts" containing:
        """
        /** @sdp is ARCH-tax */
        export const rate = 0.25
        """
      And a file "apps/shop/src/billing.ts" containing:
        """
        import { rate } from "<name>"

        /** @sdp is ARCH-billing */
        export const bill = (): number => rate
        """
      And the files are in no git repository
      When I run "sdp q '#ARCH-billing -imports-> *' --ids" in "apps/shop"
      Then the exit code is 2
      And the output contains "not read: src/billing.ts:1 [import-unresolved]"
      And the output lines are "nothing"

      Examples:
        | file          | says                                                                 | name  |
        | tsconfig.json | { "compilerOptions": { "paths": { "@/*": ["./apps/shop/src/*"] } } } | @/tax |

  Rule: What sdp cannot follow of an import, its name or a setting it depends on, is reported once where it is written, and makes the answer incomplete when it could name the workspace's code

    A library a package.json declares, a module of Node.js and a file that is not code are no element;
    any other name sdp cannot follow could hide a dependency from the architecture's rules.

    Scenario Outline: An import sdp cannot follow makes the answer incomplete only when it could name the workspace's code: <case>
      Given a file "<config>" containing:
        """
        <says>
        """
      And a file "packages/tax/package.json" containing:
        """
        { "name": "@shop/tax", "exports": "./src/index.ts" }
        """
      And a file "packages/tax/src/index.ts" containing:
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
      When I run "sdp q '#ARCH-billing -imports-> *' --ids"
      Then the exit code is <exit code>
      And the output lines are "<imports>"
      And the output contains "not read: <at> [import-unresolved]" <reported>

      Examples:
        | case                                            | config        | says                                                      | name      | exit code | imports  | at               | reported |
        | a name no package.json declares                 | package.json  | { "name": "shop" }                                        | tax       | 2         | nothing  | src/billing.ts:1 | 1 time   |
        | a library a package.json declares               | package.json  | { "name": "shop", "dependencies": { "rates": "^1.0.0" } } | rates     | 0         | nothing  | src/billing.ts:1 | 0 times  |
        | what the tsconfig.json extends is not installed | tsconfig.json | { "extends": "@shop/tsconfig" }                           | @shop/tax | 2         | ARCH-tax | tsconfig.json:1  | 1 time   |

  Rule: The architecture and its links can be drawn as a Mermaid flowchart

    Scenario: The flowchart of the architecture
      When I run "sdp arch --mermaid"
      Then the exit code is 0
      And the output contains "flowchart LR"
      And the output contains "-->|imports|"
      And the output contains '["ARCH-mailer"]'

  Rule: `@quality` marks a rule as a quality requirement, shown beside the elements that realize its feature, and a team that keeps quality requirements as specs names their kind a driver

    `@quality` is a Cucumber tag: the examples of a rule inherit it, so `sdp run --tags @quality` runs
    the quality requirements alone.

    Scenario: A rule marked @quality
      Given a file "specs/search.feature" containing:
        """
        @id=search @maturity=idea @realized-by:ARCH-search
        Feature: Search

          @quality
          Rule: Results come within 200 ms
        """
      When I ask for the architecture view
      Then the output contains "search#results-come-within-200-ms, through search"

  Rule: What belongs in the architecture is never checked

    Declaring it is the architect's call, not a rule sdp can hold anyone to.

    Scenario: An element only its code names, and a decision nothing links to
      When the workspace is checked
      Then sdp reports nothing

  Rule: Every anchor of an element declares it, and two that disagree on an attribute are reported

    An element anchored in several places is one element whichever file is read first: where two
    anchors disagree, the first file's is kept; a kind no anchor writes gives way to one written.

    Scenario Outline: Two anchors of one element, <case>
      Given a file "src/courier/retry.ts" containing:
        """
        /**
         * Retries while the provider is down.
         *
         * @sdp is <first>
         */
        export const retry = (): number => 3
        """
      And a file "src/courier/send.ts" containing:
        """
        /**
         * Sends receipts.
         *
         * @sdp is <second>
         */
        export const send = (): number => 0
        """
      When the workspace is loaded
      Then the workspace graph has nodes:
        | id   | kind   | owner   |
        | <id> | <kind> | <owner> |
      And sdp reports "<reported>"

      Examples:
        | case                        | first                   | second                     | id           | kind    | owner | reported             |
        | that disagree on the owner  | ARCH-courier owner=post | ARCH-courier owner=billing | ARCH-courier | element | post  | declaration-conflict |
        | the first writing the kind  | courier kind=pattern    | courier                    | courier      | pattern |       | nothing              |
        | the second writing the kind | courier                 | courier kind=pattern       | courier      | pattern |       | nothing              |

  @decided-by:architecture-is-declared-in-doc-comments
  Rule: A spec that declares an element or a pattern is reported, and what it says is not read

    Scenario: An anchor that disagrees with the spec
      Given these specs:
        | tags                           | Feature |
        | @id=ARCH-ledger @owner=finance | Ledger  |
      And a file "src/ledger.ts" containing:
        """
        /**
         * Books every payment.
         *
         * @sdp is ARCH-ledger owner=payments
         */
        export class Ledger {}
        """
      When the workspace is loaded
      Then the workspace graph has nodes:
        | id          | source          | owner    |
        | ARCH-ledger | src/ledger.ts:4 | payments |
      And sdp reports:
        | rule             | severity | at                          |
        | declared-in-spec | error    | specs/ARCH-ledger.feature:1 |

  @decided-by:architecture-is-declared-in-doc-comments
  Rule: A pattern is declared in the doc comment of the code its instances share, and code that applies it says so with `@sdp applies`

    A pattern imports nothing, and nothing imports it.

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
         * @sdp is ARCH-billing
         * @sdp applies PAT-retry
         */
        export const charge = (): Promise<number> => retry(async () => 0)
        """
      When the workspace is loaded
      Then the workspace graph has nodes:
        | id        | kind    | source         |
        | PAT-retry | pattern | src/retry.ts:4 |
      When I query "#PAT-retry <-applies- code -is-> element"
      Then the result is "ARCH-billing"
      When I query "#ARCH-billing -imports-> *"
      Then the result is "nothing"

  Rule: An element links to each pattern its code links to, by the relation the code wrote, at the tag

    Code is part of each element anchored in its file, so what it applies, they apply, by the code's
    own word for the relation.

    Scenario Outline: The retry pattern played by <code>
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
        | the declaration that is billing           | /**\n * @sdp is ARCH-billing\n * @sdp applies PAT-retry\n */\nexport const charge = (): number => 0                                     | ARCH-billing |
        | a declaration of the file that is billing | /** @sdp is ARCH-billing */\nimport { retry } from "./retry.ts"\n\n/** @sdp applies PAT-retry */\nexport const charge = (): number => 0 | ARCH-billing |
        | code of no element                        | /** @sdp applies PAT-retry */\nexport const charge = (): number => 0                                                                    | nothing      |

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
      And the output contains "interface Invoice { readonly number: string; readonly cents: number }"
      And the output contains "function charge(invoice: Invoice): Promise<boolean>"
      And the output does not contain "audit"

  Rule: Each element is shown with the live work on it and the work still to come, the furthest along first

    The work on an element is each feature that names it, and each rule still to come of a feature
    built on it; what has come furthest is the next to weigh on the element.

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
      When I ask for the architecture view
      Then the output contains "still to come, named by export" <shown>

      Examples:
        | named by      | maturity        | kind    | reported      | shown   |
        | still to come | @maturity=ready | element | nothing       | 1 time  |
        | that is live  |                 | missing | dangling-link | 0 times |
