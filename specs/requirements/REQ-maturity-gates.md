---
id: REQ-maturity-gates
kind: requirement
title: Honest maturity
maturity: ready
iteration: I1
tags: [spec-format, quality-gates]
links:
  refines: CAP-living-specs
  realized-by: ARCH-checker
  decided-by: DEC-0005
---

# Honest maturity

Authors declare how mature a spec is; `sdp check` verifies that the content supports the claim
([[DEC-0005]]). Whether a spec is implemented is not declared at all: it is derived from scenario
results ([[REQ-executable-specs]]).

| Level | The content must have |
| --- | --- |
| idea | a title |
| draft | a description of the problem or intent |
| specified | at least one scenario that states an outcome (`Then`) |
| ready | no unresolved open questions; every scenario has steps and an outcome |

Open questions are written as [[REQ-progressive-specs]] describes.

A spec claiming more than its content supports is an error (`maturity-gate`), with a hint naming
the level it does reach. Content ahead of its label is not wrong, only worth knowing: when the
content reaches `specified` or `ready` above the label, `sdp check` adds an informational
`maturity-promotable`. Teams can rename or extend the ladder (`maturity` in [[REQ-configuration]]);
levels of their own have no built-in gate but take part in ordering, so `maturity<ready` keeps
working in queries.

## Scenarios

~~~gherkin
Scenario Outline: A claim is checked against the content
  Given a file "specs/REQ-csv.md" containing:
    """
    ---
    id: REQ-csv
    maturity: <claimed>
    ---
    # Export to CSV

    <description>
    """
  When the workspace is checked
  Then the check <verdict>

  Examples:
    | claimed   | description                  | verdict                                 |
    | idea      |                              | does not report "maturity-gate"         |
    | draft     |                              | reports "maturity-gate" for "REQ-csv"   |
    | draft     | Analysts want data in Excel. | does not report "maturity-gate"         |
    | specified | Analysts want data in Excel. | reports "maturity-gate" for "REQ-csv"   |

Scenario: Ready means no open questions
  Given a file "specs/REQ-csv.md" containing:
    """
    ---
    id: REQ-csv
    maturity: ready
    ---
    # Export to CSV

    Analysts want data in Excel.

    ## Open questions

    - [x] Which delimiter? Comma.
    - [ ] Do we include archived rows?

    ```gherkin
    Scenario: Export current rows
      When I export the report
      Then I get a CSV file with one line per row
    ```
    """
  When the workspace is checked
  Then the check reports "maturity-gate" for "REQ-csv"

Scenario: Content ahead of its label can be promoted
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
  Then the check reports "maturity-promotable" for "REQ-csv"
  And the "maturity-promotable" diagnostic has severity "info"

Scenario: Levels a team adds have no built-in gate
  Given a file "sdp.config.yaml" containing:
    """
    maturity: [idea, draft, approved, specified, ready]
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
  Then the check does not report "maturity-gate"
  And the check does not report "maturity-value"
~~~
