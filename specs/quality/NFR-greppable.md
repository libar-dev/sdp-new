---
id: NFR-greppable
kind: nfr
title: Grep-first
maturity: ready
quality: usability for agents
iteration: I1
activity: { implementation: I1, test: I1 }
links:
  refines: CAP-agent-collaboration
  decided-by: DEC-0003
---

# Grep-first

Agents explore with `grep`, `find`, `sed` and `jq` before anything else, so every fact sdp knows
must be reachable with those tools. An id is literal text wherever it is declared or linked to;
every node and edge carries the `file:line` it came from; the exports are one record per line
([[REQ-graph-export]]). Nothing lives only in a database or a binary index.

## Scenarios

~~~gherkin
Scenario: Every fact leads back to a line, and a link's line names its target
  Given an agent that explores this repository with grep
  When it follows every node and link of the graph back to its file and line
  Then every one of them has a file and a line that exist
  And the line of every link contains the id it links to

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
~~~
