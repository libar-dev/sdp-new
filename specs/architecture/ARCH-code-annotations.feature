@id=ARCH-code-annotations
@instance-of:PAT-pipes-and-filters @uses:ARCH-vocabulary @decided-by:DEC-0009
Feature: Code annotations

  Links code into the graph. In TypeScript and JavaScript an annotation is code, a call to
  `annotate` from `sdp/annotations` that the compiler checks; in every language it may also be a
  comment. Both are read statically: sdp never runs the code.

  @decided-by:DEC-0009
  Rule: In TypeScript and JavaScript an annotation is a call to the `annotate` that sdp exports, and to nothing else of that name

    Scenario Outline: annotate is read from the sdp package or its annotations subpath, by its name or through a namespace
      Given a file "src/pay.ts" containing:
        """
        <import>

        export const pay = () => 0
        <annotate>(pay, { implements: "REQ-pay" })
        """
      When "src/pay.ts" is scanned for annotations
      Then the annotations are:
        | line | relation   | targets | binds to |
        | 4    | implements | REQ-pay | pay      |

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
        annotate(pay, { implements: "REQ-pay" })
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
        export const later = () => { annotate(pay, { implements: "REQ-pay" }) }
        annotate(wrap, { is: "ARCH-real" })
        """
      When "src/pay.ts" is scanned for annotations
      Then the annotations are:
        | line | relation   | targets   | binds to |
        | 5    | implements | REQ-pay   | pay      |
        | 6    | is         | ARCH-real | wrap     |

  Rule: An annotation links its target to each id it names, at the target's declaration and with its doc comment

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
        a(import.meta, { implements: "REQ-graph" })
        """
      When "src/graph.ts" is scanned for annotations
      Then the annotations are:
        | line | relation    | targets           | binds to | declared at | described as                           |
        | 11   | is          | ARCH-graph        | Graph    | 10          | The system graph. More detail follows. |
        | 11   | instance-of | PAT-derived-index | Graph    | 10          | The system graph. More detail follows. |
        | 12   | implements  | REQ-graph         | the file | 1           | Graph module.                          |

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
      Given these specs:
        | tags        | Feature |
        | @id=REQ-pay | Pay     |
      And a file "src/pay.ts" containing:
        """
        import { annotate } from "sdp/annotations"

        /** Charges the card on file. */
        export const pay = () => 0
        annotate(pay, { implements: "REQ-pay" })
        """
      When the workspace is loaded
      Then the workspace graph has edges:
        | from                | rel        | to      |
        | code:src/pay.ts#pay | implements | REQ-pay |
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
        annotate(import.meta, { implements: "REQ-graph" })
        """
      When "src/graph.ts" is scanned for annotations
      Then the annotations are:
        | line | relation   | targets      | binds to        |
        | 5    | is         | ARCH-graph   | Graph.prototype |
        | 6    | is         | ARCH-builder | build           |
        | 7    | implements | REQ-graph    | the file        |
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

  Rule: What sdp cannot read without running the code is reported, never guessed

    A guessed annotation is a link nobody wrote, and a lost one a gap nobody sees.

    Scenario Outline: An id in a variable, a call as the target, or links in a variable
      Given a file "src/pay.ts" containing:
        """
        import { annotate } from "sdp/annotations"

        export const pay = () => 0
        const id = "REQ-pay"
        <call>
        """
      When "src/pay.ts" is scanned for annotations
      Then the annotations are:
        | line |
      And sdp reports:
        | line | message   |
        | 5    | <problem> |

      Examples:
        | call                                       | problem                              |
        | annotate(pay, { implements: id })          | ids must be string literals          |
        | annotate(pay(), { implements: "REQ-pay" }) | the annotation target must be a name |
        | annotate(pay, links)                       | the links must be an object literal  |

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
        | // @sdp implements REQ-pay                 |

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

  Rule: Annotating costs nothing at run time: `sdp/annotations` imports nothing

    Application code imports it in production.

    Scenario: A fresh Node process that imports sdp/annotations loads one module of sdp
      When a fresh Node process imports "sdp/annotations"
      Then the output contains "/src/annotations.ts"
      And the output contains "/src/" 1 time

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
        | 1    | implements | REQ-pay | <binds to> |

      Examples:
        | file         | comment                          | code                             | binds to |
        | src/pay.ts   | // @sdp implements REQ-pay       | export async function pay() {}   | pay      |
        | src/pay.ts   | /** @sdp implements REQ-pay */   | export class Payment {}          | Payment  |
        | src/pay.js   | // @sdp implements REQ-pay       | export const Pay = () => <form/> | Pay      |
        | src/pay.py   | # @sdp implements REQ-pay        | def pay(order):                  | pay      |
        | src/pay.go   | // @sdp implements REQ-pay       | func Pay(order Order) error {    | Pay      |
        | src/pay.rs   | /// @sdp implements REQ-pay      | pub struct Payment {}            | Payment  |
        | db/pay.sql   | -- @sdp implements REQ-pay       | create table payments (id int);  | the file |
        | web/pay.html | <!-- @sdp implements REQ-pay --> | <form id="pay"></form>           | the file |
        | src/pay.clj  | ; @sdp implements REQ-pay        | (defn pay [order])               | the file |
        | src/pay.erl  | % @sdp implements REQ-pay        | pay(Order) -> ok.                | the file |

    Scenario: After a blank line, inside a doc comment, two in a row, with typed attributes
      Given a file "src/billing.ts" containing:
        """
        // @sdp is ARCH-billing kind=element title="Billing engine" tier=1

        /**
         * Charges cards.
         * @sdp implements REQ-pay, REQ-refund
         */
        export class Billing {}

        // @sdp uses ARCH-ledger via=events
        // @sdp instance-of PAT-outbox role=publisher
        export const post = () => {}
        """
      When "src/billing.ts" is scanned for annotations
      Then the annotations are:
        | line | relation    | targets             | binds to | attributes                                   |
        | 1    | is          | ARCH-billing        | the file | kind="element" title="Billing engine" tier=1 |
        | 5    | implements  | REQ-pay, REQ-refund | Billing  |                                              |
        | 9    | uses        | ARCH-ledger         | post     | via="events"                                 |
        | 10   | instance-of | PAT-outbox          | post     | role="publisher"                             |

    Scenario: Mentioning the marker is not an annotation, and one that follows code on its line is reported as ignored
      Given a file "src/help.ts" containing:
        """
        // Write `@sdp <relation> <ID>` above a symbol to link it.
        // @sdp implements <ID>
        const example = "@sdp implements REQ-pay"
        export class Help {} // @sdp implements REQ-pay
        """
      When "src/help.ts" is scanned for annotations
      Then the annotations are:
        | line |
      When the workspace is checked
      Then sdp reports at least:
        | rule               | at            |
        | annotation-ignored | src/help.ts:4 |

  Rule: In TypeScript and JavaScript a comment is what the parser reads as one; in other languages, a line that reads like one, best effort

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

  Rule: Every annotation in this repository reads, and the ids it is typed against are current

    sdp only warns about either; this repository fails its run instead.

    Scenario: Annotations found, none unreadable, and no stale id types
      Then the query "code -is-> element|pattern" returns at least 1 result
      And there are no diagnostics for rule "annotation-unreadable"
      And there are no diagnostics for rule "types-stale"

  Rule: Code in this repository links only to the architecture, and every ready requirement names the element that realizes it

    Scenario: No code outside the architecture, none linked to a requirement, no ready requirement without an element
      Then the query "code !-is|instance-of-> element|pattern" returns no results
      And the query "code ?-*-> requirement|nfr" returns no results
      And the query "requirement[maturity=ready] !-realized-by-> element" returns no results
