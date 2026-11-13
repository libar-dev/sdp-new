@id=guest-checkout @maturity=specified
@depends-on:cart-totals
Feature: Guest checkout

  Shoppers without an account want to buy without creating one, and the shop wants their sale:
  carts are abandoned at a sign-up form.

  Not an account: a guest gives what one order needs, and nothing of it is kept for the next.

  Rule: A guest pays without creating an account

    Every field between the cart and the payment loses carts; an account can be offered once the
    order is placed.

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
