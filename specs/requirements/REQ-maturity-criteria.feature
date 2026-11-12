@id=REQ-maturity-criteria @maturity=ready @spec-format @quality-gates
@refines:CAP-living-specs @realized-by:ARCH-checker
@iteration:I1 @activity.implementation:I1 @activity.test:I1
Feature: Honest maturity

  Authors declare how mature a spec is, and `sdp check` holds the claim to the content. Whether a
  spec works is not declared at all: it is derived from scenario results.

  @decided-by:DEC-0005
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
        | claimed   | content                                                                                       | reported          |
        | specified | Analysts want data in Excel.                                                                  | maturity-criteria |
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
        | claimed   | second                                                                  | reported          |
        | specified | Rule: Archived rows too                                                 | nothing           |
        | ready     | Rule: Archived rows too                                                 | maturity-criteria |
        | ready     | Rule: Archived rows too\n  Scenario: Archive\n    Then they are exported | nothing           |
        | ready     | Scenario: Import\n  When I import a file                                | maturity-criteria |
        | ready     | @open\nRule: Archived rows too?                                         | maturity-criteria |
        | ready     | Rule: Archived rows too\n  @open\n  Scenario: Deleted ones as well?     | maturity-criteria |

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
        | rule              | line | message                                                                                                      |
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

  Rule: What ready means beyond the shape of a spec is the team's Definition of Ready, a gate of its own

    sdp cannot know whether the design behind a spec is decided or anyone has reviewed it: a
    placeholder paragraph with a token scenario meets every criterion.

    Scenario Outline: A ready requirement, its review and what it depends on
      Given a file "specs/POL-definition-of-ready.feature" containing:
        """
        @id=POL-definition-of-ready @kind=policy
        Feature: Definition of Ready

          Rule: A ready requirement is reviewed, and what it depends on is ready too

            @gate
            Scenario: Reviewed, and depending only on what is ready
              Then the query "requirement[maturity=ready] ?-depends-on-> requirement[maturity<ready]" returns no results
              And the query "requirement[maturity=ready, !reviewed-by]" returns no results
        """
      And a file "specs/REQ-reports.feature" containing:
        """
        @id=REQ-reports @maturity=<dependency> @reviewed-by=analysts
        Feature: Reports

          Analysts see what was sold.

          Rule: Sales are reported by day

            Scenario: Sales by day
              Then the report has one row per day
        """
      And a file "specs/REQ-csv.feature" containing:
        """
        @id=REQ-csv @maturity=ready <review> @depends-on:REQ-reports
        Feature: Export to CSV

          Analysts want data in Excel.

          Rule: Every row is exported

            Scenario: Export current rows
              When I export the report
              Then I get a CSV file with one line per row
        """
      When I run "sdp check"
      Then the exit code is 0
      When I run "sdp gate POL-definition-of-ready"
      Then the exit code is <exit code>

      Examples:
        | dependency | review                | exit code |
        | draft      | @reviewed-by=analysts | 1         |
        | ready      |                       | 1         |
        | ready      | @reviewed-by=analysts | 0         |

  @decided-by:DEC-0005
  Rule: A spec's stage is its maturity until its scenarios say more, and only a node with a maturity or scenarios has one

    Scenario Outline: Passing, failing, pending and undefined
      Given a file "specs/REQ-csv.feature" containing:
        """
        @id=REQ-csv <maturity>
        Feature: Export to CSV

          Analysts want data in Excel.

          Rule: Every row is exported

            Scenario: Export current rows
              When I export the report
              Then I get a CSV file
        """
      And a step definition "I export the report" that passes
      And a step definition "<defined>" that <outcome>
      When the workspace is run
      Then node "REQ-csv" has attribute stage = "<stage>"

      Examples:
        | maturity            | defined          | outcome | stage       |
        | @maturity=specified | I get a CSV file | passes  | verified    |
        | @maturity=specified | I get a CSV file | fails   | failing     |
        | @maturity=specified | I get a CSV file | pends   | in-progress |
        | @maturity=specified | something else   | passes  | specified   |
        |                     | something else   | passes  | undefined   |
        | @maturity=verified  | something else   | passes  | undefined   |

  Rule: Every report counts stages the same way, and failing ranks with in-progress

    Scenario: An idea, a failing and a verified spec in one iteration
      Given these specs:
        | tags                                   | Feature |
        | @id=I1 @kind=iteration                 | I1      |
        | @id=REQ-b @maturity=idea @iteration:I1 | B       |
      And a file "specs/REQ-a.feature" containing:
        """
        @id=REQ-a @maturity=specified @iteration:I1
        Feature: A

          Something to export.

          Rule: An export saves a file

            Scenario: Export
              Then a file is saved
        """
      And a file "specs/NFR-fast.feature" containing:
        """
        @id=NFR-fast @iteration:I1
        Feature: Exports are fast

          Rule: A report exports within a second

            Scenario: Within a second
              Then the guard holds
        """
      And a step definition "a file is saved" that fails
      And a step definition "the guard holds" that passes
      When the workspace is run
      Then sdp status counts the stages "failing:1 idea:1 verified:1"
      When the lifecycle is computed
      Then the iterations are:
        | id | stages                      |
        | I1 | failing:1 idea:1 verified:1 |
      When I query "*[stage>ready]"
      Then the result is "NFR-fast, REQ-a"
      When I query "*[stage<verified]"
      Then the result is "REQ-a, REQ-b"
      When I query "*[stage=in-progress]"
      Then the result is "nothing"
      When I query "*[stage>=in-progress, stage<=failing]"
      Then the result is "REQ-a"
