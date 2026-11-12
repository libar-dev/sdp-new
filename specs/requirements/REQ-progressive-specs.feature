@id=REQ-progressive-specs @maturity=ready @spec-format
@refines:CAP-living-specs @realized-by:ARCH-spec-parser @decided-by:DEC-0001
@iteration:I1 @activity.implementation:I1 @activity.test:I1
Feature: Specifications at every maturity

  A product idea, a half-understood need and a fully designed feature are written in the same
  format: a Gherkin file, read by the official parser as it is. The file grows with understanding —
  a name becomes a description, rules gain examples, open questions become rules — but it never
  moves to another tool or format, and the scenarios later run as tests, unchanged. Decisions,
  quality requirements, the plan, milestones and risks are written the same way.

  # TODO(convert): The first is the format, in one file; how each part of it is read is the contract of
  # TODO(convert): ARCH-spec-parser, and how it becomes nodes and edges, of ARCH-graph-builder.

  Scenario: One file says what a spec is, what it links to, what must hold and why, and what is still open
    Given a file "specs/REQ-guest-checkout.feature" containing:
      """
      @id=REQ-guest-checkout @maturity=specified @checkout   # what it is: = describes; a bare tag is a tag
      @refines:CAP-online-sales @realized-by:ARCH-orders    # what it links to: one tag, one link
      @iteration:C2 @activity.implementation:C3              # when it is written, when it is built
      Feature: Guest checkout

        Shoppers without an account can buy: a third of all carts are abandoned at the sign-up form.

        Background:
          Given a cart with 2 items

        @decided-by:DEC-0004
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
    Then node "REQ-guest-checkout" has attribute kind = "requirement"
    And node "REQ-guest-checkout" has attribute summary = "Shoppers without an account can buy: a third of all carts are abandoned at the sign-up form."
    And node "REQ-guest-checkout" has attribute openQuestions = "1"
    And node "REQ-guest-checkout" has attribute scenarios = "1"
    And the edges from "REQ-guest-checkout" are "REQ-guest-checkout -refines-> CAP-online-sales, REQ-guest-checkout -realized-by-> ARCH-orders, REQ-guest-checkout -iteration-> C2, REQ-guest-checkout -activity.implementation-> C3"
    And the edges from "REQ-guest-checkout#a-guest-pays-without-creating-an-account" are "REQ-guest-checkout#a-guest-pays-without-creating-an-account -rule-of-> REQ-guest-checkout, REQ-guest-checkout#a-guest-pays-without-creating-an-account -decided-by-> DEC-0004"
    And node "REQ-guest-checkout#a-guest-gets-a-receipt-by-email" has attribute description = "The address is not verified first: a wrong one costs a receipt, a check costs the sale."
    And node "REQ-guest-checkout#by-card" has attribute rule = "REQ-guest-checkout#a-guest-pays-without-creating-an-account"

  Scenario: An idea is an id and a name
    Given these specs:
      | tags                              | Feature   |
      | @id=REQ-dark-mode @maturity=idea  | Dark mode |
    When the workspace is loaded
    Then node "REQ-dark-mode" has attribute kind = "requirement"
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
    Then node "REQ-login" has attribute scenarios = "1"
    And node "REQ-login#valid-credentials" has attribute kind = "scenario"
    And the workspace graph has edges:
      | from                        | rel      | to        |
      | REQ-login#valid-credentials | verifies | REQ-login |
    And node "REQ-login#valid-credentials" has attribute source = "specs/REQ-login.md:11"

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
    Then node "REQ-vat#vat-by-country" has attribute examples = "3"
