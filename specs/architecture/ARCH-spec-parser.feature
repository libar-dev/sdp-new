@id=ARCH-spec-parser
@decided-by:specs-are-gherkin-files @instance-of:PAT-pipes-and-filters @uses:ARCH-vocabulary
Feature: Spec parser

  Reads one `.feature` file into one spec, and what it cannot read into a diagnostic. It reads what
  the official Gherkin parser returns and adds no syntax of its own. It is a pure function of the
  file and the configuration, never throws on content, and keeps the line of every fact, so each
  node, edge and diagnostic built from it points at a greppable `file:line`.

  It is architecture because it defines the one specification format: a change here changes what
  every spec in every workspace means, the highest cost of change in the system.

  Rule: A scenario's hash covers what a step handler can observe, and nothing else

    A result counts only while its hash holds, so planning a spec, raising its maturity, naming the
    decision a rule rests on or rewording a reason leaves it valid.

    Scenario Outline: Which edits change a scenario's hash
      Given a file "specs/REQ-pay.feature" containing:
        """
        @id=REQ-pay @maturity=draft @iteration:E1
        Feature: Pay

          Shoppers pay.

          @decided-by:DEC-0001
          Rule: An order needs a payment

            No goods leave without one.

            @slow
            Scenario: Card payment
              Given a cart with 2 items
              When the shopper pays with:
                | card | 4242 |
              Then an order is created
        """
      When "specs/REQ-pay.feature" is parsed
      And "specs/REQ-pay.feature" is parsed again after replacing "<text>" with "<replacement>"
      Then the hash of "REQ-pay#card-payment" <hash>

      Examples:
        | text                        | replacement             | hash           |
        | 2 items                     | 3 items                 | changes        |
        | 4242                        | 4000                    | changes        |
        | @slow                       | @fast                   | changes        |
        | @id=REQ-pay                 | @id=REQ-pay @kind=story | changes        |
        | @maturity=draft             | @maturity=ready         | stays the same |
        | @iteration:E1               | @iteration:E2           | stays the same |
        | @decided-by:DEC-0001        | @decided-by:DEC-0002    | stays the same |
        | Feature: Pay                | Feature: Payment        | stays the same |
        | Shoppers pay.               | Shoppers pay by card.   | stays the same |
        | No goods leave without one. | Nothing ships unpaid.   | stays the same |
