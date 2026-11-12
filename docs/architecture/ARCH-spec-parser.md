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

Turns one file into one spec in the format [[REQ-progressive-specs]] defines: identity,
attributes, links, prose links, open questions and executable scenarios, plus a diagnostic for
anything it cannot read. It is a pure function of the file's content and the configuration, and it
keeps the line of every fact, so each node, edge and diagnostic built from it points at a greppable
`file:line`. Annotations in code are read by [[ARCH-code-annotations]].

Defines the one specification format (DEC-0001). A change here changes what every spec file in every
workspace means — the highest cost of change in the system.

## Markdown

The format is CommonMark with YAML front matter, fenced Gherkin and `[[wiki-links]]` in prose
([[DEC-0001]]). Each file is parsed once, and the spec carries everything later stages read, so
the checker and the context bundle never read Markdown themselves.

- **Front matter** is the YAML between a first line `---` and the next `---` or `...`, parsed as a
  YAML document whose every node keeps its line: an attribute, an entry of a map attribute, an
  inline node and each link target point at the line they are written on, never at another
  occurrence of the same text. It holds JSON data — strings, numbers, booleans, null, lists, maps
  with plain keys, `__proto__` and `constructor` being keys like any other. An anchor may be
  repeated by an alias, which stands for the anchor's value at the alias's own line; an alias
  inside the value it names or one that names no anchor, a tag JSON has no type for (`!!set`,
  `!!binary`), a number it cannot hold (`.inf`) or a key that is not plain text is an error.
- **Links** are read from the keys that link ([[ARCH-graph-builder]]): the entries of `links:`, and the keys
  the vocabulary names — the plan and phase relations, a workspace's own link keys and each
  discipline of `activity`, as `activity.<discipline>`. A key's value is one id, a comma-separated
  or YAML list of ids, or a map with `to` and the link's attributes; each link is at the line of
  its target.
- **Kinds.** A node has the kind its `kind` gives it, else the kind its id prefix says
  ([[REQ-configuration]]). The kinds sdp makes itself — `scenario`, `code`, `missing` — are not an author's
  to give: one written is a `derived-attribute` error and counts as not written.
- **The body** is CommonMark, parsed by `mdast-util-from-markdown`. What a renderer shows as code
  — fenced and indented code blocks, code spans — and HTML, comments included, is never read as a
  scenario, a link, a heading or an open question; nor is a `[[wiki-link]]` read out of what a
  Markdown link does not show as its text: its destination, its title, an image, a definition; fences close as CommonMark says (same
  character, at least as long, nothing after it), CRLF and tabs count as CommonMark counts them.
- **Gherkin** is a fenced code block whose language is `gherkin`, `feature` or `cucumber`,
  wherever it is: in a list or a quote too.
- **Attributes.** `tags` becomes a list without `@`, from a list or a comma- or space-separated
  string; every other value is kept as YAML parsed it.
- **Prose** is the paragraphs, lists and quotes of the body, as written. The first paragraph is the
  summary (at most 280 characters) and the description the criteria of `draft` ask for
  ([[REQ-maturity-criteria]]); each heading's section is the prose under it, up to the next heading
  of the same or a higher level.
- **Open questions** are the list items, nested ones included, under an open-questions heading,
  up to the next heading of the same or a higher level.

## Gherkin

The blocks are joined into one Gherkin document for the Cucumber parser, and every scenario, step
and example row is mapped back to its line in the Markdown file. The Feature is named after the
spec, unless a `Feature:` line opens the first block, and is tagged with the spec's tags and kind;
a `Feature:` line anywhere else is content.

- A scenario's id is `<spec id>#<slug of its name>`, made unique within the file with `-2`, `-3`, …;
  an unnamed scenario is `#scenario-<position>`. Not its position, which every edit above it
  would change, and not a tag to keep unique by hand: the id survives a move and an edit of its
  steps, and a renamed scenario is a new one.
- Outlines compile to one executable example per row, Background steps included.
- Each scenario carries a hash of what a step handler can observe of it — its examples' names,
  their tags (inherited ones too), step text, doc strings and tables. Editing any of them makes
  earlier results stale; editing prose around them does not.

## Diagnostics

The parser never throws on content. Front matter it cannot read (`front-matter`, at the offending
line) leaves the file out of the graph; a file with a `kind` in its front matter or with a Gherkin
block, but no `id`, is an error (`missing-id`): it is plainly meant as a spec, and its scenarios
would otherwise be dropped silently. The reserved keys are checked
for their shape, and what they cannot hold is an error at the line it is written on: `links:` that
is not a map or a list, or a link without a target (`link-syntax`); `nodes:` that is not a list, or
an entry that is not a map with an id (`inline-node`). An inline node's id follows the rules of a
spec's: a string, trimmed, not empty. An empty `links:` or `nodes:` declares nothing. A Gherkin
syntax error (`gherkin-syntax`) is reported once, at the line where parsing stopped. Each of these
drops only what could not be read.

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
    | missing-id | error    | 1    | declares kind "decision" but no id |

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

Scenario Outline: Front matter is JSON data
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
  And parsing reports:
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

Scenario Outline: A reserved key of the wrong shape is an error at its line
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
  Then parsing reports:
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

Scenario: Inline nodes are declared under nodes, each at the line of its id
  Given a file "docs/plan.md" containing:
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
  When "docs/plan.md" is parsed
  Then the parsed spec has inline nodes:
    | id         | kind      | title      | line | attributes          | links              | link lines |
    | E10        | iteration | E10        | 6    |                     |                    |            |
    | E1         | iteration | E1         | 7    | phase="elaboration" | -phase-> elaboration | 7        |
    | ARCH-cache | element   | Page cache | 8    |                     | -serves-> ARCH-api | 10         |
  And parsing reports:
    | rule        | severity | line | message                          |
    | inline-node | error    | 11   | an entry under nodes needs an id |

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
  Then the parsed spec has no scenarios
  And the parsed spec has no open questions
  And the parsed spec has prose links:
    | to      | line |
    | VISIBLE | 31   |
    | LINKED  | 33   |

Scenario: Gherkin in a quote or a list item runs, and CRLF and tabs count as CommonMark counts them
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

Scenario: Code, comments and an empty fence are not a description
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
  Then the check reports "maturity-criteria" for "REQ-csv"

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
