---
id: ARCH-spec-parser
kind: element
title: Spec parser
iteration: I1
links:
  decided-by: DEC-0001
  instance-of: { to: PAT-pipes-and-filters, role: filter }
  uses: ARCH-vocabulary
---

# Spec parser

Turns one file into one spec in the format of [[REQ-progressive-specs]] — identity, attributes,
links, rules, open questions and executable scenarios — plus a diagnostic for anything it cannot
read. It is a pure function of the file's content and the configuration, it never throws on
content, and it keeps the line of every fact, so each node, edge and diagnostic built from it
points at a greppable `file:line`.

It is architecture because it defines the one specification format: a change here changes what
every spec file in every workspace means — the highest cost of change in the system.

~~~gherkin
Rule: Front matter is YAML that holds JSON data, and every fact in it keeps its line

  Identity, attributes, links and inline nodes are read from its keys. What cannot be read is an
  error at the line it is written on, and drops only that: the parser never guesses and never throws
  on content.

  Scenario: Identity, attributes and the summary are read from the file; an alias stands for its anchor's value
    Given a file "specs/REQ-guest-checkout.md" containing:
      """
      ---
      id: REQ-guest-checkout
      maturity: draft
      tags: "checkout, @web mobile"
      estimate: 3
      owner: &team { team: payments }
      reviewer: *team
      links: { refines: CAP-sales }
      ---
      # Guest checkout

      > Draft: wording not final.

      Shoppers without an account
      can buy with `cards`.

      More detail.
      """
    When "specs/REQ-guest-checkout.md" is parsed
    Then the parsed spec has kind "requirement"
    And the parsed spec has title "Guest checkout"
    And the parsed spec has summary "Shoppers without an account can buy with `cards`."
    And the parsed spec has exactly these attributes:
      | key      | value                 |
      | maturity | draft                 |
      | tags     | checkout, web, mobile |
      | estimate | 3                     |
      | owner    | {"team":"payments"}   |
      | reviewer | {"team":"payments"}   |
    And sdp reports nothing

  Scenario Outline: The title falls back to the first top-level heading, then the id
    Given a file "specs/REQ-basket.md" containing:
      """
      ---
      id: REQ-basket
      <front matter>
      ---
      <body>
      """
    When "specs/REQ-basket.md" is parsed
    Then the parsed spec has title "<title>"

    Examples:
      | front matter    | body             | title      |
      | title: Checkout | # Basket         | Checkout   |
      | maturity: idea  | # Basket         | Basket     |
      | maturity: idea  | ## Basket        | REQ-basket |
      | maturity: idea  | Just a sentence. | REQ-basket |

  Scenario Outline: Markdown without a usable id is not a spec, and no problem
    Given a file "specs/notes.md" containing:
      """
      ---
      <front matter>
      ---
      # Notes
      """
    When "specs/notes.md" is parsed
    Then the file is not a spec
    And sdp reports nothing

    Examples:
      | front matter     |
      | layout: post     |
      | id: ""           |
      | # a comment only |

  Scenario: Front matter with a kind but no id is plainly meant as a spec, and is an error
    Given a file "specs/DEC-cache.md" containing:
      """
      ---
      kind: decision
      ---
      # Cache product pages
      """
    When "specs/DEC-cache.md" is parsed
    Then the file is not a spec
    And sdp reports:
      | rule       | severity | line | message                            |
      | missing-id | error    | 1    | declares kind "decision" but no id |

  Scenario Outline: Front matter that cannot be read is reported at its line, and leaves the file out of the graph
    Given a file "specs/REQ-basket.md" containing:
      """
      ---
      id: REQ-basket
      <front matter>
      <end>
      # Basket
      """
    When "specs/REQ-basket.md" is parsed
    Then the file is not a spec
    And sdp reports:
      | rule         | severity | line   | message   |
      | front-matter | error    | <line> | <message> |

    Examples:
      | front matter   | end            | line | message                                        |
      | title: [Basket | ---            | 3    | must be sufficiently indented and end with a ] |
      | id: REQ-cart   | ---            | 3    | Map keys must be unique                        |
      | title: Basket  | maturity: idea | 1    | front matter is not closed with ---            |

  Scenario Outline: Front matter holds JSON data: an alias inside itself or to no anchor, a tag or number JSON has no type for, a key that is not text are errors
    Given a file "specs/REQ-basket.md" containing:
      """
      ---
      id: REQ-basket
      <front matter>
      ---
      # Basket
      """
    When "specs/REQ-basket.md" is parsed
    Then the file is not a spec
    And sdp reports:
      | rule         | severity | line | message   |
      | front-matter | error    | 3    | <message> |

    Examples:
      | front matter             | message                                   |
      | owner: &x { self: *x }   | the alias *x repeats a value it is inside |
      | links: &x [*x]           | the alias *x repeats a value it is inside |
      | owner: *nobody           | the alias *nobody names no anchor         |
      | estimate: .inf           | .inf is not a JSON number                 |
      | ? [team, lead] : Ada     | a key must be plain text                  |
      | owners: !!set { a, b }   | !!set has no JSON type                    |
      | logo: !!binary aGVsbG8=  | !!binary has no JSON type                 |

  Scenario: A link is one id, a comma-separated or YAML list, or a map with to and attributes, each at the line of its target
    Given a file "specs/REQ-cart.md" containing:
      """
      ---
      id: REQ-cart
      links:
        uses: ARCH-cart-store
        realized-by: ARCH-cart
        refines: CAP-sales, CAP-retention
        depends-on: [REQ-pricing, REQ-stock]
        constrained-by: { to: NFR-latency, note: p95 }
        guarded-by:
          - DEC-0001
          - { to: DEC-0002, since: 2026 }
      ---
      # Cart
      """
    When "specs/REQ-cart.md" is parsed
    Then the parsed spec has links:
      | rel            | to              | line | attributes |
      | uses           | ARCH-cart-store | 4    |            |
      | realized-by    | ARCH-cart       | 5    |            |
      | refines        | CAP-sales       | 6    |            |
      | refines        | CAP-retention   | 6    |            |
      | depends-on     | REQ-pricing     | 7    |            |
      | depends-on     | REQ-stock       | 7    |            |
      | constrained-by | NFR-latency     | 8    | note="p95" |
      | guarded-by     | DEC-0001        | 10   |            |
      | guarded-by     | DEC-0002        | 11   | since=2026 |
    And sdp reports nothing

  Scenario: Every key, map entry and link target is at the line it is written on
    Given a file "specs/REQ-cart.md" containing:
      """
      ---
      id: REQ-cart
      note: shares a store with ARCH-cart-store
      store: &store ARCH-cart-store
      "activity":
        test: [C1, T1]
      iteration:
        - E1
        - E2
      links:
        uses: *store
        calls:
          - ARCH-pricing
        guarded-by:
          since: 2026
          to: DEC-0001
      nodes:
        - id: ARCH-cart-store
          links:
            stores:
              to: ARCH-db
      ---
      # Cart
      """
    When "specs/REQ-cart.md" is parsed
    Then the parsed spec has links:
      | rel           | to              | line |
      | uses          | ARCH-cart-store | 11   |
      | calls         | ARCH-pricing    | 13   |
      | guarded-by    | DEC-0001        | 16   |
      | iteration     | E1              | 8    |
      | iteration     | E2              | 9    |
      | activity.test | C1              | 6    |
      | activity.test | T1              | 6    |
    And the parsed spec has attribute lines:
      | key           | line |
      | note          | 3    |
      | store         | 4    |
      | activity      | 5    |
      | activity.test | 6    |
      | iteration     | 7    |
    And the parsed spec has inline nodes:
      | id              | line | links             | link lines |
      | ARCH-cart-store | 18   | -stores-> ARCH-db | 21         |

  Scenario Outline: links or nodes of the wrong shape is an error at its line, and drops only what could not be read
    Given a file "specs/REQ-cart.md" containing:
      """
      ---
      id: REQ-cart
      maturity: idea
      <front matter>
      ---
      # Cart
      """
    When "specs/REQ-cart.md" is parsed
    Then sdp reports:
      | rule   | severity | line | message   |
      | <rule> | error    | 4    | <message> |

    Examples:
      | front matter                            | rule        | message                                  |
      | links: ARCH-cart                        | link-syntax | links must be a map or a list            |
      | links: [ARCH-cart]                      | link-syntax | a link in a list needs rel and to        |
      | links: [{ to: ARCH-cart }]              | link-syntax | a link in a list needs rel and to        |
      | links: { uses: { note: no target } }    | link-syntax | uses: {"note":"no target"} has no target |
      | links: { uses: true }                   | link-syntax | uses: true has no target                 |
      | nodes: { REQ-a: { kind: requirement } } | inline-node | nodes must be a list                     |
      | nodes: [REQ-a]                          | inline-node | an entry under nodes needs an id         |
      | nodes: [{ id: "  " }]                   | inline-node | an entry under nodes needs an id         |
      | nodes: [{ id: 7, kind: requirement }]   | inline-node | an entry under nodes needs an id         |

  Scenario: Inline nodes are declared under nodes, each at the line of its id, which is a trimmed, non-empty string
    Given a file "specs/plan.md" containing:
      """
      ---
      id: PLAN
      kind: plan
      links:
      nodes:
        - { id: E10, kind: iteration }
        - { id: " E1 ", kind: iteration, phase: elaboration }
        - id: ARCH-cache
          title: Page cache
          links: [{ rel: serves, to: ARCH-api, protocol: http }]
        - { title: Nameless }
      ---
      # Plan
      """
    When "specs/plan.md" is parsed
    Then the parsed spec has inline nodes:
      | id         | kind      | title      | line | attributes          | links              | link lines |
      | E10        | iteration | E10        | 6    |                     |                    |            |
      | E1         | iteration | E1         | 7    | phase="elaboration" | -phase-> elaboration | 7        |
      | ARCH-cache | element   | Page cache | 8    |                     | -serves-> ARCH-api | 10         |
    And sdp reports:
      | rule        | severity | line | message                          |
      | inline-node | error    | 11   | an entry under nodes needs an id |
