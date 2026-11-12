@id=REQ-cart-totals @maturity=ready
@realized-by:ARCH-pricing
Feature: Cart totals include VAT

  Shoppers see the gross total, including the VAT of the delivery country, before they pay.

  @decided-by:DEC-integer-cents
  Rule: The total adds the VAT of the delivery country, rounded once to whole cents

    Scenario Outline: Gross total by country
      Given a cart with <quantity> items at <price> cents
      When the delivery country is <country>
      Then the total is <total> cents

      Examples:
        | quantity | price | country | total |
        | 2        | 1000  | DE      | 2380  |
        | 1        | 999   | HR      | 1249  |

  Rule: A country without a VAT rate has no total

    Scenario: Unknown countries are rejected
      Given a cart with 1 items at 100 cents
      When the delivery country is XX
      Then pricing fails with "no VAT rate for XX"
