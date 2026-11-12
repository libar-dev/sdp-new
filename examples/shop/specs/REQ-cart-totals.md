---
id: REQ-cart-totals
title: Cart totals include VAT
maturity: ready
links:
  realized-by: ARCH-pricing
  decided-by: DEC-0001
---

# Cart totals include VAT

Shoppers see the gross total, including the VAT of the delivery country, before they pay.

```gherkin
Scenario Outline: Gross total by country
  Given a cart with <quantity> items at <price> cents
  When the delivery country is <country>
  Then the total is <total> cents

  Examples:
    | quantity | price | country | total |
    | 2        | 1000  | DE      | 2380  |
    | 1        | 999   | HR      | 1249  |

Scenario: Unknown countries are rejected
  Given a cart with 1 items at 100 cents
  When the delivery country is XX
  Then pricing fails with "no VAT rate for XX"
```