~~~

~~~gherkin
Rule: The body is CommonMark: what a renderer shows as code, or hides, is never read

  A scenario, a link or an open question is read only where a reader of the rendered page would see
  one.

  Scenario: Prose links are mentions or typed, and never inside code
    Given a file "specs/REQ-refunds.md" containing:
      """
      ---
      id: REQ-refunds
      ---
      # Refunds

      Follows [[DEC-0001]] and [[DEC-0002|the refund policy]].
      realized-by:: [[ARCH-orders]], [[ARCH-payments]]
      Write `[[DEC-0009]]` to link a decision.

      ```text
      [[DEC-0008]]
      ```
      """
    When "specs/REQ-refunds.md" is parsed
    Then the parsed spec has prose links:
      | to            | rel         | line |
      | DEC-0001      | mentions    | 6    |
      | DEC-0002      | mentions    | 6    |
      | ARCH-orders   | realized-by | 7    |
      | ARCH-payments | realized-by | 7    |

  Scenario: What a renderer shows as code or HTML, or hides in a link's destination, is not read as a scenario, a link or a question
    Given a file "specs/REQ-docs.md" containing:
      """
      ---
      id: REQ-docs
      ---
      # Docs

          [[INDENTED]]
          ## Open questions
          - an indented question

      <!-- [[COMMENTED]]
      ## Open questions
      - a commented question
      -->

      ``a span with [[SPANNED]] and ` inside``

      ```text
      ```not-a-closer
      ```gherkin
      Scenario: Documentation
        Then nothing runs
      ```

      ~~~~markdown
      ~~~gherkin
      Scenario: Inside a longer fence
        Then nothing runs
      ~~~
      ~~~~

      Visible: [[VISIBLE]].

      [Shown: [[LINKED]]](https://example.com/[[DESTINATION]] "[[TITLED]]") ![[[ALT]]](logo.png)

      [reference]: https://example.com/[[DEFINED]]
      """
    When "specs/REQ-docs.md" is parsed
    Then the parsed spec has scenarios:
      | id |
    And the parsed spec has open questions:
      | question |
    And the parsed spec has prose links:
      | to      | line |
      | VISIBLE | 31   |
      | LINKED  | 33   |

  Scenario: Gherkin in a quote or a list item is read, and CRLF and tabs count as CommonMark counts them
    Given a file "specs/REQ-pay.md" containing:
      """
      ---
      id: REQ-pay
      ---
      # Pay

      →[[INDENTED]]

      > ```gherkin
      > Scenario: Quoted
      >   Then it runs
      > ```

      - ```gherkin
        Scenario: Listed
          Then it runs
        ```
      """
    When "specs/REQ-pay.md" is parsed with CRLF line endings and → as a tab
    Then the parsed spec has scenarios:
      | id             | line |
      | REQ-pay#quoted | 9    |
      | REQ-pay#listed | 14   |
    And the executable steps of "REQ-pay#listed" are:
      | keyword | text    | line |
      | Then    | it runs | 15   |
    And the parsed spec has prose links:
      | to |

  Scenario: Code, comments and an empty fence are not a description, so they give no summary
    Given a file "specs/REQ-csv.md" containing:
      """
      ---
      id: REQ-csv
      maturity: draft
      ---
      # Export to CSV

      ```text
      ```
      <!-- Analysts want data in Excel. -->
      """
    When "specs/REQ-csv.md" is parsed
    Then the parsed spec has summary ""
    When the workspace is checked
    Then sdp reports at least:
      | rule              | node    |
      | maturity-criteria | REQ-csv |

  Scenario: Open questions are the list items under their heading, nested ones included, up to the next heading of its level; a checked or struck one is resolved
    Given a file "specs/REQ-checkout.md" containing:
      """
      ---
      id: REQ-checkout
      ---
      # Checkout

      - a list item, not a question

      ## Open questions
      - [ ] Do we verify the email address?
      - [x] Can guests save their cart? No.
      - ~~Do we need a captcha?~~
      - Which payment providers?
        - Do we take wallets?

      ### For legal
      - Do we keep receipts for ten years?

      ## Rules
      - not a question either
      """
    When "specs/REQ-checkout.md" is parsed
    Then the parsed spec has open questions:
      | question                           | resolved | line |
      | Do we verify the email address?    | no       | 9    |
      | Can guests save their cart? No.    | yes      | 10   |
      | ~~Do we need a captcha?~~          | yes      | 11   |
      | Which payment providers?           | no       | 12   |
      | Do we take wallets?                | no       | 13   |
      | Do we keep receipts for ten years? | no       | 16   |

  Scenario Outline: Open question, Questions, Unresolved questions and TBD introduce open questions too
    Given a file "specs/REQ-checkout.md" containing:
      """
      ---
      id: REQ-checkout
      ---
      # Checkout

      ## <heading>
      - Who signs off?
      """
    When "specs/REQ-checkout.md" is parsed
    Then the parsed spec has open questions:
      | question       | resolved |
      | Who signs off? | no       |

    Examples:
      | heading              |
      | Open question        |
      | Questions            |
      | Unresolved questions |
      | TBD                  |
