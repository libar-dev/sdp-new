---
id: REQ-progressive-specs
kind: requirement
title: Specifications at every maturity
maturity: ready
iteration: E1
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
moves to another tool or format. The scenarios later execute as tests, unchanged.

## Rules

- A Markdown file is a spec when its front matter has an `id`. Every other front matter key is an attribute.
- `kind` is free text; when omitted it is inferred from the id prefix (`REQ-` → requirement).
- Behaviour is Gherkin in fenced `gherkin` blocks. All blocks of one file form one Feature.
- Classic `.feature` files are specs too; their metadata travels in `@key:value` tags.

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
