@id=write-a-spec @maturity=implemented
@realized-by:ARCH-spec-parser @realized-by:ARCH-graph-builder
Feature: Write a spec

  Analysts, architects, developers and agents write down what a system must do, and why, as plain
  files that people read in a review, tools parse and sdp runs. A spec is one Gherkin `.feature`
  file: its tags say what it is and what it links to, its rules what must hold and why, its
  scenarios are the examples, and what is still undecided is a question in it. The file grows with
  understanding — a name becomes a description, rules gain examples, open questions become rules —
  and never moves to another tool or format.

  No syntax of sdp's own: what the official Gherkin parser reads is all there is, so no front
  matter, no Markdown and no numbering kept by hand. Not how specs link into one graph, nor how
  their scenarios run: this is one file and what it says.

  @decided-by:specs-are-gherkin-files
  Rule: One file says what a spec is, what it links to, what must hold and why, and what is still open

    The official Gherkin parser reads it as it is, so any Gherkin tool reads a spec, and its
    scenarios run as tests unchanged.

    Scenario: Every part of the format in one feature
      Given a file "specs/guest-checkout.feature" containing:
        """
        @id=guest-checkout @maturity=specified @checkout   # what it is: = describes; a bare tag is a tag
        @refines:checkout @realized-by:ARCH-orders         # what it links to: one tag, one link
        @iteration:IT-payments @activity.implementation:IT-launch   # when it is written, when it is built
        Feature: Guest checkout

          Shoppers without an account can buy: a third of all carts are abandoned at the sign-up form.

          Background:
            Given a cart with 2 items

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
      And node "guest-checkout" has attribute scenarios = "1"
      And the edges from "guest-checkout" are "guest-checkout -refines-> checkout, guest-checkout -realized-by-> ARCH-orders, guest-checkout -iteration-> IT-payments, guest-checkout -activity.implementation-> IT-launch"
      And the edges from "guest-checkout#a-guest-pays-without-creating-an-account" are "guest-checkout#a-guest-pays-without-creating-an-account -rule-of-> guest-checkout, guest-checkout#a-guest-pays-without-creating-an-account -decided-by-> no-sign-up-at-checkout"
      And node "guest-checkout#a-guest-gets-a-receipt-by-email" has attribute description = "The address is not verified first: a wrong one costs a receipt, a check costs the sale."
      And node "guest-checkout#by-card" has attribute rule = "guest-checkout#a-guest-pays-without-creating-an-account"

  @decided-by:specs-are-gherkin-files
  Rule: A file is one spec: its Feature, named by its tags or else by its path

    Gherkin reads a second `Feature:` as text of the description above it, so sdp says so rather
    than lose a spec without a word.

    Scenario Outline: Named by its tags or its path, titled by its Feature or its id
      Given a file "features/search.feature" containing:
        """
        <tags>
        Feature: <name>
        """
      When "features/search.feature" is parsed
      Then the parsed spec has id "<id>"
      And the parsed spec has kind "<kind>"
      And the parsed spec has title "<title>"

      Examples:
        | tags                                 | name           | id                            | kind    | title          |
        | @id=search                           | Product search | search                        | feature | Product search |
        | @id=search-by-voice @kind=story @web | Product search | search-by-voice               | story   | Product search |
        | @web                                 | Product search | suite:features/search.feature | suite   | Product search |
        | @id=search                           |                | search                        | feature | search         |
        | @id=true @kind=false                 | Product search | true                          | false   | Product search |

    Scenario: A second Feature in a file is text of the description above it, and an error
      Given a file "specs/pay.feature" containing:
        """
        @id=pay
        Feature: Pay

          Shoppers pay.

        Feature: Refund
        """
      When "specs/pay.feature" is parsed
      Then sdp reports:
        | rule           | severity | line | message                                                       |
        | gherkin-syntax | error    | 6    | "Feature: Refund" is read as text of the description above it |

    Scenario: A Feature line inside a doc string is content
      Given a file "specs/docs.feature" containing:
        """
        @id=docs
        Feature: Docs

          Rule: A feature file can be shown

            Scenario: Describe a feature
              Given a feature file containing:
                ```
                Feature: Search
                ```
        """
      When "specs/docs.feature" is parsed
      Then sdp reports nothing
      And the executable steps of "docs#describe-a-feature" are:
        | keyword | text                       | doc string      |
        | Given   | a feature file containing: | Feature: Search |

  Rule: An idea is a spec already: an id and a name are enough

    Nothing waits for the rest of the format: a description, rules, examples and links come as they
    are understood.

    Scenario: An idea
      Given these specs:
        | tags                         | Feature   |
        | @id=dark-mode @maturity=idea | Dark mode |
      When the workspace is loaded
      Then node "dark-mode" has attribute kind = "feature"
      And node "dark-mode" has attribute title = "Dark mode"
      And node "dark-mode" has attribute stage = "idea"

  @decided-by:still-to-come-is-marked-where-it-is-written
  Rule: A Feature or a Rule declares its maturity, and implemented says it is built

    Below implemented is work still to come, `toCome` in the graph. A change to a built feature is
    rules of it at the maturity they have reached, so nothing moves when it is built.

    Scenario: A built feature with a rule still to come
      Given a file "specs/cart.feature" containing:
        """
        @id=cart @maturity=implemented
        Feature: Cart

          Shoppers collect items before paying.

          Rule: A cart holds what was added

            Scenario: Add an item
              Then the cart holds 1 item

          @maturity=draft
          Rule: A cart is kept for a week

            Shoppers come back to finish what they started.
        """
      When the workspace is loaded
      And I query "*[toCome]"
      Then the result is "cart#a-cart-is-kept-for-a-week"
      And node "cart" has attribute rulesToCome = "1"
      And node "cart#a-cart-is-kept-for-a-week" has attribute stage = "draft"
      And node "cart#a-cart-holds-what-was-added" has attribute stage = "implemented"

  Rule: A Rule without a maturity of its own has its Feature's

    So one rule can be built in a feature still to come, and one still to come in a built feature.
    On a Scenario or Examples a maturity would switch single examples off, so it is an error.

    Scenario Outline: A rule's own maturity, else its Feature's
      Given a file "specs/cart.feature" containing:
        """
        @id=cart <feature>
        Feature: Cart

          Shoppers collect items before paying.

          <rule>
          Rule: A cart holds what was added

            Scenario: Add an item
              Then the cart holds 1 item
        """
      When the workspace is loaded
      Then node "cart#a-cart-holds-what-was-added" has attribute toCome = "<rule still to come>"
      And node "cart#add-an-item" has attribute toCome = "<rule still to come>"
      And node "cart" has attribute toCome = "<feature still to come>"

      Examples:
        | feature               | rule                  | rule still to come | feature still to come |
        | @maturity=implemented |                       | undefined          | undefined             |
        | @maturity=implemented | @maturity=ready       | true               | undefined             |
        | @maturity=draft       |                       | true               | true                  |
        | @maturity=draft       | @maturity=implemented | undefined          | true                  |

    Scenario: A maturity on a Scenario or on Examples is an error, and the example stays its rule's
      Given a file "specs/pay.feature" containing:
        """
        @id=pay @maturity=implemented
        Feature: Pay

          Rule: An order needs a payment

            @maturity=draft
            Scenario Outline: Card
              Then an order is created

              @maturity=idea
              Examples:
                | n |
                | 1 |
        """
      When the workspace is loaded
      Then sdp reports:
        | rule       | severity | line | message                                                       |
        | annotation | error    | 6    | @maturity=draft: only a Feature or a Rule declares a maturity |
        | annotation | error    | 10   | @maturity=idea: only a Feature or a Rule declares a maturity  |
      And node "pay#card" has attribute toCome = "undefined"

  @decided-by:specs-are-gherkin-files
  Rule: A tag `@key=value` is a fact and `@rel:ID` a link, the first `=` or `:` decides, and any other tag is a Cucumber tag

    The first sign decides, so a value may hold the other, as a time does: `@due=2026-12-01T10:00`.

    Scenario: Values, lists, nested keys and links, each at the line of its tag
      Given a file "specs/checkout.feature" containing:
        """
        @id=checkout @maturity=draft @web
        @estimate=8 @ratio=1.50 @public=false @due=2026-12-01T10:00 @owner.team=core @owner.lead=ada @label=a @label=b
        @refines:sales @iteration:IT-beta @activity.test:IT-beta @activity.test:IT-launch
        Feature: Guest checkout
        """
      When "specs/checkout.feature" is parsed
      Then the parsed spec has exactly these attributes:
        | key      | json                         |
        | maturity | "draft"                      |
        | estimate | 8                            |
        | ratio    | "1.50"                       |
        | public   | false                        |
        | due      | "2026-12-01T10:00"           |
        | owner    | {"team":"core","lead":"ada"} |
        | label    | ["a","b"]                    |
        | tags     | ["web"]                      |
      And the parsed spec has attribute lines:
        | key        | line |
        | id         | 1    |
        | maturity   | 1    |
        | estimate   | 2    |
        | ratio      | 2    |
        | public     | 2    |
        | due        | 2    |
        | owner.team | 2    |
        | owner.lead | 2    |
        | label      | 2    |
      And the parsed spec has links:
        | rel           | to        | line |
        | refines       | sales     | 3    |
        | iteration     | IT-beta   | 3    |
        | activity.test | IT-beta   | 3    |
        | activity.test | IT-launch | 3    |
      And sdp reports nothing

  Rule: A tag is about the Feature, the Rule or the Scenario it sits on, and only Cucumber tags are inherited

    The spec's kind is inherited as a tag too, so `--tags @feature` selects the examples of
    features.

    Scenario: Tags on every level, from the Feature to the Examples
      Given a file "specs/pay.feature" containing:
        """
        @id=pay @maturity=ready @checkout
        Feature: Pay

          @decided-by:charge-once @slow @owner=payments
          Rule: A wallet is charged once

            @priority=1 @serial @covers:refund
            Scenario Outline: Retry
              When the payment is retried by <method>
              Then one charge is made

              @eu
              Examples:
                | method |
                | card   |
        """
      When "specs/pay.feature" is parsed
      Then the parsed spec has rules:
        | id                           | line | tags  | attributes       | links                     |
        | pay#a-wallet-is-charged-once | 5    | @slow | owner="payments" | -decided-by-> charge-once |
      And the parsed spec has scenarios:
        | id        | rule                     | tags    | attributes | links            |
        | pay#retry | A wallet is charged once | @serial | priority=1 | -covers-> refund |
      And the executable tags of "pay#retry" are "@checkout, @feature, @slow, @serial, @eu"
      And sdp reports nothing

  Rule: The text under a Feature, a Rule or a Scenario is its description, and the Feature's first paragraph is the summary

    A description says why, and a relation is a tag, so an id written in one is only text. Gherkin
    drops a `#` line from a description without a word, so sdp says so.

    Scenario: Two paragraphs under the Feature, two lines under a Rule, one under a Scenario
      Given a file "specs/pay.feature" containing:
        """
        @id=pay
        Feature: Pay

          Shoppers without an account
          can pay by card.

          A later paragraph names charge-once.

          Rule: A wallet is charged once

            A retry reuses the first charge.
            Charging twice is the one error a shopper does not forgive.

            Scenario: Retry
              The network failed after the charge.

              When the payment is retried
        """
      When "specs/pay.feature" is parsed
      Then the parsed spec has summary "Shoppers without an account can pay by card."
      And the parsed spec has links:
        | rel | to |
      And the parsed spec has rules:
        | id                           | description                                                                                   |
        | pay#a-wallet-is-charged-once | A retry reuses the first charge.\nCharging twice is the one error a shopper does not forgive. |
      And the parsed spec has scenarios:
        | id        | description                          |
        | pay#retry | The network failed after the charge. |

    Scenario: A # line inside a description is a comment, which Gherkin leaves out of it, and sdp says so
      Given a file "specs/pay.feature" containing:
        """
        @id=pay
        Feature: Pay

          Shoppers pay.
          # Why
          Cards first, wallets later.

          # A comment after the description is only a comment.
          Rule: An order needs a payment
        """
      When "specs/pay.feature" is parsed
      Then the parsed spec has summary "Shoppers pay. Cards first, wallets later."
      And sdp reports:
        | rule                | severity | line | message                                        |
        | description-comment | warning  | 5    | "# Why" is a comment, so Gherkin leaves it out |

  Rule: Every scenario is an example of the Rule above it, and one outside every Rule is an error, except in a suite named by its path

    A rule is the contract and its scenarios the evidence: a scenario outside one tests what nobody
    stated. A suite without an id is someone else's, and runs as it is.

    Scenario: A scenario after a Rule, at the Feature's indentation, is still the Rule's
      Given a file "specs/pay.feature" containing:
        """
        @id=pay
        Feature: Pay

          Rule: A wallet is charged once

            Scenario: Retry
              When the payment is retried

          Scenario: Refund
            When the order is refunded
        """
      When "specs/pay.feature" is parsed
      Then the parsed spec has scenarios:
        | id         | rule                     |
        | pay#retry  | A wallet is charged once |
        | pay#refund | A wallet is charged once |
      And sdp reports nothing

    Scenario: Two scenarios before the first Rule, and a suite named by its path
      Given a file "specs/pay.feature" containing:
        """
        @id=pay
        Feature: Pay

          Scenario: Card
            Then an order is created

          Scenario: Wallet
            Then an order is created

          Rule: An order needs a payment

            Scenario: Nothing to pay
              Then no order is created
        """
      And a file "features/search.feature" containing:
        """
        Feature: Search
          Scenario: By name
            Then I see lamps
        """
      When the workspace is loaded
      Then sdp reports:
        | rule                  | severity | at                  | message                                         |
        | scenario-outside-rule | error    | specs/pay.feature:4 | "Card" is an example of no rule, nor are 1 more |

  Rule: A rule or a scenario is identified by the slug of its name: a scenario named like another or like a rule is numbered, a rule alike is an error

    Not a position, which every edit above it would change, nor a tag kept unique by hand. A rule's
    name says what must hold, so two alike are one rule written twice.

    Scenario: An id is the slug of the name, numbered when the file has the name twice or a rule has it, and by position when there is no name
      Given a file "specs/pay.feature" containing:
        """
        @id=pay
        Feature: Pay

          Rule: A declined card is retried

            Scenario: Retry
              Given a declined card

            Scenario: Retry
              Given an expired card

            Scenario:
              Given no card

            Scenario: A declined card is retried
              Given a card declined twice
        """
      When "specs/pay.feature" is parsed
      Then the parsed spec has rules:
        | id                             | line |
        | pay#a-declined-card-is-retried | 4    |
      And the parsed spec has scenarios:
        | id                               | line |
        | pay#retry                        | 6    |
        | pay#retry-2                      | 9    |
        | pay#scenario-3                   | 12   |
        | pay#a-declined-card-is-retried-2 | 15   |
      And sdp reports nothing

    Scenario: A long name is cut after the last whole word within 64 characters
      Given a file "specs/pay.feature" containing:
        """
        @id=pay
        Feature: Pay

          Rule: A card the bank declines is retried every hour for a whole day, then never again
        """
      When "specs/pay.feature" is parsed
      Then the parsed spec has rules:
        | id                                                                 | line |
        | pay#a-card-the-bank-declines-is-retried-every-hour-for-a-whole-day | 4    |

    Scenario: Two rules alike are one id twice, which stops a run
      Given a file "specs/pay.feature" containing:
        """
        @id=pay
        Feature: Pay

          Rule: A card is charged once

            Scenario: Twice
              Then one charge is made

          Rule: A card is charged once
        """
      When the workspace is loaded
      Then sdp reports:
        | rule         | at                  | message                                                                  |
        | duplicate-id | specs/pay.feature:9 | id pay#a-card-is-charged-once is already declared at specs/pay.feature:4 |
      When I run "sdp run"
      Then the exit code is 1
      And the output contains "specs/pay.feature:9 [duplicate-id]"

  Rule: A Rule or a Scenario tagged `@open` is a question, its name the question

    A question is a choice of what must hold, so it is written where the rule chosen will be.

    Scenario: An open Rule needs no example, and an open Scenario no step
      Given a file "specs/explorer.feature" containing:
        """
        @id=explorer @maturity=draft
        Feature: Explorer

          Stakeholders read the graph in a browser.

          Rule: A reader browses the architecture

          @open
          Rule: A static export, or a local server?

          Rule: The explorer only reads

            @open
            Scenario: Is the code behind an element shown always?
        """
      When "specs/explorer.feature" is parsed
      Then the parsed spec has open questions:
        | question                                    | line |
        | A static export, or a local server?         | 9    |
        | Is the code behind an element shown always? | 14   |
      When the workspace is checked
      Then sdp reports nothing

  Rule: An open question is still to come, and has no examples

    It cannot switch off the examples of a rule that holds, whatever maturity it would inherit.

    Scenario Outline: A question in a feature at <maturity>
      Given a file "specs/explorer.feature" containing:
        """
        @id=explorer @maturity=<maturity>
        Feature: Explorer

          Stakeholders read the graph in a browser.

          Rule: A reader browses the architecture

            Scenario: Browse
              Then the architecture is shown

          @open
          Rule: A static export, or a local server?
        """
      When the workspace is checked
      Then sdp reports nothing
      And node "explorer#a-static-export-or-a-local-server" has attribute toCome = "true"
      And node "explorer#a-reader-browses-the-architecture" has attribute toCome = "<still to come>"

      Examples:
        | maturity    | still to come |
        | implemented | undefined     |
        | specified   | true          |

    Scenario: An open rule with an example is an error
      Given a file "specs/explorer.feature" containing:
        """
        @id=explorer @maturity=implemented
        Feature: Explorer

          Stakeholders read the graph in a browser.

          Rule: A reader browses the architecture

            Scenario: Browse
              Then the architecture is shown

          @open
          Rule: A static export, or a local server?

            Scenario: Export
              Then the graph is exported
        """
      When the workspace is checked
      Then sdp reports:
        | rule             | severity | line | message                                                                               |
        | question-example | error    | 14   | explorer#a-static-export-or-a-local-server is an open question, so it has no examples |

  Rule: A scenario runs the Feature's Background, then its Rule's, then its own steps, each at the line it is written on

    As Cucumber runs it, so a step that fails is reported at the line it is written on, in the
    Background where it is.

    Scenario: Under a Rule with a Background of its own
      Given a file "specs/pay.feature" containing:
        """
        @id=pay
        Feature: Pay

          Background:
            Given a shop

          Rule: A wallet is charged once

            Background:
              Given a wallet

            Scenario: Retry
              When the payment is retried
              Then one charge is made
        """
      When "specs/pay.feature" is parsed
      Then the parsed spec has scenarios:
        | id        | line |
        | pay#retry | 12   |
      And the executable steps of "pay#retry" are:
        | keyword | text                   | line |
        | Given   | a shop                 | 5    |
        | Given   | a wallet               | 10   |
        | When    | the payment is retried | 13   |
        | Then    | one charge is made     | 14   |

  Rule: An outline is one scenario, with an example per row

    Scenario: VAT in three countries
      Given a file "specs/vat.feature" containing:
        """
        @id=vat
        Feature: VAT

          Rule: VAT is charged at the buyer's rate

            Scenario Outline: VAT by country
              Then the VAT in <country> is <vat>

              Examples:
                | country | vat |
                | DE      | 19  |
                | FR      | 20  |
                | HR      | 25  |
        """
      When the workspace is loaded
      Then node "vat#vat-by-country" has attribute examples = "3"

  Rule: An annotation that cannot mean what it says is an error at its line, and neither a fact nor a tag

    Its author meant a fact or a link, so it is not quietly read as a Cucumber tag instead.

    Scenario Outline: A list in one tag, a second id, an id that links, a key that is a value and a map, a key that names nothing, an id below the Feature, an annotation on Examples
      Given a file "specs/pay.feature" containing:
        """
        @id=pay <feature>
        Feature: Pay

          <rule>
          Rule: An order needs a payment

            <scenario>
            Scenario Outline: Card
              Then an order is created

              <examples>
              Examples:
                | n |
                | 1 |
        """
      When "specs/pay.feature" is parsed
      Then sdp reports:
        | rule       | severity | line   | message   |
        | annotation | error    | <line> | <message> |
      And the executable tags of "pay#card" are "@feature"

      Examples:
        | feature                     | rule        | scenario    | examples         | line | message                                     |
        | @uses:A,B                   |             |             |                  | 1    | @uses:A,B: one tag is one link              |
        | @id=other                   |             |             |                  | 1    | @id=other: a spec has one id                |
        | @id:other                   |             |             |                  | 1    | @id:other: a spec's id is written with =    |
        | @owner=ada @owner.team=core |             |             |                  | 1    | owner is written as a value and as a map    |
        | @owner..team=core           |             |             |                  | 1    | @owner..team=core: this key names nothing   |
        |                             | @1st=ok     |             |                  | 4    | @1st=ok: this key names nothing             |
        |                             |             | @:b         |                  | 7    | @:b: this key names nothing                 |
        |                             | @id=payment |             |                  | 4    | @id=payment: only a Feature says what it is |
        |                             |             | @kind=story |                  | 7    | @kind=story: only a Feature says what it is |
        |                             |             |             | @browser=firefox | 11   | an annotation on Examples is about no node  |

  Rule: A file the parser cannot read is an error at the line where it stopped, and no spec until it parses

    Nothing of it is guessed: the scenarios above the error do not run as if they were all there is.

    Scenario: A misspelt keyword in the last scenario
      Given a file "specs/pay.feature" containing:
        """
        @id=pay
        Feature: Pay

          Rule: An order needs a payment

            Scenario: Card payment
              Given a card

            Scenario: Wallet payment
              Given a wallet
              Whne I pay
        """
      When "specs/pay.feature" is parsed
      Then the file is not a spec
      And sdp reports:
        | rule           | severity | line |
        | gherkin-syntax | error    | 11   |

  Rule: A file reads the same whatever its line endings

    A file saved with Windows line endings means what it means anywhere else: the same summary, the
    same lines, the same steps.

    Scenario: CRLF line endings
      Given a file "specs/pay.feature" containing:
        """
        @id=pay
        @maturity=ready
        Feature: Pay

          Shoppers pay
          # Why
          by card.

          Rule: A wallet is charged once
            A retry reuses the first charge.

            Scenario: Retry
              When the payment is retried with:
                ```
                one
                two
                ```
              Then one charge is made
        """
      When "specs/pay.feature" is parsed with CRLF line endings
      Then the parsed spec has summary "Shoppers pay by card."
      And the parsed spec has attribute lines:
        | key      | line |
        | id       | 1    |
        | maturity | 2    |
      And the parsed spec has rules:
        | name                     | line | description                      |
        | A wallet is charged once | 9    | A retry reuses the first charge. |
      And the executable steps of "pay#retry" are:
        | keyword | text                         | line | doc string |
        | When    | the payment is retried with: | 13   | one\ntwo   |
        | Then    | one charge is made           | 18   |            |
      And sdp reports:
        | rule                | line |
        | description-comment | 6    |
