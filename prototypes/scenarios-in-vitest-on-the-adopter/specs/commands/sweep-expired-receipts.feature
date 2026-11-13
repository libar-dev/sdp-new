@id=sweep-expired-receipts @realized-by:ARCH-command
Feature: Sweep expired receipts

  An operator keeps the receipts table bounded: a receipt past its expiry answers no retry.

  Rule: A sweep deletes the expired receipts of one tenant, and no other row

    @simulator
    Scenario: Three expired receipts
      Given tenant "a" has 3 expired receipts
      And tenant "b" has 1 expired receipt
      When the receipts of tenant "a" are swept
      Then the sweep reports 3 deleted
      And 1 receipt remains

  Rule: A sweep deletes at most 1,000 receipts, and says when more remain

    @simulator
    Scenario: One more than the bound
      Given tenant "a" has 1001 expired receipts
      When the receipts of tenant "a" are swept
      Then the sweep reports 1000 deleted
      And the sweep says more remain

  Rule: The next state is the fold of evolve over the events, left to right

    @pure
    Scenario: Three events
      Given the events "a, b, c"
      When they are folded onto ">"
      Then the state is ">abc"

  @maturity=idea
  Rule: A schedule runs the sweep for every tenant each day

    @simulator
    Scenario: A day passes
      Given tenant "a" has 3 expired receipts
      When a day passes
      Then 0 receipts remain
