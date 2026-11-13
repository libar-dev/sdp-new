@id=link-code-to-specs
@realized-by:ARCH-code-annotations @realized-by:ARCH-graph-builder @realized-by:ARCH-checker
Feature: Link code to the architecture

  Architects and developers, people and agents, need the graph to know which code is each element
  and pattern of the architecture, so that a question goes from a feature, through the elements that
  realize it, to the code behind them, and back.

  Not a discovery of the architecture: an element is what an annotation states, never inferred. Nor
  a link from code to a feature: a feature names the element that realizes it, and reaches its code
  through it.

  Rule: Annotated code is a code node linked to what it names; an is link declares the node it names, with the key=value written on it, and a link has no attributes

    A link is a fact between two nodes and nothing more: what would qualify it belongs to one of
    them, or to the comment that describes the code.

    Scenario: An element declared by the file that is it, with its owner, and a pattern applied by its class
      Given a file "src/retry.ts" containing:
        """
        /** @sdp is PAT-retry */
        export const retry = (): number => 3
        """
      And a file "src/billing.ts" containing:
        """
        // @sdp is ARCH-billing owner=payments

        // @sdp applies PAT-retry via=backoff
        export class Billing {}
        """
      When the workspace is loaded
      Then the workspace graph has nodes:
        | id                          | kind    | source           | owner    |
        | ARCH-billing                | element | src/billing.ts:1 | payments |
        | code:src/billing.ts         | code    | src/billing.ts:1 |          |
        | code:src/billing.ts#Billing | code    | src/billing.ts:4 |          |
        | code:src/retry.ts#retry     | code    | src/retry.ts:2   |          |
        | PAT-retry                   | pattern | src/retry.ts:1   |          |
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
  Rule: A tag in a doc comment annotates the module-level declaration it documents, or the file when the comment opens it, in every language, and the rest of the comment describes that code

    Scenario: In TypeScript, in a Python docstring and in Go
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
        | code:src/card.ts#charge   | Charges the card on file. |
        | code:src/wallet.py#pay    | Pays from the wallet.     |
        | code:src/bank.go#Transfer | Transfers from the bank.  |
      And the workspace graph has edges:
        | from                      | rel | to          |
        | code:src/card.ts#charge   | is  | ARCH-card   |
        | code:src/wallet.py#pay    | is  | ARCH-wallet |
        | code:src/bank.go#Transfer | is  | ARCH-bank   |

  @decided-by:architecture-is-declared-in-doc-comments
  Rule: A tag written where it annotates no module-level declaration and opens no file is reported, and one a doc comment shows as code is no tag

    A tag that annotates nothing would drop out of the graph unseen. Code a comment shows, in an
    `@example` or a fenced block, is an example of other code, whatever it says.

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
  Rule: A tag sdp cannot read, or one that names an id no node declares, is reported where it is written, never guessed

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

  Rule: Annotated code carries its shape as written, a declaration's signature or a file's exports, and sdp check warns of an annotated function that states no return type

    So the graph explains the code the architect annotated without the code being read. The shape is
    the public surface as the file writes it: no body, no private member, no type only a compiler
    would infer, and nothing it passes on from another file, which has a shape of its own.

    Scenario: A file and a function, and a function without its return type
      Given a file "src/pricing.ts" containing:
        """
        /** @sdp is ARCH-pricing */

        export type Cents = number

        /** @sdp is ARCH-pricing */
        export const total = (lines: ReadonlyArray<Cents>): Cents => lines.length
        """
      And a file "src/pay.ts" containing:
        """
        /** @sdp is ARCH-pay */
        export const pay = (amount: number) => amount
        """
      When the workspace is loaded
      Then the workspace graph has nodes:
        | id                        | shape                                              | exports                                                                 |
        | code:src/pricing.ts       |                                                    | type Cents = number, function total(lines: ReadonlyArray<Cents>): Cents |
        | code:src/pricing.ts#total | function total(lines: ReadonlyArray<Cents>): Cents |                                                                         |
        | code:src/pay.ts#pay       | function pay(amount: number)                       |                                                                         |
        | ARCH-pay                  |                                                    |                                                                         |
        | ARCH-pricing              |                                                    |                                                                         |
      When the workspace is checked
      Then sdp reports:
        | rule        | at           |
        | return-type | src/pay.ts:2 |

    Scenario: An overloaded function, a class with private members and a function made with Effect
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
        """
      When the workspace is loaded
      Then the workspace graph has nodes:
        | id                     | shape                                                                                     |
        | code:src/cart.ts#parse | function parse(text: string): number; function parse(text: string, radix: number): number |
        | code:src/cart.ts#Cart  | class Cart { constructor(readonly owner: string); add(line: number): void }               |
        | code:src/cart.ts#load  | function load(id: string): Effect.fn.Return<number>                                       |
        | ARCH-cart              |                                                                                           |

    Scenario: What a file exports under another name, by default, and from another file
      Given a file "src/vat.ts" containing:
        """
        export const vat = (cents: number): number => cents / 5
        """
      And a file "src/pricing.ts" containing:
        """
        /** @sdp is ARCH-pricing */
        export * from "./vat.ts"

        const total = (lines: ReadonlyArray<number>): number => lines.length
        export { total as sum }

        export default function round(cents: number): number {
          return Math.round(cents)
        }
        """
      When the workspace is loaded
      Then the workspace graph has nodes:
        | id                  | exports                                                                                   |
        | code:src/pricing.ts | function sum(lines: ReadonlyArray<number>): number, function round(cents: number): number |
        | ARCH-pricing        |                                                                                           |

  Rule: A value written on an annotation reads as it does in a spec's tag: a number only when it reads back as the number it is written as

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
