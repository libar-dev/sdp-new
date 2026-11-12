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

Authors declare how mature a spec is; `sdp check` verifies that the content supports the claim
([[DEC-0005]]). Whether a spec is implemented is not declared at all: it is derived from scenario
results ([[REQ-executable-specs]]), and writing a derived fact such as `stage` is an error
(`derived-attribute`, [[ARCH-graph-builder]]).

| Level | The content must have |
| --- | --- |
| idea | a title |
| draft | a description of the problem or intent: a paragraph, not just code, comments or headings |
| specified | at least one scenario that states an outcome (`Then`) |
| ready | no unresolved open questions; every scenario has an outcome |

Open questions are written as [[REQ-progressive-specs]] describes.

A node claiming more than its content supports is an error (`maturity-criteria`), with a hint naming
the level it does reach. The criteria apply wherever a maturity is declared: a node declared inline
or in code has only a title, so it can claim no more than the first level. A maturity that is not
on the ladder is an error (`maturity-value`). Content ahead of its label is not wrong, only worth
knowing: when the content reaches `specified` or `ready` above the label, `sdp check` adds an
informational `maturity-promotable`. Teams can rename or extend the ladder (`vocabulary.maturity`
in [[REQ-configuration]]); levels of their own have no built-in criteria but take part in ordering, so
`maturity<ready` keeps working in queries.

## Stage

`maturity` is declared and checked; `verification` is derived from scenario results. `stage` sums
the two up in one word, and only on nodes that declare a maturity or have scenarios: `verified`
when every scenario passes, `failing` when any fails — a regression is not work in progress —
`in-progress` while automation is partial, and otherwise the declared maturity. In comparisons
`failing` ranks with `in-progress`, above every maturity level and below `verified`
([[REQ-graph-query]]). Every report counts stages the same way: each node that has one.

## Structural, not a judgement

The criteria check the *shape* of a spec, never its quality. `ready` means **structurally ready**:
nothing is left open and every scenario is complete. It does not mean the design behind the spec
is decided, its quality requirements are measurable, or anyone has reviewed it — sdp cannot know
that, and a placeholder paragraph with a token scenario passes ([[RISK-0004]]).

What else "ready" has to mean is the team's **Definition of Ready**, and the team writes it down as
executable policy: a spec with a `@gate` scenario — or a milestone — whose built-in steps
([[REQ-builtin-steps]]) query the graph. sdp ships no such rules; each team picks its own, for
example:

````markdown
---
id: POL-definition-of-ready
kind: policy
title: Definition of Ready
---

# Definition of Ready

A requirement is ready when the decisions it rests on are accepted, the quality requirements that
constrain it state a measure, and a reviewer signed it off.

```gherkin
@gate
Scenario: Ready requirements rest on accepted decisions, measures and a review
  Then the query "requirement[maturity=ready] ?-decided-by-> decision[status!=accepted]" returns no results
  And the query "requirement[maturity=ready] ?-constrained-by-> nfr[!measure]" returns no results
  And the query "requirement[maturity=ready, !reviewed-by]" returns no results
```
````

Here `measure` and `reviewed-by` are attributes the team chose to record; they mean nothing to sdp.
Gates run last in `sdp run` and never fail it; `sdp gate <id>` enforces one, for instance in the
pipeline that merges a pull request ([[REQ-cli]]).

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
    | idea      |                              | does not report "maturity-criteria"         |
    | draft     |                              | reports "maturity-criteria" for "REQ-csv"   |
    | draft     | Analysts want data in Excel. | does not report "maturity-criteria"         |
    | specified | Analysts want data in Excel. | reports "maturity-criteria" for "REQ-csv"   |

Scenario: Specified means a scenario states an outcome
  Given a file "specs/REQ-csv.md" containing:
    """
    ---
    id: REQ-csv
    maturity: specified
    ---
    # Export to CSV

    Analysts want data in Excel.

    ```gherkin
    Scenario: Export current rows
      When I export the report
    ```
    """
  When the workspace is checked
  Then the check reports "maturity-criteria" for "REQ-csv"

Scenario Outline: A node without a spec of its own can claim no more than the first level
  Given a file "<file>" containing:
    """
    <content>
    """
  When the workspace is checked
  Then the check reports "maturity-criteria" for "<id>"

  Examples:
    | file            | content                                                                                     | id         |
    | docs/backlog.md | ---\nid: BACKLOG\nnodes:\n  - { id: REQ-export, kind: requirement, maturity: ready }\n---\n# Backlog | REQ-export |
    | src/pay.py      | # @sdp is REQ-pay kind=requirement maturity=ready\ndef pay(): pass                            | REQ-pay    |

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
  Then the check reports "maturity-criteria" for "REQ-csv"

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

Scenario Outline: A team's Definition of Ready is a gate of its own
  Given a file "docs/POL-definition-of-ready.md" containing:
    """
    ---
    id: POL-definition-of-ready
    kind: policy
    title: Definition of Ready
    ---
    # Definition of Ready

    ```gherkin
    @gate
    Scenario: Ready requirements rest on accepted decisions and a review
      Then the query "requirement[maturity=ready] ?-decided-by-> decision[status!=accepted]" returns no results
      And the query "requirement[maturity=ready, !reviewed-by]" returns no results
    ```
    """
  And a file "docs/DEC-0001.md" containing:
    """
    ---
    id: DEC-0001
    kind: decision
    status: <decision>
    ---
    # CSV, not spreadsheets

    ## Decision

    Reports export as CSV.
    """
  And a file "specs/REQ-csv.md" containing:
    """
    ---
    id: REQ-csv
    maturity: ready
    <review>
    links:
      decided-by: DEC-0001
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
    | decision | review                | exit code |
    | proposed | reviewed-by: analysts | 1         |
    | accepted |                       | 1         |
    | accepted | reviewed-by: analysts | 0         |

Scenario: Levels a team adds have no built-in criteria
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
  Then the check does not report "maturity-criteria"
  And the check does not report "maturity-value"

Scenario Outline: Stage is the declared maturity until scenarios say more
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
  When the scenarios are run
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
  Given a file "docs/plan.md" containing:
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
  And a file "docs/DEC-1.md" containing:
    """
    ---
    id: DEC-1
    kind: decision
    status: accepted
    iteration: I1
    ---
    # Files are CSV

    ## Decision

    Every export is CSV.

    ```gherkin
    Scenario: The decision holds
      Then the guard holds
    ```
    """
  And a step definition "a file is saved" that fails
  And a step definition "the guard holds" that passes
  When the scenarios are run
  Then sdp status counts the stages "draft:1 failing:1 verified:1"
  And the lifecycle evidence of "I1" counts the stages "draft:1 failing:1 verified:1"
  When I query "*[stage>ready]"
  Then the result is "DEC-1, REQ-a"
  When I query "*[stage<verified]"
  Then the result is "REQ-a, REQ-b"
  When I query "*[stage=in-progress]"
  Then the result is "nothing"
  When I query "*[stage>=in-progress, stage<=failing]"
  Then the result is "REQ-a"
~~~
