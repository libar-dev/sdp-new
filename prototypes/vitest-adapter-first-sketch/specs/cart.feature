@id=cart
Feature: Cart

  Rule: A cart holds each item once

    @native
    Scenario: An item added twice
      Given an empty cart
      When I add "a lamp" 2 times
      Then the cart holds 1 item

    Scenario: Two items
      Given an empty cart
      When I add "a lamp" 1 time
      And I add "a chair" 1 time
      Then the cart holds 3 items

  @maturity=specified
  Rule: A cart expires after a week

    Scenario: A week-old cart
      Given a cart from 8 days ago
      Then the cart is empty
