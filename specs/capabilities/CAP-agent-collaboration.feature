@id=CAP-agent-collaboration
@refines:VISION
@iteration:I1
Feature: Agent collaboration

  AI agents read, query and change delivery state with the tools they already have, and get enough
  context in one call to work on a specification safely. The same files answer through four doors,
  from least to most specialised: grep, the export with one record per line, the command line and
  MCP.

  Rule: Every door gives the same answer, with the file it came from

    No door has a store of its own, so they cannot disagree.

    Scenario: The command line and an MCP client ask which specs a decision constrains
      Given these specs:
        | tags                                  | Feature                |
        | @id=REQ-checkout @decided-by:DEC-0001 | Checkout               |
        | @id=DEC-0001                          | Pay without an account |
      When I run "sdp q '#DEC-0001 <-decided-by- *'"
      Then the output contains "REQ-checkout"
      And the output contains "specs/REQ-checkout.feature"
      When an MCP client of "sdp mcp" calls "sdp_query" with:
        """
        { "expression": "#DEC-0001 <-decided-by- *" }
        """
      Then the output contains "REQ-checkout"
      And the output contains "specs/REQ-checkout.feature"
