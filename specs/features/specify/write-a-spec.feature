@id=write-a-spec
@realized-by:ARCH-spec-parser @realized-by:ARCH-graph-builder
Feature: Write a spec

  Analysts, architects, developers and agents write down what a system must do, and why, as one
  Gherkin `.feature` file per spec that people review, tools parse and sdp runs, and that grows from
  a name to rules with examples without moving to another tool.

  Not a syntax of sdp's own: what the official Gherkin parser reads is all there is.

  @decided-by:specs-are-gherkin-files
  Rule: A file is one spec named by its `@id=` tag, or else a suite named by its path

    Scenario: A spec and someone else's suite
      Given these specs:
        | tags       | Feature        |
        | @id=search | Product search |
      And a file "features/checkout.feature" containing:
        """
        Feature: Checkout
        """
      When the workspace is loaded
      Then the workspace graph has nodes:
        | id                              | kind    | title          |
        | search                          | feature | Product search |
        | suite:features/checkout.feature | suite   | Checkout       |

  @decided-by:still-to-come-is-marked-where-it-is-written
  Rule: A Feature or a Rule declaring a maturity is still to come, and a Rule without one takes its Feature's

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
      Then the workspace node "cart" has attribute toCome = "<feature still to come>"
      And the workspace node "cart#a-cart-holds-what-was-added" has attribute toCome = "<rule still to come>"

      Examples:
        | case                                   | feature         | rule            | feature still to come | rule still to come |
        | Nothing declared                       |                 |                 | undefined             | undefined          |
        | A rule still to come in a live feature |                 | @maturity=ready | undefined             | true               |
        | A feature still to come                | @maturity=draft |                 | true                  | true               |

  @decided-by:specs-are-gherkin-files
  Rule: A tag is a fact `@key=value` or a link `@rel:id` by its first `=` or `:`, else a Cucumber tag

    Scenario: A fact whose value holds a colon, a link and a Cucumber tag
      Given these specs:
        | tags                                                   | Feature |
        | @id=pay @due=2026-12-01T10:00 @refines:sales @checkout | Pay     |
      When the workspace is loaded
      Then the workspace node "pay" has attribute due = "2026-12-01T10:00"
      And the workspace node "pay" has attribute tags = "@checkout"
      And the edges from "pay" are "pay -refines-> sales"

  Rule: A fact is a number or a boolean when it reads back as one, a list when repeated, a map when dotted

    Scenario: A number, a version, a boolean, a list and a map
      Given these specs:
        | tags                                                                                 | Feature |
        | @id=pay @estimate=8 @version=1.10 @billable=false @label=a @label=b @owner.team=core | Pay     |
      When the graph is exported
      Then the output contains '"estimate":8,'
      And the output contains '"version":"1.10"'
      And the output contains '"billable":false'
      And the output contains '"label":["a","b"]'
      And the output contains '"owner":{"team":"core"}'

  Rule: A scenario inherits the Cucumber tags of its Feature and its Rule, and its spec's kind as one

    Facts and links are not inherited, so planning a spec changes none of its examples.

    Scenario: Selected by the tags above it, and not by a fact
      Given a file "specs/pay.feature" containing:
        """
        @id=pay @maturity=draft @checkout
        Feature: Pay

          @slow
          Rule: A wallet is charged once

            Scenario: Retry
              Then one charge is made
        """
      And a step definition "one charge is made" that passes
      When the workspace is run with "--tags '@checkout and @slow and @feature and not @maturity=draft'"
      Then the step "one charge is made" has status "passed"

  Rule: The text under a Feature, a Rule or a Scenario is its description, and the Feature's first paragraph its summary

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
      When the workspace is loaded
      Then the workspace graph has nodes:
        | id                           | summary                                      | description                          |
        | pay                          | Shoppers without an account can pay by card. |                                      |
        | pay#a-wallet-is-charged-once |                                              | A retry reuses the first charge.     |
        | pay#retry                    |                                              | The network failed after the charge. |

  Rule: A scenario outside every Rule is an error, except in a suite named by its path

    Scenario: A scenario before the first Rule, in a spec and in a suite
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

  Rule: A rule's or a scenario's id is the slug of its name, a scenario's numbered when that slug is taken

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
      When the workspace is loaded
      Then the workspace graph has nodes:
        | id                               | kind     |
        | pay                              | feature  |
        | pay#a-declined-card-is-retried   | rule     |
        | pay#retry                        | scenario |
        | pay#retry-2                      | scenario |
        | pay#a-declined-card-is-retried-2 | scenario |

  Rule: A Rule tagged `@open` is a question, still to come, and leaves its live feature live

    A question waits on someone's answer, and fails nothing that is built meanwhile.

    Scenario: A question in a live feature
      Given a file "specs/cart.feature" containing:
        """
        @id=cart
        Feature: Cart

          Rule: A cart holds what was added

            Scenario: Add an item
              Then the cart holds 1 item

          @open
          Rule: Does a cart expire?
        """
      When the workspace is checked
      Then sdp reports "nothing"
      And the workspace graph has nodes:
        | id                               | toCome |
        | cart                             |        |
        | cart#a-cart-holds-what-was-added |        |
        | cart#add-an-item                 |        |
        | cart#does-a-cart-expire          | true   |

  Rule: A scenario's steps are its Feature's Background, then its Rule's, then its own, once per row of an outline

    As Cucumber runs them, so a spec runs alike in sdp and in Cucumber.

    Scenario: An outline under a Rule with a Background of its own, whose step fails
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
      And a step definition "a shop" that passes
      And a step definition "a wallet" that fails
      And a step definition "the payment is retried by {word}" that passes
      When the workspace is run
      Then the step "a shop" has status "passed"
      And the step "a wallet" has status "failed"
      And the step "the payment is retried by card" has status "skipped"
      And the step "the payment is retried by wallet" has status "skipped"

  @decided-by:specs-are-gherkin-files
  Rule: A file Gherkin cannot parse is an error at the line where parsing stopped, and no spec

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
      When the workspace is loaded
      Then sdp reports:
        | rule           | severity | at                  |
        | gherkin-syntax | error    | specs/pay.feature:8 |
      When I query "*"
      Then the result is "nothing"
