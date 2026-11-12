// @sdp is ARCH-pricing

/** Money is integer cents everywhere (DEC-0001). */
export type Cents = number

export const vatRates: Readonly<Record<string, number>> = { DE: 19, FR: 20, HR: 25 }

// @sdp implements REQ-cart-totals
export const vatFor = (net: Cents, country: string): Cents => {
  const rate = vatRates[country]
  if (rate === undefined) throw new Error(`no VAT rate for ${country}`)
  return Math.round((net * rate) / 100)
}
