@id=write-a-spec
@realized-by:ARCH-spec-parser @realized-by:ARCH-graph-builder
Feature: Write a spec

  Analysts, architects, developers and agents write down what a system must do, and why, as one
  Gherkin `.feature` file per spec that people review, tools parse and sdp runs, and that grows from
  a name to rules with examples without moving to another tool.

  Not a syntax of sdp's own: what the official Gherkin parser reads is all there is.

  @decided-by:specs-are-gherkin-files
  Rule: One file says what a spec is, what it links to, what must hold and why, and what is still open

    Scenario: Every part of the format in one feature
      Given a file "specs/guest-checkout.feature" containing:
        """
        @id=guest-checkout @maturity=specified @checkout
        @realized-by:ARCH-orders @iteration:IT-payments
        Feature: Guest checkout

          Shoppers without an account can buy: a third of all carts are abandoned at the sign-up form.

          @decided-by:no-sign-up-at-checkout
          Rule: A guest pays without creating an account

            Scenario: By card
              When the guest pays with a valid card
              Then an order is created

          Rule: A guest gets a receipt by email

            The address is not verified first: a wrong one costs a receipt, a check costs the sale.

          @open
          Rule: Can a guest save the cart for later?
        """
      When the workspace is loaded
      Then node "guest-checkout" has attribute kind = "feature"
      And node "guest-checkout" has attribute summary = "Shoppers without an account can buy: a third of all carts are abandoned at the sign-up form."
      And node "guest-checkout" has attribute openQuestions = "1"
      And the edges from "guest-checkout" are "guest-checkout -realized-by-> ARCH-orders, guest-checkout -iteration-> IT-payments"
      And node "guest-checkout#a-guest-gets-a-receipt-by-email" has attribute description = "The address is not verified first: a wrong one costs a receipt, a check costs the sale."
      And node "guest-checkout#by-card" has attribute rule = "guest-checkout#a-guest-pays-without-creating-an-account"

  @decided-by:specs-are-gherkin-files
  Rule: A file is one spec, its Feature, named by its tags or else by its path, and an id and a name are enough

    Scenario Outline: Named by its tags or its path
      Given a file "features/search.feature" containing:
        """
        <tags>
        Feature: Product search
        """
      When "features/search.feature" is parsed
      Then the parsed spec has id "<id>"
      And the parsed spec has kind "<kind>"

      Examples:
        | tags                                 | id                            | kind    |
        | @id=search                           | search                        | feature |
        | @id=search-by-voice @kind=story @web | search-by-voice               | story   |
        | @web                                 | suite:features/search.feature | suite   |

  @decided-by:still-to-come-is-marked-where-it-is-written
  Rule: A Feature or a Rule that declares a maturity is still to come and one that declares none is live, and a Rule without one has its Feature's

    Scenario Outline: What declares a maturity: <case>
      Given a file "specs/cart.feature" containing:
        """
        @id=cart <feature>
        Feature: Cart

          <rule>
          Rule: A cart holds what was added

            Scenario: Add an item
              Then the cart holds 1 item
        """
      When the workspace is loaded
      Then node "cart" has attribute toCome = "<feature still to come>"
      And node "cart#a-cart-holds-what-was-added" has attribute toCome = "<rule still to come>"

      Examples:
        | case                                   | feature         | rule            | feature still to come | rule still to come |
        | Nothing declared                       |                 |                 | undefined             | undefined          |
        | A rule still to come in a live feature |                 | @maturity=ready | undefined             | true               |
        | A feature still to come                | @maturity=draft |                 | true                  | true               |

  @decided-by:specs-are-gherkin-files
  Rule: A tag `@key=value` is a fact and `@rel:ID` a link, the first `=` or `:` decides, any other tag is a Cucumber tag, and only Cucumber tags are inherited

    Scenario: Facts, links and Cucumber tags on a Feature, a Rule and a Scenario
      Given a file "specs/pay.feature" containing:
        """
        @id=pay @maturity=draft @checkout
        @estimate=8 @due=2026-12-01T10:00 @owner.team=core @label=a @label=b @refines:sales
        Feature: Pay

          @decided-by:charge-once @slow
          Rule: A wallet is charged once

            @priority=1 @serial
            Scenario: Retry
              Then one charge is made
        """
      When "specs/pay.feature" is parsed
      Then the parsed spec has exactly these attributes:
        | key      | json               |
        | maturity | "draft"            |
        | estimate | 8                  |
        | due      | "2026-12-01T10:00" |
        | owner    | {"team":"core"}    |
        | label    | ["a","b"]          |
      And the parsed spec has links:
        | rel     | to    | line |
        | refines | sales | 2    |
      And the parsed spec has rules:
        | id                           | tags  | links                     |
        | pay#a-wallet-is-charged-once | @slow | -decided-by-> charge-once |
      And the parsed spec has scenarios:
        | id        | tags    | attributes |
        | pay#retry | @serial | priority=1 |
      And the executable tags of "pay#retry" are "@checkout, @feature, @slow, @serial"

  Rule: The text under a Feature, a Rule or a Scenario is its description, and the Feature's first paragraph is the summary

    Scenario: A paragraph under the Feature, and lines under a Rule and a Scenario
      Given a file "specs/pay.feature" containing:
        """
        @id=pay
        Feature: Pay

          Shoppers without an account
          can pay by card.

          Rule: A wallet is charged once

            A retry reuses the first charge.

            Scenario: Retry
              The network failed after the charge.

              When the payment is retried
        """
      When "specs/pay.feature" is parsed
      Then the parsed spec has summary "Shoppers without an account can pay by card."
      And the parsed spec has rules:
        | id                           | description                      |
        | pay#a-wallet-is-charged-once | A retry reuses the first charge. |
      And the parsed spec has scenarios:
        | id        | description                          |
        | pay#retry | The network failed after the charge. |

  Rule: Every scenario is an example of the Rule above it, and one outside every Rule is an error, except in a suite named by its path

    Scenario: A scenario before the first Rule, and a suite named by its path
      Given a file "specs/pay.feature" containing:
        """
        @id=pay
        Feature: Pay

          Scenario: Card
            Then an order is created
        """
      And a file "features/search.feature" containing:
        """
        Feature: Search
          Scenario: By name
            Then I see lamps
        """
      When the workspace is loaded
      Then sdp reports:
        | rule                  | severity | at                  |
        | scenario-outside-rule | error    | specs/pay.feature:4 |

  Rule: A rule or a scenario is identified by the slug of its name, and a scenario named like another or like a rule is numbered

    Scenario: Two scenarios of one name, and one named like its rule
      Given a file "specs/pay.feature" containing:
        """
        @id=pay
        Feature: Pay

          Rule: A declined card is retried

            Scenario: Retry
              Given a declined card

            Scenario: Retry
              Given an expired card

            Scenario: A declined card is retried
              Given a card declined twice
        """
      When "specs/pay.feature" is parsed
      Then the parsed spec has scenarios:
        | id                               |
        | pay#retry                        |
        | pay#retry-2                      |
        | pay#a-declined-card-is-retried-2 |

  Rule: A Rule tagged `@open` is a question still to come, and in a live feature it is about what is built unless it declares a maturity

    Scenario: A question about the live cart, and one about work still to come
      Given a file "specs/cart.feature" containing:
        """
        @id=cart
        Feature: Cart

          Rule: A cart holds what was added

            Scenario: Add an item
              Then the cart holds 1 item

          @open
          Rule: Does a cart expire?

          @open @maturity=idea
          Rule: Can a cart be shared with a friend?
        """
      When the workspace is loaded
      And I query "*[!toCome] <-rule-of- rule[tags=@open][!maturity]"
      Then the result is "cart#does-a-cart-expire"
      And node "cart#does-a-cart-expire" has attribute toCome = "true"
      And node "cart#can-a-cart-be-shared-with-a-friend" has attribute stage = "idea"

  Rule: A scenario runs as Cucumber runs it: the Feature's Background, then its Rule's, then its own steps, and an outline once per row

    Scenario: An outline under a Rule with a Background of its own
      Given a file "specs/pay.feature" containing:
        """
        @id=pay
        Feature: Pay

          Background:
            Given a shop

          Rule: A wallet is charged once

            Background:
              Given a wallet

            Scenario Outline: Retry
              When the payment is retried by <method>

              Examples:
                | method |
                | card   |
                | wallet |
        """
      When "specs/pay.feature" is parsed
      Then the executable steps of "pay#retry" are:
        | keyword | text                           | line |
        | Given   | a shop                         | 5    |
        | Given   | a wallet                       | 10   |
        | When    | the payment is retried by card | 13   |
      When the workspace is loaded
      Then node "pay#retry" has attribute examples = "2"

  @decided-by:specs-are-gherkin-files
  Rule: A file the Gherkin parser cannot read is an error at the line where it stopped, and no spec until it parses

    Scenario: A misspelt keyword in the last scenario
      Given a file "specs/pay.feature" containing:
        """
        @id=pay
        Feature: Pay

          Rule: An order needs a payment

            Scenario: Card payment
              Given a card
              Whne I pay
        """
      When "specs/pay.feature" is parsed
      Then the file is not a spec
      And sdp reports:
        | rule           | severity | line |
        | gherkin-syntax | error    | 8    |
