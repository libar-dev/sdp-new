@id=REQ-decision-records @maturity=ready
@realized-by:ARCH-checker
Feature: Decision records

  A decision holds the one thing no scenario can say: what was chosen over what, and why. It is in
  force because its file exists: what is undecided is an open question on the spec it blocks, what
  changed is rewritten, and git keeps the rest. Record one only for a choice that is hard to
  reverse, surprising without context and a real trade-off; any other choice is a sentence, or a
  rule, in the spec it concerns.

  Rule: A decision is a title and one to three sentences

    Scenario: A title and a sentence
      Given a file "specs/DEC-0001.feature" containing:
        """
        @id=DEC-0001
        Feature: Retire legacy billing

          Not a wrapper around it, because every new caller would keep it alive.
        """
      When the workspace is checked
      Then sdp reports nothing
      And node "DEC-0001" has attribute kind = "decision"

    Scenario Outline: A decision that grows a rule or a scenario is reported
      Given a file "specs/DEC-0001.feature" containing:
        """
        @id=DEC-0001
        Feature: Retire legacy billing

          Not a wrapper around it, because every new caller would keep it alive.

          <more>
        """
      When the workspace is checked
      Then sdp reports at least:
        | rule           | node     | at                       |
        | decision-shape | DEC-0001 | specs/DEC-0001.feature:6 |

      Examples:
        | more                                                            |
        | Rule: Nothing calls legacy billing                              |
        | Scenario: Nothing calls legacy billing\n  Then nothing calls it |

    Scenario: A new decision asks what was chosen over what, and why
      When I run "sdp new decision 'Use Postgres for orders' --dir specs"
      Then the file "specs/DEC-use-postgres-for-orders.feature" contains "Not <what a reasonable person would have chosen>, because <why>."
      When I run "sdp check --json"
      Then the JSON output has:
        | data.rule | template-placeholder        |
        | data.node | DEC-use-postgres-for-orders |

  Rule: The rule a decision leads to is a rule of what it constrains, which links back to the decision

    Scenario: A rule of legacy billing rests on the decision to retire it, and fails while code still calls it
      Given a file "specs/DEC-0001.feature" containing:
        """
        @id=DEC-0001
        Feature: Retire legacy billing

          Not a wrapper around it, because every new caller would keep it alive.
        """
      And a file "specs/ARCH-legacy-billing.feature" containing:
        """
        @id=ARCH-legacy-billing
        Feature: Legacy billing

          @decided-by:DEC-0001
          Rule: Nothing new calls legacy billing

            Scenario: No code uses it
              Then the query "code -uses-> #ARCH-legacy-billing" returns no results
        """
      And a file "src/invoices.ts" containing:
        """
        // @sdp uses ARCH-legacy-billing
        export function invoice() {}
        """
      When the workspace is checked
      Then sdp reports nothing
      When I query "#DEC-0001 <-decided-by- rule"
      Then the result is "ARCH-legacy-billing#nothing-new-calls-legacy-billing"
      When the workspace is run
      Then node "ARCH-legacy-billing#no-code-uses-it" has attribute status = "failed"
