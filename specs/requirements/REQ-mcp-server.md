---
id: REQ-mcp-server
kind: requirement
title: Graph access over MCP
maturity: ready
iteration: C2
tags: [agents]
links:
  refines: CAP-agent-collaboration
  realized-by: ARCH-mcp
---

# Graph access over MCP

Agents that speak the Model Context Protocol get the graph as tools by running `sdp mcp`, a server
on stdio. Each call reads the workspace afresh, so an agent sees its own edits immediately. Agents
with a shell can do everything through the CLI or plain grep instead; MCP is a convenience, not a
requirement.

| Tool | Arguments | Answers with |
| --- | --- | --- |
| `sdp_status` | — | summary counts as JSON: kinds, relations, stages, decision statuses, scenario results, significant elements, diagnostics |
| `sdp_query` | `expression`, optional `paths` | the matching nodes, one per line (id, kind, status, title, `file:line`), or the matched paths |
| `sdp_show` | `id` | the node as JSON with its outgoing and incoming edges |
| `sdp_context` | `id`, optional `depth` (2) | the node's context bundle ([[REQ-agent-context]]) |
| `sdp_check` | optional minimum `severity` (`warning`) | diagnostics with rule, `file:line` and hint ([[REQ-check-rules]]) |
| `sdp_architecture` | — | the curated architecture as JSON: significant ids, ids declared but not significant, and the view's nodes and edges ([[REQ-curated-architecture]]) |

Mistakes come back as tool errors that an agent can read and act on, not as protocol failures: a
malformed query returns the parser's message together with the query syntax, and an unknown id
says so. The server's instructions suggest where to start: `sdp_status`, then `sdp_query`, and
`sdp_context` before working on a spec.

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

Scenario: The server offers one tool per question
  When an agent lists the MCP tools
  Then the MCP tools are "sdp_architecture, sdp_check, sdp_context, sdp_query, sdp_show, sdp_status"

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
    | sdp_architecture | {}                                                    | "significant": []                                  |

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
    | tool        |
    | sdp_show    |
    | sdp_context |

Scenario: Diagnostics tell the agent what to do
  When an agent calls the MCP tool "sdp_check" with:
    """
    {}
    """
  Then the output contains "dangling-link"
  And the output contains "specs/REQ-a.md:5"
  And the output contains "→ create a spec with `id: REQ-gone`"

Scenario: The architecture tool returns only what architects marked significant
  Given a file "docs/architecture.md" containing:
    """
    ---
    id: ARCH-overview
    kind: view
    nodes:
      - { id: ARCH-orders, kind: element, significant: true, rationale: owns the order aggregate, links: { decided-by: DEC-0001 } }
      - { id: ARCH-cache, kind: element }
      - { id: DEC-0001, kind: decision, status: accepted, decision: one transaction per order }
    ---
    # Architecture
    """
  When an agent calls the MCP tool "sdp_architecture" with:
    """
    {}
    """
  Then the output field "significant" holds "ARCH-orders"
  And the output field "declared" holds "ARCH-cache"
  And the output field "nodes" holds "ARCH-orders, DEC-0001"

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
~~~
