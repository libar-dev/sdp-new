---
id: REQ-check-rules
kind: requirement
title: Check rules
maturity: ready
iteration: I1
activity: { implementation: I1, test: I1 }
tags: [quality-gates]
links:
  refines: CAP-living-specs
  realized-by: ARCH-checker
---

# Check rules

`sdp check` reports what is wrong with the specifications: files that do not parse, references that
lead nowhere, maturity claims the content does not support, decision records that contradict
themselves, plans that name iterations nobody declared, annotations sdp does not read, and template
text nobody replaced. Every diagnostic names its rule, a severity and the `file:line` to look at, and most
carry a hint phrased as an instruction, so a person or an agent can fix it without reading sdp's
code. `sdp check --json` prints the same as objects (`rule`, `severity`, `message`, `node`,
`file`, `line`, `hint`); agents also get them from the MCP tool `sdp_check` ([[REQ-mcp-server]]).

An **error** means the graph is wrong or a claim is false; `sdp check` exits with 1 while there is
one ([[REQ-cli]]). A **warning** means something was ignored or is probably a slip, and an **info**
is a suggestion. What belongs in the architecture is never checked: declaring it is the architect's
call ([[DEC-0008]]).
Teams add their own rules as scenarios with built-in steps ([[REQ-builtin-steps]]).

## Rules

