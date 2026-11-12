---
id: NFR-greppable
kind: nfr
title: Grep-first
maturity: ready
type: quality
quality: usability for agents
iteration: E2
links:
  refines: CAP-agent-collaboration
  decided-by: DEC-0003
---

# Grep-first

Agents explore with `grep`, `find`, `sed` and `jq` before anything else. Every fact the tool knows
must therefore be reachable with those tools: ids are literal text in the files that declare them,
every node and edge carries the `file:line` it came from, and the exports for grep and jq are
line-oriented, one fact per line ([[REQ-graph-export]]). Nothing lives only in a database or a
binary index.

## Scenarios

Quality attribute scenarios: *Given* is the source and environment, *When* the stimulus, *Then*
the response and its measure.

~~~gherkin
Scenario: Every fact in this repository points at a file and line
  Then every node of this repository has a source location
  And every edge of this repository has a source location

Scenario: Ids are literal text in the files that declare them
  Then every node id of this repository appears literally in its source file

Scenario Outline: Line-oriented exports keep one fact per line, whatever the text
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
  When the graph is exported as <format>
  Then the output has one line per node and edge

  Examples:
    | format |
    | jsonl  |
    | tsv    |
~~~
