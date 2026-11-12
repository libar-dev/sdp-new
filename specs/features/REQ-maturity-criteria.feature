@id=REQ-maturity-criteria @maturity=ready
@realized-by:ARCH-checker
Feature: Honest maturity

  Authors declare how mature a spec is, and `sdp check` holds the claim to the content. Whether a
  spec works is not declared at all: it is derived from scenario results.

  @decided-by:declared-maturity-derived-stage
  Rule: Each level asks for more of the content, and a claim the content does not support is an error

    Scenario Outline: A name, then a paragraph, then an outcome
      Given a file "specs/REQ-csv.feature" containing:
        """
        @id=REQ-csv @maturity=<claimed>
        Feature: Export to CSV

        <content>
        """
      When the workspace is checked
      Then sdp reports "<reported>"

      Examples: idea asks for a name
        | claimed | content | reported |
        | idea    |         | nothing  |

      Examples: draft, for a first paragraph: who wants what, and why
        | claimed | content                      | reported          |
        | draft   |                              | maturity-criteria |
        | draft   | Analysts want data in Excel. | nothing           |

      Examples: specified, for a scenario that states an outcome
        | claimed   | content                                                                                         | reported          |
        | specified | Analysts want data in Excel.                                                                    | maturity-criteria |
        | specified | Analysts want data in Excel.\n\nRule: Every row is exported\nScenario: Export\nWhen I export it | maturity-criteria |

    Scenario: A requirement declared in code can claim no more than a name
      Given a file "src/pay.py" containing:
        """
        # @sdp is REQ-pay kind=requirement maturity=ready
        def pay(): pass
        """
      When the workspace is checked
      Then sdp reports at least:
        | rule              | node    |
        | maturity-criteria | REQ-pay |

  Rule: Ready asks for an example of every rule, an outcome in every scenario and no open question

    So a draft's rules are a checked list of what is still to specify.

    Scenario Outline: What a spec may leave until it claims ready
      Given a file "specs/REQ-csv.feature" containing:
        """
        @id=REQ-csv @maturity=<claimed>
        Feature: Export to CSV

          Analysts want data in Excel.

          Rule: Every row is exported

            Scenario: Export
              Then I get a file

          <second>
        """
      When the workspace is checked
      Then sdp reports "<reported>"

      Examples:
        | claimed   | second                                                                   | reported          |
        | specified | Rule: Archived rows too                                                  | nothing           |
        | ready     | Rule: Archived rows too                                                  | maturity-criteria |
        | ready     | Rule: Archived rows too\n  Scenario: Archive\n    Then they are exported | nothing           |
        | ready     | Scenario: Import\n  When I import a file                                 | maturity-criteria |
        | ready     | @open\nRule: Archived rows too?                                          | maturity-criteria |
        | ready     | Rule: Archived rows too\n  @open\n  Scenario: Deleted ones as well?      | maturity-criteria |

    Scenario: What keeps a spec from ready names the first open question and the first rule without an example
      Given a file "specs/REQ-csv.feature" containing:
        """
        @id=REQ-csv @maturity=ready
        Feature: Export to CSV

          Analysts want data in Excel.

          Rule: Archived rows are exported too

          @open
          Rule: Which delimiter?
        """
      When the workspace is checked
      Then sdp reports:
        | rule              | line | message                                                                                                             |
        | maturity-criteria | 1    | 1 open question(s), e.g. "Which delimiter?" (line 9); rule "Archived rows are exported too" has no example (line 6) |

  Rule: Content ahead of its label is no error, only an info that the spec can be promoted

    Scenario: A draft whose scenario states an outcome
      Given a file "specs/REQ-csv.feature" containing:
        """
        @id=REQ-csv @maturity=draft
        Feature: Export to CSV

          Analysts want data in Excel.

          Rule: Every row is exported

            Scenario: Export current rows
              When I export the report
              Then I get a CSV file with one line per row
        """
      When the workspace is checked
      Then sdp reports:
        | rule                | severity | node    |
        | maturity-promotable | info     | REQ-csv |

  Rule: A level a team adds has no criteria of its own, and takes its place in the order

    Scenario: approved, between draft and specified
      Given a file "sdp.config.yaml" containing:
        """
        vocabulary: { maturity: [idea, draft, approved, specified, ready] }
        """
      And these specs:
        | tags                           | Feature       |
        | @id=REQ-csv @maturity=approved | Export to CSV |
      When the workspace is checked
      Then sdp reports nothing
      When I query "requirement[maturity>draft, maturity<specified]"
      Then the result is "REQ-csv"
