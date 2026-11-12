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

Agents explore with `grep`, `find`, `sed` and `jq` before anything else. Every fact the tool knows
must therefore be reachable with those tools: ids are literal text in the files that declare them
(scenario and code ids are built from a spec id or a path), every node and edge carries the `file:line` it came from, and the exports for grep and jq are
line-oriented, one fact per line ([[REQ-graph-export]]). Nothing lives only in a database or a
binary index.

## Scenarios

Quality attribute scenarios: *Given* is the source and environment, *When* the stimulus, *Then*
the response and its measure.

~~~gherkin
Scenario: Grepping for an id finds the file that declares it
  Given an agent that explores this repository with grep
  When it searches each file for the ids of the nodes declared there
  Then every id is found in the file that declares it

Scenario: Every exported fact names the file and line it came from
  Given an agent that explores this repository with grep
  When it exports the graph
  Then every record of the export names the file and line it came from

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
  And a file "docs/ARCH-x.md" containing:
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
