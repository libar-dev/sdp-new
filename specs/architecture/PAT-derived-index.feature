@id=PAT-derived-index
@decided-by:DEC-0003
@iteration:I1
Feature: Derived index over source files

  Any structure needed to answer a question fast is derived from the human-edited files on demand,
  and can be thrown away (DEC-0003).

  It is why grep, git and pull requests work on all delivery knowledge and why there is no database
  to migrate; abandoning it would change every workflow.

  Scenario: The next command sees an edit
    Given a file "specs/REQ-a.md" containing:
      """
      ---
      id: REQ-a
      ---
      # Alpha
      """
    When I run "sdp q requirement --ids"
    Then the output contains "REQ-a"
    Given a file "specs/REQ-a.md" containing:
      """
      ---
      id: REQ-b
      ---
      # Beta
      """
    When I run "sdp q requirement --ids"
    Then the output contains "REQ-b"
    And the output does not contain "REQ-a"
