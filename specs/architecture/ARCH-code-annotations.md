---
id: ARCH-code-annotations
kind: element
title: Code annotations
links:
  instance-of: { to: PAT-pipes-and-filters, role: filter }
  uses: ARCH-vocabulary
  decided-by: DEC-0009
---

# Code annotations

Links code into the graph. In TypeScript and JavaScript an annotation is code: a call to
`annotate` from `sdp/annotations`, typed and checked by the compiler ([[DEC-0009]]). In every
language it may also be a comment. Both are read statically — sdp never runs the code — and
[[ARCH-graph-builder]] turns what they say into `code` nodes and edges. A TypeScript or JavaScript
file is parsed once (oxc-parser), and both kinds of annotation are read from that parse.

## Typed annotations (TypeScript, JavaScript)

```ts
import { annotate } from "sdp/annotations"

/** The system graph: immutable nodes and edges with adjacency indexes. */
export class Graph { … }
annotate(Graph, { is: "ARCH-graph", "instance-of": "PAT-derived-index" })

annotate(import.meta, { is: "ARCH-query-engine" })   // the whole module
```

- **The target is a module-level declaration** — a class, function or constant declared at the
  top of the module, a property path on one such as `Graph.prototype`, or `import.meta` for the
  module — so renaming it or finding its references includes the annotation, and its name is
  unique in the file: the `code` node is `code:<file>#<name>`, at the declaration's line. A target
  declared inside a function or block, or not declared in the module at all (an import, a global),
  is `annotation-unreadable`. Targets are run-time values: an interface or type alias cannot be
  passed, so for a type-only abstraction annotate the module that defines it or the value that
  realizes it.
- **Ids are typed.** `sdp types` writes the workspace's ids, mapped to their kinds, into a
  declaration that fills `Ids` in `sdp/annotations` (path: the `types` setting,
  [[REQ-configuration]]). Then an id that does not exist is a compile error, with "did you mean"
  suggestions; `IdOf<"decision">` narrows to one kind. The check is only as good as the
  declaration: the compiler must include it (the `tsconfig` `include`), and it must be current —
  until `sdp types` has run any string is accepted, and `sdp check` reports `types-stale` when the
  declaration no longer matches the graph.
- **Links** map free-form relation names to one id or a list of ids. An optional third argument
  declares the node an `is` link names when no spec does: its `kind` and `title`.
- **Literals only.** Ids and attributes must be literals; a computed one is reported as
  `annotation-unreadable` instead of guessed. Type-only wrappers do not count as computing:
  `{ is: "ARCH-x" } as const` and `satisfies Declaration` read as the object inside.
- **Bound to the import.** A call counts when its name refers to `annotate` imported from
  `sdp/annotations` (or `sdp`, which exports it too): aliased (`import { annotate as a }`) and
  namespace (`import * as sdp`) imports are recognised, ES module imports only. Any other module,
  even one whose path ends in `annotations`, is a different function. Inside a scope that declares
  the name again — a parameter, a `let`, `const`, `class` or function declaration in a block, a
  `var` in a function, a loop variable, a catch parameter — the name means that declaration and its
  calls are not annotations.
- **Unparsable files are reported.** A file that names `sdp/annotations` or `@sdp` but does not
  parse loses none of its annotations silently: `annotation-unreadable` points at the syntax error.
- **Descriptions come from the code.** The annotated declaration's JSDoc — the module's leading
  JSDoc for `import.meta` — becomes the `code` node's `doc`, so context bundles quote the code's own
  description of itself.
- **No run-time cost.** `annotate` returns its target; `sdp/annotations` has no imports.

## Comment annotations (any language)

```text
@sdp <relation> <ID>[, <ID>...] [key=value ...]
```

`grep -rn "@sdp" .` lists every one.

- **In TypeScript and JavaScript, comments are the parser's.** An annotation is a line of a real
  comment whose text, after the comment's own `/` `*` `!` and spaces, starts with `@sdp`. Text in a
  string or a template literal is never one, whatever it looks like.
- **In other languages, best effort by line.** sdp has no parser for them, so an annotation is any
  line whose first text is a comment marker — `//`, `///`, `/*`, `*`, `#`, `--`, `<!--`, `;`, `%`
  or a docstring quote — followed by `@sdp`, or a bare `@sdp` line. Such a line inside a multi-line
  string counts too.
- **Comment lines only.** Prose that mentions the marker is not an annotation; one that follows code
  on the same line is not read, and is reported as `annotation-ignored`.
- **Binding.** An annotation binds to the declaration directly below it, skipping further comment
  lines. Declarations are recognised by keyword (`class`, `interface`, `type`, `function`, `const`,
  `def`, `func`, `fn`, `struct`, `trait`, …). A blank line, or a line that declares nothing, binds
  it to the whole file instead.
- **Targets and attributes.** Targets are ids, separated by commas; an annotation with a target
  that is not an id is ignored. `key=value` pairs are attributes: `true`, `false` and numbers are
  typed, quotes allow spaces.
- **Relations** are free text. `is` anchors a node in code — and declares it when no spec does.

Code: `src/annotations.ts` (the typed API), `src/parse/Annotations.ts` (one scan per file),
`src/parse/TypedAnnotations.ts`, `src/graph/Types.ts` (the id declarations).

## Scenarios