~~~

~~~gherkin
Rule: The fences of a file are one feature

  Whatever a fence calls its language, its scenarios join the spec's one feature: a line is the
  line in the Markdown file, and an id is unique in the file. A scenario's id is the slug of its
  name — not its position, which every edit above it would change, and not a tag to keep unique
  by hand.

  Scenario: Scenarios and steps keep their lines in the Markdown file, Background steps included, and carry the spec's tags and kind
    Given a file "specs/REQ-pay.md" containing:
      """
      ---
      id: REQ-pay
      tags: [checkout]
      ---
      # Pay

      ```gherkin
      Background:
        Given a shop

      Scenario: Card payment
        When the shopper pays by card
        Then an order is created
      ```
      """
    When "specs/REQ-pay.md" is parsed
    Then the parsed spec has scenarios:
      | id                   | line |
      | REQ-pay#card-payment | 11   |
    And the executable steps of "REQ-pay#card-payment" are:
      | keyword | text                     | line |
      | Given   | a shop                   | 9    |
      | When    | the shopper pays by card | 12   |
      | Then    | an order is created      | 13   |
    And the executable tags of "REQ-pay#card-payment" are "@checkout, @requirement"

  Scenario: An id is the slug of the name, numbered when the file has the name twice, and by position when there is no name
    Given a file "specs/REQ-pay.md" containing:
      """
      ---
      id: REQ-pay
      ---
      # Pay

      ```gherkin
      Scenario: Retry
        Given a declined card
      ```

      Prose between the blocks.

      ```feature
      Scenario: Retry
        Given an expired wallet

      Scenario:
        Given no wallet
      ```

      ```cucumber
      Scenario: Refund
        Given a refunded wallet
      ```
      """
    When "specs/REQ-pay.md" is parsed
    Then the parsed spec has scenarios:
      | id                 | line |
      | REQ-pay#retry      | 7    |
      | REQ-pay#retry-2    | 14   |
      | REQ-pay#scenario-3 | 17   |
      | REQ-pay#refund     | 22   |

  Scenario: A Feature line may open the first block
    Given a file "specs/REQ-search.md" containing:
      """
      ---
      id: REQ-search
      tags: [catalog]
      ---
      # Search

      ```gherkin
      # A comment
      @smoke
      Feature: Product search
        Scenario: By name
          Then I see lamps
      ```
      """
    When "specs/REQ-search.md" is parsed
    Then sdp reports nothing
    And the parsed spec has scenarios:
      | id                 | line |
      | REQ-search#by-name | 11   |
    And the executable tags of "REQ-search#by-name" are "@catalog, @requirement, @smoke"

  Scenario: A Feature line inside a doc string is content
    Given a file "specs/REQ-docs.md" containing:
      """
      ---
      id: REQ-docs
      ---
      # Docs

      ````gherkin
      Scenario: Describe a feature
        Given a feature file containing:
          ```
          Feature: Search
          ```
      ````
      """
    When "specs/REQ-docs.md" is parsed
    Then sdp reports nothing
    And the executable steps of "REQ-docs#describe-a-feature" are:
      | keyword | text                       | doc string      |
      | Given   | a feature file containing: | Feature: Search |

  Scenario: A Gherkin syntax error is reported at the Markdown line where parsing stopped, and no scenario of the file is kept
    Given a file "specs/REQ-pay.md" containing:
      """
      ---
      id: REQ-pay
      ---
      # Pay

      ```gherkin
      Scenario: Card payment
        Given a card
      ```

      ```gherkin
      Scenario: Wallet payment
        Given a wallet
        Whne I pay
      ```
      """
    When "specs/REQ-pay.md" is parsed
    Then the parsed spec has scenarios:
      | id |
    And sdp reports:
      | rule           | severity | line |
      | gherkin-syntax | error    | 14   |
