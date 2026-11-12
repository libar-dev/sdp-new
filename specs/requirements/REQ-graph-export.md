---
id: REQ-graph-export
kind: requirement
title: Graph exports
maturity: ready
iteration: I1
activity: { implementation: I1, test: I1 }
tags: [agents]
links:
  refines: CAP-agent-collaboration
  realized-by: ARCH-reports
  decided-by: DEC-0003
---

# Graph exports

The graph is a derived index of the files ([[DEC-0003]]), and it can be written out for tools that
know nothing about sdp. `sdp graph -f <format>` prints the whole graph, or with `-q <query>` the
nodes and edges along the paths a query matches. `sdp graph --write` writes `.sdp/graph.jsonl` and
`.sdp/graph.tsv`, regenerated on demand and never edited by hand.

| Format | Shape |
| --- | --- |
| `jsonl` (default) | one JSON object per line: nodes as `{"type":"node", "id", "kind", "title", "source", "attrs"}`, then edges as `{"type":"edge", "from", "rel", "to", "attrs", "source"}` |
| `tsv` | one fact per line: `node⇥<id>⇥<kind>⇥<title>⇥<file:line>` and `edge⇥<from>⇥<rel>⇥<to>⇥<file:line>`; tabs and line breaks inside a cell become spaces |
| `json` | one document: `{ "nodes": [...], "edges": [...] }` |
| `dot` | a Graphviz digraph; decisions, patterns, milestones and the architecture each have a shape of their own |
| `mermaid` | a Mermaid flowchart, shaped the same way |

The line-oriented formats answer most questions with standard tools ([[NFR-greppable]]):

```sh
grep -P '^edge\t[^\t]*\trealized-by\t' .sdp/graph.tsv
jq -c 'select(.type=="node" and .attrs.stage=="in-progress")' .sdp/graph.jsonl
```

## Scenarios

~~~gherkin
Background:
  Given a file "specs/REQ-a.md" containing:
    """
    ---
    id: REQ-a
    maturity: idea
    links:
      realized-by: ARCH-x
    ---
    # Alpha
    """
  And a file "docs/ARCH-x.md" containing:
    """
    ---
    id: ARCH-x
    kind: element
    ---
    # X
    """

Scenario Outline: Every format carries the edges with their source
  When the graph is exported as <format>
  Then the output contains '<edge>'

  Examples:
    | format  | edge                                                                                         |
    | jsonl   | {"type":"edge","from":"REQ-a","rel":"realized-by","to":"ARCH-x","source":"specs/REQ-a.md:5"} |
    | tsv     | edge\tREQ-a\trealized-by\tARCH-x\tspecs/REQ-a.md:5                                           |
    | json    | "source": "specs/REQ-a.md:5"                                                                 |
    | dot     | "REQ-a" -> "ARCH-x" [label="realized-by"];                                                   |
    | mermaid | -->\|realized-by\|                                                                           |

Scenario Outline: Diagrams shape a node by the role its kind plays
  When the graph is exported as <format>
  Then the output contains '<shape>'

  Examples:
    | format  | shape                                       |
    | dot     | "ARCH-x" [label="ARCH-x\nX", shape=box3d]; |
    | dot     | "REQ-a" [label="REQ-a\nAlpha", shape=ellipse]; |

Scenario: A query selects the part of the graph to export
  Given a file "specs/REQ-b.md" containing:
    """
    ---
    id: REQ-b
    maturity: idea
    ---
    # Beta
    """
  When I run "sdp graph -f tsv -q 'requirement -realized-by-> element'"
  Then the output contains "edge\tREQ-a\trealized-by\tARCH-x"
  And the output does not contain "REQ-b"
~~~
