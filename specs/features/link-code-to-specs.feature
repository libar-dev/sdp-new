@id=link-code-to-specs @maturity=implemented
@realized-by:ARCH-code-annotations @realized-by:ARCH-graph-builder @realized-by:ARCH-checker
Feature: Link code to specs

  Developers want the graph to know which code is which element, or implements what, so that a
  question can go from a feature to the code behind it and back. sdp reads the source and never
  runs it. In TypeScript and JavaScript an annotation is a call to `annotate` from
  `sdp/annotations`, whose ids the compiler checks once `sdp types` has declared them; in any
  language it can be a comment.

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
        // @sdp uses ARCH-ledger via=events
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
        | code:src/billing.ts#Billing | code    | Billing        | src/billing.ts:3             |
        | code:src/ledger.ts#Ledger   | code    | Ledger         | src/ledger.ts:1              |
        | ARCH-ledger                 | element | Ledger         | src/ledger.ts:1              |
      And the workspace graph has edges:
        | from                        | rel        | to           | attributes   |
        | code:src/billing.ts         | is         | ARCH-billing |              |
        | code:src/billing.ts#Billing | implements | pay          |              |
        | code:src/billing.ts#Billing | uses       | ARCH-ledger  | via="events" |
        | code:src/ledger.ts#Ledger   | is         | ARCH-ledger  |              |
      And node "ARCH-billing" has attribute owner = "payments"
      And node "ARCH-billing" has attribute tier = "1"

    Scenario: A maturity given in code decides the stage like one written in the spec
      Given a file "src/pay.py" containing:
        """
        # @sdp is pay maturity=idea
        def pay(): pass
        """
      When the workspace is loaded
      Then node "pay" has attribute maturity = "idea"
      And node "pay" has attribute stage = "idea"

  Rule: In TypeScript and JavaScript an annotation can be a call to the `annotate` that sdp exports, and to nothing else of that name

    Unlike a comment, a call is checked by the compiler and follows a rename; unlike a decorator, it
    runs in Node.js from source and does nothing when it runs.

    Scenario Outline: annotate is read from the sdp package or its annotations subpath, by its name or through a namespace
      Given a file "src/pay.ts" containing:
        """
        <import>

        export const pay = () => 0
        <annotate>(pay, { implements: "pay" })
        """
      When "src/pay.ts" is scanned for annotations
      Then the annotations are:
        | line | relation   | targets | binds to |
        | 4    | implements | pay     | pay      |

      Examples:
        | import                                     | annotate     |
        | import { annotate } from "sdp/annotations" | annotate     |
        | import { annotate } from "sdp"             | annotate     |
        | import * as sdp from "sdp/annotations"     | sdp.annotate |

    Scenario Outline: Functions named annotate from any other module are not annotations
      Given a file "src/pay.ts" containing:
        """
        import { annotate } from "<module>"

        export const pay = () => 0
        annotate(pay, { implements: "pay" })
        """
      When "src/pay.ts" is scanned for annotations
      Then the annotations are:
        | line |

      Examples:
        | module            |
        | ./decorators.ts   |
        | ./annotations.ts  |
        | ../annotations    |
        | @acme/annotations |

    Scenario Outline: A name declared again in an enclosing scope is not the import
      Given a file "src/pay.ts" containing:
        """
        import * as sdp from "sdp/annotations"
        import { annotate } from "sdp/annotations"

        export const pay = () => 0
        <code>
        """
      When "src/pay.ts" is scanned for annotations
      Then the annotations are:
        | line |

      Examples:
        | shadowed by                  | code                                                                                                                    |
        | a parameter                  | export const wrap = (annotate: (...a: Array<unknown>) => void) => annotate(pay, { is: "ARCH-fake" })                    |
        | a destructured parameter     | export function wrap({ annotate }: { annotate: Function }) { annotate(pay, { is: "ARCH-fake" }) }                       |
        | a constructor property       | export class Wrap { constructor(private annotate: Function) { annotate(pay, { is: "ARCH-fake" }) } }                    |
        | a block-level const          | { const annotate = (...a: Array<unknown>) => a; annotate(pay, { is: "ARCH-fake" }) }                                    |
        | a later function declaration | export function wrap() { annotate(pay, { is: "ARCH-fake" }); function annotate(...a: Array<unknown>) {} }               |
        | a var in a nested block      | export function wrap() { if (pay()) { var annotate = (...a: Array<unknown>) => a } annotate(pay, { is: "ARCH-fake" }) } |
        | a loop variable              | for (const annotate of [pay]) annotate(pay, { is: "ARCH-fake" })                                                        |
        | a catch parameter            | try { pay() } catch (annotate) { annotate(pay, { is: "ARCH-fake" }) }                                                   |
        | a namespace parameter        | export const wrap = (sdp: { annotate: Function }) => sdp.annotate(pay, { is: "ARCH-fake" })                             |

    Scenario: Outside the shadowing scope the import is read again
      Given a file "src/pay.ts" containing:
        """
        import { annotate } from "sdp/annotations"

        export const pay = () => 0
        export const wrap = (annotate: (...a: Array<unknown>) => void) => annotate(pay, { is: "ARCH-fake" })
        export const later = () => { annotate(pay, { implements: "pay" }) }
        annotate(wrap, { is: "ARCH-real" })
        """
      When "src/pay.ts" is scanned for annotations
      Then the annotations are:
        | line | relation   | targets   | binds to |
        | 5    | implements | pay       | pay      |
        | 6    | is         | ARCH-real | wrap     |

  Rule: An annotation links its target to each id it names, at the target's declaration and with its doc comment

    An answer leads to the code itself rather than to the annotation, and the code's own words reach
    the graph and the context bundles.

    Scenario: A typed annotation links a symbol, and brings its declaration's line and description
      Given a file "src/graph.ts" containing:
        """
        /**
         * Graph module.
         */
        import { annotate as a } from "sdp/annotations"

        /** The system graph. More detail follows.
         *
         * @internal
         */
        export class Graph {}
        a(Graph, { is: "ARCH-graph", "instance-of": ["PAT-derived-index"] })
        a(import.meta, { implements: "graph" })
        """
      When "src/graph.ts" is scanned for annotations
      Then the annotations are:
        | line | relation    | targets           | binds to | declared at | described as                           |
        | 11   | is          | ARCH-graph        | Graph    | 10          | The system graph. More detail follows. |
        | 11   | instance-of | PAT-derived-index | Graph    | 10          | The system graph. More detail follows. |
        | 12   | implements  | graph             | the file | 1           | Graph module.                          |

    Scenario: as const and satisfies change only types, so the objects inside are read
      Given a file "src/cache.ts" containing:
        """
        import { annotate, type Declaration } from "sdp/annotations"

        export const cache = new Map()
        annotate(cache, { is: "ARCH-cache" } as const, { kind: "element", title: "Page cache" } satisfies Declaration)
        annotate(cache, ({ uses: ["ARCH-store"] }) satisfies Record<string, unknown>)
        """
      When "src/cache.ts" is scanned for annotations
      Then the annotations are:
        | line | relation | targets    | binds to | attributes                        |
        | 4    | is       | ARCH-cache | cache    | kind="element" title="Page cache" |
        | 5    | uses     | ARCH-store | cache    |                                   |
      And sdp reports nothing

    Scenario: In the graph, typed annotations become code nodes at the declaration
      Given a file "src/pay.ts" containing:
        """
        import { annotate } from "sdp/annotations"

        /** Charges the card on file. */
        export const pay = () => 0
        annotate(pay, { implements: "pay" })
        """
      When the workspace is loaded
      Then the workspace graph has edges:
        | from                | rel        | to  |
        | code:src/pay.ts#pay | implements | pay |
      And node "code:src/pay.ts#pay" has attribute doc = "Charges the card on file."
      And node "code:src/pay.ts#pay" has attribute source = "src/pay.ts:4"

  Rule: A target is a module-level declaration, a property of one, or `import.meta`, and any other target is reported and links nothing

    A code node is named by its file and its target, and only a module-level name is unique there.

    Scenario: A property of a class, a constant and the module itself
      Given a file "src/graph.ts" containing:
        """
        import { annotate } from "sdp/annotations"

        export class Graph {}
        export const build = () => new Graph()
        annotate(Graph.prototype, { is: "ARCH-graph" })
        annotate(build, { is: "ARCH-builder" })
        annotate(import.meta, { implements: "graph" })
        """
      When "src/graph.ts" is scanned for annotations
      Then the annotations are:
        | line | relation   | targets      | binds to        |
        | 5    | is         | ARCH-graph   | Graph.prototype |
        | 6    | is         | ARCH-builder | build           |
        | 7    | implements | graph        | the file        |
      And sdp reports nothing

    Scenario Outline: A target declared inside a function, as a parameter, by an import, or nowhere
      Given a file "src/items.ts" containing:
        """
        import { annotate } from "sdp/annotations"
        import { Cart } from "./cart.ts"

        export const item = 0
        <code>
        """
      When "src/items.ts" is scanned for annotations
      Then the annotations are:
        | line |
      And sdp reports:
        | line | message                                                                                    |
        | 5    | the annotation target must be a module-level declaration or import.meta: <name> is not one |
      When I query "code"
      Then the result is "nothing"

      Examples:
        | declared as                  | name | code                                                                          |
        | a constant inside a function | item | export function first() { const item = 1; annotate(item, { is: "ARCH-a" }) } |
        | a parameter                  | item | export const second = (item: number) => annotate(item, { is: "ARCH-b" })      |
        | an import                    | Cart | annotate(Cart, { is: "ARCH-cart" })                                           |
        | nothing                      | cart | annotate(cart.items, { is: "ARCH-cart" })                                     |

  Rule: sdp types declares every id with its kind for annotate() to accept, and check says when the declarations no longer match

    An id that does not exist is then a compile error where it is written, not a dangling link found
    later; until the declarations are written, any string is accepted.

    Scenario: The ids are declared, and fall behind when a spec is added
      When I run "sdp types"
      Then the exit code is 0
      And the file ".sdp/ids.d.ts" contains '"pay": "feature"'
      When I run "sdp check --json"
      Then the JSON output has:
        | data | nothing |
      Given these specs:
        | tags                      | Feature |
        | @id=export @maturity=idea | Export  |
      When I run "sdp check --json"
      Then the JSON output has:
        | data.rule | types-stale   |
        | data.file | .sdp/ids.d.ts |

    Scenario: The compiler accepts any id until sdp types has run, and then only the ids it declared
      Given sdp is installed in the workspace
      And a file "tsconfig.json" containing:
        """
        { "include": ["src", ".sdp/ids.d.ts"] }
        """
      And a file "src/pay.ts" containing:
        """
        import { annotate } from "sdp/annotations"

        export const pay = () => 0
        annotate(pay, { implements: "pay" })
        """
      And a file "src/refund.ts" containing:
        """
        import { annotate } from "sdp/annotations"

        export const refund = () => 0
        annotate(refund, { implements: "refund" })
        """
      When I run "tsc --noEmit"
      Then the exit code is 0
      When I run "sdp types"
      Then the exit code is 0
      When I run "tsc --noEmit"
      Then the exit code is 1
      And the output contains "src/refund.ts(4,"
      And the output does not contain "src/pay.ts"

  Rule: A comment line `@sdp <relation> <ID>[, <ID>…] [key=value …]` annotates the declaration directly below it, or else the file

    Scenario Outline: A comment line in any language carries an annotation, bound to the declaration below it if sdp knows its keyword
      Given a file "<file>" containing:
        """
        <comment>
        <code>
        """
      When "<file>" is scanned for annotations
      Then the annotations are:
        | line | relation   | targets | binds to   |
        | 1    | implements | pay     | <binds to> |

      Examples:
        | file         | comment                      | code                             | binds to |
        | src/pay.ts   | // @sdp implements pay       | export async function pay() {}   | pay      |
        | src/pay.ts   | /** @sdp implements pay */   | export class Payment {}          | Payment  |
        | src/pay.js   | // @sdp implements pay       | export const Pay = () => <form/> | Pay      |
        | src/pay.py   | # @sdp implements pay        | def pay(order):                  | pay      |
        | src/pay.go   | // @sdp implements pay       | func Pay(order Order) error {    | Pay      |
        | src/pay.rs   | /// @sdp implements pay      | pub struct Payment {}            | Payment  |
        | db/pay.sql   | -- @sdp implements pay       | create table payments (id int);  | the file |
        | web/pay.html | <!-- @sdp implements pay --> | <form id="pay"></form>           | the file |
        | src/pay.clj  | ; @sdp implements pay        | (defn pay [order])               | the file |
        | src/pay.erl  | % @sdp implements pay        | pay(Order) -> ok.                | the file |

    Scenario: After a blank line, inside a doc comment, two in a row, with typed attributes
      Given a file "src/billing.ts" containing:
        """
        // @sdp is ARCH-billing kind=element title="Billing engine" tier=1

        /**
         * Charges cards.
         * @sdp implements pay, refund
         */
        export class Billing {}

        // @sdp uses ARCH-ledger via=events
        // @sdp instance-of PAT-outbox role=publisher
        export const post = () => {}
        """
      When "src/billing.ts" is scanned for annotations
      Then the annotations are:
        | line | relation    | targets      | binds to | attributes                                   |
        | 1    | is          | ARCH-billing | the file | kind="element" title="Billing engine" tier=1 |
        | 5    | implements  | pay, refund  | Billing  |                                              |
        | 9    | uses        | ARCH-ledger  | post     | via="events"                                 |
        | 10   | instance-of | PAT-outbox   | post     | role="publisher"                             |

    Scenario: Mentioning the marker is not an annotation, and one that follows code on its line is reported as ignored
      Given a file "src/help.ts" containing:
        """
        // Write `@sdp <relation> <ID>` above a symbol to link it.
        // @sdp implements <ID>
        const example = "@sdp implements pay"
        export class Help {} // @sdp implements pay
        """
      When "src/help.ts" is scanned for annotations
      Then the annotations are:
        | line |
      When the workspace is checked
      Then sdp reports at least:
        | rule               | at            |
        | annotation-ignored | src/help.ts:4 |

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

  Rule: What sdp cannot read without running the code is reported, never guessed

    A guessed annotation is a link nobody wrote, and a lost one a gap nobody sees.

    Scenario Outline: An id in a variable, a call as the target, or links in a variable
      Given a file "src/pay.ts" containing:
        """
        import { annotate } from "sdp/annotations"

        export const pay = () => 0
        const id = "pay"
        <call>
        """
      When "src/pay.ts" is scanned for annotations
      Then the annotations are:
        | line |
      And sdp reports:
        | line | message   |
        | 5    | <problem> |

      Examples:
        | call                                   | problem                              |
        | annotate(pay, { implements: id })      | ids must be string literals          |
        | annotate(pay(), { implements: "pay" }) | the annotation target must be a name |
        | annotate(pay, links)                   | the links must be an object literal  |

    Scenario Outline: A file that annotates but does not parse is reported, so none of its annotations is lost silently
      Given a file "src/pay.ts" containing:
        """
        <annotates>

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

      Examples:
        | annotates                                  |
        | import { annotate } from "sdp/annotations" |
        | // @sdp implements pay                     |

    Scenario: A file that does not parse and does not annotate is none of sdp's business
      Given a file "src/pay.ts" containing:
        """
        import { annotate } from "./decorators.ts"

        export const pay = ( => 0
        """
      When "src/pay.ts" is scanned for annotations
      Then the annotations are:
        | line |
      And sdp reports nothing

  Rule: Annotating costs nothing at run time: importing `sdp/annotations` loads no other module of sdp

    Application code imports it in production.

    Scenario: A fresh Node process that imports sdp/annotations loads one module of sdp
      When a fresh Node process imports "sdp/annotations"
      Then the output contains "/src/annotations.ts"
      And the output contains "/src/" 1 time

  @maturity=ready @decided-by:architecture-is-declared-in-doc-comments
  @replaces:link-code-to-specs#in-typescript-and-javascript-an-annotation-can-be-a-call-to-the
  @replaces:link-code-to-specs#a-target-is-a-module-level-declaration-a-property-of-one-or
  @replaces:link-code-to-specs#annotating-costs-nothing-at-run-time-importing-sdp-annotations
  @replaces:link-code-to-specs#an-annotation-links-its-target-to-each-id-it-names-at-the-target
  @replaces:link-code-to-specs#a-comment-line-sdp-relation-id-id-key-value-annotates-the
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

    Scenario: A call named annotate is code like any other
      Given a file "src/pay.ts" containing:
        """
        import { annotate } from "sdp/annotations"

        export const pay = (): number => 0
        annotate(pay, { implements: "pay" })
        """
      When the workspace is loaded
      Then sdp reports nothing
      When I query "code"
      Then the result is "nothing"

  @maturity=ready @decided-by:architecture-is-declared-in-doc-comments
  @replaces:link-code-to-specs#sdp-types-declares-every-id-with-its-kind-for-annotate-to-accept
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

  @maturity=ready
  Rule: Annotated code carries its shape: a declaration's signature, members or type, and a file's exports

    So the graph explains the code the architect annotated without the code being read. The shape
    is read as written, and leads with what the declaration is: a type the compiler would infer is
    not.

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

        const audit = (): void => {}
        """
      When the workspace is loaded
      Then the workspace graph has nodes:
        | id                  | doc                             | exports                                                       |
        | code:src/pricing.ts | Prices, VAT rates and rounding. | type Cents = number, function vatFor(net: Cents, rate: number): Cents |

  @maturity=ready
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
        | export const pay = 0.2                                                                         | nothing     |
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

  @maturity=ready
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