~~~

~~~gherkin
Rule: A Rule ends with its fence

  A rule and its examples are written in one fence, and the fence is where the rule ends: neither
  its name nor its Background nor its tags reach the scenarios of a later fence. A rule that held
  until the end of the file would claim every scenario written below it, in sections that never
  heard of it.

  Scenario: A scenario in a later fence belongs to no rule, and runs without the rule's Background and tags
    Given a file "specs/REQ-pay.md" containing:
      """
      ---
      id: REQ-pay
      ---
      # Pay

      ```gherkin
      @wallet
      Rule: A wallet is charged once

        Background:
          Given a wallet

        Scenario: Retry
          When the payment is retried
      ```

      ```gherkin
      Scenario: Refund
        When the order is refunded
      ```
      """
    When "specs/REQ-pay.md" is parsed
    Then the parsed spec has scenarios:
      | id             | rule                       |
      | REQ-pay#retry  | A wallet is charged once   |
      | REQ-pay#refund |                            |
    And the executable steps of "REQ-pay#refund" are:
      | keyword | text                  |
      | When    | the order is refunded |
    And the executable tags of "REQ-pay#refund" are "@requirement"

  Scenario: A Background outside a Rule opens the file and holds in every fence, under a Rule too
    Given a file "specs/REQ-pay.md" containing:
      """
      ---
      id: REQ-pay
      ---
      # Pay

      ```gherkin
      Background:
        Given a shop
      ```

      ```gherkin
      Rule: A wallet is charged once

        Background:
          Given a wallet

        Scenario: Retry
          When the payment is retried
      ```
      """
    When "specs/REQ-pay.md" is parsed
    Then the executable steps of "REQ-pay#retry" are:
      | keyword | text                   | line |
      | Given   | a shop                 | 8    |
      | Given   | a wallet               | 15   |
      | When    | the payment is retried | 18   |

  Scenario: A Background outside a Rule in a later fence is an error that says where it belongs
    Given a file "specs/REQ-pay.md" containing:
      """
      ---
      id: REQ-pay
      ---
      # Pay

      ```gherkin
      Scenario: Retry
        When the payment is retried
      ```

      ```gherkin
      Background:
        Given a wallet

      Scenario: Refund
        When the order is refunded
      ```
      """
    When "specs/REQ-pay.md" is parsed
    Then the parsed spec has scenarios:
      | id |
    And sdp reports:
      | rule           | severity | line | message                                                         |
      | gherkin-syntax | error    | 12   | a Background outside a Rule holds for the whole file |
