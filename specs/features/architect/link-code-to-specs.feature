@id=link-code-to-specs
@realized-by:ARCH-code-annotations @realized-by:ARCH-graph-builder @realized-by:ARCH-checker
Feature: Link code to specs

  Architects and developers, people and agents, need the graph to know which code is each element
  and pattern of the architecture, so that a question goes from a feature, through the elements
  that realize it, to the code behind them, and back. An annotation is a tag in the comment that
  documents the code, in any language, and sdp reads it without running the code.

  Not a discovery of the architecture: an element is what an annotation states, never inferred
  from names, imports or the layout of files.

  Background:
    Given these specs:
      | tags                   | Feature |
      | @id=pay @maturity=idea | Pay     |

  Rule: Annotated code is a code node linked to what it names, and an is link declares the node it names

    Scenario: An element declared by the file that is it, and one by the declaration that is it
      Given a file "src/billing.ts" containing:
        """
        // @sdp is ARCH-billing

        // @sdp implements pay
        export class Billing {}
        """
      And a file "src/ledger.ts" containing:
        """
        // @sdp is ARCH-ledger
        export class Ledger {}
        """
      When the workspace is loaded
      Then the workspace graph has exactly these nodes:
        | id                          | kind    | source              |
        | pay                         | feature | specs/pay.feature:1 |
        | ARCH-billing                | element | src/billing.ts:1    |
        | code:src/billing.ts         | code    | src/billing.ts:1    |
        | code:src/billing.ts#Billing | code    | src/billing.ts:4    |
        | ARCH-ledger                 | element | src/ledger.ts:1     |
        | code:src/ledger.ts#Ledger   | code    | src/ledger.ts:2     |
      And the workspace graph has edges:
        | from                        | rel        | to           |
        | code:src/billing.ts         | is         | ARCH-billing |
        | code:src/billing.ts#Billing | implements | pay          |
        | code:src/ledger.ts#Ledger   | is         | ARCH-ledger  |

  Rule: In TypeScript and JavaScript only a real comment annotates, never a string; in other languages any line that reads like a comment does, best effort

    Scenario Outline: A tag inside a string, in <language>
      Given a file "<file>" containing:
        """
        <code>
        """
      When I query "element"
      Then the result is "<elements>"

      Examples:
        | language   | file           | code                                                                                              | elements     |
        | TypeScript | src/example.ts | export const example = `\n// @sdp is ARCH-fiction\n`\n// @sdp is ARCH-real\nexport const real = 1 | ARCH-real    |
        | Python     | src/example.py | text = '''\n# @sdp is ARCH-example\n'''                                                           | ARCH-example |

  Rule: A file whose tags sdp cannot read is reported, never guessed

    A guessed annotation is a link nobody wrote, and a lost one a gap nobody sees.

    Scenario Outline: A tag that cannot be read as written: <case>
      Given a file "src/pay.ts" containing:
        """
        <code>
        """
      When the workspace is loaded
      Then sdp reports:
        | rule                  | at                | message   |
        | annotation-unreadable | src/pay.ts:<line> | <message> |
      When I query "code"
      Then the result is "nothing"

      Examples:
        | case                       | code                                                                             | line | message                                                    |
        | a word that is no id       | /** @sdp implements pay? */\nexport const pay = (): number => 0                  | 1    | names pay?, which is no id                                 |
        | words after its ids        | /** @sdp is ARCH-billing handles payments */\nexport const pay = (): number => 0 | 1    | goes on after its ids with "handles payments"              |
        | a file that does not parse | // @sdp implements pay\n\nexport const pay = ( => 0                              | 3    | the file does not parse, so its annotations cannot be read |

  @decided-by:architecture-is-declared-in-doc-comments
  Rule: A tag in a doc comment is the one form of annotation, in every language

    The tag annotates the declaration the comment documents, or the file when the comment opens it,
    and the rest of the comment describes that code.

    Scenario Outline: In <language>, the comment around the tag describes the code
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
        | Python     | src/pay.py | # Charges the card on file.\n# @sdp implements pay\ndef pay(): pass                                    | code:src/pay.py#pay |
        | Go         | src/pay.go | // Charges the card on file.\n//\n// @sdp implements pay\nfunc Pay() error {                           | code:src/pay.go#Pay |

  @decided-by:architecture-is-declared-in-doc-comments
  Rule: An id that no node declares is reported by sdp check where the tag names it

    Scenario Outline: A tag that names refund, which nothing declares
      Given a file "<file>" containing:
        """
        <content>
        """
      When the workspace is checked
      Then sdp reports:
        | rule          | severity | at   | message                                     |
        | dangling-link | error    | <at> | -implements-> refund: no node has id refund |

      Examples:
        | file          | content                                                                 | at              |
        | src/refund.ts | /** @sdp implements pay, refund */\nexport const back = (): number => 0 | src/refund.ts:1 |
        | src/refund.py | # @sdp implements refund\ndef back(): pass                              | src/refund.py:1 |

  Rule: Annotated code carries its shape: a declaration's signature, members or type, and a file's exports

    So the graph explains the code the architect annotated without the code being read. The shape is
    read as written: a type only a compiler would infer is not in it.

    Scenario: A file and a function, each tagged in the comment that describes it
      Given a file "src/pricing.ts" containing:
        """
        /**
         * Prices and VAT.
         *
         * @sdp is ARCH-pricing
         */
        import { round } from "./round.ts"

        export type Cents = number

        /**
         * Totals a cart, rounding once.
         *
         * @sdp implements pay
         */
        export const total = (lines: ReadonlyArray<Cents>): Cents => round(lines.length)
        """
      When the workspace is loaded
      Then the workspace graph has nodes:
        | id                        | shape                                              | exports                                                                 |
        | code:src/pricing.ts       |                                                    | type Cents = number, function total(lines: ReadonlyArray<Cents>): Cents |
        | code:src/pricing.ts#total | function total(lines: ReadonlyArray<Cents>): Cents |                                                                         |

  Rule: sdp check asks an annotated function to state its return type

    Without it the shape says nothing of what the function gives back, and sdp infers no type.

    Scenario: Reported at the function, as a warning
      Given a file "src/pay.ts" containing:
        """
        /** @sdp implements pay */
        export const pay = (amount: number) => amount
        """
      When the workspace is checked
      Then sdp reports:
        | rule        | severity | at           | message                                   |
        | return-type | warning  | src/pay.ts:2 | code:src/pay.ts#pay states no return type |

  Rule: A key=value on an annotation describes only the node it declares; a link has no attributes

    A link is a fact between two nodes and nothing more: what would qualify it belongs to one of
    them, or to the comment that describes the code.

    Scenario: An element declared with an attribute, and a link written with one
      Given a file "src/billing.ts" containing:
        """
        /**
         * @sdp is ARCH-billing owner=payments
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
        | id           | owner    |
        | ARCH-billing | payments |
      And the workspace graph has edges:
        | from                        | rel  | to          |
        | code:src/billing.ts#Billing | uses | ARCH-ledger |
      And sdp reports:
        | rule               | severity | at               | message                                                |
        | annotation-ignored | warning  | src/billing.ts:3 | via=events describes no node: a link has no attributes |

  @maturity=ready
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
