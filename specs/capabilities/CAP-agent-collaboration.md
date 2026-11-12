---
id: CAP-agent-collaboration
kind: capability
title: Agent collaboration
iteration: I1
links:
  refines: VISION
---

# Agent collaboration

AI agents read, query and change delivery state with the tools they already have, and get enough
context in one call to work on a specification safely.

The same files answer through four doors, from least to most specialised: grep, the export with
one record per line, the command line and MCP. No door has a store of its own, so they cannot
disagree, and every answer names the file it came from. The [[README]] asks one question through
grep, jq and `sdp q`; here MCP gives the same answer as the command line.

~~~gherkin
Scenario: An MCP client and the command line get the same answer, with the file it came from
  Given a file "specs/REQ-checkout.md" containing:
    """
    ---
    id: REQ-checkout
    links: { decided-by: DEC-0001 }
    ---
    # Checkout
    """
  And a file "specs/DEC-0001.md" containing:
    """
    ---
    id: DEC-0001
    ---
    # Pay without an account
    """
  When I run "sdp q '#DEC-0001 <-decided-by- *'"
  Then the output contains "REQ-checkout"
  And the output contains "specs/REQ-checkout.md"
  When an MCP client of "sdp mcp" calls "sdp_query" with:
    """
    { "expression": "#DEC-0001 <-decided-by- *" }
    """
  Then the output contains "REQ-checkout"
  And the output contains "specs/REQ-checkout.md"
~~~
