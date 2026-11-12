---
id: REQ-progressive-specs
kind: requirement
title: Specifications at every maturity
maturity: ready
iteration: I1
tags: [spec-format]
links:
  refines: CAP-living-specs
  realized-by: ARCH-spec-parser
  decided-by: DEC-0001
---

# Specifications at every maturity

A product idea, a half-understood need and a fully designed feature are written in the same
format: a Markdown file with YAML front matter. The file grows with understanding — a sentence
becomes a description, the description gains scenarios, open questions get resolved — but it never
moves to another tool or format. The scenarios later execute as tests, unchanged. Decisions,
quality requirements, the plan, milestones, risks, the vision and the glossary use the same format.

`````markdown
---
id: REQ-guest-checkout           # unique, literal, greppable
kind: requirement                # free text; inferred from the id prefix when omitted
title: Guest checkout            # defaults to the first # heading
maturity: specified              # idea → draft → specified → ready
iteration: C2                    # an attribute whose value is a node id becomes an edge
tags: [checkout]
links:                           # explicit, free-form relations
  refines: CAP-online-sales
  realized-by: [ARCH-orders, ARCH-payments]
  constrained-by: { to: NFR-checkout-latency, note: "p95" }
---

# Guest checkout

Shoppers without an account can buy. Prose, tables, diagrams, EARS sentences —
whatever explains the need. Mention other nodes with [[DEC-0004]] or typed:
realized-by:: [[ARCH-orders]]

## Open questions
- [ ] Do we verify the email address before payment?
- [x] Can guests save their cart? No.

## Scenarios

```gherkin
Scenario: Guest pays by card
  Given a cart with 2 items
  When the guest checks out with a valid card
  Then an order is created
  And a receipt is emailed
```
`````

- **A spec** is a Markdown file whose front matter has a non-empty `id`. `id`, `kind`, `title`,
  `links` and `nodes` have fixed meanings; every other key is an attribute ([[GLOSSARY]] lists the
  ones sdp reads). `kind` is free text, inferred from the id prefix when omitted (`REQ-` →
  requirement, [[REQ-configuration]]); `title` defaults to the first `#` heading, else the id.
- **Links** in front matter map a relation to one target, several, or a target with attributes:

  ```yaml
  links:
    refines: CAP-sales                              # one target
    calls: ARCH-pricing, ARCH-tax                   # several, comma-separated
    uses: [ARCH-cart, ARCH-cart-store]              # a list
    constrained-by: { to: NFR-latency, note: p95 }  # a target with attributes
  ```

  A list of records works too: `links: [{ rel: uses, to: ARCH-cart, note: sync }]`. An attribute
  whose value is a node id links as well (`iteration: C2`). `nodes:` declares inline nodes, for
  things too small for a file of their own.
- **Prose** mentions a node with `[[ID]]` or `[[ID|label]]`, or links it with a named relation:
  `realized-by:: [[ARCH-orders]], [[ARCH-payments]]`. Inside code they are text. The first
  paragraph is the spec's summary.
- **Open questions** are the list items under a heading *Open questions*, *Questions*,
  *Unresolved* or *TBD*; `- [x]` or a ~~struck~~ item is resolved.
- **Behaviour** is standard Gherkin in fenced blocks — ```` ```gherkin ````, `feature` or
  `cucumber`, or `~~~` when a scenario quotes a fenced block. All blocks of one file form one
  Feature, compiled by the official Cucumber parser; every scenario keeps the line it was written
  on. A `Feature:` line may open the first block.
- **Feature files** are specs too: every `.feature` file joins the graph. `@id:`, `@kind:` and
  other `@key:value` tags on the Feature carry its metadata (`@id:REQ-x @maturity:ready`), so
  existing suites join without conversion; without `@id:` the file is the spec `feature:<path>`.

How specs, links and code annotations become nodes and edges is the contract of
[[ARCH-graph-builder]]; how files are read, of [[ARCH-spec-parser]]. Why Markdown with embedded
Gherkin, rather than plain `.feature` files, Gauge, EARS, a TypeScript DSL or YAML records:
[[DEC-0001]].

## Scenarios

~~~gherkin
Scenario: An idea is a single line
  Given a file "specs/REQ-dark-mode.md" containing:
    """
    ---
    id: REQ-dark-mode
    maturity: idea
    ---
    # Dark mode
    """
  When the workspace is loaded
  Then the workspace graph has node "REQ-dark-mode" of kind "requirement"
  And node "REQ-dark-mode" has attribute title = "Dark mode"
  And node "REQ-dark-mode" has attribute stage = "idea"

Scenario: Gherkin blocks become executable scenarios
  Given a file "specs/REQ-login.md" containing:
    """
    ---
    id: REQ-login
    kind: requirement
    maturity: specified
    ---
    # Login

    Members sign in with email and password.

    ```gherkin
    Scenario: Valid credentials
      Given a member "ada@example.com"
      When she signs in with the right password
      Then she sees her dashboard
    ```
    """
  When the workspace is loaded
  Then node "REQ-login" has 1 scenario
  And the workspace graph has node "REQ-login#valid-credentials" of kind "scenario"
  And there is an edge "REQ-login#valid-credentials" -verifies-> "REQ-login"
  And scenario "REQ-login#valid-credentials" is at line 11

Scenario: Outlines expand into one executable example per row
  Given a file "specs/REQ-vat.md" containing:
    """
    ---
    id: REQ-vat
    maturity: specified
    ---
    # VAT

    ```gherkin
    Scenario Outline: VAT by country
      Given a basket worth <net> in <country>
      Then the VAT is <vat>

      Examples:
        | country | net | vat |
        | DE      | 100 | 19  |
        | FR      | 100 | 20  |
        | HR      | 100 | 25  |
    ```
    """
  When the workspace is loaded
  Then scenario "REQ-vat#vat-by-country" has 3 examples

Scenario: Classic feature files join the same graph
  Given a file "features/search.feature" containing:
    """
    @id:REQ-search @maturity:ready
    Feature: Product search
      Scenario: Search by name
        When I search for "lamp"
        Then I see lamps
    """
  When the workspace is loaded
  Then the workspace graph has node "REQ-search" of kind "requirement"
  And node "REQ-search" has attribute maturity = "ready"
  And node "REQ-search" has 1 scenario
~~~
