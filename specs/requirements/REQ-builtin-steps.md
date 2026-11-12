---
id: REQ-builtin-steps
kind: requirement
title: Built-in steps over the graph
maturity: ready
iteration: C1
tags: [execution, quality-gates]
links:
  refines: CAP-living-specs
  realized-by: ARCH-runner
---

# Built-in steps over the graph

Every run includes step definitions that assert against the project graph instead of the product.
With them, rules about the specifications themselves — architecture fitness functions, decision
guards, milestone gates, a team's own definition of done — are ordinary scenarios in the same format
as everything else, and need no code.

| Step | Passes when |
| --- | --- |
| `the query "<q>" returns no results` | the query matches nothing |
| `the query "<q>" returns <n> result(s)` | it matches exactly `n` nodes |
| `the query "<q>" returns at least <n> result(s)` | it matches `n` nodes or more |
| `the query "<q>" returns at most <n> result(s)` | it matches `n` nodes or fewer |
| `the query "<q>" returns:` with a one-column table of ids | it matches exactly those nodes, in any order; a header cell `id` is optional |
| `every node matching "<a>" also matches "<b>"` | every result of `a` is a result of `b` |
| `there are no <severity> diagnostics` | `sdp check` reports nothing of that severity: `error(s)`, `warning(s)` or `info` |
| `there are no diagnostics for rule "<rule>"` | `sdp check` reports nothing for that rule ([[REQ-check-rules]]) |
| `the node "<id>" has <key> "<value>"` | the node's attribute — or its `kind` or `title` — has that value |

Queries are SDPQ path patterns ([[REQ-graph-query]]). A failing step says what it expected and
lists up to ten offending nodes with their `file:line`; a malformed query fails the step with the
parser's message. The steps assert against the graph as it was when the run started, so ordinary
scenarios see the results of earlier runs and gate scenarios those of the current one
([[REQ-executable-specs]]). Like any step, they match by text, whatever the keyword.

This repository uses them for its decision guards and milestone gates:

```gherkin
# docs/decisions/DEC-0001: all Gherkin in this repository parses
Then there are no diagnostics for rule "gherkin-syntax"

# docs/decisions/DEC-0002: every reference resolves
Then the query "missing" returns no results

# docs/delivery/milestones/MS-LCA: the architecture baseline is curated
Then the query "*[significant, !rationale]" returns no results
And the query "*[significant] !-*- decision|nfr" returns no results
```

## Scenarios

The guard scenarios below run against a small workspace: one draft requirement realized by an
element, and a decision whose status nobody has set yet.

~~~gherkin
Background:
  Given a file "specs/REQ-search.md" containing:
    """
    ---
    id: REQ-search
    maturity: draft
    links:
      realized-by: ARCH-index
    ---
    # Search

    Shoppers find products by name.
    """
  And a file "docs/ARCH-index.md" containing:
    """
    ---
    id: ARCH-index
    kind: element
    links:
      decided-by: DEC-0001
    ---
    # Search index
    """
  And a file "docs/DEC-0001.md" containing:
    """
    ---
    id: DEC-0001
    kind: decision
    ---
    # Use an inverted index
    """

Scenario Outline: A built-in step passes when the graph agrees
  Given a file "specs/guard.feature" containing:
    """
    Feature: Guard
      Scenario: Guard
        Then <step>
    """
  When the scenarios are run
  Then the step '<step>' has status "passed"

  Examples:
    | step                                                                       |
    | the query "requirement" returns 1 result                                   |
    | the query "requirement[maturity=ready]" returns no results                 |
    | the query "requirement\|element" returns at least 2 results                |
    | the query "element" returns at most 1 result                               |
    | every node matching "requirement" also matches "* ?-realized-by-> element" |
    | there are no error diagnostics                                             |
    | there are no diagnostics for rule "dangling-link"                          |
    | the node "REQ-search" has maturity "draft"                                 |
    | the node "ARCH-index" has kind "element"                                   |

Scenario Outline: A built-in step that fails says why
  Given a file "specs/guard.feature" containing:
    """
    Feature: Guard
      Scenario: Guard
        Then <step>
    """
  When the scenarios are run
  Then the step '<step>' has status "failed"
  And the step '<step>' reports '<reason>'

  Examples:
    | step                                                        | reason                                           |
    | the query "requirement" returns 2 results                   | returned 1 result(s), expected 2                 |
    | the query "requirement" returns no results                  | REQ-search (requirement) specs/REQ-search.md:1   |
    | the query "element" returns at least 2 results              | returned 1 result(s), expected at least 2        |
    | the query "requirement\|element" returns at most 1 result   | returned 2 result(s), expected at most 1         |
    | every node matching "element" also matches "*[significant]" | ARCH-index (element) docs/ARCH-index.md:1        |
    | there are no warning diagnostics                            | [decision-status] DEC-0001                       |
    | there are no diagnostics for rule "decision-status"         | DEC-0001: decision status should be one of       |
    | the node "REQ-search" has maturity "ready"                  | REQ-search.maturity is "draft", expected "ready" |
    | the node "REQ-lost" has stage "verified"                    | no node REQ-lost                                 |
    | the query "requirement[" returns no results                 | invalid query                                    |

Scenario: A query result is compared with a table of ids
  Given a file "specs/guard.feature" containing:
    """
    Feature: Guard
      Scenario: Exactly these
        Then the query "requirement|element" returns:
          | id         |
          | REQ-search |
          | ARCH-index |

      Scenario: Not these
        Then the query "requirement" returns:
          | REQ-search |
          | ARCH-index |
    """
  When the scenarios are run
  Then the step 'the query "requirement|element" returns:' has status "passed"
  And the step 'the query "requirement" returns:' has status "failed"
  And the step 'the query "requirement" returns:' reports "returned [REQ-search], expected [ARCH-index, REQ-search]"
~~~