~~~

~~~gherkin
Rule: The text under a Rule or a Scenario is kept as its description

  What must hold, and why, is written where the examples are: under `Rule:`, and under
  `Scenario:` where one example needs a word of its own. sdp keeps that text with the scenario, so
  a reader of the graph gets the rule with its reason, and the prose around the fence has nothing
  left to say about it.

  Scenario: A scenario and a rule carry the text under their keyword line, without the indentation it was written with
    Given a file "specs/REQ-pay.md" containing:
      """
      ---
      id: REQ-pay
      ---
      # Pay

      ```gherkin
      Rule: A wallet is charged once

        A retry reuses the first charge.
        Charging twice is the one error a shopper does not forgive.

        Scenario: Retry
          The network failed after the charge.

          When the payment is retried

        Scenario: Refund
          When the order is refunded
      ```
      """
    When "specs/REQ-pay.md" is parsed
    Then the parsed spec has rules:
      | id                               | description                                                                                   |
      | REQ-pay#a-wallet-is-charged-once | A retry reuses the first charge.\nCharging twice is the one error a shopper does not forgive. |
    And the parsed spec has scenarios:
      | id             | description                          | rule                     |
      | REQ-pay#retry  | The network failed after the charge. | A wallet is charged once |
      | REQ-pay#refund |                                      | A wallet is charged once |

  Scenario Outline: The scenario hash covers what a step handler can observe, and nothing of the text around it
    Given a file "specs/REQ-pay.md" containing:
      """
      ---
      id: REQ-pay
      ---
      # Pay

      Shoppers pay by card.

      ```gherkin
      Rule: An order needs a payment
        No goods leave without one.

        Scenario: Card payment
          Given a cart with 2 items
          When the shopper pays with:
            | card | 4242 |
          Then an order is created
      ```
      """
    When "specs/REQ-pay.md" is parsed
    And "specs/REQ-pay.md" is parsed again after replacing "<text>" with "<replacement>"
    Then the hash of "REQ-pay#card-payment" <hash>

    Examples:
      | text                        | replacement                     | hash           |
      | 2 items                     | 3 items                         | changes        |
      | 4242                        | 4000                            | changes        |
      | Shoppers pay by card.       | Shoppers pay by card or wallet. | stays the same |
      | # Pay                       | # Payment                       | stays the same |
      | No goods leave without one. | Nothing ships unpaid.           | stays the same |
