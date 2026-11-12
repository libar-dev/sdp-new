---
id: REQ-mcp-server
kind: requirement
title: Graph access over MCP
maturity: ready
iteration: I1
activity: { implementation: I1, test: I1 }
tags: [agents]
links:
  refines: CAP-agent-collaboration
  realized-by: ARCH-mcp
---

# Graph access over MCP

Agents that speak the Model Context Protocol get the graph as tools by running `sdp mcp`, a server
on stdio. Each call reads the workspace afresh — the step files too, where a tool uses them — so
an agent sees its own edits immediately. Agents with a shell can do everything through
the CLI or plain grep instead; MCP is optional.

| Tool | Arguments | Answers with |
| --- | --- | --- |
| `sdp_status` | — | summary counts as JSON: kinds, relations, stages, decision statuses, scenario results, nodes of an architectural kind, diagnostics |
| `sdp_query` | `expression`, optional `paths` | the matching nodes, one per line (id, kind, status, title, `file:line`), or the matched paths; when nothing matches because the pattern names a kind or relation nothing uses, a note listing those in use; when a limit cut evaluation short ([[ARCH-query-engine]]), a first line that says so and names the limit, even if nothing matched |
| `sdp_show` | `id` | the node as JSON with its outgoing and incoming edges |
| `sdp_context` | `id`, optional `depth` (1 to 6, default 2) | the node's context bundle ([[REQ-agent-context]]) |
| `sdp_snippets` | `id` | the steps of the spec's scenarios that no step definition matches, or more than one, each with its `file:line`, and a step definition module with a suggested definition for each undefined one ([[REQ-executable-specs]]) |
| `sdp_check` | optional minimum `severity` (`warning`) | diagnostics with rule, `file:line` and hint ([[REQ-check-rules]]) |
| `sdp_architecture` | — | the architecture as JSON: every element and pattern with the decisions and quality requirements linked to it, as the view's nodes and edges ([[REQ-curated-architecture]]) |
| `sdp_lifecycle` | — | phases with their milestone gates, iterations with their planned work, discipline activity, as `sdp lifecycle` prints them ([[REQ-lifecycle-view]]) |

Every tool only reads files, and answers the same when asked twice: the tools are annotated
read-only, idempotent, non-destructive and closed-world, so clients can call them without asking
for permission. None of them imports or runs code of the workspace: step definitions are read from
the step files statically ([[REQ-executable-specs]]), so inspecting a checkout an agent does not
trust yet executes nothing of it. Running scenarios is `sdp run`, on the command line.

Mistakes come back as tool errors that an agent can read and act on, not as protocol failures: a
malformed query returns the parser's message together with the query syntax, and an unknown id
says so. Arguments are checked against each tool's schema before it runs: a misspelt argument or
an out-of-range value is rejected as invalid parameters, naming the argument, instead of being
silently ignored. The server's instructions suggest where to start: `sdp_status`, then `sdp_query`, and
`sdp_context` before working on a spec. They say how code links to the graph: typed `annotate`
calls in TypeScript and JavaScript first, `@sdp` comments in other languages
([[ARCH-code-annotations]]).

## Scenarios

~~~gherkin
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

Scenario: The server offers one tool per question, every one of them read-only
  When an agent lists the MCP tools
  Then the MCP tools are "sdp_architecture, sdp_check, sdp_context, sdp_lifecycle, sdp_query, sdp_show, sdp_snippets, sdp_status"
  And every MCP tool is marked "readOnlyHint, idempotentHint"

Scenario Outline: Every tool answers from the workspace
  When an agent calls the MCP tool "<tool>" with:
    """
    <arguments>
    """
  Then the output contains '<answer>'

  Examples:
    | tool             | arguments                                             | answer                                             |
    | sdp_status       | {}                                                    | "requirement": 1                                   |
    | sdp_query        | { "expression": "requirement[maturity=draft]" }       | REQ-a\trequirement\tdraft\tAlpha\tspecs/REQ-a.md:1 |
    | sdp_query        | { "expression": "requirement -*-> *", "paths": true } | REQ-a -depends-on-> REQ-gone                       |
    | sdp_show         | { "id": "REQ-a" }                                     | "rel": "depends-on"                                |
    | sdp_context      | { "id": "REQ-a" }                                     | # REQ-a — Alpha                                    |
    | sdp_check        | {}                                                    | error [dangling-link] REQ-a -depends-on-> REQ-gone |
    | sdp_architecture | {}                                                    | "nodes": []                                        |
    | sdp_lifecycle    | {}                                                    | No phases defined yet                              |
    | sdp_snippets     | { "id": "REQ-a" }                                     | REQ-a has no scenarios                             |
    | sdp_query        | { "expression": "requirement -realised-by-> *" }      | no relation realised-by; relations in use: depends-on |

