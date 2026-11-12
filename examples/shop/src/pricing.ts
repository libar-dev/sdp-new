/**
 * Prices, VAT rates and rounding: every monetary figure flows through here, and rounding and VAT
 * rules are regulated and costly to change.
 */
import { annotate } from "sdp/annotations"

annotate(import.meta, { is: "ARCH-pricing" })

/** Money is integer cents everywhere (integer-cents). */
export type Cents = number

export const vatRates: Readonly<Record<string, number>> = { DE: 19, FR: 20, HR: 25 }

/** The VAT on a net amount for the delivery country, rounded once. */
export const vatFor = (net: Cents, country: string): Cents => {
  const rate = Object.hasOwn(vatRates, country) ? vatRates[country] : undefined
  if (rate === undefined) throw new Error(`no VAT rate for ${country}`)
  return Math.round((net * rate) / 100)
}
