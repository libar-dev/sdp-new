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

Agents that speak the Model Context Protocol get the graph as tools (`sdp_query`, `sdp_show`,
`sdp_context`, `sdp_check`, `sdp_architecture`, `sdp_status`) by running `sdp mcp`. Each call
reads the workspace afresh, so an agent sees its own edits immediately. Agents with a shell can do
everything through the CLI or plain grep instead; MCP is a convenience, not a requirement.

## Scenarios

~~~gherkin
Background:
  Given a file "specs/REQ-a.md" containing:
    """
    ---
    id: REQ-a
    maturity: ready
    links:
      depends-on: REQ-gone
    ---
    # Alpha
    """

Scenario: Agents query the graph
  When an agent calls the MCP tool "sdp_query" with:
    """
    { "expression": "requirement[maturity=ready]" }
    """
  Then the output contains "REQ-a"

Scenario: Agents get actionable diagnostics
  When an agent calls the MCP tool "sdp_check" with:
    """
    {}
    """
  Then the output contains "dangling-link"
  And the output contains "REQ-gone"
~~~
