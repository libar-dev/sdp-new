---
id: ARCH-code-annotations
kind: element
title: Code annotations
links:
  instance-of: { to: PAT-pipes-and-filters, role: filter }
  feeds: ARCH-graph-builder
  decided-by: DEC-0009
---

# Code annotations

Links code into the graph. In TypeScript and JavaScript an annotation is code: a call to
`annotate` from `sdp/annotations`, typed and checked by the compiler ([[DEC-0009]]). In every other
language it is a comment line. Both are read statically — sdp never runs the code — and
[[ARCH-graph-builder]] turns what they say into `code` nodes and edges.

## Typed annotations (TypeScript, JavaScript)

```ts
import { annotate } from "sdp/annotations"

/** The system graph: immutable nodes and edges with adjacency indexes. */
export class Graph { … }
annotate(Graph, { is: "ARCH-graph", "instance-of": "PAT-derived-index" })

annotate(import.meta, { is: "ARCH-query-engine" })   // the whole module
```

- **The target is a real symbol** — a class, function or constant, a property path such as
  `Graph.prototype`, or `import.meta` for the module — so renaming it or finding its references
  includes the annotation. The `code` node sits at the declaration's line.
- **Ids are typed.** `sdp types` writes the workspace's ids, mapped to their kinds, into a
  declaration that fills `Ids` in `sdp/annotations` (path: the `types` setting,
  [[REQ-configuration]]). Then an id that does not exist is a compile error, with "did you mean"
  suggestions; `IdOf<"decision">` narrows to one kind. `sdp check` reports `types-stale` when the
  declaration no longer matches the graph.
- **Links** map free-form relation names to one id or a list of ids. An optional third argument
  declares the node an `is` link names when no spec does: `kind`, `title`, `significant`,
  `rationale`.
- **Literals only.** Ids and attributes must be literals; a computed one is reported as
  `annotation-unreadable` instead of guessed. Aliased (`import { annotate as a }`) and namespace
  (`import * as sdp`) imports are recognised.
- **Descriptions come from the code.** The annotated declaration's JSDoc — the module's leading
  JSDoc for `import.meta` — becomes the `code` node's `doc`, so context bundles quote the code's own
  description of itself.
- **No run-time cost.** `annotate` returns its target; `sdp/annotations` has no imports.

## Comment annotations (any language)

```text
@sdp <relation> <ID>[, <ID>...] [key=value ...]
```

`grep -rn "@sdp" .` lists every one.

- **Comment lines only.** The marker opens the comment: `//`, `///`, `/*`, `*`, `#`, `--`, `<!--`,
  `;`, `%`, or a docstring quote, or a bare line inside a block comment. A string literal, a
  trailing comment or prose that mentions the marker is not an annotation; one that follows code on
  the same line is reported as `annotation-ignored`.
- **Binding.** An annotation binds to the declaration directly below it, skipping further comment
  lines. Declarations are recognised by keyword (`class`, `interface`, `type`, `function`, `const`,
  `def`, `func`, `fn`, `struct`, `trait`, …). A blank line, or a line that declares nothing, binds
  it to the whole file instead.
- **Targets and attributes.** Targets are ids, separated by commas; an annotation with a target
  that is not an id is ignored. `key=value` pairs are attributes: `true`, `false` and numbers are
  typed, quotes allow spaces.
- **Relations** are free text. `is` anchors a node in code — and declares it when no spec does.

Code: `src/annotations.ts` (the typed API), `src/parse/TypedAnnotations.ts`,
`src/parse/Annotations.ts`, `src/graph/Types.ts` (the id declarations).

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
  When "src/graph.ts" is scanned for typed annotations
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
    sdp.annotate(cache, { is: "ARCH-cache" }, { kind: "element", significant: true, rationale: "hot path" })
    """
  When "src/cache.ts" is scanned for typed annotations
  Then the annotations are:
    | line | relation | targets    | binds to | attributes                                         |
    | 4    | is       | ARCH-cache | cache    | kind="element" significant=true rationale="hot path" |

Scenario Outline: What cannot be read without running the code is reported, not guessed
  Given a file "src/pay.ts" containing:
    """
    import { annotate } from "sdp/annotations"

    export const pay = () => 0
    const id = "REQ-pay"
    <call>
    """
  When "src/pay.ts" is scanned for typed annotations
  Then no annotations are found
  And the scan reports at line 5: "<problem>"

  Examples:
    | call                                       | problem                                   |
    | annotate(pay, { implements: id })          | ids must be string literals               |
    | annotate(pay(), { implements: "REQ-pay" }) | the annotation target must be a name      |
    | annotate(pay, links)                       | the links must be an object literal       |

Scenario: Calls to other functions named annotate are not annotations
  Given a file "src/pay.ts" containing:
    """
    import { annotate } from "./decorators.ts"

    annotate(pay, { implements: "REQ-pay" })
    """
  When "src/pay.ts" is scanned for typed annotations
  Then no annotations are found

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
    | file         | comment                          | code                            | binds to |
    | src/pay.ts   | // @sdp implements REQ-pay       | export async function pay() {}  | pay      |
    | src/pay.ts   | /** @sdp implements REQ-pay */   | export class Payment {}         | Payment  |
    | src/pay.py   | # @sdp implements REQ-pay        | def pay(order):                 | pay      |
    | src/pay.go   | // @sdp implements REQ-pay       | func Pay(order Order) error {   | Pay      |
    | src/pay.rs   | /// @sdp implements REQ-pay      | pub struct Payment {}           | Payment  |
    | db/pay.sql   | -- @sdp implements REQ-pay       | create table payments (id int); | the file |
    | web/pay.html | <!-- @sdp implements REQ-pay --> | <form id="pay"></form>          | the file |

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
~~~
