---
id: REQ-graph-export
kind: requirement
title: The graph as plain data
maturity: ready
iteration: I1
activity: { implementation: I1, test: I1 }
tags: [agents]
links:
  refines: CAP-agent-collaboration
  realized-by: ARCH-reports
  decided-by: DEC-0003
---

# The graph as plain data

Agents and scripts take data structures apart faster than they learn a query language. So sdp
hands its graph — a derived index of the files ([[DEC-0003]]) — over as plain data for ordinary
tools: `sdp graph` prints one record per line, and grep, jq or a few lines of script answer from
it what `sdp q` answers ([[NFR-greppable]]). SDPQ ([[REQ-graph-query]]) stays as a convenience; it
is never the only door.

The field names are a public contract: they do not change with the workspace, and every JSON
answer of sdp and of its programmatic API is made of the same records, so a script written
against one reads them all.

## Scenarios

~~~gherkin
Background:
  Given a file "specs/REQ-a.md" containing:
    """
    ---
    id: REQ-a
    maturity: idea
    links:
      realized-by: { to: ARCH-x, since: 2026 }
      depends-on: REQ-gone
    realized-by: ARCH-x
    ---
    # Alpha
    """
  And a file "sdp.config.yaml" containing:
    """
    vocabulary: { links: [realized-by] }
    """
  And a file "specs/REQ-b.md" containing:
    """
    ---
    id: REQ-b
    title: "Beta\twith a tab\nand a line break"
    maturity: ready
    ---
    Beta comes second.
    """
  And a file "docs/ARCH-x.md" containing:
    """
    ---
    id: ARCH-x
    kind: element
    links:
      decided-by: DEC-0001
    ---
    # X
    """
  And a file "docs/DEC-0001.md" containing:
    """
    ---
    id: DEC-0001
    kind: decision
    status: accepted
    ---
    # Use X
    """

Rule: The record

  Scenario Outline: A record says what it is and always has every field, in this order; an edge is one record however many places state it
    When the graph is exported
    Then the output contains '<record>'

    Examples:
      | what                             | record                                                                                                                                                                                            |
      | a node with its attributes       | {"type":"node","id":"REQ-a","kind":"requirement","title":"Alpha","file":"specs/REQ-a.md","line":1,"attrs":{"maturity":"idea","realized-by":"ARCH-x","file":"specs/REQ-a.md","scenarios":0,"verification":"none","stage":"idea"}} |
      | a node nothing declares          | {"type":"node","id":"REQ-gone","kind":"missing","title":"REQ-gone","file":null,"line":null,"attrs":{}}                                                                                          |
      | an edge stated in two places     | {"type":"edge","from":"REQ-a","rel":"realized-by","to":"ARCH-x","attrs":{"since":2026},"declared":[{"file":"specs/REQ-a.md","line":5},{"file":"specs/REQ-a.md","line":7}]}                      |
      | an edge without attributes       | {"type":"edge","from":"ARCH-x","rel":"decided-by","to":"DEC-0001","attrs":{},"declared":[{"file":"docs/ARCH-x.md","line":5}]}                                                                   |

  Scenario: One record per line, whatever the text
    When the graph is exported
    Then the output has one line per node and edge

  Scenario: The programmatic API answers with the same records, in the envelope of every answer
    When a program asks the API for "requirement[maturity=ready]"
    Then the output contains '"complete": true'
    And the output field "data.nodes" holds "REQ-b"
    And the output contains '"file": "specs/REQ-b.md"'

  Scenario: sdp graph prints every node and then every edge
    When I run the pipeline:
      """
      sdp graph | jq -r .type | uniq
      """
    Then the output lines are "node, edge"
    When I run "sdp graph"
    Then the exit code is 0
    And the output contains '{"type":"node","id":"DEC-0001","kind":"decision","title":"Use X","file":"docs/DEC-0001.md","line":1,'
    And the output contains '{"type":"edge","from":"ARCH-x","rel":"decided-by","to":"DEC-0001"'

Rule: A part of the graph, and a picture of it

  Scenario: A query selects the part of the graph to export
    When I run "sdp graph -q 'requirement -realized-by-> element'"
    Then the output contains '"id":"REQ-a"'
    And the output contains '"from":"REQ-a","rel":"realized-by","to":"ARCH-x"'
    And the output does not contain "REQ-b"
    And the output does not contain "DEC-0001"

  Scenario: The same graph as a Mermaid flowchart, shaped by the role a kind plays
    When I run "sdp graph --mermaid -q 'element -decided-by-> decision'"
    Then the output contains "flowchart LR"
    And the output contains '["ARCH-x<br/><small>X</small>"]'
    And the output contains '[/"DEC-0001<br/><small>Use X</small>"/]'
    And the output contains "-->|decided-by|"

Rule: Ordinary tools answer what sdp q answers

  Scenario Outline: jq over the export gives the answer of the query
    When I run "sdp q '<query>' --ids"
    Then the output lines are "<answer>"
    When I run the pipeline:
      """
      sdp graph | jq -r '<jq>'
      """
    Then the output lines are "<answer>"

    Examples:
      | query                                 | answer         | jq                                                                              |
      | requirement[maturity=ready]           | REQ-b          | select(.type == "node" and .kind == "requirement" and .attrs.maturity == "ready") \| .id |
      | *[source~^docs/]                      | ARCH-x, DEC-0001 | select(.type == "node" and (.file // "" \| startswith("docs/"))) \| .id       |
      | #ARCH-x <-realized-by- *              | REQ-a          | select(.type == "edge" and .rel == "realized-by" and .to == "ARCH-x") \| .from  |
      | missing                               | REQ-gone       | select(.type == "node" and .file == null) \| .id                                |

  Scenario: A two-hop question is a few lines of jq
    When I run "sdp q 'requirement -realized-by-> element -decided-by-> decision' --ids"
    Then the output lines are "DEC-0001"
    When I run the pipeline:
      """
      sdp graph | jq -rs '
        (map(select(.type == "node")) | INDEX(.id)) as $node
        | map(select(.type == "edge")) as $edges
        | $edges[] | select(.rel == "realized-by" and $node[.from].kind == "requirement") | .to as $element
        | $edges[] | select(.rel == "decided-by" and .from == $element and $node[.to].kind == "decision") | .to'
      """
    Then the output lines are "DEC-0001"

  Scenario: A question about absence is a few lines of script
    When I run "sdp q 'requirement !-realized-by-> *' --ids"
    Then the output lines are "REQ-b"
    When I run the pipeline:
      """
      sdp graph | node -e '
        const records = require("fs").readFileSync(0, "utf8").trim().split("\n").map((line) => JSON.parse(line))
        const realized = new Set(records.filter((r) => r.type === "edge" && r.rel === "realized-by").map((r) => r.from))
        for (const r of records) if (r.type === "node" && r.kind === "requirement" && !realized.has(r.id)) console.log(r.id)'
      """
    Then the output lines are "REQ-b"

  Scenario: Where a link is declared is one grep away
    When I run the pipeline:
      """
      sdp graph | grep '"rel":"decided-by"' | jq -r '.declared[] | "\(.file):\(.line)"'
      """
    Then the output lines are "docs/ARCH-x.md:5"

  Scenario: Another format is a line of jq
    When I run the pipeline:
      """
      echo 'digraph sdp {'
      sdp graph | jq -r 'select(.type == "edge") | "  \"\(.from)\" -> \"\(.to)\" [label=\"\(.rel)\"];"'
      echo '}'
      """
    Then the output contains '  "REQ-a" -> "ARCH-x" [label="realized-by"];'
~~~