| Rule | Severity | Reported when | Fix |
| --- | --- | --- | --- |
| `front-matter` | error | the YAML between the `---` lines does not parse, is not a mapping, is not closed or holds what is not JSON data — an alias inside itself, a tag such as `!!set`, `.inf`, a key that is not text ([[ARCH-spec-parser]]); the file stays out of the graph | fix the YAML |
| `missing-id` | error | a file declares a `kind` in its front matter, or has a Gherkin block, but no `id`: it is plainly meant as a spec, yet it is not part of the graph and its scenarios would not run | add `id: <PREFIX>-<slug>`, or `exclude` a document that only shows Gherkin |
| `duplicate-id` | error | a spec or inline node reuses an id declared elsewhere; the later one is left out | rename one of them |
| `dangling-link` | error | a link key ([[DEC-0010]]), a `[[ID]]` mention or a code annotation names an id no node has — each reference is reported; the target stays queryable as a `missing` node | create the node (`sdp new`) or fix the reference; for a plan or phase relation, the hint lists the declared ones |
| `link-syntax` | error | `links:` is not a map or a list, or the value of a link key has a shape sdp does not understand; it is ignored | write `<rel>: <ID> \| [<ID>, …] \| { to: <ID>, …attributes }` |
| `link-conflict` | warning | two declarations of the same link give one of its attributes different values; the first is kept | give the attribute one value, or declare the link once |
| `derived-attribute` | error | a spec, an inline node or a code annotation writes an attribute sdp derives (`stage`, `verification`, …); the value is ignored | delete it |
| `inline-node` | error | `nodes:` is not a list, or an entry under it is not a map with an `id`; it is ignored | write `nodes: [{ id: <ID>, … }]` |
| `gherkin-syntax` | error | a gherkin block does not parse; the first error is reported, with the number of follow-on errors | fix the Gherkin at that line |
| `scenario-empty` | warning | a scenario has no steps | write its steps or delete it |
| `maturity-value` | error | `maturity` is not on the configured ladder; the node gets no stage from it | use one of the configured levels |
| `maturity-criteria` | error | the content does not support the declared maturity — of a spec, an inline node or a node declared in code ([[REQ-maturity-criteria]]) | complete the content or lower the maturity |
| `maturity-promotable` | info | the content meets the `specified` or `ready` gate, above the declared maturity | raise the maturity if the team agrees |
| `decision-status` | warning | a decision has no `status`, or one other than `proposed`, `accepted`, `rejected`, `deprecated`, `superseded` | set `status` |
| `decision-supersede` | warning | a decision supersedes one whose status is not `superseded`, or a superseded decision has no successor | make both records agree |
| `decision-content` | info | an accepted decision has no "Decision" or "Outcome" section ([[REQ-decision-records]]) | state the decision under `## Decision` |
| `plan-reference` | warning | a plan or phase relation, or an entry of `activity:`, names a node that is not an iteration or a phase; `activity:` is not a mapping or names a discipline that is not configured; or a node whose kind belongs to no discipline is planned into an iteration, which plans no discipline's work ([[REQ-lifecycle-view]]) | name a declared iteration, phase or discipline, plan the work with `activity:`, or add the kind to a discipline |
| `annotation-ignored` | warning | an `@sdp` annotation follows code on the same line, where it is not read: an annotation opens its own comment line and binds to the declaration below it, or with a blank line after it to the whole file ([[ARCH-code-annotations]]) | move it to a comment line of its own |
| `annotation-unreadable` | warning | a typed annotation (`annotate(target, links)` from `sdp/annotations`) whose target is not a module-level declaration or `import.meta`, or whose ids or attributes are computed rather than literal — sdp reads annotations without running code; or a file that annotates but does not parse ([[ARCH-code-annotations]]) | write the target as a name declared at the top of the module and the ids as string literals |
| `step-unreadable` | warning | a step file has no top-level `defineSteps(…)` call imported from `sdp/steps`, or registers a step whose expression is computed: sdp reads step definitions without running them, so context, snippets and `sdp steps` do not know that step ([[REQ-executable-specs]]) | write the expression as a string or RegExp literal |
| `step-expression` | error | a step definition's Cucumber Expression is malformed, or its RegExp literal is no regular expression, so it can match nothing and `sdp run` refuses to start | fix the expression |
| `types-stale` | warning | the id declarations at the `types` path no longer match the graph, so `annotate()` may accept removed ids or reject new ones ([[REQ-configuration]]) | run `sdp types` |
| `template-placeholder` | warning | text an `sdp new` template asks the author to replace is still there — a prompt such as "We will …" or "What is still unknown?", or a scenario or step written as `<…>`; one diagnostic per spec, at the first | write your own text, or delete it |

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
    | front-matter        | error    | specs/REQ-a.md   | 2    | { id: REQ-a                                          |                                                                                       |
    | missing-id          | error    | specs/REQ-a.md   | 1    | { kind: requirement }                                |                                                                                       |
    | duplicate-id        | error    | docs/PLAN.md     | 2    | { id: PLAN, nodes: [{ id: I1 }, { id: I1 }] }        |                                                                                       |
    | dangling-link       | error    | specs/REQ-a.md   | 2    | { id: REQ-a, links: { depends-on: REQ-gone } }       |                                                                                       |
    | link-syntax         | error    | specs/REQ-a.md   | 2    | { id: REQ-a, links: [REQ-b] }                        |                                                                                       |
    | link-conflict       | warning  | specs/REQ-a.md   | 5    | id: REQ-a\nlinks:\n  iteration: { to: REQ-a, by: x }\niteration: { to: REQ-a, by: y } |                                                         |
    | derived-attribute   | error    | specs/REQ-a.md   | 3    | id: REQ-a\nverification: passing                     |                                                                                       |
    | inline-node         | error    | docs/PLAN.md     | 2    | { id: PLAN, nodes: [inception] }                     |                                                                                       |
    | gherkin-syntax      | error    | specs/REQ-a.md   | 10   | { id: REQ-a }                                        | ```gherkin\nScenario: Rows\n  Given the rows:\n    \| a \| b \|\n    \| c \|\n```     |
    | scenario-empty      | warning  | specs/REQ-a.md   | 7    | { id: REQ-a }                                        | ```gherkin\nScenario: Nothing yet\n```                                                |
    | maturity-value      | error    | specs/REQ-a.md   | 1    | { id: REQ-a, maturity: someday }                     |                                                                                       |
    | maturity-criteria       | error    | specs/REQ-a.md   | 1    | { id: REQ-a, maturity: specified }                   | Analysts export reports.                                                              |
    | maturity-promotable | info     | specs/REQ-a.md   | 1    | { id: REQ-a, maturity: draft }                       | Analysts export reports.\n\n```gherkin\nScenario: Export\n  Then a file is saved\n``` |
    | decision-status     | warning  | docs/DEC-0001.md | 1    | { id: DEC-0001, kind: decision }                     |                                                                                       |
    | decision-supersede  | warning  | docs/DEC-0001.md | 1    | { id: DEC-0001, kind: decision, status: superseded } |                                                                                       |
    | decision-content    | info     | docs/DEC-0001.md | 1    | { id: DEC-0001, kind: decision, status: accepted }   | We release weekly.                                                                    |
    | plan-reference      | warning  | specs/REQ-a.md   | 3    | id: REQ-a\niteration: REQ-a                          |                                                                                       |
    | annotation-ignored  | warning  | src/cart.py      | 6    |                                                      | total = 0  # @sdp implements REQ-a                                                    |
    | template-placeholder | warning | docs/DEC-0001.md | 8    | { id: DEC-0001, kind: decision, status: proposed }   | ## Decision\n\nWe will …                                                             |

Scenario Outline: Plans name declared iterations, phases and disciplines
  Given a file "docs/PLAN.md" containing:
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
  Then the check reports "plan-reference" for '<message>'

  Examples:
    | front matter                                    | message                                                  |
    | iteration: elaboration                          | iteration "elaboration" names no iteration               |
    | phase: E1                                       | phase "E1" names no phase                                |
    | activity: { implementation: PLAN }              | activity.implementation "PLAN" names no iteration        |
    | activity: { implementation: [E1, elaboration] } | activity.implementation "elaboration" names no iteration |
    | activity: { testing: E1 }                       | activity names "testing", which is not a discipline      |
    | activity: E1                                    | activity should map disciplines to iterations            |
    | kind: risk\niteration: E1                        | kind risk belongs to no discipline                       |

Scenario: A plan that names what it declares is clean
  Given a file "docs/PLAN.md" containing:
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
  Then the check does not report "plan-reference"

Scenario Outline: Template text is flagged until it is replaced
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
  Then the check reports "template-placeholder" for "REQ-a"
  And the "template-placeholder" diagnostic points at "specs/REQ-a.md:<line>"

  Examples:
    | text                                                               | line |
    | One sentence capturing the idea.                                   | 9    |
    | ## Open questions\n\n- [ ] What is still unknown?                  | 11   |
    | ```gherkin\nScenario: <the main success case>\n  Then it works\n``` | 10   |
    | ```gherkin\nScenario: Export\n  Then <observable outcome>\n```      | 11   |

Scenario Outline: Words that only mention template text or annotations are not flagged
  Given a file "<file>" containing:
    """
    <text>
    """
  When the workspace is checked
  Then the check does not report "<rule>"

  Examples:
    | file           | rule                 | text                                                                |
    | specs/REQ-a.md | template-placeholder | ---\nid: REQ-a\n---\n# A\n\nDecision records start with "We will …" |
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
  Then the check reports "annotation-unreadable"
  And the "annotation-unreadable" diagnostic has severity "warning"
  And the "annotation-unreadable" diagnostic points at "src/cart.ts:5"

Scenario Outline: A step definition sdp cannot read or match is reported
  Given a file "specs/steps/cart.steps.ts" containing:
    """
    import { defineSteps } from "sdp/steps"

    const cart = "an empty cart"
    export default defineSteps(() => ({}), ({ Given }) => {
      Given(<expression>, () => {})
    })
    """
  When the workspace is checked
  Then the check reports "<rule>"
  And the "<rule>" diagnostic has severity "<severity>"
  And the "<rule>" diagnostic points at "specs/steps/cart.steps.ts:5"

  Examples:
    | expression          | rule            | severity |
    | cart                | step-unreadable | warning  |
    | "a cart of {items}" | step-expression | error    |
    | /a (cart of items/  | step-expression | error    |

Scenario: Id declarations that no longer match the graph are reported
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
  Then the check reports "types-stale"
  And the "types-stale" diagnostic points at ".sdp/ids.d.ts:1"

Scenario: The catalogue covers every rule
  Then every rule sdp reports has an example in this spec
~~~
