---
id: ARCH-pricing
kind: element
title: Pricing
links:
  decided-by: DEC-0001
  constrained-by: NFR-pricing-latency
---

# Pricing

VAT rates and rounding. Anchored in code by `annotate(import.meta, { is: "ARCH-pricing" })` in
`src/pricing.ts`: the module is the element.

Every monetary figure flows through it; rounding and VAT rules are regulated and costly to change.
