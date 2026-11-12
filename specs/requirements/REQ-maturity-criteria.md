---
id: REQ-maturity-criteria
kind: requirement
title: Honest maturity
maturity: ready
iteration: I1
activity: { implementation: I1, test: I1 }
tags: [spec-format, quality-gates]
links:
  refines: CAP-living-specs
  realized-by: ARCH-checker
  decided-by: DEC-0005
---

# Honest maturity

Authors declare how mature a spec is, and `sdp check` holds the claim to the content
([[DEC-0005]]). Whether a spec is implemented is not declared at all: it is derived from scenario
results ([[REQ-executable-specs]]).

The criteria check the *shape* of a spec, never its quality. `ready` means structurally ready:
nothing is left open, every rule has an example and every scenario is complete. It does not mean the design behind the spec
is decided or anyone has reviewed it — sdp cannot know that, and a placeholder paragraph with a
token scenario passes ([[RISK-0004]]). What else "ready" has to mean is the team's Definition of
Ready, which the team writes as a gate of its own.

## Scenarios

~~~gherkin
Scenario Outline: Each level asks for more of the content, and a claim the content does not support is an error
  Given a file "specs/REQ-csv.md" containing:
    """
    ---
    id: REQ-csv
    maturity: <claimed>
    ---
    # Export to CSV

    <content>
    """
  When the workspace is checked
  Then sdp reports "<reported>"

  Examples: idea asks for a title
    | claimed   | content                      | reported          |
    | idea      |                              | nothing           |

  Examples: draft, for a description of the problem or intent
    | claimed   | content                      | reported          |
    | draft     |                              | maturity-criteria |
    | draft     | Analysts want data in Excel. | nothing           |

  Examples: specified, for a scenario that states an outcome
    | claimed   | content                                                                                                               | reported          |
    | specified | Analysts want data in Excel.                                                                                          | maturity-criteria |
    | specified | Analysts want data in Excel.\n\n```gherkin\nScenario: Export\n  When I export the report\n```                         | maturity-criteria |
    | specified | Analysts want data in Excel.\n\n```gherkin\nScenario: Export\n  When I export the report\n  Then I get a file\n```    | maturity-promotable |

  Examples: ready, for no open question left and an outcome in every scenario
    | claimed   | content                                                                                                                                                         | reported          |
    | ready     | Analysts want data in Excel.\n\n## Open questions\n- [ ] Archived rows too?\n\n```gherkin\nScenario: Export\n  Then I get a file\n```                            | maturity-criteria |
    | ready     | Analysts want data in Excel.\n\n```gherkin\nScenario: Export\n  Then I get a file\n\nScenario: Import\n  When I import a file\n```                            | maturity-criteria |
    | ready     | Analysts want data in Excel.\n\n## Open questions\n- [x] Which delimiter? Comma.\n\n```gherkin\nScenario: Export\n  Then I get a file\n```                       | nothing           |

Scenario Outline: From ready on, a rule is a to-do until it has an example, and a rule or a scenario tagged @open is a question
  So a draft's rules are a checked list of what is still to specify.

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

Scenario Outline: A node declared inline or in code has only a title, so it can claim no more than the first level
  Given a file "<file>" containing:
    """
    <content>
    """
  When the workspace is checked
  Then sdp reports at least:
    | rule              | node |
    | maturity-criteria | <id> |

  Examples:
    | file            | content                                                                                     | id         |
    | specs/backlog.md | ---\nid: BACKLOG\nnodes:\n  - { id: REQ-export, kind: requirement, maturity: ready }\n---\n# Backlog | REQ-export |
    | src/pay.py      | # @sdp is REQ-pay kind=requirement maturity=ready\ndef pay(): pass                            | REQ-pay    |

Scenario: Content ahead of its label is not wrong, only worth knowing: an info says it can be promoted
  Given a file "specs/REQ-csv.md" containing:
    """
    ---
    id: REQ-csv
    maturity: draft
    ---
    # Export to CSV

    Analysts want data in Excel.

    ```gherkin
    Scenario: Export current rows
      When I export the report
      Then I get a CSV file with one line per row
    ```
    """
  When the workspace is checked
  Then sdp reports at least:
    | rule                | severity | node    |
    | maturity-promotable | info     | REQ-csv |

