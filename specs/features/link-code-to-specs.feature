@id=link-code-to-specs
@realized-by:ARCH-code-annotations @realized-by:ARCH-graph-builder @realized-by:ARCH-checker
Feature: Link code to specs

  Developers want the graph to know which code is which element, or implements what, so that a
  question can go from a feature to the code behind it and back. sdp reads the source and never
  runs it: an annotation is a tag in the comment that documents the code, in every language.

  Not a discovery of the architecture: an element is what an annotation states, never inferred
  from names, imports or the layout of files; between the elements stated, sdp derives which
  imports which (see-the-architecture).

  Background:
    Given these specs:
      | tags                   | Feature |
      | @id=pay @maturity=idea | Pay     |

  Rule: Annotated code is a code node linked to what it names, and an is link adds to its node only what no spec says

    Scenario: An element a spec declares and one only code declares
      Given these specs:
        | tags                             | Feature |
        | @id=ARCH-billing @owner=payments | Billing |
      And a file "src/billing.ts" containing:
        """
        // @sdp is ARCH-billing owner=platform tier=1

        // @sdp implements pay
        // @sdp uses ARCH-ledger
        export class Billing {}
        """
      And a file "src/ledger.ts" containing:
        """
        // @sdp is ARCH-ledger title="Ledger"
        export class Ledger {}
        """
      When the workspace is loaded
      Then the workspace graph has exactly these nodes:
        | id                          | kind    | title          | source                       |
        | pay                         | feature | Pay            | specs/pay.feature:1          |
        | ARCH-billing                | element | Billing        | specs/ARCH-billing.feature:1 |
        | code:src/billing.ts         | code    | src/billing.ts | src/billing.ts:1             |
        | code:src/billing.ts#Billing | code    | Billing        | src/billing.ts:5             |
        | code:src/ledger.ts#Ledger   | code    | Ledger         | src/ledger.ts:2              |
        | ARCH-ledger                 | element | Ledger         | src/ledger.ts:1              |
      And the workspace graph has edges:
        | from                        | rel        | to           |
        | code:src/billing.ts         | is         | ARCH-billing |
        | code:src/billing.ts#Billing | implements | pay          |
        | code:src/billing.ts#Billing | uses       | ARCH-ledger  |
        | code:src/ledger.ts#Ledger   | is         | ARCH-ledger  |
      And node "ARCH-billing" has attribute owner = "payments"
      And node "ARCH-billing" has attribute tier = "1"

    Scenario Outline: A tag names an id as a spec declares it: <id>
      Given a file "src/pay.ts" containing:
        """
        /** @sdp implements <id> */
        export const pay = (): number => 0
        """
      When the workspace is loaded
      Then the workspace graph has edges:
        | from                | rel        | to   | source       |
        | code:src/pay.ts#pay | implements | <id> | src/pay.ts:1 |

      Examples:
        | id               |
        | 2fa-login        |
        | ARCH-zählung     |
        | 支払い             |
        | pay#ein-schritt  |

    Scenario: A maturity given in code decides the stage like one written in the spec
      Given a file "src/pay.py" containing:
        """
        # @sdp is pay maturity=idea
        def pay(): pass
        """
      When the workspace is loaded
      Then node "pay" has attribute maturity = "idea"
      And node "pay" has attribute stage = "idea"

  Rule: In TypeScript and JavaScript only a real comment annotates, never a string; in other languages any line that reads like a comment does, best effort

    sdp parses TypeScript and JavaScript, so it tells a comment from a string; it has no parser for
    other languages, and reads them line by line.

    Scenario: In TypeScript and JavaScript a string is never an annotation
      Given a file "src/example.ts" containing:
        """
        export const example = `
        // @sdp is ARCH-fiction
        `
        const quoted = "// @sdp is ARCH-fiction"
        // @sdp is ARCH-real
        export const real = 1
        """
      When "src/example.ts" is scanned for annotations
      Then the annotations are:
        | line | relation | targets   | binds to |
        | 5    | is       | ARCH-real | real     |
      When I query "element"
      Then the result is "ARCH-real"

    Scenario: In Python a comment line counts even inside a multi-line string
      Given a file "src/example.py" containing:
        """
        text = '''
        # @sdp is ARCH-example
        '''
        """
      When "src/example.py" is scanned for annotations
      Then the annotations are:
        | line | relation | targets      | binds to |
        | 2    | is       | ARCH-example | the file |

  Rule: A file whose tags sdp cannot read is reported, never guessed

    A guessed annotation is a link nobody wrote, and a lost one a gap nobody sees. A tag that names
    something that is no id, or goes on after its ids with other words, was meant as a tag; one whose
    ids are placeholders, as `@sdp implements <ID>` in a guide, only mentions the form. `sdp/annotations`,
    the module of the `annotate()` that tags replaced, is reported wherever a file imports it: what
    its calls say is translated into tags only where a call plainly uses the import.

    Scenario: A file that annotates but does not parse is reported, so none of its annotations is lost silently
      Given a file "src/pay.ts" containing:
        """
        // @sdp implements pay

        export const pay = ( => 0
        """
      When "src/pay.ts" is scanned for annotations
      Then the annotations are:
        | line |
      And sdp reports:
        | line | message                                                                      |
        | 3    | the file does not parse, so its annotations cannot be read: Unexpected token |
      When the workspace is checked
      Then sdp reports at least:
        | rule                  |
        | annotation-unreadable |

    Scenario Outline: A tag that cannot be read as written: <case>
      Given a file "src/pay.ts" containing:
        """
        <code>
        """
      When the workspace is loaded
      Then sdp reports:
        | rule                  | at                | message   | hint   |
        | annotation-unreadable | src/pay.ts:<line> | <message> | <hint> |
      When I query "code"
      Then the result is "nothing"

      Examples:
        | case                         | code                                                                                                     | line | message                                                   | hint                                                         |
        | a list with a word that is no id | /** @sdp implements pay, pay? */\nexport const pay = (): number => 0                                   | 1    | "@sdp implements pay, pay?" names pay?, which is no id     | separated by commas                                          |
        | a word that is no id         | /** @sdp implements pay? */\nexport const pay = (): number => 0                                         | 1    | "@sdp implements pay?" names pay?, which is no id          | separated by commas                                          |
        | words after its ids          | /** @sdp is ARCH-billing handles payments */\nexport const pay = (): number => 0                          | 1    | "@sdp is ARCH-billing handles payments" goes on after its ids with "handles payments" | separated by commas |
        | attributes and no id         | /** @sdp is owner=payments */\nexport const pay = (): number => 0                                       | 1    | "@sdp is owner=payments" names no id                       | separated by commas                                          |
        | a placeholder left open      | /** @sdp is <billing */\nexport const pay = (): number => 0                                              | 1    | "@sdp is <billing" names <billing, which is no id         | separated by commas                                          |
        | an id that ends a sentence   | /** @sdp is ARCH-billing. */\nexport const pay = (): number => 0                                         | 1    | "@sdp is ARCH-billing." names ARCH-billing., which is no id | no full stop at its end                                      |
        | the retired annotate() | import { annotate } from "sdp/annotations"\n\nexport const pay = (): number => 0\nannotate(pay, { implements: ["pay", "refund"] }) | 1 | sdp/annotations is retired, so no annotate() of it is read | in the doc comment of pay, @sdp implements pay, refund (the call at line 4) |
        | the retired annotate(), of a namespace | import * as annotations from "sdp/annotations"\n\nexport const pay = (): number => 0\nannotations.annotate(pay, { implements: "pay" }) | 1 | sdp/annotations is retired, so no annotate() of it is read | in the doc comment of pay, @sdp implements pay (the call at line 4) |
        | the retired module, as its default | import annotations from "sdp/annotations"\n\nexport const pay = (): number => 0\nannotations.annotate(pay, { implements: "pay" }) | 1 | sdp/annotations is retired, so no annotate() of it is read | in the doc comment of pay, @sdp implements pay (the call at line 4) |
        | the retired module, for its effects | import "sdp/annotations"\n\nexport const pay = (): number => 0 | 1 | sdp/annotations is retired, so no annotate() of it is read | in the doc comment of each declaration: `@sdp <relation> <ID>` |
        | the retired module, with import() | export const pay = (): number => 0\n\nvoid import("sdp/annotations") | 3 | sdp/annotations is retired, so no annotate() of it is read | in the doc comment of each declaration: `@sdp <relation> <ID>` |
        | the retired module, with require() | const { annotate } = require("sdp/annotations")\n\nexport const pay = (): number => 0\nannotate(pay, { implements: "pay" }) | 1 | sdp/annotations is retired, so no annotate() of it is read | in the doc comment of each declaration: `@sdp <relation> <ID>` |
        | a retired call a name declared after it would hide | import { annotate } from "sdp/annotations"\n\nexport const pay = (): number => 0\nexport function paid(note = annotate(pay, { implements: "pay" })): void {\n  var annotate\n} | 1 | sdp/annotations is retired, so no annotate() of it is read | in the doc comment of pay, @sdp implements pay (the call at line 4) |

    Scenario: A file that does not parse and does not annotate is none of sdp's business
      Given a file "src/pay.ts" containing:
        """
        // Pays: see the pay feature.

        export const pay = ( => 0
        """
      When "src/pay.ts" is scanned for annotations
      Then the annotations are:
        | line |
      And sdp reports nothing

  @decided-by:architecture-is-declared-in-doc-comments
  Rule: A tag in a doc comment is the one form of annotation, in every language

    The tag annotates the declaration the comment documents, or the file when the comment opens it,
    and the rest of the comment is that code's description. A code node is named by its file and
    its declaration, and only a module-level name is unique there.

    Scenario: A file and a declaration, each tagged in the comment that describes it
      Given a file "src/pricing.ts" containing:
        """
        /**
         * Prices and VAT.
         *
         * @sdp is ARCH-pricing
         */
        import { round } from "./round.ts"

        /**
         * A cart's total, rounded once.
         *
         * @sdp implements pay
         */
        export const total = (net: number): number => round(net)
        """
      When the workspace is loaded
      Then the workspace graph has nodes:
        | id                        | source            | doc                           |
        | code:src/pricing.ts       | src/pricing.ts:1  | Prices and VAT.               |
        | code:src/pricing.ts#total | src/pricing.ts:13 | A cart's total, rounded once. |
      And the workspace graph has edges:
        | from                      | rel        | to           | source            |
        | code:src/pricing.ts       | is         | ARCH-pricing | src/pricing.ts:4  |
        | code:src/pricing.ts#total | implements | pay          | src/pricing.ts:11 |
      And sdp reports nothing

    Scenario Outline: The words of the comment around the tag describe the code
      Given a file "src/pay.ts" containing:
        """
        <comment>
        export const pay = (): number => 0
        """
      When the workspace is loaded
      Then the workspace graph has nodes:
        | id                  | source            | doc                       |
        | code:src/pay.ts#pay | src/pay.ts:<line> | Charges the card on file. |

      Examples:
        | written as                         | comment                                                                       | line |
        | the tag after the words            | /**\n * Charges the card on file.\n *\n * @sdp implements pay\n */            | 6    |
        | the tag before the words           | /**\n * @sdp implements pay\n *\n * Charges the card on file.\n */            | 6    |
        | a JSDoc tag of its own after them  | /**\n * Charges the card on file.\n *\n * @internal\n * @sdp implements pay\n */ | 7    |
        | line comments                      | // Charges the card on file.\n// @sdp implements pay                          | 3    |
        | a tag below the doc comment        | /** Charges the card on file. */\n// @sdp implements pay                      | 3    |
        | a comment of its own above it      | // Copyright 2026 Acme Corp.\n/**\n * Charges the card on file.\n *\n * @sdp implements pay\n */ | 7    |
        | a doc comment of its own above it  | /** @license MIT */\n/**\n * Charges the card on file.\n *\n * @sdp implements pay\n */      | 7    |

    Scenario Outline: In <language>, the comment lines around the tag describe the code
      Given a file "<file>" containing:
        """
        <code>
        """
      When the workspace is loaded
      Then the workspace graph has nodes:
        | id     | doc                       |
        | <node> | Charges the card on file. |

      Examples:
        | language | file       | code                                                                         | node                |
        | Python   | src/pay.py | # Charges the card on file.\n# @sdp implements pay\ndef pay(): pass          | code:src/pay.py#pay |
        | Go       | src/pay.go | // Charges the card on file.\n//\n// @sdp implements pay\nfunc Pay() error { | code:src/pay.go#Pay |
        | Ruby     | src/pay.rb | # @sdp implements pay\n# Charges the card on file.\ndef pay                   | code:src/pay.rb#pay |

    Scenario Outline: A decorated declaration, <placed>
      Given a file "src/pay.ts" containing:
        """
        <before>/**
         * Charges the card on file.
         *
         * @sdp implements pay
         */
        <declaration>
        """
      When the workspace is loaded
      Then the workspace graph has edges:
        | from                    | rel        | to  | source            |
        | code:src/pay.ts#Payment | implements | pay | src/pay.ts:<line> |
      And sdp reports nothing

      Examples:
        | placed                     | before                                    | declaration                         | line |
        | first in the file          |                                           | @sealed()\nexport class Payment {}  | 4    |
        | after an import            | import { sealed } from "./sealed.ts"\n\n | @sealed()\nexport class Payment {}  | 6    |
        | its decorator after export | import { sealed } from "./sealed.ts"\n\n | export @sealed() class Payment {}   | 6    |

    Scenario Outline: A tag in a comment that documents no module-level declaration and opens no file links nothing, and is reported
      Given a file "src/items.ts" containing:
        """
        import { Cart } from "./cart.ts"

        export const item = 0
        <code>
        """
      When the workspace is loaded
      Then sdp reports:
        | rule               | at                  | message                                                       |
        | annotation-ignored | src/items.ts:<line> | documents no module-level declaration and does not open the file |
      When I query "code"
      Then the result is "nothing"

      Examples:
        | in                                | code                                                                       | line |
        | a function                        | export function first() {\n  /** @sdp is ARCH-a */\n  const local = 1\n}  | 5    |
        | a class                           | export class Cart {\n  /** @sdp is ARCH-b */\n  total(): number {\n    return 0\n  }\n} | 5    |
        | a comment above a statement       | // @sdp is ARCH-c\nconsole.log(item)                                       | 4    |
        | a comment apart from what follows | // @sdp is ARCH-d\n\nexport const other = 1                                | 4    |

    Scenario Outline: A call named annotate is code like any other: <case>
      Given a file "src/pay.ts" containing:
        """
        <code>
        """
      When the workspace is loaded
      Then sdp reports nothing
      When I query "code"
      Then the result is "nothing"

      Examples:
        | case                                     | code                                                                                                                              |
        | a function of another module             | import { annotate } from "./notes.ts"\n\nexport const pay = (): number => 0\nannotate(pay, { implements: "pay" })                   |
        | a function of another module, imported whole | import * as notes from "./notes.ts"\n\nexport const pay = (): number => 0\nnotes.annotate(pay, { implements: "pay" })              |
        | a function of the file's own                 | const annotate = (note: unknown, links: object): void => {}\n\nexport const pay = (): number => 0\nannotate(pay, { implements: "pay" }) |

    Scenario Outline: A comment line in any language carries a tag, bound to the declaration below it if sdp knows its keyword
      Given a file "sdp.config.yaml" containing:
        """
        code: ["src/**", "db/**", "web/**"]
        """
      And a file "<file>" containing:
        """
        <comment>
        <code>
        """
      When the workspace is loaded
      Then the workspace graph has edges:
        | from        | rel        | to  | source   |
        | <code node> | implements | pay | <file>:1 |

      Examples:
        | file         | comment                      | code                             | code node                |
        | src/pay.ts   | // @sdp implements pay       | export async function pay() {}   | code:src/pay.ts#pay      |
        | src/pay.ts   | /** @sdp implements pay */   | export class Payment {}          | code:src/pay.ts#Payment  |
        | src/pay.js   | // @sdp implements pay       | export const Pay = () => <form/> | code:src/pay.js#Pay      |
        | src/pay.py   | # @sdp implements pay        | def pay(order):                  | code:src/pay.py#pay      |
        | src/pay.go   | // @sdp implements pay       | func Pay(order Order) error {    | code:src/pay.go#Pay      |
        | src/pay.rs   | /// @sdp implements pay      | pub struct Payment {}            | code:src/pay.rs#Payment  |
        | db/pay.sql   | -- @sdp implements pay       | create table payments (id int);  | code:db/pay.sql          |
        | web/pay.html | <!-- @sdp implements pay --> | <form id="pay"></form>           | code:web/pay.html        |
        | src/pay.clj  | ; @sdp implements pay        | (defn pay [order])               | code:src/pay.clj         |
        | src/pay.erl  | % @sdp implements pay        | pay(Order) -> ok.                | code:src/pay.erl         |
        | src/pay.py   | # @sdp implements pay        | @app.route("/pay")\ndef pay():   | code:src/pay.py#pay      |
        | src/Pay.java | /** @sdp implements pay */   | @Service\npublic class Payment {} | code:src/Pay.java#Payment |
        | src/pay.py   | # @sdp implements pay        | @app.route(\n    "/pay",\n    methods=["POST"],\n)\n@login_required\ndef pay(): | code:src/pay.py#pay      |
        | src/Pay.java | /** @sdp implements pay */   | @RequestMapping("/pay") @ResponseBody\npublic class Payment {} | code:src/Pay.java#Payment |
        | src/Pay.cs   | /// @sdp implements pay      | [ApiController]\n[Route("api/[controller]")]\npublic class Payment {} | code:src/Pay.cs#Payment  |
        | src/pay.rs   | /// @sdp implements pay      | #[derive(\n    Debug,\n)]\npub struct Payment {} | code:src/pay.rs#Payment  |

    Scenario: After a blank line, inside a doc comment, two in a row, with typed attributes
      Given a file "src/billing.ts" containing:
        """
        // @sdp is ARCH-billing kind=element title="Billing engine" tier=1

        /**
         * Charges cards.
         * @sdp implements pay, refund
         */
        export class Billing {}

        // @sdp uses ARCH-ledger
        // @sdp instance-of PAT-outbox
        export const post = () => {}
        """
      When the workspace is loaded
      Then the workspace graph has edges:
        | from                        | rel         | to           | source            |
        | code:src/billing.ts         | is          | ARCH-billing | src/billing.ts:1  |
        | code:src/billing.ts#Billing | implements  | pay          | src/billing.ts:5  |
        | code:src/billing.ts#Billing | implements  | refund       | src/billing.ts:5  |
        | code:src/billing.ts#post    | uses        | ARCH-ledger  | src/billing.ts:9  |
        | code:src/billing.ts#post    | instance-of | PAT-outbox   | src/billing.ts:10 |
      And the workspace graph has nodes:
        | id           | kind    | title          |
        | ARCH-billing | element | Billing engine |
      When the graph is exported
      Then the output contains '"tier":1'

    Scenario: Mentioning the marker is not an annotation, and one that follows code on its line is reported as ignored
      Given a file "src/help.ts" containing:
        """
        // Write `@sdp <relation> <ID>` above a symbol to link it.
        // @sdp implements <ID>
        const example = "@sdp implements pay"
        export class Help {} // @sdp implements pay
        """
      When the workspace is loaded
      Then sdp reports:
        | rule               | at            | message                             |
        | annotation-ignored | src/help.ts:4 | follows code on the same line       |
      When I query "code"
      Then the result is "nothing"

    Scenario Outline: A doc comment's own tags are read, not those of code it shows: <shown>
      Given a file "src/mailer.ts" containing:
        """
        /**
         * Registers the mailer.
         *
        <lines>
         */
        export const register = (): number => 0
        """
      When the workspace is loaded
      Then sdp reports nothing
      When I query "code -*-> *"
      Then the result is "<links>"

      Examples:
        | shown                                      | lines                                                                       | links   |
        | an example                                 | * @example\n * // @sdp implements pay                                       | nothing |
        | an example with a decorator in it          | * @example\n * @Injectable()\n * // @sdp implements pay\n * class Mailer {} | nothing |
        | a fenced block                             | * ```ts\n * // @sdp implements pay\n * ```                                  | nothing |
        | an example, then the comment's own tag     | * @example\n * register()\n *\n * @sdp implements pay                       | pay     |
        | a fenced block, then the comment's own tag | * ```ts\n * // @sdp is ARCH-mailer\n * ```\n *\n * @sdp implements pay      | pay     |

    Scenario Outline: A tag after words on its line is not read, and is reported: <language>
      Given a file "<file>" containing:
        """
        <comment>
        <code>
        """
      When the workspace is loaded
      Then sdp reports:
        | rule               | at       | message                                           |
        | annotation-ignored | <file>:1 | "@sdp implements pay" follows words on its line   |
      When I query "code"
      Then the result is "nothing"

      Examples:
        | language   | file       | comment                                                | code                               |
        | TypeScript | src/pay.ts | /** Charges the card on file. @sdp implements pay */   | export const pay = (): number => 0 |
        | Python     | src/pay.py | # Charges the card on file. @sdp implements pay        | def pay(): pass                    |

  @decided-by:architecture-is-declared-in-doc-comments
  Rule: An id that no node declares is reported by sdp check where the tag names it

    Scenario Outline: A tag that names refund, which nothing declares
      Given a file "<file>" containing:
        """
        <content>
        """
      When the workspace is checked
      Then sdp reports:
        | rule          | severity | at   | message                                   |
        | dangling-link | error    | <at> | -implements-> refund: no node has id refund |

      Examples:
        | file          | content                                                                                     | at              |
        | src/refund.ts | /**\n * Pays back.\n *\n * @sdp implements pay, refund\n */\nexport const back = (): number => 0 | src/refund.ts:4 |
        | src/refund.py | # @sdp implements refund\ndef back(): pass                                                  | src/refund.py:1 |

    Scenario: An id that a spec or a tag declares is not reported
      Given a file "src/pay.ts" containing:
        """
        /** @sdp is ARCH-payments */

        /**
         * Charges the card on file.
         *
         * @sdp implements pay
         * @sdp uses ARCH-payments
         */
        export const pay = (): number => 0
        """
      When the workspace is checked
      Then sdp reports nothing

  Rule: Annotated code carries its shape: a declaration's signature, members or type, and a file's exports

    So the graph explains the code the architect annotated without the code being read. The shape
    is read as written, and leads with what the declaration is: a type the compiler would infer is
    not. A variable is its written type, or else the function its value is: one written there, or
    the body `Effect.fn` and `Effect.fnUntraced` make one of, as their documentation has it. What any
    other call gives back only a type checker knows. An overloaded function is its public signatures.
    As in a declaration file, a default value is left out, and only a literal's type said of it; the
    body of a function is code, not surface, even where a class extends a call.

    Scenario: An interface and a function, each tagged in the comment that describes it
      Given a file "src/pricing.ts" containing:
        """
        /**
         * A cart line's price, in integer cents.
         *
         * @sdp is ARCH-pricing
         */
        export interface Priced {
          readonly net: number
          readonly vat: number
        }

        /**
         * Totals a cart, rounding once.
         *
         * @sdp is ARCH-pricing
         */
        export const total = (lines: ReadonlyArray<Priced>): number => lines.reduce((sum, line) => sum + line.net + line.vat, 0)
        """
      When the workspace is loaded
      Then the workspace graph has nodes:
        | id                         | doc                                    | shape                                                           |
        | code:src/pricing.ts#Priced | A cart line's price, in integer cents. | interface Priced { readonly net: number; readonly vat: number } |
        | code:src/pricing.ts#total  | Totals a cart, rounding once.          | function total(lines: ReadonlyArray<Priced>): number            |

    Scenario Outline: The shape of each kind of declaration
      Given a file "src/cart.ts" containing:
        """
        import { Effect } from "effect"

        /** @sdp is ARCH-cart */
        <declaration>
        """
      When the workspace is loaded
      Then the workspace graph has nodes:
        | id                     | shape   |
        | code:src/cart.ts#<name> | <shape> |

      Examples:
        | name   | declaration                                                                                                                                        | shape                                                                                         |
        | total  | export function total(lines: ReadonlyArray<number>): number {\n  return lines.length\n}                                                            | function total(lines: ReadonlyArray<number>): number                                          |
        | first  | export const first = <T>(lines: ReadonlyArray<T>): T \| undefined => lines[0]                                                                      | function first<T>(lines: ReadonlyArray<T>): T \| undefined                                    |
        | load   | export const load = Effect.fn("load")(function*(id: string): Effect.fn.Return<number> {\n  return id.length\n})                                    | function load(id: string): Effect.fn.Return<number>                                           |
        | Cart   | export class Cart {\n  readonly lines: Array<number> = []\n  #secret = 1\n  private hidden = 2\n  constructor(readonly owner: string) {}\n  add(line: number): void {\n    this.lines.push(line)\n  }\n} | class Cart { readonly lines: Array<number>; constructor(readonly owner: string); add(line: number): void } |
        | Cents  | export type Cents = number                                                                                                                         | type Cents = number                                                                           |
        | rates  | export const rates: Readonly<Record<string, number>> = { DE: 19 }                                                                                  | const rates: Readonly<Record<string, number>>                                                 |
        | limit  | export const limit = 3                                                                                                                             | const limit                                                                                   |
        | Side   | export enum Side { Buy, Sell }                                                                                                                     | enum Side { Buy, Sell }                                                                       |
        | count  | export let count: number                                                                                                                           | let count: number                                                                             |
        | ready  | export declare const ready: boolean                                                                                                                | const ready: boolean                                                                          |
        | doubled | export const doubled = [1, 2].map((n: number): number => n * 2)                                                                                  | const doubled                                                                                 |
        | traced | export const traced = trace(function(id: string): number {\n  return id.length\n})                                                                 | const traced                                                                                  |
        | square | export const square: (n: number) => number = (n) => n * n                                                                                          | const square: (n: number) => number                                                           |
        | spanned | export const spanned = Effect.fn("spanned")(function*(id: string): Effect.fn.Return<number> {\n  return id.length\n}, Effect.withSpan("cart"))   | function spanned(id: string): Effect.fn.Return<number>                                        |
        | size   | export const size = Effect.fnUntraced(function*(id: string): Effect.fn.Return<number> {\n  return id.length\n})                                    | function size(id: string): Effect.fn.Return<number>                                           |
        | parse  | export function parse(text: string): number\nexport function parse(text: string, radix: number): number\nexport function parse(text: string, radix = 10): number {\n  return Number.parseInt(text, radix)\n} | function parse(text: string): number; function parse(text: string, radix: number): number |
        | charge | export function charge(cents: number, retries = defaultRetries(), { delay = 100 }: Backoff = {}): number {\n  return cents\n} | function charge(cents: number, retries?, { delay }?: Backoff): number |
        | page   | export function page(size = 20, label = "all", open = true, big = -1n, last?: string): number {\n  return size\n}                                  | function page(size?: number, label?: string, open?: boolean, big?: bigint, last?: string): number |
        | pad    | export function pad(width = 2, text: string, fill: string = " ", align = left()): string {\n  return text\n}                                       | function pad(width: number \| undefined, text: string, fill?: string, align?): string         |
        | Ledger | export class Ledger {\n  constructor(private readonly db: string, public name = "main") {}\n  post(entry: string): void\n  post(entry: number): void\n  post(entry: string \| number): void {\n    void entry\n  }\n  protected audit(): void {}\n} | class Ledger { constructor(db: string, public name?: string); post(entry: string): void; post(entry: number): void } |
        | Point  | export class Point {\n  constructor(public x: number = 0, y: number, onMove: (to: number) => void = () => {}, z: number) {}\n}                     | class Point { constructor(public x: number \| undefined, y: number, onMove: ((to: number) => void) \| undefined, z: number) } |
        | Billing | export class Billing extends Effect.Service<Billing>()("Billing", {\n  effect: Effect.gen(function*() {\n    const key = process.env.STRIPE_KEY ?? "sk_live_fallback"\n    return { key }\n  }),\n  fallback: () => process.env.STRIPE_KEY\n}) {} | class Billing extends Effect.Service<Billing>()("Billing", { effect: Effect.gen(function*() {…}), fallback: () => … }) {} |
        | Person | export class Person extends Schema.Class<Person>("Person")({ id: Schema.Number, name: Schema.String }) {}                                          | class Person extends Schema.Class<Person>("Person")({ id: Schema.Number, name: Schema.String }) {} |
        | Missing | export class Missing extends Data.TaggedError("Missing")<{\n  readonly id: string\n}> {}                                                           | class Missing extends Data.TaggedError("Missing")<{ readonly id: string }> {}                 |
        | Base   | export abstract class Base<T> extends Object implements Iterable<T> {\n  abstract each(): void\n} | abstract class Base<T> extends Object implements Iterable<T> { abstract each(): void } |

    Scenario: A tag that opens a file gives the shapes of what the file exports
      Given a file "src/pricing.ts" containing:
        """
        /**
         * Prices, VAT rates and rounding.
         *
         * @sdp is ARCH-pricing
         */
        import { round } from "./round.ts"

        export type Cents = number

        /** The VAT on a net amount, rounded once. */
        export const vatFor = (net: Cents, rate: number): Cents => round((net * rate) / 100)

        export let rounding: number

        export function cents(euros: number): Cents
        export function cents(euros: string): Cents
        export function cents(euros: number | string): Cents {
          return Math.round(Number(euros) * 100)
        }

        const audit = (): void => {}

        class Rates {
          vat(country: string): number {
            return country === "DE" ? 19 : 20
          }
        }
        export default Rates
        """
      When the workspace is loaded
      Then the workspace graph has nodes:
        | id                  | doc                             | exports                                                                                                                                                 |
        | code:src/pricing.ts | Prices, VAT rates and rounding. | type Cents = number, function vatFor(net: Cents, rate: number): Cents, let rounding: number, function cents(euros: number): Cents; function cents(euros: string): Cents, class Rates { vat(country: string): number } |

  Rule: sdp check asks an annotated function to state its return type

    Without it the shape says nothing of what the function gives back, and sdp infers no type.

    Scenario Outline: A tagged function, with and without a return type
      Given a file "src/pay.ts" containing:
        """
        import { Effect } from "effect"

        /**
         * Charges the card on file.
         *
         * @sdp implements pay
         */
        <declaration>
        """
      When the workspace is checked
      Then sdp reports "<reported>"

      Examples:
        | declaration                                                                                    | reported    |
        | export const pay = (amount: number): number => amount                                          | nothing     |
        | export const pay = (amount: number) => amount                                                  | return-type |
        | export function pay(amount: number) {\n  return amount\n}                                      | return-type |
        | export const pay = Effect.fn("pay")(function*(amount: number) {\n  return amount\n})           | return-type |
        | export const pay = Effect.fn("pay")(function*(amount: number): Effect.fn.Return<number> {\n  return amount\n}) | nothing     |
        | export const pay = Effect.fn("pay")(function*(amount: number) {\n  return amount\n}, Effect.withSpan("pay")) | return-type |
        | export const pay = Effect.fn(`pay`)(function*(amount: number) {\n  return amount\n})           | return-type |
        | export const pay = Effect.fn("card." + "pay")(function*(amount: number) {\n  return amount\n}) | return-type |
        | export const pay = 0.2                                                                         | nothing     |
        | export const pay = [1, 2].map((amount: number) => amount)                                      | nothing     |
        | export const pay: (amount: number) => number = (amount) => amount                              | nothing     |
        | export class Pay {\n  amount() {\n    return 0\n  }\n}                                         | nothing     |

    Scenario: Reported at the function, as a warning
      Given a file "src/pay.ts" containing:
        """
        /**
         * Charges the card on file.
         *
         * @sdp implements pay
         */
        export const pay = (amount: number) => amount
        """
      When the workspace is checked
      Then sdp reports:
        | rule        | severity | at           | message                                         |
        | return-type | warning  | src/pay.ts:6 | code:src/pay.ts#pay states no return type        |

  Rule: A key=value on an annotation describes only the node it declares; a link has no attributes

    A link is a fact between two nodes and nothing more: what would qualify it belongs to one of
    them, or to the comment that describes the code.

    Scenario: An element declared with attributes, and a link written with one
      Given a file "src/billing.ts" containing:
        """
        /**
         * Charges cards.
         *
         * @sdp is ARCH-billing owner=payments tier=1
         * @sdp uses ARCH-ledger via=events
         */
        export class Billing {}
        """
      And a file "src/ledger.ts" containing:
        """
        /** @sdp is ARCH-ledger */
        export class Ledger {}
        """
      When the workspace is loaded
      Then the workspace graph has nodes:
        | id           | owner    | tier |
        | ARCH-billing | payments | 1    |
      And sdp reports:
        | rule               | severity | at               | message                                                 |
        | annotation-ignored | warning  | src/billing.ts:5 | via=events describes no node: a link has no attributes |
      When the graph is exported
      Then the output contains '{"type":"edge","from":"code:src/billing.ts#Billing","rel":"uses","to":"ARCH-ledger","declared":[{"file":"src/billing.ts","line":5}]}'
