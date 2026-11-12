@id=REQ-guest-checkout @maturity=specified
@depends-on:REQ-cart-totals
Feature: Guest checkout

  Shoppers without an account can pay.

  Rule: A guest pays without creating an account

    Scenario: Guest pays by card
      Given a cart with 2 items at 1000 cents
      When a guest checks out with a valid card
      Then an order is created
      And a receipt is emailed

  @open
  Rule: Do we verify the email address before payment?

  @open
  Rule: Do orders above 50 EUR ship free?

    Carts are abandoned at the shipping-cost step.
