---
id: ARCH-spec-parser
kind: element
title: Spec parser
iteration: I1
links:
  decided-by: DEC-0001
  instance-of: { to: PAT-pipes-and-filters, role: filter }
  feeds: ARCH-graph-builder
---

# Spec parser

Turns one file into one spec in the format [[REQ-progressive-specs]] defines: identity,
attributes, links, prose links, open questions and executable scenarios, plus a diagnostic for
anything it cannot read. It is a pure function of the file's content and the configuration, and it
keeps the line of every fact, so each node, edge and diagnostic built from it points at a greppable
`file:line`. Annotations in code are read by [[ARCH-code-annotations]].

Defines the one specification format (DEC-0001). A change here changes what every spec file in every
workspace means — the highest cost of change in the system.

## Markdown

- **Scanning.** The file is read line by line; Markdown is never rendered. A link is at the line
  where its target is written, an inline node and its links at the line of its `id`.
- **Attributes.** `tags` becomes a list without `@`, from a list or a comma- or space-separated
  string; every other value is kept as YAML parsed it.
- **Summary.** The first paragraph, its lines joined; lists, quotes, tables and comments before it
  are skipped; at most 280 characters.
- **Open questions** run until the next heading of the same or a higher level.

## Gherkin

The blocks are joined into one Gherkin document for the Cucumber parser, and every scenario, step
and example row is mapped back to its line in the Markdown file. The Feature is named after the
spec, unless a `Feature:` line opens the first block, and is tagged with the spec's tags and kind;
a `Feature:` line anywhere else is content.

- A scenario's id is `<spec id>#<slug of its name>`, made unique within the file with `-2`, `-3`, …;
  an unnamed scenario is `#scenario-<position>`.
- Outlines compile to one executable example per row, Background steps included.
- Each scenario carries a hash of its executable content — its name, step text, doc strings and
  tables. Editing them makes earlier results stale; editing prose around them does not.

## Diagnostics

The parser never throws on content. Front matter it cannot read (`front-matter`, at the offending
line) leaves the file out of the graph; front matter with a `kind` but no `id` is flagged
(`missing-id`) because it looks like a spec that was meant to count. Links without a target
(`link-syntax`, at the `links:` key), entries under `nodes:` without an id (`inline-node`) and a
Gherkin syntax error (`gherkin-syntax`, reported once, at the line where parsing stopped) drop only
what could not be read.

Code: `src/parse/Markdown.ts`, `src/parse/Gherkin.ts`, `src/parse/Spec.ts`.

## Scenarios

~~~gherkin
Scenario: Identity, attributes and summary are read from the file
  Given a file "specs/REQ-guest-checkout.md" containing:
    """
    ---
    id: REQ-guest-checkout
    maturity: draft
    tags: "checkout, @web mobile"
    estimate: 3
    owner: { team: payments }
    links: { refines: CAP-sales }
    ---
    # Guest checkout

    > Draft: wording not final.

    Shoppers without an account
    can buy.

    More detail.
    """
  When "specs/REQ-guest-checkout.md" is parsed
  Then the parsed spec has kind "requirement"
  And the parsed spec has title "Guest checkout"
  And the parsed spec has summary "Shoppers without an account can buy."
  And the parsed spec has exactly these attributes:
    | key      | value                 |
    | maturity | draft                 |
    | tags     | checkout, web, mobile |
    | estimate | 3                     |
    | owner    | {"team":"payments"}   |
  And parsing reports nothing

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

Scenario Outline: Markdown without an id is not a spec
  Given a file "docs/notes.md" containing:
    """
    ---
    <front matter>
    ---
    # Notes
    """
  When "docs/notes.md" is parsed
  Then the file is not a spec
  And parsing reports nothing

  Examples:
    | front matter     |
    | layout: post     |
    | id: ""           |
    | # a comment only |

Scenario: Front matter with a kind but no id is flagged
  Given a file "docs/DEC-cache.md" containing:
    """
    ---
    kind: decision
    status: accepted
    ---
    # Cache product pages
    """
  When "docs/DEC-cache.md" is parsed
  Then the file is not a spec
  And parsing reports:
    | rule       | severity | line | message                            |
    | missing-id | warning  | 1    | declares kind "decision" but no id |

Scenario Outline: Broken front matter is reported at its line
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
  And parsing reports:
    | rule         | severity | line   | message   |
    | front-matter | error    | <line> | <message> |

  Examples:
    | front matter   | end            | line | message                                        |
    | title: [Basket | ---            | 3    | must be sufficiently indented and end with a ] |
    | id: REQ-cart   | ---            | 3    | Map keys must be unique                        |
    | title: Basket  | maturity: idea | 1    | front matter is not closed with ---            |

