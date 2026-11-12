@id=NFR-greppable @maturity=ready @quality=usability
@refines:CAP-agent-collaboration @decided-by:DEC-0003
@iteration:I1 @activity.implementation:I1 @activity.test:I1
Feature: Grep-first

  Agents explore with `grep`, `find`, `sed` and `jq` before anything else, so every fact sdp knows
  must be reachable with those tools. Nothing lives only in a database or a binary index.

  Rule: Every node and link is at a file and line that exist, and a link's line holds the id it links to

    Scenario: This repository's graph
      Then every node and link of this repository is at a file and line that exist
      And the line of every link of this repository contains the id it links to

  Rule: The export is one record per line, whatever the text

    Scenario: A reason that runs over two lines
      Given a file "specs/REQ-a.feature" containing:
        """
        @id=REQ-a @realized-by:ARCH-x
        Feature: Alpha "with quotes" and a \ backslash

          Rule: Alpha comes first

            Its reason runs
            over two lines.
        """
      And these specs:
        | tags       | Feature |
        | @id=ARCH-x | X       |
      When the graph is exported
      Then the output has one line per node and edge
