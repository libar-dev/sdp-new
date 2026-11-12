@id=NFR-greppable @maturity=ready @quality=usability
@refines:CAP-agent-collaboration @decided-by:DEC-0003
@iteration:I1 @activity.implementation:I1 @activity.test:I1
Feature: Grep-first

  Agents explore with `grep`, `find`, `sed` and `jq` before anything else, so every fact sdp knows
  must be reachable with those tools. An id is literal text wherever it is declared or linked to;
  every node and edge carries the `file:line` it came from; the exports are one record per line
  (REQ-graph-export). Nothing lives only in a database or a binary index.

  Scenario: Every fact leads back to a line, and a link's line names its target
    Then every node and link of this repository is at a file and line that exist
    And the line of every link of this repository contains the id it links to

  Scenario: The export keeps one fact per line, whatever the text
    Given a file "specs/REQ-a.md" containing:
      """
      ---
      id: REQ-a
      title: "Alpha\twith a tab\nand a line break"
      links:
        realized-by: ARCH-x
      ---
      Alpha comes first.
      """
    And a file "specs/ARCH-x.md" containing:
      """
      ---
      id: ARCH-x
      kind: element
      ---
      # X
      """
    When the graph is exported
    Then the output has one line per node and edge
