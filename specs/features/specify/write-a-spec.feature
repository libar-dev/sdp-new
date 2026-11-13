@id=write-a-spec
@realized-by:ARCH-spec-parser @realized-by:ARCH-graph-builder
Feature: Write a spec

  Analysts, architects, developers and agents write down what a system must do, and why, as plain
  files that people review, tools parse and sdp runs. A spec is one Gherkin `.feature` file that
  grows with understanding — a name becomes a description, rules gain examples, open questions
  become rules — and never moves to another tool or format.

  Not a syntax of sdp's own: what the official Gherkin parser reads is all there is.

  @decided-by:specs-are-gherkin-files
  Rule: One file says what a spec is, what it links to, what must hold and why, and what is still open

    The official Gherkin parser reads it as it is, so any Gherkin tool reads a spec, and its
    scenarios run as tests unchanged.

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
  Rule: A file is one spec: its Feature, named by its tags or else by its path

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

  Rule: An idea is a spec already: an id and a name are enough

    Nothing waits for the rest of the format: a description, rules, examples and links come as they
    are understood.

    Scenario: An idea
      Given these specs:
        | tags                         | Feature   |
        | @id=dark-mode @maturity=idea | Dark mode |
      When the workspace is loaded
      Then node "dark-mode" has attribute kind = "feature"
      And node "dark-mode" has attribute stage = "idea"

  @decided-by:still-to-come-is-marked-where-it-is-written
  Rule: A Feature or a Rule that declares a maturity is still to come, whatever the value, and one that declares none is live

    A live Feature or Rule is built: its examples must pass. A change to a live feature is rules of
    it with a maturity of their own, so nothing moves when it is built.

    Scenario Outline: A feature that declares <declared>
      Given a file "specs/cart.feature" containing:
        """
        @id=cart <maturity>
        Feature: Cart

          Rule: A cart holds what was added

            Scenario: Add an item
              Then the cart holds 1 item
        """
      When the workspace is loaded
      Then node "cart" has attribute toCome = "<still to come>"
      And node "cart" has attribute stage = "<stage>"

      Examples:
        | declared              | maturity            | still to come | stage     |
        | nothing               |                     | undefined     | unrun     |
        | a rung of the ladder  | @maturity=specified | true          | specified |
        | a word off the ladder | @maturity=someday   | true          | someday   |

  Rule: A Rule without a maturity of its own has its Feature's

    So a rule still to come is written in the live feature it changes, and all of a feature still to
    come is still to come.

    Scenario Outline: A rule's own maturity, else its Feature's
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
      Then node "cart#a-cart-holds-what-was-added" has attribute toCome = "<rule still to come>"
      And node "cart" has attribute toCome = "<feature still to come>"

      Examples:
        | feature         | rule            | rule still to come | feature still to come |
        |                 |                 | undefined          | undefined             |
        |                 | @maturity=ready | true               | undefined             |
        | @maturity=draft |                 | true               | true                  |

  Rule: Work still to come names the live rule or feature it replaces

    What it replaces stays live until the change that builds the replacement deletes it, so no two
    replace each other; a link to a feature stands for all of its rules.

    Scenario Outline: A rule that replaces <case>
      Given a file "specs/cart.feature" containing:
        """
        @id=cart
        Feature: Cart

          Rule: A cart holds what was added

            Scenario: Add an item
              Then the cart holds 1 item

          @maturity=draft
          Rule: A cart is kept for a week

          <tags>
          Rule: A cart holds each item once
        """
      When the workspace is checked
      Then sdp reports "<reported>"

      Examples:
        | case                 | tags                                                       | reported    |
        | a live rule          | @maturity=draft @replaces:cart#a-cart-holds-what-was-added | nothing     |
        | a rule still to come | @maturity=draft @replaces:cart#a-cart-is-kept-for-a-week   | replacement |
        | its own feature      | @maturity=draft @replaces:cart                             | replacement |

  Rule: An example renamed with its steps edited, or merged into another, is named where it went in the change that does it

    `@replaces:<feature>#<example>` on its Scenario, once for each example it takes over. An example
    that is still here is its own test, and naming it is an error.

    Scenario Outline: An example that names <case>
      Given a file "specs/cart.feature" containing:
        """
        @id=cart
        Feature: Cart

          Rule: A cart holds what was added

            Scenario: Add an item
              Then the cart holds 1 item

            <tags>
            Scenario: Add a lamp and a desk
              Then the cart holds a lamp and a desk
        """
      When the workspace is checked
      Then sdp reports "<reported>"

      Examples:
        | case                  | tags                                                | reported    |
        | two examples now gone | @replaces:cart#add-a-lamp @replaces:cart#add-a-desk | nothing     |
        | an example still here | @replaces:cart#add-an-item                          | replacement |
        | the rule it is under  | @replaces:cart#a-cart-holds-what-was-added          | replacement |

  @decided-by:specs-are-gherkin-files
  Rule: A tag `@key=value` is a fact and `@rel:ID` a link, the first `=` or `:` decides, and any other tag is a Cucumber tag

    The first sign decides, so a value may hold the other, as a time does: `@due=2026-12-01T10:00`.

    Scenario: Values, lists, nested keys and links
      Given a file "specs/checkout.feature" containing:
        """
        @id=checkout @maturity=draft @web
        @estimate=8 @ratio=1.50 @due=2026-12-01T10:00 @owner.team=core @label=a @label=b
        @refines:sales @activity.test:IT-beta
        Feature: Guest checkout
        """
      When "specs/checkout.feature" is parsed
      Then the parsed spec has exactly these attributes:
        | key      | json               |
        | maturity | "draft"            |
        | estimate | 8                  |
        | ratio    | "1.50"             |
        | due      | "2026-12-01T10:00" |
        | owner    | {"team":"core"}    |
        | label    | ["a","b"]          |
      And the parsed spec has links:
        | rel           | to      | line |
        | refines       | sales   | 3    |
        | activity.test | IT-beta | 3    |
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

            @priority=1 @serial
            Scenario Outline: Retry
              Then one charge is made by <method>

              @eu
              Examples:
                | method |
                | card   |
        """
      When "specs/pay.feature" is parsed
      Then the parsed spec has rules:
        | id                           | tags  | attributes       | links                     |
        | pay#a-wallet-is-charged-once | @slow | owner="payments" | -decided-by-> charge-once |
      And the parsed spec has scenarios:
        | id        | tags    | attributes |
        | pay#retry | @serial | priority=1 |
      And the executable tags of "pay#retry" are "@checkout, @feature, @slow, @serial, @eu"

  Rule: The text under a Feature, a Rule or a Scenario is its description, and the Feature's first paragraph is the summary

    A description says why, and a relation is a tag, so an id written in one is only text.

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

  Rule: Every scenario is an example of the Rule above it, and one outside every Rule is an error, except in a suite named by its path

    A rule is the contract and its scenarios the evidence: a scenario outside one tests what nobody
    stated. A suite without an id is someone else's, and runs as it is.

    Scenario: A scenario before the first Rule, and a suite named by its path
      Given a file "specs/pay.feature" containing:
        """
        @id=pay
        Feature: Pay

          Scenario: Card
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
        | rule                  | severity | at                  |
        | scenario-outside-rule | error    | specs/pay.feature:4 |

  Rule: A rule or a scenario is identified by the slug of its name, its letters and digits in any script: a scenario named like another or like a rule is numbered, a rule alike is an error

    Not a position, which every edit above it would change, nor a tag kept unique by hand. A rule's
    name says what must hold, so two alike are one rule written twice.

    Scenario: An id is the slug of the name, numbered when the file has the name twice or a rule has it
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

          Rule: Отклонённая карта повторяется

            Scenario: Płatność, große Karte
              Given a declined card
        """
      When "specs/pay.feature" is parsed
      Then the parsed spec has rules:
        | id                                |
        | pay#a-declined-card-is-retried    |
        | pay#отклонённая-карта-повторяется |
      And the parsed spec has scenarios:
        | id                               |
        | pay#retry                        |
        | pay#retry-2                      |
        | pay#a-declined-card-is-retried-2 |
        | pay#płatnosc-große-karte         |
      And sdp reports nothing

  Rule: A Rule tagged `@open` is a question, its name the question: it is still to come, and has no examples

    A question is a choice of what must hold, so it is written where the rule chosen will be, and it
    cannot switch off the examples of a rule that holds.

    Scenario: An open rule with an example
      Given a file "specs/explorer.feature" containing:
        """
        @id=explorer
        Feature: Explorer

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
        | rule             | severity | line |
        | question-example | error    | 12   |
      And node "explorer#a-static-export-or-a-local-server" has attribute toCome = "true"
      And node "explorer#a-reader-browses-the-architecture" has attribute toCome = "undefined"

  Rule: An open question in a live feature is about what is built, unless it declares a maturity, which makes it one about work still to come

    So a gate can ask that nothing built is still undecided, while the questions of work still to
    come wait for that work.

    Scenario: A question about the live cart, and one about a rule of it still to come
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
      And node "cart#can-a-cart-be-shared-with-a-friend" has attribute stage = "idea"

  Rule: A scenario runs the Feature's Background, then its Rule's, then its own steps, each at the line it is written on

    As Cucumber runs it, so a step that fails is reported at the line it is written on.

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
        """
      When "specs/pay.feature" is parsed
      Then the executable steps of "pay#retry" are:
        | keyword | text                   | line |
        | Given   | a shop                 | 5    |
        | Given   | a wallet               | 10   |
        | When    | the payment is retried | 13   |

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

  Rule: A tag that cannot mean what it says is an error at its line, and neither a fact, a link nor a Cucumber tag

    Its author meant a fact or a link, so it is not quietly read as a Cucumber tag instead.

    Scenario Outline: A tag that cannot mean what it says, on a Feature, a Rule and a Scenario
      Given a file "specs/pay.feature" containing:
        """
        @id=pay <feature>
        Feature: Pay

          <rule>
          Rule: An order needs a payment

            <scenario>
            Scenario: Card
              Then an order is created
        """
      When "specs/pay.feature" is parsed
      Then sdp reports:
        | rule       | severity | line   | message   |
        | tag-syntax | error    | <line> | <message> |
      And the executable tags of "pay#card" are "@feature"

      Examples:
        | feature                     | rule        | scenario        | line | message                                                       |
        | @uses:A,B                   |             |                 | 1    | @uses:A,B: one tag is one link                                |
        | @id=other                   |             |                 | 1    | @id=other: a spec has one id                                  |
        | @owner=ada @owner.team=core |             |                 | 1    | owner is written as a value and as a map                      |
        |                             | @1st=ok     |                 | 4    | @1st=ok: this key names nothing                               |
        |                             | @id=payment |                 | 4    | @id=payment: only a Feature says what it is                   |
        | @owner=ada@pay.com          |             |                 | 1    | @owner=ada@pay.com: a tag holds no @                          |
        |                             |             | @maturity=draft | 7    | @maturity=draft: only a Feature or a Rule declares a maturity |

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

    Scenario: CRLF line endings
      Given a file "specs/pay.feature" containing:
        """
        @id=pay
        Feature: Pay

          Shoppers pay
          by card.

          Rule: A wallet is charged once
            A retry reuses the first charge.

            Scenario: Retry
              When the payment is retried with:
                ```
                one
                two
                ```
        """
      When "specs/pay.feature" is parsed with CRLF line endings
      Then the parsed spec has summary "Shoppers pay by card."
      And the parsed spec has rules:
        | name                     | line | description                      |
        | A wallet is charged once | 7    | A retry reuses the first charge. |
      And the executable steps of "pay#retry" are:
        | keyword | text                         | line | doc string |
        | When    | the payment is retried with: | 11   | one\ntwo   |

  @decided-by:specs-are-gherkin-files
  Rule: Specs stay on the official Gherkin parser, and check reports each of its silent edges that it can see

    Every editor and Cucumber tool reads the parser's Gherkin; what the parser drops without a word,
    check says.

    Scenario Outline: A link after a comment on a tag line, and a second Feature
      Given a file "specs/pay.feature" containing:
        """
        <content>
        """
      When "specs/pay.feature" is parsed
      Then sdp reports at least:
        | rule   | severity | line   | message   |
        | <rule> | error    | <line> | <message> |

      Examples:
        | content                                                              | rule           | line | message                                                       |
        | @id=pay @maturity=idea #wallets later @depends-on:cart\nFeature: Pay | tag-syntax     | 1    | so the tags in it are dropped: @depends-on:cart               |
        | @id=pay\nFeature: Pay\n\n  Shoppers pay.\n\nFeature: Refund          | gherkin-syntax | 6    | "Feature: Refund" is read as text of the description above it |
