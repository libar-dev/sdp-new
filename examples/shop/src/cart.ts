import { annotate } from "sdp/annotations"
import { type Cents, vatFor } from "./pricing.ts"

/** A shopper's cart: lines of SKUs at a price, totalled with the delivery country's VAT. */
export class Cart {
  readonly #lines: Array<{ readonly sku: string; readonly price: Cents; readonly quantity: number }> = []

  add(sku: string, price: Cents, quantity = 1): this {
    this.#lines.push({ sku, price, quantity })
    return this
  }

  get net(): Cents {
    return this.#lines.reduce((sum, line) => sum + line.price * line.quantity, 0)
  }

  total(country: string): Cents {
    return this.net + vatFor(this.net, country)
  }
}
annotate(Cart, { implements: "REQ-cart-totals" })
