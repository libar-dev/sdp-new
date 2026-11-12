---
id: DEC-0001
---

# Money is integer cents, rounded once

Not floating point, whose sums drift (0.1 + 0.2) until prices, VAT and totals no longer reconcile
with accounting: rounding happens once, when VAT is computed.
