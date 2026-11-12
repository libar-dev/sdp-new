@id=REQ-decision-records @maturity=ready @decisions
@refines:CAP-curated-architecture @realized-by:ARCH-checker
@iteration:I1 @activity.implementation:I1 @activity.test:I1
Feature: Decision records

  A decision holds the one thing no scenario can say: what was chosen over what, and why. It is in
  force because its file exists: what is undecided is an open question on the spec it blocks, what
  changed is rewritten, and git keeps the rest. Record one only for a choice that is hard to
  reverse, surprising without context and a real trade-off; any other choice is a sentence, or a
  resolved open question, in the spec it concerns.

  Scenario: A decision is a title and a sentence
    Given a file "specs/DEC-0001.md" containing:
      """
      ---
      id: DEC-0001
      ---
      # Retire legacy billing

      Not a wrapper around it, because every new caller would keep it alive.
      """
    When the workspace is checked
    Then sdp reports nothing
    And node "DEC-0001" has attribute kind = "decision"

  Scenario Outline: A decision that grows a section or a scenario is reported
    Given a file "specs/DEC-0001.md" containing:
      """
      ---
      id: DEC-0001
      ---
      # Retire legacy billing

      Not a wrapper around it, because every new caller would keep it alive.

      <more>
      """
    When the workspace is checked
    Then sdp reports at least:
      | rule           | node     | at                       |
      | decision-shape | DEC-0001 | specs/DEC-0001.md:<line> |

    Examples:
      | more                                                                              | line |
      | ## Consequences\n\nInvoices move to the new module.                               | 8    |
      | ```gherkin\nScenario: Nothing calls legacy billing\n  Then nothing calls it\n```  | 9    |

  Scenario: The rule a decision leads to is a scenario of what it constrains, which links back
    Given a file "specs/DEC-0001.md" containing:
      """
      ---
      id: DEC-0001
      ---
      # Retire legacy billing

      Not a wrapper around it, because every new caller would keep it alive.
      """
    And a file "specs/ARCH-legacy-billing.md" containing:
      """
      ---
      id: ARCH-legacy-billing
      links:
        decided-by: DEC-0001
      ---
      # Legacy billing

      ```gherkin
      Scenario: Nothing new calls legacy billing
        Then the query "code -uses-> #ARCH-legacy-billing" returns no results
      ```
      """
    And a file "src/invoices.ts" containing:
      """
      // @sdp uses ARCH-legacy-billing
      export function invoice() {}
      """
    When the workspace is checked
    Then sdp reports nothing
    When the workspace is run
    Then node "ARCH-legacy-billing#nothing-new-calls-legacy-billing" has attribute status = "failed"

  Scenario: A new decision asks what was chosen over what, and why
    When I run "sdp new decision 'Use Postgres for orders' --dir specs"
    Then the file "specs/DEC-0001.feature" contains "Not <what a reasonable person would have chosen>, because <why>."
    When I run "sdp check --json"
    Then the JSON output has:
      | data.rule | template-placeholder |
      | data.node | DEC-0001             |
