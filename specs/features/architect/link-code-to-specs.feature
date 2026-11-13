@id=link-code-to-specs
@realized-by:ARCH-code-annotations @realized-by:ARCH-graph-builder @realized-by:ARCH-checker
Feature: Link code to specs

  Architects and developers, people and agents, need the graph to know which code is each element
  and pattern of the architecture, so that a question goes from a feature, through the elements that
  realize it, to the code behind them, and back.

  Not a discovery of the architecture: an element is what an annotation states, never inferred.

  Background:
    Given these specs:
      | tags                   | Feature |
      | @id=pay @maturity=idea | Pay     |

  Rule: Annotated code is a code node linked to what it names; an is link declares the node it names, with the key=value written on it, and a link has no attributes

    Scenario: An element declared by the file that is it, with its owner
      Given a file "src/billing.ts" containing:
        """
        // @sdp is ARCH-billing owner=payments

        // @sdp implements pay via=events
        export class Billing {}
        """
      When the workspace is loaded
      Then the workspace graph has nodes:
        | id           | kind    | source           | owner    |
        | ARCH-billing | element | src/billing.ts:1 | payments |
      And the workspace graph has edges:
        | from                        | rel        | to           |
        | code:src/billing.ts         | is         | ARCH-billing |
        | code:src/billing.ts#Billing | implements | pay          |
      And sdp reports:
        | rule               | at               |
        | annotation-ignored | src/billing.ts:3 |

  @decided-by:architecture-is-declared-in-doc-comments
  Rule: A tag in a doc comment annotates the module-level declaration it documents, or the file when the comment opens it, in every language, and the rest of the comment describes that code

    Scenario Outline: In <language>
      Given a file "<file>" containing:
        """
        <code>
        """
      When the workspace is loaded
      Then the workspace graph has nodes:
        | id     | doc                       |
        | <node> | Charges the card on file. |
      And the workspace graph has edges:
        | from   | rel        | to  |
        | <node> | implements | pay |

      Examples:
        | language   | file       | code                                                                                                   | node                |
        | TypeScript | src/pay.ts | /**\n * Charges the card on file.\n *\n * @sdp implements pay\n */\nexport const pay = (): number => 0 | code:src/pay.ts#pay |
        | Python     | src/pay.py | def pay(order):\n    '''Charges the card on file.\n\n    @sdp implements pay'''\n    return order        | code:src/pay.py#pay |
        | Go         | src/pay.go | // Charges the card on file.\n//\n// @sdp implements pay\nfunc Pay() error {                           | code:src/pay.go#Pay |

  @decided-by:architecture-is-declared-in-doc-comments
  Rule: A tag sdp cannot read, or one that names an id no node declares, is reported where it is written, never guessed

    Scenario: A tag that names no id, and one that names an id nothing declares
      Given a file "src/pay.ts" containing:
        """
        /** @sdp implements pay? */
        export const pay = (): number => 0
        """
      And a file "src/refund.ts" containing:
        """
        /** @sdp implements refund */
        export const back = (): number => 0
        """
      When the workspace is checked
      Then sdp reports:
        | rule                  | at              |
        | annotation-unreadable | src/pay.ts:1    |
        | dangling-link         | src/refund.ts:1 |

  Rule: Annotated code carries its shape as written, a declaration's signature or a file's exports, and sdp check warns of an annotated function that states no return type

    Scenario: A file and a function, and a function without its return type
      Given a file "src/pricing.ts" containing:
        """
        /** @sdp is ARCH-pricing */

        export type Cents = number

        /** @sdp implements pay */
        export const total = (lines: ReadonlyArray<Cents>): Cents => lines.length
        """
      And a file "src/pay.ts" containing:
        """
        /** @sdp implements pay */
        export const pay = (amount: number) => amount
        """
      When the workspace is loaded
      Then the workspace graph has nodes:
        | id                        | shape                                              | exports                                                                 |
        | code:src/pricing.ts       |                                                    | type Cents = number, function total(lines: ReadonlyArray<Cents>): Cents |
        | code:src/pricing.ts#total | function total(lines: ReadonlyArray<Cents>): Cents |                                                                         |
      When the workspace is checked
      Then sdp reports:
        | rule        | at           |
        | return-type | src/pay.ts:2 |

  Rule: A value written on an annotation reads as it does in a spec's tag: a number only when it reads back as the number it is written as

    One key=value is one fact wherever it is written.

    Scenario: Values that look like numbers without being written as one
      Given a file "src/billing.ts" containing:
        """
        /** @sdp is ARCH-billing code=007 rate=1.50 tier=1 */
        export class Billing {}
        """
      When the workspace is loaded
      Then the workspace graph has nodes:
        | id           | code | rate | tier |
        | ARCH-billing | 007  | 1.50 | 1    |