Scenario: Links accept every shape, each at the line of its target
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
  And parsing reports nothing

Scenario Outline: A link without a target is reported at the links key
  Given a file "specs/REQ-cart.md" containing:
    """
    ---
    id: REQ-cart
    maturity: idea
    links: <links>
    ---
    # Cart
    """
  When "specs/REQ-cart.md" is parsed
  Then parsing reports:
    | rule        | severity | line | message   |
    | link-syntax | warning  | 4    | <message> |

  Examples:
    | links                         | message                                 |
    | ARCH-cart                     | ignored link "ARCH-cart"                |
    | [ARCH-cart]                   | ignored link "ARCH-cart"                |
    | [{ to: ARCH-cart }]           | ignored link {"to":"ARCH-cart"}         |
    | { uses: { note: no target } } | ignored link uses: {"note":"no target"} |
    | { uses: true }                | ignored link uses: true                 |

Scenario: Inline nodes are declared under nodes, each at the line of its id
  Given a file "docs/plan.md" containing:
    """
    ---
    id: PLAN
    kind: plan
    nodes:
      - { id: E10, kind: iteration }
      - { id: E1, kind: iteration, phase: elaboration }
      - id: ARCH-cache
        title: Page cache
        links: [{ rel: serves, to: ARCH-api, protocol: http }]
      - { title: Nameless }
    ---
    # Plan
    """
  When "docs/plan.md" is parsed
  Then the parsed spec has inline nodes:
    | id         | kind      | title      | line | attributes          | links              |
    | E10        | iteration | E10        | 5    |                     |                    |
    | E1         | iteration | E1         | 6    | phase="elaboration" |                    |
    | ARCH-cache | element   | Page cache | 7    |                     | -serves-> ARCH-api |
  And parsing reports:
    | rule        | severity | line | message                                         |
    | inline-node | warning  | 4    | ignored entry under nodes: {"title":"Nameless"} |

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

Scenario: Open questions are the list items under their heading
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
    | Do we keep receipts for ten years? | no       | 15   |

Scenario Outline: Several headings introduce open questions
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

Scenario: Scenarios and steps keep their lines in the Markdown file
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

Scenario: All blocks of a file form one feature with unique scenario ids
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
    Rule: Wallets
      Scenario: Retry
        Given an expired wallet

      Scenario:
        Given no wallet
    ```
    """
  When "specs/REQ-pay.md" is parsed
  Then the parsed spec has scenarios:
    | id                 | line | rule    |
    | REQ-pay#retry      | 7    |         |
    | REQ-pay#retry-2    | 15   | Wallets |
    | REQ-pay#scenario-3 | 18   | Wallets |

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
  Then parsing reports nothing
  And the executable steps of "REQ-docs#describe-a-feature" are:
    | keyword | text                       | doc string      |
    | Given   | a feature file containing: | Feature: Search |

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
  Then parsing reports nothing
  And the parsed spec has scenarios:
    | id                 | line |
    | REQ-search#by-name | 11   |
  And the executable tags of "REQ-search#by-name" are "@catalog, @requirement, @smoke"

Scenario: A Gherkin syntax error is reported at its Markdown line
  Given a file "specs/REQ-pay.md" containing:
    """
    ---
    id: REQ-pay
    ---
    # Pay

    ```gherkin
    Scenario: Card payment
      Given a card
      Whne I pay
    ```
    """
  When "specs/REQ-pay.md" is parsed
  Then the parsed spec has no scenarios
  And parsing reports:
    | rule           | severity | line |
    | gherkin-syntax | error    | 9    |

Scenario Outline: The scenario hash covers executable content only
  Given a file "specs/REQ-pay.md" containing:
    """
    ---
    id: REQ-pay
    ---
    # Pay

    Shoppers pay by card.

    ```gherkin
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
    | text                  | replacement                     | hash           |
    | 2 items               | 3 items                         | changes        |
    | 4242                  | 4000                            | changes        |
    | Shoppers pay by card. | Shoppers pay by card or wallet. | stays the same |
    | # Pay                 | # Payment                       | stays the same |

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
    | @id:REQ-search @maturity:ready | REQ-search                      | requirement |
    | @id:SEARCH-1 @kind:story @web  | SEARCH-1                        | story       |
    | @web                           | feature:features/search.feature | feature     |
~~~
