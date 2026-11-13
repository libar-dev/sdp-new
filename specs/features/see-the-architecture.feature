@id=see-the-architecture
@realized-by:ARCH-architecture-view @realized-by:ARCH-application @realized-by:ARCH-reports @realized-by:ARCH-graph-builder @realized-by:ARCH-code-annotations
Feature: See the architecture

  Architects, and anyone designing a change, person or agent, need the few elements and patterns
  that shape the system, the decisions and quality requirements around them, the code that is
  each of them with its surface and which of them it calls, and the work built on each and still
  to come, in one view: `sdp arch`, or the MCP tool `sdp_architecture`.

  Not a discovery of the architecture: sdp never judges what belongs in it. Nor are quality
  requirements a document apart: they are in the specs, and their examples run with the rest.

  Background:
    Given these specs:
      | tags                                                                     | Feature                                 |
      | @id=publish-through-an-outbox @kind=decision                             | Orders publish events through an outbox |
      | @id=json-logs @kind=decision                                             | Logs are JSON                           |
      | @id=order-latency @maturity=idea @kind=nfr                               | Order latency                           |
      | @id=numbered-receipts @kind=decision                                     | Receipts are numbered without gaps      |
      | @id=refunds @maturity=idea @depends-on:receipts @decided-by:credit-notes | Refunds                                 |
      | @id=credit-notes @kind=decision                                          | A refund is a credit note               |
    And a file "specs/receipts.feature" containing:
      """
      @id=receipts @maturity=idea @realized-by:ARCH-orders @constrained-by:order-latency
      Feature: Receipts

        @decided-by:numbered-receipts
        Rule: Every receipt is numbered

        @type=quality @decided-by:publish-through-an-outbox
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
      export class MailTemplates {}
      export interface Receipt {
        readonly number: string
      }
      export type { Cents } from "./money.ts"
      """
    And a file "src/orders.ts" containing:
      """
      import { Mailer } from "./mailer.ts"

      /**
       * @sdp is ARCH-orders
       * @sdp plays PAT-outbox
       */
      export const place = (): Mailer => new Mailer()
      """

  Rule: The architecture is every element and pattern its code declares, with the decisions and quality requirements linked to it, to a feature linked to it or to a rule of that feature, and nothing else

    Which few parts are significant — they carry quality attributes, are costly to change or
    constrain many others — is a judgement, not a metric of the code, and a list of every
    abstraction buries them. A feature names the elements that realize it, and a rule the
    decision it rests on: what shaped the feature shaped them, and the view gives the route. A
    decision only named in a description is not linked, and one linked further away — to a
    feature that depends on that one — shaped that other feature, not the element.

    @replaces:see-the-architecture#elements-and-patterns-from-specs-and-code-with-the-decisions-and
    Scenario: Elements and patterns from code, with the decisions and quality requirements that shaped them, and the links among them
      When I run "sdp arch --json"
      Then the exit code is 0
      And the JSON output has:
        | data.architecture          | ARCH-billing, ARCH-mailer, ARCH-orders, PAT-outbox                                                                                       |
        | data.drivers               | order-latency, receipts#a-receipt-is-sent-within-a-minute, numbered-receipts, publish-through-an-outbox                                  |
        | data.drivers.through.nodes | ARCH-orders, receipts, order-latency, ARCH-orders, receipts, receipts#a-receipt-is-sent-within-a-minute, ARCH-orders, receipts, receipts#every-receipt-is-numbered, numbered-receipts, ARCH-orders, receipts, receipts#a-receipt-is-sent-within-a-minute, publish-through-an-outbox |
        | data.anchors               | code:src/billing.ts#Billing, code:src/mailer.ts#Mailer, code:src/orders.ts#place, code:src/outbox.ts#outbox                              |
        | data.edges.rel             | decided-by, imports, is, is, is, is, plays, plays                                                                                        |

  Rule: Each element is shown with what it is for, from the doc comment of its code, and with its links

    It is named by its id, unless an anchor gives it a title.

    @replaces:see-the-architecture#one-element-described-by-its-spec-one-by-its-code-one-by-its
    Scenario: Elements described by their code, and one by its links alone
      When I run "sdp arch"
      Then the exit code is 0
      And the output contains:
        """
        Architecture: 4 node(s) of the kinds element, pattern

        ARCH-billing (element)
        Owns invoices; tax rules are regulated and costly to change. It writes logs as json-logs says.
        ARCH-billing <-is- code:src/billing.ts#Billing  Billing
        class Billing {}

        ARCH-mailer (element)
        Sends receipts, and retries while the provider is down.
        ARCH-mailer <-imports- ARCH-orders
        ARCH-mailer <-is- code:src/mailer.ts#Mailer  Mailer
        class Mailer {}

        ARCH-orders (element)
        ARCH-orders -imports-> ARCH-mailer
        ARCH-orders -plays-> PAT-outbox  Transactional outbox
        ARCH-orders <-is- code:src/orders.ts#place  place
        function place(): Mailer
        order-latency, through receipts  Order latency
        receipts#a-receipt-is-sent-within-a-minute, through receipts  A receipt is sent within a minute
        numbered-receipts, through receipts  Receipts are numbered without gaps
        publish-through-an-outbox, through receipts  Orders publish events through an outbox
        still to come: receipts (idea)  Receipts

        PAT-outbox — Transactional outbox (pattern)
        Keeps each event with the change that raised it, until it is published.
        PAT-outbox <-plays- ARCH-orders
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
    constant from a module anchored to the other; an import of types alone calls no code of it,
    whether that module declares the types or passes them on. Derived, the dependencies cannot
    drift from the code, and none is written by hand (link-specs). Only TypeScript and JavaScript
    are read for imports: code in any other language imports no element, and neither does a name
    the code computes as it runs, for TypeScript resolves it to no file.

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
        | const mailer = (name: string) => import(name)   | nothing     |

    Scenario Outline: A type another module passes on is still a type: <passed on>
      Given a file "src/barrel.ts" containing:
        """
        <barrel>

        /** @sdp is ARCH-barrel */
        export const version = 1
        """
      And a file "src/billing.ts" containing:
        """
        import { <name> } from "./barrel.ts"

        /** @sdp is ARCH-billing */
        export const bill = (): number => 0
        """
      When I query "#ARCH-billing -imports-> *"
      Then the result is "<imports>"

      Examples:
        | passed on                           | barrel                                                    | name    | imports     |
        | re-exported without type            | export { Receipt } from "./mailer.ts"                     | Receipt | nothing     |
        | re-exported under another name      | export { Receipt as Sent } from "./mailer.ts"             | Sent    | nothing     |
        | imported, then exported             | import { Receipt } from "./mailer.ts"\nexport { Receipt } | Receipt | nothing     |
        | among all the names of its module   | export * from "./mailer.ts"                               | Receipt | nothing     |
        | a class among all the names of its module | export * from "./mailer.ts"                         | Mailer  | ARCH-barrel |

  Rule: An import means the file TypeScript 7 resolves its name to, or TypeScript 5 where a project relies on it, by the files of the code, whether or not its packages are installed

    A package is found by the name its package.json gives, as a package manager links it into
    node_modules: the graph follows the files, not what `npm install` linked. Of TypeScript 5, sdp
    follows what costs a TypeScript 7 project nothing: `node10` resolution, and a build's root in the
    directory of its code. A deno.json maps names as Deno does.

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
        | src/tax/package.json      | { "main": "rates.js" }                                                                                   | src/tax/index.ts      | src/tax/rates.ts          | ./tax     | ARCH-tax |
        | tsconfig.json             | {\n  // the aliases of the code\n  "compilerOptions": { "paths": { "@/*": ["./src/*"] } },\n}            | lib/tax.ts            | src/tax.ts                | @/tax     | ARCH-tax |
        | tsconfig.json             | { "compilerOptions": { "baseUrl": "./src", "paths": { "@/*": ["*"] } } }                                 | lib/tax.ts            | src/tax.ts                | @/tax     | ARCH-tax |
        | jsconfig.json             | { "compilerOptions": { "paths": { "@/*": ["./src/*"] } } }                                               | lib/tax.ts            | src/tax.ts                | @/tax     | ARCH-tax |
        | tsconfig.json             | { "compilerOptions": { "moduleSuffixes": [".native", ""] } }                                             | src/tax.ts            | src/tax.native.ts         | ./tax.js  | ARCH-tax |
        | tsconfig.json             | { "compilerOptions": { "rootDir": 1, "paths": { "@/*": ["./src/*"] } } }                                 | lib/tax.ts            | src/tax.ts                | @/tax     | ARCH-tax |
        | deno.json                 | { "imports": { "@/": "./src/" } }                                                                        | lib/tax.ts            | src/tax.ts                | @/tax.ts  | ARCH-tax |
        | package.json              | { "name": "shop", "imports": { "#tax": "./src/tax.ts" } }                                                | lib/tax.ts            | src/tax.ts                | #tax      | ARCH-tax |
        | packages/tax/package.json | { "name": "@shop/tax", "exports": { ".": { "types": "./src/index.ts", "default": "./dist/index.js" } } } | packages/tax/index.ts | packages/tax/src/index.ts | @shop/tax | ARCH-tax |
        | package.json              | { "name": "shop", "dependencies": { "tax": "^1.0.0" } }                                                  | lib/tax.ts            | src/tax.ts                | tax       | nothing  |

    Scenario Outline: A package's exports under conditions mean what TypeScript resolves the import by: <case>
      Given a file "tsconfig.json" containing:
        """
        <tsconfig>
        """
      And a file "package.json" containing:
        """
        { "name": "shop", "type": "<type>" }
        """
      And a file "packages/tax/package.json" containing:
        """
        { "name": "@shop/tax", "exports": { "@shop/source": "./src/index.ts", "require": "./cjs.ts", "import": "./esm.ts" } }
        """
      And a file "packages/tax/src/index.ts" containing:
        """
        /** @sdp is ARCH-tax-source */
        export const rate = 0.25
        """
      And a file "packages/tax/cjs.ts" containing:
        """
        /** @sdp is ARCH-tax-cjs */
        export const rate = 0.25
        """
      And a file "packages/tax/esm.ts" containing:
        """
        /** @sdp is ARCH-tax-esm */
        export const rate = 0.25
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
        | case                                           | tsconfig                                                        | type     | import                                | imports         |
        | an import                                      | {}                                                              | commonjs | import { rate } from "@shop/tax"      | ARCH-tax-esm    |
        | import = require()                             | {}                                                              | module   | import tax = require("@shop/tax")     | ARCH-tax-cjs    |
        | require()                                      | {}                                                              | module   | const tax = require("@shop/tax")      | ARCH-tax-cjs    |
        | an import compiled to CommonJS                 | { "compilerOptions": { "module": "commonjs" } }                 | module   | import { rate } from "@shop/tax"      | ARCH-tax-cjs    |
        | an import of a CommonJS package, for Node.js   | { "compilerOptions": { "module": "nodenext" } }                 | commonjs | import { rate } from "@shop/tax"      | ARCH-tax-cjs    |
        | an import of an ES module package, for Node.js | { "compilerOptions": { "module": "nodenext" } }                 | module   | import { rate } from "@shop/tax"      | ARCH-tax-esm    |
        | import() of a CommonJS package, for Node.js    | { "compilerOptions": { "module": "nodenext" } }                 | commonjs | const tax = () => import("@shop/tax") | ARCH-tax-esm    |
        | a condition the tsconfig.json adds             | { "compilerOptions": { "customConditions": ["@shop/source"] } } | module   | import { rate } from "@shop/tax"      | ARCH-tax-source |

    Scenario Outline: A package of the workspace means the source of the entry its package.json names: <case>
      Given a file "package.json" containing:
        """
        <workspace>
        """
      And a file "packages/tax/package.json" containing:
        """
        <package>
        """
      And a file "<config>" containing:
        """
        <tsconfig>
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
      When I query "#ARCH-billing -imports-> *"
      Then the result is "ARCH-tax"

      Examples:
        | case                                                              | workspace                                                              | package                                                                                                     | config                           | tsconfig                                                        | name            |
        | its types and main, built from src                                | { "name": "shop" }                                                     | { "name": "@shop/tax", "types": "./dist/index.d.ts", "main": "./dist/index.js" }                            | packages/tax/tsconfig.json       | { "compilerOptions": { "rootDir": "src", "outDir": "dist" } }   | @shop/tax       |
        | its exports, built from src                                       | { "name": "shop" }                                                     | { "name": "@shop/tax", "exports": { ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" } } } | packages/tax/tsconfig.json       | { "compilerOptions": { "rootDir": "src", "outDir": "dist" } }   | @shop/tax       |
        | a subpath of its exports, built from src                          | { "name": "shop" }                                                     | { "name": "@shop/tax", "exports": { "./*": "./dist/*.js" } }                                                | packages/tax/tsconfig.json       | { "compilerOptions": { "rootDir": "src", "outDir": "dist" } }   | @shop/tax/index |
        | its main, built from its directory                                | { "name": "shop" }                                                     | { "name": "@shop/tax", "main": "./dist/src/index.js" }                                                      | packages/tax/tsconfig.json       | { "compilerOptions": { "outDir": "dist" } }                     | @shop/tax       |
        | an alias a package.json declares                                  | { "name": "shop", "dependencies": { "tax": "npm:@shop/tax@1.0.0" } }   | { "name": "@shop/tax", "exports": "./src/index.ts" }                                                        | packages/tax/tsconfig.json       | {}                                                              | tax             |
        | an alias of the workspace                                         | { "name": "shop", "dependencies": { "tax": "workspace:@shop/tax@*" } } | { "name": "@shop/tax", "exports": "./src/index.ts" }                                                        | packages/tax/tsconfig.json       | {}                                                              | tax             |
        | a directory a package.json declares                               | { "name": "shop", "dependencies": { "tax": "file:./packages/tax" } }   | { "name": "@shop/tax", "exports": "./src/index.ts" }                                                        | packages/tax/tsconfig.json       | {}                                                              | tax             |
        | a directory a package.json links                                  | { "name": "shop", "dependencies": { "tax": "link:packages/tax" } }     | { "name": "@shop/tax", "exports": "./src/index.ts" }                                                        | packages/tax/tsconfig.json       | {}                                                              | tax             |
        | its main, built by TypeScript 5 from the directory its code is in | { "name": "shop" }                                                     | { "name": "@shop/tax", "types": "./dist/index.d.ts", "main": "./dist/index.js" }                            | packages/tax/tsconfig.json       | { "compilerOptions": { "outDir": "dist" }, "include": ["src"] } | @shop/tax       |
        | its main, built by a tsconfig.build.json                          | { "name": "shop" }                                                     | { "name": "@shop/tax", "types": "./dist/index.d.ts", "main": "./dist/index.js" }                            | packages/tax/tsconfig.build.json | { "compilerOptions": { "rootDir": "src", "outDir": "dist" } }   | @shop/tax       |
        | its main, under node10 resolution, which reads no exports         | { "name": "shop" }                                                     | { "name": "@shop/tax", "exports": "./dist/index.js", "main": "./src/index.ts" }                             | tsconfig.json                    | { "compilerOptions": { "moduleResolution": "node10" } }         | @shop/tax       |
        | its main, compiled to CommonJS by TypeScript 5                    | { "name": "shop", "devDependencies": { "typescript": "^5.4.0" } }      | { "name": "@shop/tax", "exports": "./dist/index.js", "main": "./src/index.ts" }                             | tsconfig.json                    | { "compilerOptions": { "module": "commonjs" } }                 | @shop/tax       |

    Scenario Outline: A tsconfig.json maps names as the one it extends does, from where that one is: <extended>
      Given a file "package.json" containing:
        """
        { "name": "shop", "workspaces": ["config", "packages/*"] }
        """
      And a file "<manifest>" containing:
        """
        { "name": "@shop/tsconfig" }
        """
      And a file "<base>" containing:
        """
        { "compilerOptions": { "paths": { "@/*": ["<to>"] } } }
        """
      And a file "tsconfig.json" containing:
        """
        { "extends": "<extends>" }
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

      Examples:
        | extended                                 | manifest                                 | base                                  | to             | extends                     |
        | by its path                              | config/package.json                      | config/tsconfig.base.json             | ../src/*       | ./config/tsconfig.base.json |
        | by a file of a package of the workspace  | packages/tsconfig/package.json           | packages/tsconfig/base.json           | ../../src/*    | @shop/tsconfig/base.json    |
        | by a package of the workspace, whole     | packages/tsconfig/package.json           | packages/tsconfig/tsconfig.json       | ../../src/*    | @shop/tsconfig              |
        | by a package installed in a node_modules | node_modules/@shop/tsconfig/package.json | node_modules/@shop/tsconfig/base.json | ../../../src/* | @shop/tsconfig/base.json    |

    Scenario: A file is read with the tsconfig.json, among those its own references, that includes it
      Given a file "packages/web/tsconfig.json" containing:
        """
        { "files": [], "references": [{ "path": "./tsconfig.node.json" }, { "path": "./tsconfig.app.json" }] }
        """
      And a file "packages/web/tsconfig.node.json" containing:
        """
        { "compilerOptions": { "paths": { "@/*": ["./config/*"] } }, "include": ["vite.config.ts"] }
        """
      And a file "packages/web/tsconfig.app.json" containing:
        """
        { "compilerOptions": { "paths": { "@/*": ["./src/*"] } }, "include": ["src"] }
        """
      And a file "packages/web/src/components/button.tsx" containing:
        """
        /** @sdp is ARCH-ui */
        export const Button = (): number => 0
        """
      And a file "packages/web/src/app.tsx" containing:
        """
        import { Button } from "@/components/button"

        /** @sdp is ARCH-web */
        export const App = (): number => Button()
        """
      When I query "#ARCH-web -imports-> *"
      Then the result is "ARCH-ui"

    Scenario: A tsconfig.json above the workspace maps names from where it is
      Given a file "tsconfig.base.json" containing:
        """
        { "compilerOptions": { "paths": { "@/*": ["./apps/shop/src/*"] } } }
        """
      And a file "apps/shop/tsconfig.json" containing:
        """
        { "extends": "../../tsconfig.base.json" }
        """
      And a file "apps/shop/src/tax.ts" containing:
        """
        /** @sdp is ARCH-tax */
        export const rate = 0.25
        """
      And a file "apps/shop/src/billing.ts" containing:
        """
        import { rate } from "@/tax"

        /** @sdp is ARCH-billing */
        export const bill = (): number => rate
        """
      And the files are committed on the branch "main"
      When I run "sdp q '#ARCH-billing -imports-> *' --ids" in "apps/shop"
      Then the exit code is 0
      And the output lines are "ARCH-tax"

  Rule: What an import means is read from the repository, and from outside it only what a tsconfig.json of it extends, which is said

    The same commit gives the same graph wherever it is checked out. The repository ends at git's top
    level, or at the workspace's root outside git; a tsconfig.json that extends one beyond it names
    that file, which is read, and `sdp check` says so.

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
      And the output contains 'note: not read: src/billing.ts:1 [import-unresolved] "<name>" is neither a package of the workspace'
      And the output lines are "nothing"

      Examples:
        | file          | says                                                                 | name  |
        | tsconfig.json | { "compilerOptions": { "paths": { "@/*": ["./apps/shop/src/*"] } } } | @/tax |
        | package.json  | { "name": "shop", "dependencies": { "rates": "^1.0.0" } }            | rates |

    Scenario: A tsconfig.json that extends one outside the repository is read with it, and check says so
      Given a file "tsconfig.base.json" containing:
        """
        { "compilerOptions": { "paths": { "@/*": ["./apps/shop/src/*"] } } }
        """
      And a file "apps/shop/tsconfig.json" containing:
        """
        { "extends": "../../tsconfig.base.json" }
        """
      And a file "apps/shop/src/tax.ts" containing:
        """
        /** @sdp is ARCH-tax */
        export const rate = 0.25
        """
      And a file "apps/shop/src/billing.ts" containing:
        """
        import { rate } from "@/tax"

        /** @sdp is ARCH-billing */
        export const bill = (): number => rate
        """
      And the files are in no git repository
      When I run "sdp q '#ARCH-billing -imports-> *' --ids" in "apps/shop"
      Then the exit code is 0
      And the output lines are "ARCH-tax"
      When I run "sdp check --base none --json" in "apps/shop"
      Then the exit code is 0
      And the JSON output has:
        | data.rule     | import-config-outside |
        | data.severity | info                  |
        | data.file     | tsconfig.json         |
        | data.line     | 1                     |

  Rule: What sdp cannot follow of an import, its name or a setting it depends on, is reported once where it is written, and makes the answer incomplete when it could name the workspace's code

    A library a package.json declares, a module of Node.js or one the code declares, and a file
    that is not code are no element, whatever sdp reads. Any other name, or a setting sdp cannot read
    or does not follow, could hide a dependency from the architecture's rules; one that could not is
    no reason to doubt the answer, and a warning that fires for nothing teaches users to ignore it.

    Scenario Outline: An import sdp cannot follow is reported, and the answer is incomplete: <case>
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
        import { rate } from "<name>"

        /** @sdp is ARCH-billing */
        export const bill = (): number => rate
        """
      When I run "sdp q '#ARCH-billing -imports-> *' --ids"
      Then the exit code is 2
      And the output contains 'note: not read: <at> [import-unresolved] <message>'
      And the output lines are "<imports>"

      Examples:
        | case                                                        | config           | says                                                                       | tax                                                                                              | name       | imports  | at                          | message                                                                                                                                         |
        | a name no package.json declares                             | package.json     | { "name": "shop" }                                                         | { "name": "@shop/tax", "exports": "./src/index.ts" }                                             | tax        | nothing  | src/billing.ts:1            | "tax" is neither a package of the workspace nor a library a package.json declares                                                               |
        | a name its paths map to no file                             | tsconfig.json    | { "compilerOptions": { "paths": { "@/*": ["./missing/*"] } } }             | { "name": "@shop/tax", "exports": "./src/index.ts" }                                             | @/tax      | nothing  | src/billing.ts:1            | "@/tax" is mapped by the paths of tsconfig.json to missing/tax, which is no code file                                                           |
        | a name the imports of package.json do not map               | package.json     | { "name": "shop", "imports": { "#rates": "./src/rates.ts" } }              | { "name": "@shop/tax", "exports": "./src/index.ts" }                                             | #tax       | nothing  | src/billing.ts:1            | "#tax" is not mapped by the imports of package.json                                                                                             |
        | a relative name of no file                                  | package.json     | { "name": "shop" }                                                         | { "name": "@shop/tax", "exports": "./src/index.ts" }                                             | ./rates.ts | nothing  | src/billing.ts:1            | "./rates.ts" names no code file of the workspace                                                                                                |
        | a name the imports of package.json map to an undeclared one | package.json     | { "name": "shop", "imports": { "#tax": "tax-rates" } }                     | { "name": "@shop/tax", "exports": "./src/index.ts" }                                             | #tax       | nothing  | src/billing.ts:1            | "#tax" is mapped by the imports of package.json to tax-rates, which is neither a package of the workspace nor a library a package.json declares |
        | a package exported only under conditions TypeScript lacks   | package.json     | { "name": "shop" }                                                         | { "name": "@shop/tax", "exports": { "browser": "./src/index.ts" } }                              | @shop/tax  | nothing  | src/billing.ts:1            | "@shop/tax" is mapped by packages/tax/package.json only under the conditions browser                                                            |
        | an entry of a package that no tsconfig.json builds          | package.json     | { "name": "shop" }                                                         | { "name": "@shop/tax", "types": "./dist/index.d.ts", "main": "./dist/index.js" }                 | @shop/tax  | nothing  | src/billing.ts:1            | "@shop/tax" means packages/tax/dist/index.d.ts, which is no code file                                                                           |
        | a package that exports a name without its extension         | package.json     | { "name": "shop" }                                                         | { "name": "@shop/tax", "exports": "./src/index" }                                                | @shop/tax  | nothing  | src/billing.ts:1            | "@shop/tax" means packages/tax/src/index, which is no code file                                                                                 |
        | two packages of the workspace with one name                 | src/package.json | { "name": "@shop/tax" }                                                    | { "name": "@shop/tax", "exports": "./src/index.ts" }                                             | @shop/tax  | nothing  | src/billing.ts:1            | "@shop/tax" names 2 packages of the workspace                                                                                                   |
        | what the tsconfig.json extends is not installed             | tsconfig.json    | { "extends": "@tsconfig/strictest" }                                       | { "name": "@shop/tax", "exports": "./src/index.ts" }                                             | @shop/tax  | ARCH-tax | tsconfig.json:1             | tsconfig.json extends @tsconfig/strictest, which is neither a package of the workspace nor installed in the repository                          |
        | a library, what the tsconfig.json extends not installed     | tsconfig.json    | { "extends": "@tsconfig/strictest" }                                       | { "name": "@shop/tax", "exports": "./src/index.ts", "dependencies": { "effect": "^4.0.0" } }     | effect     | nothing  | tsconfig.json:1             | tsconfig.json extends @tsconfig/strictest, which is neither a package of the workspace nor installed in the repository                          |
        | the tsconfig.json does not parse                            | tsconfig.json    | { "compilerOptions": { "paths": } }                                        | { "name": "@shop/tax", "exports": "./src/index.ts" }                                             | @shop/tax  | ARCH-tax | tsconfig.json:1             | tsconfig.json does not parse                                                                                                                    |
        | a setting of a type TypeScript does not read                | tsconfig.json    | { "compilerOptions": { "paths": { "@/*": "./src/*" } } }                   | { "name": "@shop/tax", "exports": "./src/index.ts" }                                             | @shop/tax  | ARCH-tax | tsconfig.json:1             | tsconfig.json sets paths to a value of a type TypeScript does not read                                                                          |
        | a tsconfig.json that resolves names as classic does         | tsconfig.json    | { "compilerOptions": { "moduleResolution": "classic" } }                   | { "name": "@shop/tax", "exports": "./src/index.ts" }                                             | @shop/tax  | ARCH-tax | tsconfig.json:1             | tsconfig.json sets moduleResolution to classic, which sdp does not follow                                                                       |
        | a relative name of no file, which rootDirs could find       | tsconfig.json    | { "compilerOptions": { "rootDirs": ["src", "generated"] } }                | { "name": "@shop/tax", "exports": "./src/index.ts" }                                             | ./rates.ts | nothing  | tsconfig.json:1             | tsconfig.json sets rootDirs, which sdp does not follow                                                                                          |
        | a package that maps its names by typesVersions              | package.json     | { "name": "shop" }                                                         | { "name": "@shop/tax", "main": "./src/index.ts", "typesVersions": { "*": { "*": ["dist/*"] } } } | @shop/tax  | ARCH-tax | packages/tax/package.json:1 | packages/tax/package.json maps names by typesVersions, which sdp does not follow                                                                |
        | a deno.json that maps names by scopes                       | deno.json        | { "scopes": { "./src/": { "@shop/tax": "./packages/tax/src/index.ts" } } } | { "name": "@shop/tax", "exports": "./src/index.ts" }                                             | @shop/tax  | ARCH-tax | deno.json:1                 | deno.json maps names by scopes, which sdp does not follow                                                                                       |

    Scenario Outline: A file that says what an import means, and that sdp may not read, is reported as one that does not parse: <file>
      Given a file "<file>" containing:
        """
        <says>
        """
      And a file "src/tax.ts" containing:
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
      When I run the pipeline:
        """
        chmod 000 <file>
        sdp q '#ARCH-billing -imports-> *' --ids
        status=$?
        chmod 644 <file>
        exit $status
        """
      Then the exit code is 2
      And the output contains 'note: not read: <at> [import-unresolved] <message>'

      Examples:
        | file          | says                                                       | name  | at               | message                                                                                                                                         |
        | tsconfig.json | { "compilerOptions": { "paths": { "@/*": ["./src/*"] } } } | @/tax | tsconfig.json:1  | tsconfig.json is a file sdp may not read, so what it sets is not read                                                                           |
        | package.json  | { "name": "shop", "imports": { "#tax": "./src/tax.ts" } }  | tax   | src/billing.ts:1 | "tax" is neither a package of the workspace nor a library a package.json declares, so it is not resolved; package.json is a file sdp may not read |
        | deno.json     | { "imports": { "tax": "./src/tax.ts" } }                   | tax   | deno.json:1      | deno.json is a file sdp may not read, so what it maps is not read                                                                               |

    Scenario: An import of code that is no file sdp can read is reported once, where that code is
      Given a file "src/billing.ts" containing:
        """
        import { rate } from "./tax.ts"

        /** @sdp is ARCH-billing */
        export const bill = (): number => rate
        """
      When I run the pipeline:
        """
        ln -s nowhere.ts src/tax.ts
        sdp check --base none
        """
      Then the exit code is 1
      And the output contains "[not-a-file] src/tax.ts is a link that leads to no file"
      And the output does not contain "import-unresolved"

    Scenario Outline: An import that cannot name the workspace's code, or whose answer sdp read, is not reported: <case>
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
        import { rate } from "<name>"

        /** @sdp is ARCH-billing */
        export const bill = (): number => rate
        """
      When I run "sdp q '#ARCH-billing -imports-> *' --ids"
      Then the exit code is 0
      And the output lines are "<imports>"

      Examples:
        | case                                                                                    | config         | says                                                                                  | tax                                                                                                      | name                         | imports  |
        | a library a package.json declares                                                       | package.json   | { "name": "shop", "dependencies": { "effect": "^4.0.0" } }                            | { "name": "@shop/tax", "exports": "./src/index.ts" }                                                     | effect                       | nothing  |
        | a library whose types a package.json declares                                           | package.json   | { "name": "shop", "devDependencies": { "@types/express": "^5.0.0" } }                 | { "name": "@shop/tax", "exports": "./src/index.ts" }                                                     | express                      | nothing  |
        | a module of Node.js                                                                     | package.json   | { "name": "shop" }                                                                    | { "name": "@shop/tax", "exports": "./src/index.ts" }                                                     | node:fs                      | nothing  |
        | a module of Node.js, named without node:                                                | package.json   | { "name": "shop" }                                                                    | { "name": "@shop/tax", "exports": "./src/index.ts" }                                                     | fs                           | nothing  |
        | a library a deno.json maps                                                              | deno.json      | { "imports": { "effect": "npm:effect@4" } }                                           | { "name": "@shop/tax", "exports": "./src/index.ts" }                                                     | effect                       | nothing  |
        | a file that is not code                                                                 | tsconfig.json  | { "compilerOptions": { "paths": { "@/*": ["./src/*"] } } }                            | { "name": "@shop/tax", "exports": "./src/index.ts" }                                                     | @/logo.svg                   | nothing  |
        | a relative name of a file outside the workspace's code                                  | package.json   | { "name": "shop" }                                                                    | { "name": "@shop/tax", "exports": "./src/index.ts" }                                                     | ../scripts/rates.ts          | nothing  |
        | a declaration file                                                                      | src/rates.d.ts | export declare const rate: number                                                     | { "name": "@shop/tax", "exports": "./src/index.ts" }                                                     | ./rates                      | nothing  |
        | a module the workspace's code declares                                                  | src/env.d.ts   | declare module "tax-rates" { export const rate: number }                              | { "name": "@shop/tax", "exports": "./src/index.ts" }                                                     | tax-rates                    | nothing  |
        | a condition on a branch the import does not take                                        | package.json   | { "name": "shop" }                                                                    | { "name": "@shop/tax", "exports": { "import": "./src/index.ts", "require": { "browser": "./cjs.ts" } } } | @shop/tax                    | ARCH-tax |
        | what the tsconfig.json extends is not installed, and sets nothing the import depends on | tsconfig.json  | { "extends": "@tsconfig/node22" }                                                     | { "name": "@shop/tax", "exports": "./src/index.ts" }                                                     | ../packages/tax/src/index.ts | ARCH-tax |
        | a setting of a type TypeScript does not read, which the import does not depend on       | tsconfig.json  | { "compilerOptions": { "rootDir": 1, "paths": { "@/*": ["./packages/tax/src/*"] } } } | { "name": "@shop/tax", "exports": "./src/index.ts" }                                                     | @/index                      | ARCH-tax |

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
        | tags                                                                              | Feature               |
        | @id=search @maturity=idea @realized-by:ARCH-search @constrained-by:search-latency | Search                |
        | @id=search-latency <marker>                                                       | Results within 200 ms |
      When I ask for the architecture view
      Then the output contains "search-latency, through search"

      Examples:
        | marker                          |
        | @kind=nfr                       |
        | @kind=requirement @type=quality |
        | @kind=story @type=constraint    |

  Rule: What belongs in the architecture is never checked

    Declaring it is the architect's call, not a rule sdp can hold anyone to.

    @replaces:see-the-architecture#an-element-without-links-or-code-and-a-decision-nothing-links-to
    Scenario: An element only its code names, and a decision nothing links to
      When the workspace is checked
      Then sdp reports nothing

  Rule: Every anchor of an element declares it, and two that disagree on an attribute are reported

    An element anchored in several places is one element whichever file is read first: what each
    anchor declares holds, and where two disagree the first file's is kept. A kind that no anchor
    writes and no prefix names is no declaration, and gives way to one that is written.

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

  @decided-by:architecture-is-declared-in-doc-comments
  Rule: A spec that declares an element or a pattern is reported, and what it says is not read

    Scenario: Billing, described in a spec and by its code
      Given a file "specs/ARCH-billing.feature" containing:
        """
        @id=ARCH-billing
        Feature: Billing

          Owns invoices.
        """
      And a file "src/billing.ts" containing:
        """
        /**
         * Bills customers monthly.
         *
         * @sdp is ARCH-billing
         */
        export class Billing {}
        """
      When I run "sdp arch"
      Then the exit code is 2
      And the output contains:
        """
        ARCH-billing (element)  src/billing.ts:4
        Bills customers monthly.
        """
      And the output does not contain "Owns invoices"
      And the output contains "not read: specs/ARCH-billing.feature:1 [declared-in-spec]"

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
        | id          | title       | source          | owner    | tier |
        | ARCH-ledger | ARCH-ledger | src/ledger.ts:4 | payments | 1    |
      And sdp reports:
        | rule             | severity | at                          | message                                                                            | hint                                                                                                                                         |
        | declared-in-spec | error    | specs/ARCH-ledger.feature:1 | ARCH-ledger is declared by its code, as every element is, so this spec is not read | move its words to the doc comment of its code, beside `@sdp is ARCH-ledger`, and its links to the rules of the features that realize it |

    Scenario: Billing's spec writes the retry pattern, which its code plays, and the outbox, which it does not yet
      Given a file "specs/ARCH-billing.feature" containing:
        """
        @id=ARCH-billing @plays:PAT-retry @plays:PAT-outbox
        Feature: Billing
        """
      And a file "src/retry.ts" containing:
        """
        /** @sdp is PAT-retry */
        export const retry = <A>(call: () => Promise<A>): Promise<A> => call()
        """
      And a file "src/billing.ts" containing:
        """
        /** @sdp is ARCH-billing */
        import { retry } from "./retry.ts"

        /** @sdp plays PAT-retry */
        export const charge = (): Promise<number> => retry(async () => 0)
        """
      When the workspace is loaded
      Then sdp reports:
        | rule             | severity | at                           |
        | declared-in-spec | error    | specs/ARCH-billing.feature:1 |
      And the workspace graph has edges:
        | from         | rel   | to        | sources          |
        | ARCH-billing | plays | PAT-retry | src/billing.ts:4 |
      And the edges from "ARCH-billing" are "ARCH-billing -plays-> PAT-retry"

  @decided-by:architecture-is-declared-in-doc-comments
  Rule: A pattern is declared in the doc comment of the code its instances share, and code that applies it says so with `@sdp plays`

    The code every instance goes through is the pattern's, and its comment says what the pattern
    is; an anchor declares a node of the kind its id's prefix names. `plays` is the team's word, and
    like any link it only names a pattern, which an anchor declares. Elements import elements: a
    pattern imports nothing, and nothing imports it.

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
      And the output contains "PAT-retry <-plays- ARCH-billing"

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

  Rule: An element links to each pattern its code links to, by the relation the code wrote, at the tag

    Code is part of each element anchored in its file, as its imports are: what it plays, they
    play. The relation is the code's own word, not one sdp makes, so a question asks for it as the
    code wrote it.

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
      When I query "#PAT-retry <-plays- element"
      Then the result is "<elements>"

      Examples:
        | code                                                            | billing                                                                                                                               | elements     |
        | the declaration that is billing                                 | /**\n * @sdp is ARCH-billing\n * @sdp plays PAT-retry\n */\nexport const charge = (): number => 0                                     | ARCH-billing |
        | a declaration of the file that is billing                       | /** @sdp is ARCH-billing */\nimport { retry } from "./retry.ts"\n\n/** @sdp plays PAT-retry */\nexport const charge = (): number => 0 | ARCH-billing |
        | a declaration of a file another declaration of which is billing | /** @sdp is ARCH-billing */\nexport class Billing {}\n\n/** @sdp plays PAT-retry */\nexport const charge = (): number => 0            | ARCH-billing |
        | code of no element                                              | /** @sdp plays PAT-retry */\nexport const charge = (): number => 0                                                                    | nothing      |

    Scenario: Billing plays the retry pattern in every answer
      Given a file "src/retry.ts" containing:
        """
        /** @sdp is PAT-retry */
        export const retry = <A>(call: () => Promise<A>): Promise<A> => call()
        """
      And a file "src/billing.ts" containing:
        """
        /** @sdp is ARCH-billing */
        import { retry } from "./retry.ts"

        /** @sdp plays PAT-retry */
        export const charge = (): Promise<number> => retry(async () => 0)
        """
      When the workspace is loaded
      Then the workspace graph has edges:
        | from         | rel   | to        | source           |
        | ARCH-billing | plays | PAT-retry | src/billing.ts:4 |
      When I run "sdp arch"
      Then the exit code is 0
      And the output contains "ARCH-billing -plays-> PAT-retry"
      And the output contains "PAT-retry <-plays- ARCH-billing"
      When I run "sdp arch --mermaid"
      Then the exit code is 0
      And the output contains "-->|plays|"
      When I run "sdp context PAT-retry"
      Then the exit code is 0
      And the output contains "PAT-retry <-plays- ARCH-billing"

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

  Rule: Each element is shown with the live work on it and the work still to come, the furthest along first

    The work on an element is each feature that names it, and each rule still to come of a feature
    built on it. What is still to come is in the order of the workspace's ladder, the last rung
    first: what has come furthest is the next to weigh on the element.

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
