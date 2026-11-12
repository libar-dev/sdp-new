@id=ARCH-spec-parser
@decided-by:DEC-0001 @instance-of:PAT-pipes-and-filters @uses:ARCH-vocabulary
@iteration:I1
Feature: Spec parser

  Reads one `.feature` file into one spec, and what it cannot read into a diagnostic. It reads what
  the official Gherkin parser returns and adds no syntax of its own. It is a pure function of the
  file and the configuration, never throws on content, and keeps the line of every fact, so each
  node, edge and diagnostic built from it points at a greppable `file:line`.

  It is architecture because it defines the one specification format: a change here changes what
  every spec in every workspace means, the highest cost of change in the system.

  @decided-by:DEC-0001
  Rule: A file is one spec: its Feature, named by its tags or else by its path

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
        | tags                          | name           | id                              | kind        | title          |
        | @id=REQ-search                | Product search | REQ-search                      | requirement | Product search |
        | @id=SEARCH-1 @kind=story @web | Product search | SEARCH-1                        | story       | Product search |
        | @web                          | Product search | feature:features/search.feature | feature     | Product search |
        | @id=REQ-search                |                | REQ-search                      | requirement | REQ-search     |

    Scenario: A second Feature in a file is text of the description above it, and an error
      Given a file "specs/REQ-pay.feature" containing:
        """
        @id=REQ-pay
        Feature: Pay

          Shoppers pay.

        Feature: Refund
        """
      When "specs/REQ-pay.feature" is parsed
      Then sdp reports:
        | rule           | severity | line | message                                                        |
        | gherkin-syntax | error    | 6    | "Feature: Refund" is read as text of the description above it |

    Scenario: A Feature line inside a doc string is content
      Given a file "specs/REQ-docs.feature" containing:
        """
        @id=REQ-docs
        Feature: Docs

          Rule: A feature file can be shown

            Scenario: Describe a feature
              Given a feature file containing:
                ```
                Feature: Search
                ```
        """
      When "specs/REQ-docs.feature" is parsed
      Then sdp reports nothing
      And the executable steps of "REQ-docs#describe-a-feature" are:
        | keyword | text                       | doc string      |
        | Given   | a feature file containing: | Feature: Search |

  @decided-by:DEC-0001
  Rule: A tag `@key=value` is a fact and `@rel:ID` a link, the first `=` or `:` decides, and any other tag is a Cucumber tag

    So a link is a property of how it is written, never of its value.

    Scenario: Values, lists, nested keys and links, each at the line of its tag
      Given a file "specs/REQ-checkout.feature" containing:
        """
        @id=REQ-checkout @maturity=draft @web
        @estimate=8 @ratio=1.50 @public=false @due=2026-12-01T10:00 @owner.team=core @owner.lead=ada @label=a @label=b
        @refines:CAP-sales @iteration:E1 @activity.test:E1 @activity.test:T1
        Feature: Guest checkout
        """
      When "specs/REQ-checkout.feature" is parsed
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
        | refines       | CAP-sales | 3    |
        | iteration     | E1        | 3    |
        | activity.test | E1        | 3    |
        | activity.test | T1        | 3    |
      And sdp reports nothing

  Rule: A tag is about the Feature, the Rule or the Scenario it sits on, and only Cucumber tags are inherited

    The spec's kind is inherited as a tag too, so `--tags @requirement` selects the examples of
    requirements.

    Scenario: Tags on every level, from the Feature to the Examples
      Given a file "specs/REQ-pay.feature" containing:
        """
        @id=REQ-pay @maturity=ready @checkout
        Feature: Pay

          @decided-by:DEC-0001 @slow @owner=payments
          Rule: A wallet is charged once

            @priority=1 @serial @covers:REQ-refund
            Scenario Outline: Retry
              When the payment is retried by <method>
              Then one charge is made

              @eu
              Examples:
                | method |
                | card   |
        """
      When "specs/REQ-pay.feature" is parsed
      Then the parsed spec has rules:
        | id                               | line | tags  | attributes       | links                  |
        | REQ-pay#a-wallet-is-charged-once | 5    | @slow | owner="payments" | -decided-by-> DEC-0001 |
      And the parsed spec has scenarios:
        | id            | rule                     | tags    | attributes | links                |
        | REQ-pay#retry | A wallet is charged once | @serial | priority=1 | -covers-> REQ-refund |
      And the executable tags of "REQ-pay#retry" are "@checkout, @requirement, @slow, @serial, @eu"
      And sdp reports nothing

  Rule: An annotation that cannot mean what it says is an error at its line, and neither a fact nor a tag

    Its author meant a fact or a link, so it is not quietly read as a Cucumber tag instead.

    Scenario Outline: A list in one tag, a second id, a key that is a value and a map, an id below the Feature, an annotation on Examples
      Given a file "specs/REQ-pay.feature" containing:
        """
        @id=REQ-pay <feature>
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
      When "specs/REQ-pay.feature" is parsed
      Then sdp reports:
        | rule       | severity | line   | message   |
        | annotation | error    | <line> | <message> |
      And the executable tags of "REQ-pay#card" are "@requirement"

      Examples:
        | feature                     | rule    | scenario    | examples         | line | message                                     |
        | @uses:A,B                   |         |             |                  | 1    | @uses:A,B: one tag is one link              |
        | @id=REQ-other               |         |             |                  | 1    | @id=REQ-other: a spec has one id            |
        | @owner=ada @owner.team=core |         |             |                  | 1    | owner is written as a value and as a map    |
        |                             | @id=R-1 |             |                  | 4    | @id=R-1: only a Feature says what it is     |
        |                             |         | @kind=story |                  | 7    | @kind=story: only a Feature says what it is |
        |                             |         |             | @browser=firefox | 11   | an annotation on Examples is about no node  |

  Rule: The text under a Feature, a Rule or a Scenario is its description, and the Feature's first paragraph is the summary

    A description says why, and a relation is a tag, so an id written in one is only text. Gherkin
    drops a `#` line from a description without a word, so sdp says so.

    Scenario: Two paragraphs under the Feature, two lines under a Rule, one under a Scenario
      Given a file "specs/REQ-pay.feature" containing:
        """
        @id=REQ-pay
        Feature: Pay

          Shoppers without an account
          can pay by card.

          A later paragraph names DEC-0001.

          Rule: A wallet is charged once

            A retry reuses the first charge.
            Charging twice is the one error a shopper does not forgive.

            Scenario: Retry
              The network failed after the charge.

              When the payment is retried
        """
      When "specs/REQ-pay.feature" is parsed
      Then the parsed spec has summary "Shoppers without an account can pay by card."
      And the parsed spec has links:
        | rel | to |
      And the parsed spec has rules:
        | id                               | description                                                                                   |
        | REQ-pay#a-wallet-is-charged-once | A retry reuses the first charge.\nCharging twice is the one error a shopper does not forgive. |
      And the parsed spec has scenarios:
        | id            | description                          |
        | REQ-pay#retry | The network failed after the charge. |

    Scenario: A # line inside a description is a comment, which Gherkin leaves out of it, and sdp says so
      Given a file "specs/REQ-pay.feature" containing:
        """
        @id=REQ-pay
        Feature: Pay

          Shoppers pay.
          # Why
          Cards first, wallets later.

          # A comment after the description is only a comment.
          Rule: An order needs a payment
        """
      When "specs/REQ-pay.feature" is parsed
      Then the parsed spec has summary "Shoppers pay. Cards first, wallets later."
      And sdp reports:
        | rule                | severity | line | message                                        |
        | description-comment | warning  | 5    | "# Why" is a comment, so Gherkin leaves it out |

  Rule: Every scenario is an example of the Rule above it, and one outside every Rule is an error, except in a suite named by its path

    A rule is the contract and its scenarios the evidence: a scenario outside one tests what nobody
    stated. A suite without an id is someone else's, and runs as it is.

    Scenario: A scenario after a Rule, at the Feature's indentation, is still the Rule's
      Given a file "specs/REQ-pay.feature" containing:
        """
        @id=REQ-pay
        Feature: Pay

          Rule: A wallet is charged once

            Scenario: Retry
              When the payment is retried

          Scenario: Refund
            When the order is refunded
        """
      When "specs/REQ-pay.feature" is parsed
      Then the parsed spec has scenarios:
        | id             | rule                     |
        | REQ-pay#retry  | A wallet is charged once |
        | REQ-pay#refund | A wallet is charged once |
      And sdp reports nothing

    Scenario: Two scenarios before the first Rule, and a suite named by its path
      Given a file "specs/REQ-pay.feature" containing:
        """
        @id=REQ-pay
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
        | rule                  | severity | at                      | message                                         |
        | scenario-outside-rule | error    | specs/REQ-pay.feature:4 | "Card" is an example of no rule, nor are 1 more |

  Rule: A rule or a scenario is identified by the slug of its name: scenarios alike are numbered, a rule alike is an error

    Not a position, which every edit above it would change, nor a tag kept unique by hand. A rule's
    name says what must hold, so two alike are one rule written twice.

    Scenario: An id is the slug of the name, numbered when the file has the name twice, and by position when there is no name
      Given a file "specs/REQ-pay.feature" containing:
        """
        @id=REQ-pay
        Feature: Pay

          Rule: A declined card is retried

            Scenario: Retry
              Given a declined card

            Scenario: Retry
              Given an expired card

            Scenario:
              Given no card
        """
      When "specs/REQ-pay.feature" is parsed
      Then the parsed spec has rules:
        | id                                 | line |
        | REQ-pay#a-declined-card-is-retried | 4    |
      And the parsed spec has scenarios:
        | id                 | line |
        | REQ-pay#retry      | 6    |
        | REQ-pay#retry-2    | 9    |
        | REQ-pay#scenario-3 | 12   |

    Scenario: Two rules alike, or a rule and a scenario named alike, are one id twice, which stops a run
      Given a file "specs/REQ-pay.feature" containing:
        """
        @id=REQ-pay
        Feature: Pay

          Rule: A card is charged once

            Scenario: A card is charged once
              Then one charge is made

          Rule: A card is charged once
        """
      When the workspace is loaded
      Then sdp reports:
        | rule         | at                      | message                                                                          |
        | duplicate-id | specs/REQ-pay.feature:4 | id REQ-pay#a-card-is-charged-once is already declared at specs/REQ-pay.feature:6 |
        | duplicate-id | specs/REQ-pay.feature:9 | id REQ-pay#a-card-is-charged-once is already declared at specs/REQ-pay.feature:6 |
      When I run "sdp run"
      Then the exit code is 1
      And the output contains "specs/REQ-pay.feature:9 [duplicate-id]"

  Rule: A Rule or a Scenario tagged `@open` is a question still open, its name the question, and it needs no example

    A question is a choice of what must hold, so it is written where the rule chosen will be.

    Scenario: An open Rule needs no example, and an open Scenario no step
      Given a file "specs/REQ-explorer.feature" containing:
        """
        @id=REQ-explorer
        Feature: Explorer

          Rule: A reader browses the architecture

          @open
          Rule: A static export, or a local server?

          Rule: The explorer only reads

            @open
            Scenario: Is the code behind an element shown always?
        """
      When "specs/REQ-explorer.feature" is parsed
      Then the parsed spec has open questions:
        | question                                    | line |
        | A static export, or a local server?         | 7    |
        | Is the code behind an element shown always? | 12   |
      When the workspace is checked
      Then sdp reports nothing

  Rule: A scenario runs the Feature's Background, then its Rule's, then its own steps, each at the line it is written on

    Scenario: Under a Rule with a Background of its own
      Given a file "specs/REQ-pay.feature" containing:
        """
        @id=REQ-pay
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
      When "specs/REQ-pay.feature" is parsed
      Then the parsed spec has scenarios:
        | id            | line |
        | REQ-pay#retry | 12   |
      And the executable steps of "REQ-pay#retry" are:
        | keyword | text                   | line |
        | Given   | a shop                 | 5    |
        | Given   | a wallet               | 10   |
        | When    | the payment is retried | 13   |
        | Then    | one charge is made     | 14   |

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

  Rule: A file the parser cannot read is an error at the line where it stopped, and no spec until it parses

    Nothing of it is guessed: the scenarios above the error do not run as if they were all there is.

    Scenario: A misspelt keyword in the last scenario
      Given a file "specs/REQ-pay.feature" containing:
        """
        @id=REQ-pay
        Feature: Pay

          Rule: An order needs a payment

            Scenario: Card payment
              Given a card

            Scenario: Wallet payment
              Given a wallet
              Whne I pay
        """
      When "specs/REQ-pay.feature" is parsed
      Then the file is not a spec
      And sdp reports:
        | rule           | severity | line |
        | gherkin-syntax | error    | 11   |
