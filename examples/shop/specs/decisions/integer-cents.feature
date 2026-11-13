@id=integer-cents @kind=decision
Feature: Money is integer cents, rounded once

  Not floating point, whose sums drift (0.1 + 0.2) until prices, VAT and totals no longer reconcile
  with accounting: rounding happens once, when the VAT of the total is computed. The price is that
  lines priced one by one need not add up to the total: two one-cent lines at 25% VAT are 3 cents
  together and 2 apart.