Scenario Outline: A query result cut short by a limit says so, even when it is empty
  Given a chain of 14 nodes linked by "next"
  And 25 nodes, each linked to all the others by "knows"
  When an agent calls the MCP tool "sdp_query" with:
    """
    <arguments>
    """
  Then the output contains '<first line>'

  Examples:
    | arguments                                                                 | first line                                                                                   |
    | { "expression": "#N1 -next+-> #N14" }                                     | no matches, cut short (a + edge reaches further than 12 hops): the answer may be incomplete |
    | { "expression": "#N1 -next+-> *" }                                        | 12 node(s), cut short (a + edge reaches further than 12 hops)                               |
    | { "expression": "member -knows-> member -knows-> member" }                | 25 node(s), cut short (a step has more than 10000 paths)                                    |
    | { "expression": "member -knows-> member -knows-> member", "paths": true } | 10000 path(s), cut short (a step has more than 10000 paths)                                 |

Scenario: The instructions describe typed annotations first, comments for other languages
  When an agent reads the MCP server's instructions
  Then the output contains 'TypeScript and JavaScript link code with typed calls, `annotate(target, { implements: "REQ-x" })` imported from "sdp/annotations"'
  And the output contains "other languages use comment lines, `// @sdp implements REQ-x`"

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
  And the output contains "no node REQ-lost"

  Examples:
    | tool         |
    | sdp_show     |
    | sdp_context  |
    | sdp_snippets |

Scenario Outline: A misspelt or out-of-range argument is rejected
  When an agent calls the MCP tool "<tool>" with:
    """
    <arguments>
    """
  Then the MCP tool reports an error
  And the output contains '<problem>'

  Examples:
    | tool        | arguments                               | problem                |
    | sdp_context | { "id": "REQ-a", "depht": 3 }           | ["depht"]              |
    | sdp_context | { "id": "REQ-a", "depth": 9 }           | ["depth"]              |
    | sdp_query   | { "expression": "requirement", "ids": true } | ["ids"]           |
    | sdp_status  | { "verbose": true }                     | ["verbose"]            |

Scenario: Snippets list the steps still to automate, with a module to save
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

Scenario: Diagnostics tell the agent what to do
  When an agent calls the MCP tool "sdp_check" with:
    """
    {}
    """
  Then the output contains "dangling-link"
  And the output contains "specs/REQ-a.md:5"
  And the output contains "→ create a spec with `id: REQ-gone`"

Scenario: The architecture tool returns the declared architecture and what shaped it
  Given a file "docs/architecture.md" containing:
    """
    ---
    id: ARCH-overview
    kind: view
    nodes:
      - { id: ARCH-orders, kind: element, links: { decided-by: DEC-0001 } }
      - { id: ARCH-cache, kind: element }
      - { id: DEC-0001, kind: decision, status: accepted }
      - { id: DEC-0002, kind: decision, status: accepted }
    ---
    # Architecture
    """
  When an agent calls the MCP tool "sdp_architecture" with:
    """
    {}
    """
  Then the output field "nodes" holds "ARCH-cache, ARCH-orders, DEC-0001"

Scenario: Every call sees the files as they are now
  When an agent calls the MCP tool "sdp_query" with:
    """
    { "expression": "requirement" }
    """
  And a file "specs/REQ-b.md" containing:
    """
    ---
    id: REQ-b
    ---
    # Beta
    """
  And an agent calls the MCP tool "sdp_query" with:
    """
    { "expression": "requirement" }
    """
  Then the output contains "2 node(s)"
  And the output contains "REQ-b"

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
~~~