### Typed annotations

~~~gherkin
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
    | line | relation    | targets           | binds to |
    | 11   | is          | ARCH-graph        | Graph    |
    | 11   | instance-of | PAT-derived-index | Graph    |
    | 12   | implements  | REQ-graph         | the file |
  And the annotated "Graph" is declared at line 10 and described as "The system graph. More detail follows."
  And the annotated "the module" is declared at line 1 and described as "Graph module."

Scenario: A namespace import works, and a declaration comes along with an is link
  Given a file "src/cache.ts" containing:
    """
    import * as sdp from "sdp/annotations"

    export const cache = new Map()
    sdp.annotate(cache, { is: "ARCH-cache" }, { kind: "element", title: "Page cache" })
    """
  When "src/cache.ts" is scanned for annotations
  Then the annotations are:
    | line | relation | targets    | binds to | attributes                        |
    | 4    | is       | ARCH-cache | cache    | kind="element" title="Page cache" |

Scenario Outline: What cannot be read without running the code is reported, not guessed
  Given a file "src/pay.ts" containing:
    """
    import { annotate } from "sdp/annotations"

    export const pay = () => 0
    const id = "REQ-pay"
    <call>
    """
  When "src/pay.ts" is scanned for annotations
  Then no annotations are found
  And the scan reports at line 5: "<problem>"

  Examples:
    | call                                       | problem                                   |
    | annotate(pay, { implements: id })          | ids must be string literals               |
    | annotate(pay(), { implements: "REQ-pay" }) | the annotation target must be a name      |
    | annotate(pay, links)                       | the links must be an object literal       |

Scenario Outline: The target is a declaration at the top of the module
  Given a file "src/items.ts" containing:
    """
    import { annotate } from "sdp/annotations"
    import { Cart } from "./cart.ts"

    export const item = 0
    <code>
    """
  When "src/items.ts" is scanned for annotations
  Then no annotations are found
  And the scan reports at line 5: "the annotation target must be a module-level declaration or import.meta: <name> is not one"
  When I query "code"
  Then the result is "nothing"

  Examples:
    | declared as                     | name | code                                                                          |
    | a constant inside a function    | item | export function first() { const item = 1; annotate(item, { is: "ARCH-a" }) } |
    | a parameter                     | item | export const second = (item: number) => annotate(item, { is: "ARCH-b" })      |
    | an import                       | Cart | annotate(Cart, { is: "ARCH-cart" })                                           |
    | nothing                         | cart | annotate(cart.items, { is: "ARCH-cart" })                                     |

Scenario Outline: annotate is read from the sdp package or its annotations subpath
  Given a file "src/pay.ts" containing:
    """
    import { annotate } from "<module>"

    export const pay = () => 0
    annotate(pay, { implements: "REQ-pay" })
    """
  When "src/pay.ts" is scanned for annotations
  Then the annotations are:
    | line | relation   | targets | binds to |
    | 4    | implements | REQ-pay | pay      |

  Examples:
    | module          |
    | sdp/annotations |
    | sdp             |

Scenario Outline: Functions named annotate from any other module are not annotations
  Given a file "src/pay.ts" containing:
    """
    import { annotate } from "<module>"

    export const pay = () => 0
    annotate(pay, { implements: "REQ-pay" })
    """
  When "src/pay.ts" is scanned for annotations
  Then no annotations are found

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
  Then no annotations are found

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

Scenario Outline: A file that annotates but does not parse is reported
  Given a file "src/pay.ts" containing:
    """
    <annotates>

    export const pay = ( => 0
    """
  When "src/pay.ts" is scanned for annotations
  Then no annotations are found
  And the scan reports at line 3: "the file does not parse, so its annotations cannot be read: Unexpected token"
  When the workspace is checked
  Then the check reports "annotation-unreadable"

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
  Then no annotations are found
  And the scan reports nothing

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
  And the scan reports nothing

Scenario: In the graph, typed annotations become code nodes at the declaration
  Given a file "specs/REQ-pay.md" containing:
    """
    ---
    id: REQ-pay
    ---
    # Pay
    """
  And a file "src/pay.ts" containing:
    """
    import { annotate } from "sdp/annotations"

    /** Charges the card on file. */
    export const pay = () => 0
    annotate(pay, { implements: "REQ-pay" })
    """
  When the workspace is loaded
  Then there is an edge "code:src/pay.ts#pay" -implements-> "REQ-pay"
  And node "code:src/pay.ts#pay" has attribute doc = "Charges the card on file."
  And node "code:src/pay.ts#pay" is at line 4
~~~

### Comment annotations

~~~gherkin
Scenario Outline: Any comment syntax carries an annotation
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

Scenario: An annotation binds to the declaration below it, or to the file
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

Scenario: Mentioning the marker is not an annotation
  Given a file "src/help.ts" containing:
    """
    // Write `@sdp <relation> <ID>` above a symbol to link it.
    // @sdp implements <ID>
    const example = "@sdp implements REQ-pay"
    export class Help {} // @sdp implements REQ-pay
    """
  When "src/help.ts" is scanned for annotations
  Then no annotations are found
  When the workspace is checked
  Then the "annotation-ignored" diagnostic points at "src/help.ts:4"

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

Scenario: In other languages an annotation is a comment line, even inside a multi-line string
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
~~~
