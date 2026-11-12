@id=REQ-check-rules @maturity=ready @quality-gates
@refines:CAP-living-specs @realized-by:ARCH-checker
@iteration:I1 @activity.implementation:I1 @activity.test:I1
Feature: Check rules

  `sdp check` says what is wrong with the specifications so that a person or an agent can fix it
  without reading sdp's code: every diagnostic names its rule, a severity, the `file:line` to look at
  and a hint phrased as an instruction. An error means the graph is wrong or a claim is false; a
  warning, that something was ignored or is probably a slip; an info is a suggestion. What belongs
  in the architecture is never checked (DEC-0008), and a team adds rules of its own as scenarios
  (REQ-builtin-steps).

  # TODO(convert): Each example is the smallest workspace that breaks its rule.

  Scenario Outline: Each rule reports its problem with its severity, at the line to fix
    Given a file "<file>" containing:
      """
      ---
      <front matter>
      ---
      # Example

      <body>
      """
    When the workspace is checked
    Then sdp reports at least:
      | rule   | severity   | at            |
      | <rule> | <severity> | <file>:<line> |

    Examples:
      | rule                | severity | file             | line | front matter                                         | body                                                                                  |
      | front-matter        | error    | specs/REQ-a.md   | 2    | { id: REQ-a                                          |                                                                                       |
      | missing-id          | error    | specs/REQ-a.md   | 1    | { kind: requirement }                                |                                                                                       |
      | duplicate-id        | error    | specs/PLAN.md     | 2    | { id: PLAN, nodes: [{ id: I1 }, { id: I1 }] }        |                                                                                       |
      | dangling-link       | error    | specs/REQ-a.md   | 2    | { id: REQ-a, links: { depends-on: REQ-gone } }       |                                                                                       |
      | link-syntax         | error    | specs/REQ-a.md   | 2    | { id: REQ-a, links: [REQ-b] }                        |                                                                                       |
      | link-conflict       | warning  | specs/REQ-a.md   | 5    | id: REQ-a\nlinks:\n  iteration: { to: REQ-a, by: x }\niteration: { to: REQ-a, by: y } |                                                         |
      | derived-attribute   | error    | specs/REQ-a.md   | 3    | id: REQ-a\nverification: passing                     |                                                                                       |
      | inline-node         | error    | specs/PLAN.md     | 2    | { id: PLAN, nodes: [inception] }                     |                                                                                       |
      | gherkin-syntax      | error    | specs/REQ-a.md   | 10   | { id: REQ-a }                                        | ```gherkin\nScenario: Rows\n  Given the rows:\n    \| a \| b \|\n    \| c \|\n```     |
      | scenario-empty      | warning  | specs/REQ-a.md   | 7    | { id: REQ-a }                                        | ```gherkin\nScenario: Nothing yet\n```                                                |
      | maturity-value      | error    | specs/REQ-a.md   | 1    | { id: REQ-a, maturity: someday }                     |                                                                                       |
      | maturity-criteria       | error    | specs/REQ-a.md   | 1    | { id: REQ-a, maturity: specified }                   | Analysts export reports.                                                              |
      | maturity-promotable | info     | specs/REQ-a.md   | 1    | { id: REQ-a, maturity: draft }                       | Analysts export reports.\n\n```gherkin\nScenario: Export\n  Then a file is saved\n``` |
      | decision-shape      | warning  | specs/DEC-0001.md | 8    | { id: DEC-0001 }                                     | Not monthly, because feedback is late.\n\n## Consequences                           |
      | plan-reference      | warning  | specs/REQ-a.md   | 3    | id: REQ-a\niteration: REQ-a                          |                                                                                       |
      | milestone-met       | warning  | specs/MS-beta.md  | 3    | id: MS-beta\nmet: soon                               |                                                                                       |
      | annotation-ignored  | warning  | src/cart.py      | 6    |                                                      | total = 0  # @sdp implements REQ-a                                                    |
      | template-placeholder | warning | specs/DEC-0001.md | 6    | { id: DEC-0001 }                                     | Not <what a reasonable person would have chosen>, because <why>.                      |

  Scenario Outline: Each rule of the Gherkin format reports its problem with its severity, at the line to fix
    Given a file "specs/REQ-a.feature" containing:
      """
      <content>
      """
    When the workspace is checked
    Then sdp reports at least:
      | rule   | severity   | at                         |
      | <rule> | <severity> | specs/REQ-a.feature:<line> |

    Examples:
      | rule                  | severity | line | content                                                        |
      | annotation            | error    | 1    | @id=REQ-a @uses:A,B\nFeature: A                                |
      | description-comment   | warning  | 4    | @id=REQ-a\nFeature: A\n  Why:\n  # not read\n  because.        |
      | scenario-outside-rule | error    | 3    | @id=REQ-a\nFeature: A\n  Scenario: S\n    Then it works        |

  Scenario Outline: A plan names declared iterations, phases and disciplines, and plans only work that belongs to a discipline
    Given a file "specs/PLAN.md" containing:
      """
      ---
      id: PLAN
      nodes:
        - { id: elaboration, kind: phase }
        - { id: E1, kind: iteration, phase: elaboration }
      ---
      # Plan
      """
    And a file "specs/REQ-a.md" containing:
      """
      ---
      id: REQ-a
      <front matter>
      ---
      # Example
      """
    When the workspace is checked
    Then sdp reports:
      | rule           | severity | node  | at                    | message   |
      | plan-reference | warning  | REQ-a | specs/REQ-a.md:<line> | <problem> |

    Examples:
      | front matter                                    | line | problem                              |
      | iteration: elaboration                          | 3    | "elaboration" names no iteration     |
      | phase: E1                                       | 3    | "E1" names no phase                  |
      | closes: PLAN                                    | 3    | "PLAN" names no phase or iteration   |
      | activity: { implementation: PLAN }              | 3    | "PLAN" names no iteration            |
      | activity: { implementation: [E1, elaboration] } | 3    | "elaboration" names no iteration     |
      | activity: { testing: E1 }                       | 3    | "testing", which is not a discipline |
      | activity: E1                                    | 3    | map disciplines to iterations        |
      | kind: risk\niteration: E1                       | 4    | belongs to no discipline             |

  Scenario: A plan that names what it declares is clean
    Given a file "specs/PLAN.md" containing:
      """
      ---
      id: PLAN
      nodes:
        - { id: elaboration, kind: phase }
        - { id: E1, kind: iteration, phase: elaboration }
        - { id: E2, kind: iteration, phase: elaboration }
      ---
      # Plan
      """
    And a file "specs/REQ-a.md" containing:
      """
      ---
      id: REQ-a
      iteration: E1
      activity: { analysis-design: E1, implementation: [E1, E2], test: [] }
      ---
      # Example
      """
    When the workspace is checked
    Then sdp does not report "plan-reference"

  Scenario Outline: A scenario or step a template wrote as <…> is flagged until it is filled in, once per spec, at the first
    Given a file "specs/REQ-a.md" containing:
      """
      ---
      id: REQ-a
      maturity: specified
      ---
      # Example

      Analysts export reports.

      <text>
      """
    When the workspace is checked
    Then sdp reports at least:
      | rule                 | node  | at                    |
      | template-placeholder | REQ-a | specs/REQ-a.md:<line> |

    Examples:
      | text                                                               | line |
      | ```gherkin\nScenario: <the main success case>\n  Then it works\n``` | 10   |
      | ```gherkin\nScenario: Export\n  Then <observable outcome>\n```      | 11   |

  Scenario Outline: Words that only mention template text or annotations are not flagged
    Given a file "<file>" containing:
      """
      <text>
      """
    When the workspace is checked
    Then sdp does not report "<rule>"

    Examples:
      | file           | rule                 | text                                                                |
      | specs/REQ-a.md | template-placeholder | ---\nid: REQ-a\n---\n# A\n\nA decision starts as "Not <what a reasonable person would have chosen>, because <why>." |
      | src/cart.ts    | annotation-ignored   | // after code, as in total() // @sdp implements REQ-a is not read     |
      | src/cart.ts    | annotation-ignored   | // @sdp implements REQ-a\nexport const total = 0                     |

  Scenario: A typed annotation sdp cannot read statically is reported
    Given a file "src/cart.ts" containing:
      """
      import { annotate } from "sdp/annotations"

      export const total = 0
      const requirement = "REQ-a"
      annotate(total, { implements: requirement })
      """
    When the workspace is checked
    Then sdp reports at least:
      | rule                  | severity | at            |
      | annotation-unreadable | warning  | src/cart.ts:5 |

  Scenario Outline: A step definition sdp cannot read is a warning; one that can match nothing is an error
    Given a file "specs/steps/cart.steps.ts" containing:
      """
      import { defineSteps } from "sdp/steps"

      const cart = "an empty cart"
      export default defineSteps(() => ({}), ({ Given }) => {
        Given(<expression>, () => {})
      })
      """
    When the workspace is checked
    Then sdp reports at least:
      | rule   | severity   | at                          |
      | <rule> | <severity> | specs/steps/cart.steps.ts:5 |

    Examples:
      | expression          | rule            | severity |
      | cart                | step-unreadable | warning  |
      | "a cart of {items}" | step-expression | error    |
      | /a (cart of items/  | step-expression | error    |

  Scenario: Id declarations that no longer match the graph are reported, so annotate() accepts no removed id
    Given a file "specs/REQ-a.md" containing:
      """
      ---
      id: REQ-a
      ---
      # A
      """
    And a file ".sdp/ids.d.ts" containing:
      """
      declare module "sdp/annotations" {
        interface Ids {
          "REQ-gone": "requirement"
        }
      }
      export {}
      """
    When the workspace is checked
    Then sdp reports at least:
      | rule        | at              |
      | types-stale | .sdp/ids.d.ts:1 |

  Scenario: Every rule sdp reports has an example here
    Then every rule sdp reports has an example in this spec
