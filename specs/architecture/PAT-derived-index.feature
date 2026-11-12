@id=PAT-derived-index
@decided-by:files-are-the-source-of-truth
Feature: Derived index over source files

  Any structure needed to answer a question fast is derived from the human-edited files on demand,
  and can be thrown away. It is why grep, git and pull requests work on all delivery knowledge and
  why there is no database to migrate; abandoning it would change every workflow.

  Rule: The next command sees an edit

    Scenario: A spec renamed between two commands
      Given a file "specs/REQ-a.feature" containing:
        """
        @id=REQ-a
        Feature: Alpha
        """
      When I run "sdp q requirement --ids"
      Then the output contains "REQ-a"
      Given a file "specs/REQ-a.feature" containing:
        """
        @id=REQ-b
        Feature: Beta
        """
      When I run "sdp q requirement --ids"
      Then the output contains "REQ-b"
      And the output does not contain "REQ-a"
