---
id: REQ-check-rules
kind: requirement
title: Check rules
maturity: ready
iteration: E2
tags: [quality-gates]
links:
  refines: CAP-living-specs
  realized-by: ARCH-checker
---

# Check rules

`sdp check` reports what is wrong with the specifications: files that do not parse, references that
lead nowhere, maturity claims the content does not support, decision records that contradict
themselves. Every diagnostic names its rule, a severity and the `file:line` to look at, and most
carry a hint phrased as an instruction, so a person or an agent can fix it without reading sdp's
code. `sdp check --json` prints the same as objects (`rule`, `severity`, `message`, `node`,
`source`, `hint`); agents also get them from the MCP tool `sdp_check` ([[REQ-mcp-server]]).

An **error** means the graph is wrong or a claim is false; `sdp check` exits with 1 while there is
one. A **warning** means something was ignored or is probably a slip, and an **info** is a
suggestion. Architectural significance is never checked: it is the architect's call ([[DEC-0008]]).
Teams add their own rules as scenarios with built-in steps ([[REQ-builtin-steps]]).

## Rules

| Rule | Severity | Reported when | Fix |
| --- | --- | --- | --- |
| `front-matter` | error | the YAML between the `---` lines does not parse, is not a mapping or is not closed; the file stays out of the graph | fix the YAML |
| `missing-id` | warning | front matter declares a `kind` but no `id`, so the file is not part of the graph | add `id: <PREFIX>-<slug>` |
| `duplicate-id` | error | a spec or inline node reuses an id declared elsewhere; the later one is left out | rename one of them |
| `dangling-link` | error | a link, a `[[ID]]` mention or an `@sdp` code annotation names an id no node has; the target stays queryable as a `missing` node | create the node (`sdp new`) or fix the reference |
| `link-syntax` | warning | an entry under `links:` has a shape sdp does not understand and is ignored | write `links: { <rel>: <ID> \| [<ID>, …] \| { to: <ID>, …attributes } }` |
| `inline-node` | warning | an entry under `nodes:` has no `id` and is ignored | give it an `id` |
| `gherkin-syntax` | error | a gherkin block does not parse; the first error is reported, with the number of follow-on errors | fix the Gherkin at that line |
| `scenario-empty` | warning | a scenario has no steps | write its steps or delete it |
| `maturity-value` | warning | `maturity` is not on the configured ladder | use one of the configured levels |
| `maturity-gate` | error | the content does not support the declared maturity ([[REQ-maturity-gates]]) | complete the content or lower the maturity |
| `maturity-promotable` | info | the content meets the `specified` or `ready` gate, above the declared maturity | raise the maturity if the team agrees |
| `decision-status` | warning | a decision has no `status`, or one other than `proposed`, `accepted`, `rejected`, `deprecated`, `superseded` | set `status` |
| `decision-supersede` | warning | a decision supersedes one whose status is not `superseded`, or a superseded decision has no successor | make both records agree |
| `decision-content` | info | an accepted decision has no "Decision" or "Outcome" section ([[REQ-decision-records]]) | state the decision under `## Decision` |

## Scenarios

Each row of the catalogue below is the smallest workspace that breaks its rule; the last scenario
keeps the catalogue complete.

~~~gherkin
Scenario Outline: Each rule reports its problem where it is
  Given a file "<file>" containing:
    """
    ---
    <front matter>
    ---
    # Example

    <body>
    """
  When the workspace is checked
  Then the check reports "<rule>"
  And the "<rule>" diagnostic has severity "<severity>"
  And the "<rule>" diagnostic points at "<file>:<line>"

  Examples:
    | rule                | severity | file             | line | front matter                                         | body                                                                                  |
    | front-matter        | error    | specs/REQ-a.md   | 1    | { id: REQ-a                                          |                                                                                       |
    | missing-id          | warning  | specs/REQ-a.md   | 1    | { kind: requirement }                                |                                                                                       |
    | duplicate-id        | error    | docs/PLAN.md     | 2    | { id: PLAN, nodes: [{ id: I1 }, { id: I1 }] }        |                                                                                       |
    | dangling-link       | error    | specs/REQ-a.md   | 2    | { id: REQ-a, links: { depends-on: REQ-gone } }       |                                                                                       |
    | link-syntax         | warning  | specs/REQ-a.md   | 1    | { id: REQ-a, links: [REQ-b] }                        |                                                                                       |
    | inline-node         | warning  | docs/PLAN.md     | 1    | { id: PLAN, nodes: [inception] }                     |                                                                                       |
    | gherkin-syntax      | error    | specs/REQ-a.md   | 10   | { id: REQ-a }                                        | ```gherkin\nScenario: Rows\n  Given the rows:\n    \| a \| b \|\n    \| c \|\n```     |
    | scenario-empty      | warning  | specs/REQ-a.md   | 7    | { id: REQ-a }                                        | ```gherkin\nScenario: Nothing yet\n```                                                |
    | maturity-value      | warning  | specs/REQ-a.md   | 1    | { id: REQ-a, maturity: someday }                     |                                                                                       |
    | maturity-gate       | error    | specs/REQ-a.md   | 1    | { id: REQ-a, maturity: specified }                   | Analysts export reports.                                                              |
    | maturity-promotable | info     | specs/REQ-a.md   | 1    | { id: REQ-a, maturity: draft }                       | Analysts export reports.\n\n```gherkin\nScenario: Export\n  Then a file is saved\n``` |
    | decision-status     | warning  | docs/DEC-0001.md | 1    | { id: DEC-0001, kind: decision }                     |                                                                                       |
    | decision-supersede  | warning  | docs/DEC-0001.md | 1    | { id: DEC-0001, kind: decision, status: superseded } |                                                                                       |
    | decision-content    | info     | docs/DEC-0001.md | 1    | { id: DEC-0001, kind: decision, status: accepted }   | We release weekly.                                                                    |

Scenario Outline: Only errors fail the check
  Given a file "specs/REQ-a.md" containing:
    """
    ---
    <front matter>
    ---
    # Example
    """
  When "sdp check" is executed in the workspace
  Then sdp exits with code <exit code>

  Examples:
    | front matter                                   | exit code |
    | { id: REQ-a, maturity: idea }                  | 0         |
    | { id: REQ-a, maturity: someday }               | 0         |
    | { id: REQ-a, links: { depends-on: REQ-gone } } | 1         |

Scenario: The catalogue covers every rule
  Then every rule sdp reports has an example in this spec
~~~
