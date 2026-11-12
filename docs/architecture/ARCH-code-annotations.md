---
id: ARCH-code-annotations
kind: element
title: Code annotation scanner
links:
  instance-of: { to: PAT-pipes-and-filters, role: filter }
  feeds: ARCH-graph-builder
---

# Code annotation scanner

Links code into the graph in any language, without parsing it. An annotation is a comment line
whose text starts with the marker:

```text
@sdp <relation> <ID>[, <ID>...] [key=value ...]
```

It is a pure function of one file's text; [[ARCH-graph-builder]] turns what it finds into `code`
nodes and edges. `grep -rn "@sdp" src/` lists every annotation.

- **Comment lines only.** The marker opens the comment: `//`, `///`, `/*`, `*`, `#`, `--`, `<!--`,
  `;`, `%`, or a docstring quote, or a bare line inside a block comment. A string literal, a
  trailing comment or prose that mentions the marker is not an annotation.
- **Binding.** An annotation binds to the declaration directly below it, skipping further comment
  lines. Declarations are recognised by keyword (`class`, `interface`, `type`, `function`, `const`,
  `def`, `func`, `fn`, `struct`, `trait`, …). A blank line, or a line that declares nothing, binds
  it to the whole file instead.
- **Targets and attributes.** Targets are ids, separated by commas; an annotation with a target
  that is not an id is ignored. `key=value` pairs are attributes: `true`, `false` and numbers are
  typed, quotes allow spaces.
- **Relations** are free text. `is` anchors a node in code — and declares it when no spec does.

Code: `src/parse/Annotations.ts`.

## Scenarios

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
