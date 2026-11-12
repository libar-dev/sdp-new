---
id: REQ-progressive-specs
kind: requirement
title: Specifications at every maturity
maturity: ready
iteration: I1
activity: { implementation: I1, test: I1 }
tags: [spec-format]
links:
  refines: CAP-living-specs
  realized-by: ARCH-spec-parser
  decided-by: DEC-0001
---

# Specifications at every maturity

A product idea, a half-understood need and a fully designed feature are written in the same
format: a CommonMark file with YAML front matter. The file grows with understanding — a sentence
becomes a description, the description gains scenarios, open questions get resolved — but it never
moves to another tool or format, and the scenarios later run as tests, unchanged. Decisions,
quality requirements, the plan, milestones and risks are written the same way.

## Scenarios

The first is the format, in one file; how each part of it is read is the contract of
[[ARCH-spec-parser]], and how it becomes nodes and edges, of [[ARCH-graph-builder]].

~~~gherkin
Scenario: One file says what a spec is, what it links to, what is still open and what must be true
  Given a file "specs/REQ-guest-checkout.md" containing:
    """
    ---
    id: REQ-guest-checkout           # unique, literal, greppable
    kind: requirement                # the author's word; read from the id prefix when omitted
    title: Guest checkout            # defaults to the first # heading
    maturity: specified              # idea → draft → specified → ready
    iteration: C2                    # when it is written
    activity: { implementation: C3 } # when other disciplines work on it
    tags: [checkout]
    links:                           # relations, named by their author
      refines: CAP-online-sales
      realized-by: [ARCH-orders, ARCH-payments]
      constrained-by: { to: NFR-checkout-latency, note: "p95" }
    ---

    # Guest checkout

    Shoppers without an account can buy.

    The first paragraph is the summary. Prose mentions a node with [[DEC-0004]], or links it:
    guarded-by:: [[POL-fraud]]

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
    """
  When the workspace is loaded
  Then the workspace graph has node "REQ-guest-checkout" of kind "requirement"
  And node "REQ-guest-checkout" has attribute summary = "Shoppers without an account can buy."
  And node "REQ-guest-checkout" has attribute openQuestions = "1"
  And node "REQ-guest-checkout" has 1 scenario
  And the edges from "REQ-guest-checkout" are "REQ-guest-checkout -iteration-> C2, REQ-guest-checkout -activity.implementation-> C3, REQ-guest-checkout -refines-> CAP-online-sales, REQ-guest-checkout -realized-by-> ARCH-orders, REQ-guest-checkout -realized-by-> ARCH-payments, REQ-guest-checkout -constrained-by-> NFR-checkout-latency, REQ-guest-checkout -mentions-> DEC-0004, REQ-guest-checkout -guarded-by-> POL-fraud"

Scenario: An idea is an id and a title
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

Scenario: A fenced Gherkin block holds scenarios, each a node that verifies its spec, at the line it is written on
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

Scenario: An outline is one scenario with one executable example per row
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

Scenario: A classic feature file is a spec too, with its id and attributes in the tags of its Feature
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
