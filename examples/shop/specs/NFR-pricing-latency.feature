@id=NFR-pricing-latency @maturity=ready @quality=performance
Feature: Pricing stays fast for large carts

  B2B customers order hundreds of lines; recalculating the total on every change must feel instant.

  Rule: The total of a thousand-line cart takes under 2 ms

    @serial
    Scenario: Large cart total
      Given a cart with 1000 distinct lines
      When the total is calculated 100 times
      Then each calculation takes under 2 ms on average