Scenario Outline: A team's Definition of Ready is a gate of its own
  Given a file "specs/POL-definition-of-ready.md" containing:
    """
    ---
    id: POL-definition-of-ready
    kind: policy
    title: Definition of Ready
    ---
    # Definition of Ready

    ```gherkin
    @gate
    Scenario: A ready requirement is reviewed, and what it depends on is ready too
      Then the query "requirement[maturity=ready] ?-depends-on-> requirement[maturity<ready]" returns no results
      And the query "requirement[maturity=ready, !reviewed-by]" returns no results
    ```
    """
  And a file "specs/REQ-reports.md" containing:
    """
    ---
    id: REQ-reports
    maturity: <dependency>
    reviewed-by: analysts
    ---
    # Reports

    Analysts see what was sold.

    ```gherkin
    Scenario: Sales by day
      Then the report has one row per day
    ```
    """
  And a file "specs/REQ-csv.md" containing:
    """
    ---
    id: REQ-csv
    maturity: ready
    <review>
    links:
      depends-on: REQ-reports
    ---
    # Export to CSV

    Analysts want data in Excel.

    ```gherkin
    Scenario: Export current rows
      When I export the report
      Then I get a CSV file with one line per row
    ```
    """
  When I run "sdp check"
  Then the exit code is 0
  When I run "sdp gate POL-definition-of-ready"
  Then the exit code is <exit code>

  Examples:
    | dependency | review                | exit code |
    | draft      | reviewed-by: analysts | 1         |
    | ready      |                       | 1         |
    | ready      | reviewed-by: analysts | 0         |

Scenario: A level a team adds has no built-in criteria, and takes its place in the order
  Given a file "sdp.config.yaml" containing:
    """
    vocabulary: { maturity: [idea, draft, approved, specified, ready] }
    """
  And a file "specs/REQ-csv.md" containing:
    """
    ---
    id: REQ-csv
    maturity: approved
    ---
    # Export to CSV
    """
  When the workspace is checked
  Then sdp does not report "maturity-criteria"
  And sdp does not report "maturity-value"
  When I query "requirement[maturity>draft, maturity<specified]"
  Then the result is "REQ-csv"

Scenario Outline: Stage is the declared maturity until scenarios say more, and only a node with a maturity or scenarios has one
  Given a file "specs/REQ-csv.md" containing:
    """
    ---
    id: REQ-csv
    <maturity>
    ---
    # Export to CSV

    Analysts want data in Excel.

    ```gherkin
    Scenario: Export current rows
      When I export the report
      Then I get a CSV file
    ```
    """
  And a step definition "I export the report" that passes
  And a step definition "<defined>" that <outcome>
  When the workspace is run
  Then node "REQ-csv" has attribute stage = "<stage>"

  Examples:
    | maturity            | defined          | outcome | stage       |
    | maturity: specified | I get a CSV file | passes  | verified    |
    | maturity: specified | I get a CSV file | fails   | failing     |
    | maturity: specified | I get a CSV file | pends   | in-progress |
    | maturity: specified | something else   | passes  | specified   |
    |                     | something else   | passes  | undefined   |
    | maturity: verified  | something else   | passes  | undefined   |

Scenario: Every report counts stages the same way, and failing ranks with in-progress
  Given a file "specs/plan.md" containing:
    """
    ---
    id: PLAN
    nodes:
      - { id: I1, kind: iteration }
    ---
    # Plan
    """
  And a file "specs/REQ-a.md" containing:
    """
    ---
    id: REQ-a
    maturity: specified
    iteration: I1
    ---
    # A

    Something to export.

    ```gherkin
    Scenario: Export
      Then a file is saved
    ```
    """
  And a file "specs/REQ-b.md" containing:
    """
    ---
    id: REQ-b
    maturity: draft
    iteration: I1
    ---
    # B

    Something to import.
    """
  And a file "specs/NFR-fast.md" containing:
    """
    ---
    id: NFR-fast
    iteration: I1
    ---
    # Exports are fast

    ```gherkin
    Scenario: A report exports within a second
      Then the guard holds
    ```
    """
  And a step definition "a file is saved" that fails
  And a step definition "the guard holds" that passes
  When the workspace is run
  Then sdp status counts the stages "draft:1 failing:1 verified:1"
  When the lifecycle is computed
  Then the iterations are:
    | id | stages                      |
    | I1 | draft:1 failing:1 verified:1 |
  When I query "*[stage>ready]"
  Then the result is "NFR-fast, REQ-a"
  When I query "*[stage<verified]"
  Then the result is "REQ-a, REQ-b"
  When I query "*[stage=in-progress]"
  Then the result is "nothing"
  When I query "*[stage>=in-progress, stage<=failing]"
  Then the result is "REQ-a"
~~~