~~~

~~~gherkin
Rule: A spec is a Feature, and the tags above it say what it is and what it links to

  `@key=value` is a fact and `@rel:ID` a link: the first `=` or `:` decides, so a link is a property
  of how it is written, never of its value. Any other tag is a Cucumber tag its scenarios inherit.

  Scenario: The tags give the id, the facts and the links, each at the line of its tag; the Feature gives the title and the summary
    Given a file "specs/REQ-checkout.feature" containing:
      """
      @id=REQ-checkout @maturity=draft @web
      @estimate=8 @ratio=1.50 @public=false @due=2026-12-01T10:00 @owner.team=core @owner.lead=ada @label=a @label=b
      @refines:CAP-sales @iteration:E1 @activity.test:E1 @activity.test:T1
      Feature: Guest checkout

        Shoppers without an account can buy:
        a third of all carts are abandoned at the sign-up form.

        A later paragraph says more.
      """
    When "specs/REQ-checkout.feature" is parsed
    Then the parsed spec has kind "requirement"
    And the parsed spec has title "Guest checkout"
    And the parsed spec has summary "Shoppers without an account can buy: a third of all carts are abandoned at the sign-up form."
    And the parsed spec has exactly these attributes:
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

  Scenario Outline: A feature file is identified by its tags, else by its path
    Given a file "features/search.feature" containing:
      """
      <tags>
      Feature: Product search
        Scenario: Search by name
          Then I see lamps
      """
    When "features/search.feature" is parsed
    Then the parsed spec has id "<id>"
    And the parsed spec has kind "<kind>"

    Examples:
      | tags                           | id                              | kind        |
      | @id=REQ-search @maturity=ready | REQ-search                      | requirement |
      | @id=SEARCH-1 @kind=story @web  | SEARCH-1                        | story       |
      | @web                           | feature:features/search.feature | feature     |

  Scenario: The tags of a Rule and of a Scenario are facts and links of that node, and only its Cucumber tags are inherited
    Given a file "specs/REQ-pay.feature" containing:
      """
      @id=REQ-pay @maturity=ready @checkout
      Feature: Pay

        Shoppers pay by card.

        @decided-by:DEC-0001 @slow @owner=payments
        Rule: A wallet is charged once

          A retry reuses the first charge.

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
      | id                               | name                     | line | description                      | tags  | attributes       | links                  |
      | REQ-pay#a-wallet-is-charged-once | A wallet is charged once | 7    | A retry reuses the first charge. | @slow | owner="payments" | -decided-by-> DEC-0001 |
    And the parsed spec has scenarios:
      | id            | rule                     | tags    | attributes | links                |
      | REQ-pay#retry | A wallet is charged once | @serial | priority=1 | -covers-> REQ-refund |
    And the executable tags of "REQ-pay#retry" are "@requirement, @checkout, @slow, @serial, @eu"
    And sdp reports nothing

  Scenario Outline: What a hash covers is what a step can see: an annotation, the spec's kind aside, is none of it
    Planning a spec into another iteration, raising its maturity or naming the decision a rule rests
    on leaves its results valid.

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
            When the shopper pays
            Then an order is created
      """
    When "specs/REQ-pay.feature" is parsed
    And "specs/REQ-pay.feature" is parsed again after replacing "<text>" with "<replacement>"
    Then the hash of "REQ-pay#card-payment" <hash>

    Examples:
      | text                        | replacement             | hash           |
      | @maturity=draft             | @maturity=ready         | stays the same |
      | @iteration:E1               | @iteration:E2           | stays the same |
      | @decided-by:DEC-0001        | @decided-by:DEC-0002    | stays the same |
      | Shoppers pay.               | Shoppers pay by card.   | stays the same |
      | No goods leave without one. | Nothing ships unpaid.   | stays the same |
      | @slow                       | @fast                   | changes        |
      | @id=REQ-pay                 | @id=REQ-pay @kind=story | changes        |

  Scenario Outline: An annotation that cannot mean what it says is an error at its line, and no tag
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
      | rule                | severity | line | message                               |
      | description-comment | warning  | 5    | "# Why" is a comment, so Gherkin leaves it out |

  Scenario: A Rule or a Scenario tagged @open is a question still open, and its name is the question, so it needs no steps
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
      | question                                    | resolved | line |
      | A static export, or a local server?         | no       | 7    |
      | Is the code behind an element shown always? | no       | 12   |
    When the workspace is checked
    Then sdp reports nothing

  Scenario: A scenario is an example of a rule; one outside every rule is an error, except in a suite named by its path
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
      | rule                  | severity | at                      | message                                          |
      | scenario-outside-rule | error    | specs/REQ-pay.feature:4 | "Card" is an example of no rule, nor are 1 more |
~~~
