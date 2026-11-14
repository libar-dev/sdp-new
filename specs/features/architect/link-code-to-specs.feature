@id=link-code-to-specs
@realized-by:ARCH-code-annotations @realized-by:ARCH-graph-builder @realized-by:ARCH-checker
Feature: Link code to the architecture

  Architects and developers, people and agents, need the graph to know which code is each element
  and pattern of the architecture, so that a question goes from a feature, through the elements that
  realize it, to the code behind them, and back.

  Not a discovery of the architecture: an element is what an annotation states, never inferred. Nor
  a link from code to a feature: a feature names the element that realizes it, and reaches its code
  through it.

  @decided-by:architecture-is-declared-in-doc-comments
  Rule: An element or a pattern is declared only by the `@sdp is` tag of its code

    So it is declared once, where its code is: a spec that declares one is reported, and what it
    says is not read.

    Scenario: A ledger declared by its code with its owner, and by a spec
      Given these specs:
        | tags                           | Feature |
        | @id=ARCH-ledger @owner=finance | Ledger  |
      And a file "src/ledger.ts" containing:
        """
        /** @sdp is ARCH-ledger owner=payments */
        export class Ledger {}
        """
      When the workspace is loaded
      Then the workspace graph has at least these nodes:
        | id          | source          | owner    |
        | ARCH-ledger | src/ledger.ts:1 | payments |
      And sdp reports:
        | rule             | at                          |
        | declared-in-spec | specs/ARCH-ledger.feature:1 |

  Rule: Code an `@sdp` tag annotates is a node, linked by the tag's relation to the node it names

    A link is a fact between two nodes and nothing more: a fact written on one is reported, as what
    would qualify it belongs to one of them, or to the comment that describes the code.

    Scenario: A file that is an element, and a class of it that applies a pattern
      Given a file "src/retry.ts" containing:
        """
        /** @sdp is PAT-retry */
        export const retry = (): number => 3
        """
      And a file "src/billing.ts" containing:
        """
        // @sdp is ARCH-billing

        // @sdp applies PAT-retry via=backoff
        export class Billing {}
        """
      When the workspace is loaded
      Then the workspace graph has nodes:
        | id                          | kind    | source           |
        | ARCH-billing                | element | src/billing.ts:1 |
        | code:src/billing.ts         | code    | src/billing.ts:1 |
        | code:src/billing.ts#Billing | code    | src/billing.ts:4 |
        | code:src/retry.ts#retry     | code    | src/retry.ts:2   |
        | PAT-retry                   | pattern | src/retry.ts:1   |
      And the workspace graph has edges:
        | from                        | rel     | to           |
        | code:src/billing.ts         | is      | ARCH-billing |
        | code:src/billing.ts#Billing | applies | PAT-retry    |
        | code:src/retry.ts#retry     | is      | PAT-retry    |
        | ARCH-billing                | applies | PAT-retry    |
      And sdp reports:
        | rule               | at               |
        | annotation-ignored | src/billing.ts:3 |

  @decided-by:architecture-is-declared-in-doc-comments
  Rule: An element applies each pattern its code applies

    Scenario: The retry pattern applied in the file that is billing, and by code of no element the ledger imports
      Given a file "src/retry.ts" containing:
        """
        /** @sdp is PAT-retry */
        export const retry = (): number => 3
        """
      And a file "src/billing.ts" containing:
        """
        /** @sdp is ARCH-billing */

        /** @sdp applies PAT-retry */
        export const charge = (): number => 0
        """
      And a file "src/refund.ts" containing:
        """
        /** @sdp applies PAT-retry */
        export const refund = (): number => 0
        """
      And a file "src/ledger.ts" containing:
        """
        import { refund } from "./refund.ts"

        /** @sdp is ARCH-ledger */
        export const post = (): number => refund()
        """
      When I query "#PAT-retry <-applies- element"
      Then the result is "ARCH-billing"

  @decided-by:architecture-is-declared-in-doc-comments
  Rule: A tag in a doc comment, in any language, annotates the module-level declaration it documents or the file it opens

    The rest of the comment describes that code: one comment says what the code is for and which
    element it is.

    Scenario: A TypeScript file, a Python function by its docstring, and a Go function
      Given a file "src/card.ts" containing:
        """
        /**
         * Charges the card on file.
         *
         * @sdp is ARCH-card
         */

        export const charge = (): number => 0
        """
      And a file "src/wallet.py" containing:
        """
        def pay(order):
            '''Pays from the wallet.

            @sdp is ARCH-wallet'''
            return order
        """
      And a file "src/bank.go" containing:
        """
        // Transfers from the bank.
        //
        // @sdp is ARCH-bank
        func Transfer() error {
        """
      When the workspace is loaded
      Then the workspace graph has at least these nodes:
        | id                        | doc                       |
        | code:src/card.ts          | Charges the card on file. |
        | code:src/wallet.py#pay    | Pays from the wallet.     |
        | code:src/bank.go#Transfer | Transfers from the bank.  |
      And the workspace graph has edges:
        | from                      | rel | to          |
        | code:src/card.ts          | is  | ARCH-card   |
        | code:src/wallet.py#pay    | is  | ARCH-wallet |
        | code:src/bank.go#Transfer | is  | ARCH-bank   |

  @decided-by:architecture-is-declared-in-doc-comments
  Rule: A tag that annotates no module-level declaration and opens no file is reported

    Else it would drop out of the graph unseen. Code a doc comment shows, in an `@example` or a
    fenced block, is an example of other code: a tag in it is no tag.

    Scenario: A tag after code, one on a class member, and two a doc comment shows
      Given a file "src/mailer.ts" containing:
        """
        /**
         * Registers the mailer.
         *
         * ```ts
         * // @sdp is ARCH-fenced
         * ```
         *
         * @example
         * // @sdp is ARCH-example
         */
        export const register = (): number => 0

        export class Mailer {
          /** @sdp is ARCH-member */
          private send(): void {}
        }

        export const retries = 3 // @sdp is ARCH-trailing
        """
      When the workspace is loaded
      Then sdp reports:
        | rule               | at               |
        | annotation-ignored | src/mailer.ts:14 |
        | annotation-ignored | src/mailer.ts:18 |
      When I query "element"
      Then the result is "nothing"

  @decided-by:architecture-is-declared-in-doc-comments
  Rule: A tag sdp cannot read, or one that names an id nothing declares, is reported where it is written

    A guessed annotation is a link nobody wrote, and a lost one a gap nobody sees.

    Scenario: A tag that names no id, and one that names an id nothing declares
      Given a file "src/pay.ts" containing:
        """
        /** @sdp is ARCH-pay? */
        export const pay = (): number => 0
        """
      And a file "src/refund.ts" containing:
        """
        /** @sdp applies PAT-backoff */
        export const back = (): number => 0
        """
      When the workspace is checked
      Then sdp reports:
        | rule                  | at              |
        | annotation-unreadable | src/pay.ts:1    |
        | dangling-link         | src/refund.ts:1 |

  Rule: Annotated code carries its shape as written: a declaration's signature, or what a file exports

    So the graph explains the code the architect annotated without the code being read. It is the
    public surface as the file writes it: a type only a compiler would infer is not there, which is
    why `sdp check` warns of an annotated function that states no return type, and what a file
    passes on from another has a shape of its own.

    Scenario: Signatures of an overloaded function, a class, an Effect function and one with no return type
      Given a file "src/cart.ts" containing:
        """
        import { Effect } from "effect"

        /** @sdp is ARCH-cart */
        export function parse(text: string): number
        export function parse(text: string, radix: number): number
        export function parse(text: string, radix = 10): number {
          return Number.parseInt(text, radix)
        }

        /** @sdp is ARCH-cart */
        export class Cart {
          #secret = 1
          private hidden = 2
          constructor(readonly owner: string) {}
          add(line: number): void {}
        }

        /** @sdp is ARCH-cart */
        export const load = Effect.fn("load")(function*(id: string): Effect.fn.Return<number> {
          return id.length
        })

        /** @sdp is ARCH-cart */
        export const total = (lines: ReadonlyArray<number>) => lines.length
        """
      When the workspace is loaded
      Then the workspace graph has nodes:
        | id                     | shape                                                                                     |
        | code:src/cart.ts#parse | function parse(text: string): number; function parse(text: string, radix: number): number |
        | code:src/cart.ts#Cart  | class Cart { constructor(readonly owner: string); add(line: number): void }               |
        | code:src/cart.ts#load  | function load(id: string): Effect.fn.Return<number>                                       |
        | code:src/cart.ts#total | function total(lines: ReadonlyArray<number>)                                              |
        | ARCH-cart              |                                                                                           |

    Scenario: What a file exports itself, under another name and by default, and from another file
      Given a file "src/vat.ts" containing:
        """
        export const vat = (cents: number): number => cents / 5
        """
      And a file "src/pricing.ts" containing:
        """
        /** @sdp is ARCH-pricing */
        export * from "./vat.ts"

        export type Cents = number

        const total = (lines: ReadonlyArray<Cents>): Cents => lines.length
        export { total as sum }

        export default function round(cents: number): number {
          return Math.round(cents)
        }
        """
      When the workspace is loaded
      Then the workspace graph has nodes:
        | id                  | exports                                                                                                   |
        | code:src/pricing.ts | type Cents = number, function sum(lines: ReadonlyArray<Cents>): Cents, function round(cents: number): number |
        | ARCH-pricing        |                                                                                                           |

  Rule: A fact written on a tag in code reads as it does on a spec's tag

    One key=value is one fact wherever it is written.

    Scenario: Values that look like numbers without being written as one
      Given a file "src/billing.ts" containing:
        """
        /** @sdp is ARCH-billing code=007 rate=1.50 tier=1 */
        export class Billing {}
        """
      When the workspace is loaded
      Then the workspace node "ARCH-billing" has these attributes:
        | key  | json   |
        | code | "007"  |
        | rate | "1.50" |
        | tier | 1      |

  @open
  Rule: May a fact on an `@sdp is` tag, such as `iteration=`, plan the element it declares?

    Today it becomes a plan link from the element, though only work still to come is planned and an
    element declared in code is live.
