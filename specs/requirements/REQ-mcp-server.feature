@id=REQ-mcp-server @maturity=ready @agents
@refines:CAP-agent-collaboration @realized-by:ARCH-mcp
@iteration:I1 @activity.implementation:I1 @activity.test:I1
Feature: Graph access over MCP

  Agents that speak the Model Context Protocol get the graph as tools by running `sdp mcp`, a server
  on stdio. Each tool is the use case of the command of the same name (REQ-cli): the same code
  answers both, so a tool and its command never differ in what they accept, in their limits or in
  what they make of a workspace that cannot be fully read. Agents with a shell can do everything
  through the CLI or plain grep instead; MCP is optional.

  Background:
    Given a file "specs/REQ-a.md" containing:
      """
      ---
      id: REQ-a
      maturity: draft
      links:
        depends-on: REQ-gone
      ---
      # Alpha

      Alpha comes first.
      """

  Scenario: The server offers one tool per question, each read-only and idempotent, so a client can call it without asking
    When an agent lists the MCP tools
    Then the MCP tools are "sdp_architecture, sdp_check, sdp_context, sdp_lifecycle, sdp_query, sdp_show, sdp_snippets, sdp_status, sdp_steps"
    And every MCP tool is marked "readOnlyHint, idempotentHint"

  Scenario Outline: Every tool answers with the text its command prints; an answer with nothing in it says nothing
    When an agent calls the MCP tool "<tool>" with:
      """
      <arguments>
      """
    Then the output contains '<answer>'

    Examples:
      | tool             | arguments                                             | answer                                             |
      | sdp_status       | {}                                                    | stages        draft 1                              |
      | sdp_query        | { "expression": "requirement[maturity=draft]" }       | REQ-a\trequirement\tdraft\tAlpha\tspecs/REQ-a.md:1 |
      | sdp_query        | { "expression": "requirement -*-> *", "paths": true } | REQ-a -depends-on-> REQ-gone                       |
      | sdp_query        | { "expression": "requirement[maturity=ready]" }       | nothing                                            |
      | sdp_query        | { "expression": "requirement -depend-on-> *" }        | note: no relation depend-on; closest: depends-on   |
      | sdp_show         | { "id": "REQ-a" }                                     | -depends-on-> REQ-gone                             |
      | sdp_context      | { "id": "REQ-a" }                                     | # REQ-a — Alpha                                    |
      | sdp_steps        | { "text": "returns no results" }                      | \tThen\tthe query {string} returns no results      |
      | sdp_check        | {}                                                    | error [dangling-link] REQ-a -depends-on-> REQ-gone |
      | sdp_architecture | {}                                                    | Architecture: 0 node(s)                            |
      | sdp_lifecycle    | {}                                                    | No plan yet                                        |
      | sdp_snippets     | { "id": "REQ-a" }                                     | REQ-a has no scenarios                             |

  Scenario Outline: Asked for JSON, a tool answers with the envelope its command prints
    When an agent calls the MCP tool "<tool>" with:
      """
      <arguments>
      """
    Then the JSON output has:
      | complete | true |
    And the output contains '<data>'

    Examples:
      | tool             | arguments                                         | data                         |
      | sdp_status       | { "json": true }                                  | "requirement": 1             |
      | sdp_query        | { "expression": "requirement", "json": true }     | "file": "specs/REQ-a.md"     |
      | sdp_show         | { "id": "REQ-a", "json": true }                   | "rel": "depends-on"          |
      | sdp_steps        | { "text": "returns no results", "json": true }    | "keyword": "Then"            |
      | sdp_check        | { "json": true }                                  | "rule": "dangling-link"      |
      | sdp_architecture | { "json": true }                                  | "architecture": []           |
      | sdp_lifecycle    | { "json": true }                                  | "phases": []                 |

  Scenario Outline: A tool has no stderr and no exit code, so an answer that may miss something says so first
    Given a chain of 14 nodes linked by "next"
    And 25 nodes, each linked to all the others by "knows"
    And a file "specs/REQ-broken.md" containing:
      """
      ---
      id: REQ-broken
      links: [REQ-a
      ---
      # Broken
      """
    When an agent calls the MCP tool "<tool>" with:
      """
      <arguments>
      """
    Then the output contains:
      """
      incomplete: this answer may miss something
      note:
      """
    And the output contains '<note>'

    Examples:
      | tool        | arguments                                                                 | note                                                    |
      | sdp_query   | { "expression": "#N1 -next+-> #N14" }                                     | note: cut short: a + edge reaches further than 12 hops |
      | sdp_query   | { "expression": "member -knows-> member -knows-> member", "paths": true } | note: cut short: a step has more than 10000 paths       |
      | sdp_query   | { "expression": "requirement" }                                           | note: not read: specs/REQ-broken.md:3 [front-matter]    |
      | sdp_show    | { "id": "REQ-a" }                                                         | note: not read: specs/REQ-broken.md:3 [front-matter]    |
      | sdp_context | { "id": "REQ-a" }                                                         | note: not read: specs/REQ-broken.md:3 [front-matter]    |
      | sdp_status  | {}                                                                        | note: not read: specs/REQ-broken.md:3 [front-matter]    |

  Scenario: As JSON, the envelope says that the answer may miss something
    Given a chain of 14 nodes linked by "next"
    When an agent calls the MCP tool "sdp_query" with:
      """
      { "expression": "#N1 -next+-> #N14", "json": true }
      """
    Then the JSON output has:
      | complete | false |
    And the output contains '"cut short: a + edge reaches further than 12 hops"'

  Scenario: The instructions teach that code links to the architecture, and that the architecture is the architects' call
    When an agent reads the MCP server's instructions
    Then the output contains 'Code links to the architecture, not to requirements'
    And the output contains '`annotate(Orders, { is: "ARCH-orders" })` imported from "sdp/annotations"'
    And the output contains "other languages use a comment line, `// @sdp is ARCH-orders`"
    And the output contains "`requirement -realized-by-> element <-is- code`"
    And the output contains "propose an element, a pattern or an `is` annotation, do not add or remove one yourself"
    And the output does not contain "implements"

  Scenario: A malformed query comes back as a tool error that teaches the syntax
    When an agent calls the MCP tool "sdp_query" with:
      """
      { "expression": "requirement[" }
      """
    Then the MCP tool reports an error
    And the output contains "query error"
    And the output contains "SDPQ path patterns"
    And the output does not contain '"query error'

  Scenario Outline: An unknown id is a tool error
    When an agent calls the MCP tool "<tool>" with:
      """
      { "id": "REQ-lost" }
      """
    Then the MCP tool reports an error
    And the output contains "no node REQ-lost; closest: REQ-a"

    Examples:
      | tool         |
      | sdp_show     |
      | sdp_context  |
      | sdp_snippets |

  Scenario Outline: An argument that is misspelt, out of range or not the tool's is rejected, naming it, never ignored
    When an agent calls the MCP tool "<tool>" with:
      """
      <arguments>
      """
    Then the MCP tool reports an error
    And the output contains '<problem>'

    Examples:
      | tool        | arguments                               | problem                                  |
      | sdp_context | { "id": "REQ-a", "depht": 3 }           | ["depht"]                                |
      | sdp_context | { "id": "REQ-a", "depth": 9 }           | depth must be a whole number from 1 to 6 |
      | sdp_context | { "id": "REQ-a", "depth": 1.5 }         | ["depth"]                                |
      | sdp_query   | { "expression": "requirement", "ids": true } | ["ids"]                             |
      | sdp_status  | { "verbose": true }                     | ["verbose"]                              |
      | sdp_context | { "id": "REQ-a", "json": true }         | ["json"]                                 |
      | sdp_snippets | { "id": "REQ-a", "json": true }        | ["json"]                                 |

  Scenario: Snippets list the steps that no definition matches, or more than one, with a module to save
    Given a file "specs/REQ-b.md" containing:
      """
      ---
      id: REQ-b
      ---
      # Beta

      ```gherkin
      Scenario: Beta follows alpha
        Given alpha is done
        When beta starts
        Then the query "#REQ-a" returns 1 result
      ```
      """
    When an agent calls the MCP tool "sdp_snippets" with:
      """
      { "id": "REQ-b" }
      """
    Then the output contains "REQ-b: 2 step(s) without exactly one definition (no step files yet)"
    And the output contains "- undefined: When beta starts — specs/REQ-b.md:9"
    And the output contains '  Given("alpha is done", ({ world }) => pending())'
    And the output does not contain "returns 1 result"

  Scenario: A diagnostic comes with its rule, its file:line and a hint that says what to do
    When an agent calls the MCP tool "sdp_check" with:
      """
      {}
      """
    Then the output contains "dangling-link"
    And the output contains "specs/REQ-a.md:5"
    And the output contains "→ create a spec with `id: REQ-gone`"

  Scenario: The architecture tool returns the declared architecture and what shaped it
    Given a file "specs/architecture.md" containing:
      """
      ---
      id: ARCH-overview
      kind: view
      nodes:
        - { id: ARCH-orders, kind: element, links: { decided-by: DEC-0001 } }
        - { id: ARCH-cache, kind: element }
        - { id: DEC-0001, kind: decision }
        - { id: DEC-0002, kind: decision }
      ---
      # Architecture
      """
    When an agent calls the MCP tool "sdp_architecture" with:
      """
      { "json": true }
      """
    Then the JSON output has:
      | data.architecture | ARCH-cache, ARCH-orders |
      | data.drivers      | DEC-0001                |

  Scenario: Every call reads the workspace afresh, so an agent sees its own edits
    When an agent calls the MCP tool "sdp_query" with:
      """
      { "expression": "requirement" }
      """
    Then the output contains "REQ-a\t"
    And the output does not contain "REQ-b"
    Given a file "specs/REQ-b.md" containing:
      """
      ---
      id: REQ-b
      ---
      # Beta
      """
    When an agent calls the MCP tool "sdp_query" with:
      """
      { "expression": "requirement" }
      """
    Then the output contains "REQ-a\t"
    And the output contains "REQ-b\t"

  Scenario Outline: A tool that matches steps reads the step files and runs nothing of them
    Given a file "specs/REQ-b.md" containing:
      """
      ---
      id: REQ-b
      ---
      # Beta

      ```gherkin
      Scenario: Beta follows alpha
        Given alpha is done
        When beta starts
      ```
      """
    And a file "specs/steps/beta.steps.ts" containing:
      """
      import { writeFileSync } from "node:fs"
      import { defineSteps } from "sdp/steps"

      writeFileSync("executed.txt", "this step file ran")

      export default defineSteps(() => ({}), ({ Given }) => {
        Given("alpha is done", () => {})
      })
      """
    When an MCP client of "sdp mcp" calls "<tool>" with:
      """
      { "id": "REQ-b" }
      """
    Then the output contains "undefined: When beta starts"
    And the output does not contain "undefined: Given alpha is done"
    And the file "executed.txt" does not exist

    Examples:
      | tool         |
      | sdp_context  |
      | sdp_snippets |

  Scenario: A running server sees edits to step definitions
    Given a file "specs/REQ-b.md" containing:
      """
      ---
      id: REQ-b
      ---
      # Beta

      ```gherkin
      Scenario: Beta follows alpha
        Given alpha is done
        When beta starts
      ```
      """
    And a file "specs/steps/beta.steps.ts" containing:
      """
      import { defineSteps } from "sdp/steps"

      export default defineSteps(() => ({}), ({ Given }) => {
        Given("alpha is done", () => {})
      })
      """
    When an agent calls the MCP tool "sdp_snippets" on the workspace directory with:
      """
      { "id": "REQ-b" }
      """
    Then the output contains "undefined: When beta starts"
    When a file "specs/steps/beta.steps.ts" containing:
      """
      import { defineSteps } from "sdp/steps"

      export default defineSteps(() => ({}), ({ Given, When }) => {
        Given("alpha is done", () => {})
        When("beta starts", () => {})
      })
      """
    And an agent calls the MCP tool "sdp_snippets" on the workspace directory with:
      """
      { "id": "REQ-b" }
      """
    Then the output contains "every step of REQ-b has exactly one definition (step files: specs/steps/beta.steps.ts)"
