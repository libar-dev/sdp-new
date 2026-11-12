@id=REQ-graph-export @maturity=ready @agents
@refines:CAP-agent-collaboration @realized-by:ARCH-reports @decided-by:DEC-0003 @constrained-by:NFR-greppable
@iteration:I1 @activity.implementation:I1 @activity.test:I1
Feature: The graph as plain data

  Agents and scripts take data structures apart faster than they learn a query language. So sdp
  hands its graph over as plain data for ordinary tools: `sdp graph` prints one record per line,
  and grep, jq or a few lines of script answer from it what `sdp q` answers. The query language
  stays a convenience, never the only door. Nothing is written to disk: a dump cannot say that it
  is stale or incomplete.

  Background:
    Given a file "specs/REQ-a.feature" containing:
      """
      @id=REQ-a @maturity=idea @realized-by:ARCH-x
      @depends-on:REQ-gone @realized-by:ARCH-x
      Feature: Alpha
      """
    And these specs:
      | tags                            | Feature |
      | @id=ARCH-x @decided-by:DEC-0001 | X       |
      | @id=DEC-0001                    | Use X   |
    And a file "specs/REQ-b.feature" containing:
      """
      @id=REQ-b @maturity=ready
      Feature: Beta

        Rule: Beta comes second

          After alpha,

          and only after it.
      """

  Rule: A record says what it is and always has every field, in the same order; an edge is one record however many tags state it

    The field names are a public contract: they do not change with the workspace.

    Scenario Outline: Nodes and edges
      When the graph is exported
      Then the output contains '<record>'

      Examples:
        | what                         | record                                                                                                                                                                                                              |
        | a node with its attributes   | {"type":"node","id":"REQ-a","kind":"requirement","title":"Alpha","file":"specs/REQ-a.feature","line":1,"attrs":{"maturity":"idea","file":"specs/REQ-a.feature","scenarios":0,"verification":"none","stage":"idea"}} |
        | a node nothing declares      | {"type":"node","id":"REQ-gone","kind":"missing","title":"REQ-gone","file":null,"line":null,"attrs":{}}                                                                                                              |
        | an edge stated in two places | {"type":"edge","from":"REQ-a","rel":"realized-by","to":"ARCH-x","attrs":{},"declared":[{"file":"specs/REQ-a.feature","line":1},{"file":"specs/REQ-a.feature","line":2}]}                                            |

    Scenario: A rule is a node of kind rule with what it holds and how its examples stand, and its edges say whose it is and what it rests on
      Given a file "specs/REQ-c.feature" containing:
        """
        @id=REQ-c
        Feature: Gamma

          @decided-by:DEC-0001
          Rule: Gamma comes third

            After alpha and beta.

            Scenario: Third
              Then gamma comes third
        """
      When the graph is exported
      Then the output contains '{"type":"node","id":"REQ-c#gamma-comes-third","kind":"rule","title":"Gamma comes third","file":"specs/REQ-c.feature","line":5,"attrs":{"spec":"REQ-c","description":"After alpha and beta.","scenarios":1,"verification":"unrun"}}'
      And the output contains '{"type":"edge","from":"REQ-c#gamma-comes-third","rel":"rule-of","to":"REQ-c","attrs":{},"declared":[{"file":"specs/REQ-c.feature","line":5}]}'
      And the output contains '{"type":"edge","from":"REQ-c#gamma-comes-third","rel":"decided-by","to":"DEC-0001","attrs":{},"declared":[{"file":"specs/REQ-c.feature","line":4}]}'
      And the output contains '{"type":"edge","from":"REQ-c#third","rel":"verifies","to":"REQ-c#gamma-comes-third","attrs":{},"declared":[{"file":"specs/REQ-c.feature","line":9}]}'
      And the output contains '"kind":"scenario","title":"Third","file":"specs/REQ-c.feature","line":9,"attrs":{"spec":"REQ-c","keyword":"Scenario","rule":"REQ-c#gamma-comes-third",'

  Rule: sdp graph prints one record per line, every node and then every edge, whatever the text

    Scenario: A reason of two paragraphs
      When the graph is exported
      Then the output has one line per node and edge

    Scenario: Nodes first
      When I run the pipeline:
        """
        sdp graph | jq -r .type | uniq
        """
      Then the output lines are "node, edge"
      When I run "sdp graph"
      Then the exit code is 0
      And the output contains '{"type":"node","id":"DEC-0001","kind":"decision","title":"Use X","file":"specs/DEC-0001.feature","line":1,'
      And the output contains '{"type":"edge","from":"ARCH-x","rel":"decided-by","to":"DEC-0001"'

  Rule: Every JSON answer is made of the same records, so a script written against one reads them all

    Scenario: The programmatic API answers with the same records, in the envelope of every answer
      When a program asks the API for "requirement[maturity=ready]"
      Then the JSON output has:
        | complete        | true                |
        | data.nodes      | REQ-b               |
        | data.nodes.file | specs/REQ-b.feature |

  Rule: graph -q exports only the paths a query matches, as records or as a flowchart shaped by the role a kind plays

    Scenario: A query selects the part of the graph to export
      When I run "sdp graph -q 'requirement -realized-by-> element'"
      Then the output contains '"id":"REQ-a"'
      And the output contains '"from":"REQ-a","rel":"realized-by","to":"ARCH-x"'
      And the output does not contain "REQ-b"
      And the output does not contain "DEC-0001"

    Scenario: Only the edges a path walks, not every edge between the nodes it reaches
      Given these specs:
        | tags                                | Feature |
        | @id=REQ-c @uses:REQ-d @avoids:REQ-d | C       |
        | @id=REQ-d                           | D       |
      When I run "sdp graph -q '#REQ-c -uses-> #REQ-d'"
      Then the output contains '"from":"REQ-c","rel":"uses","to":"REQ-d"'
      And the output does not contain '"rel":"avoids"'

    Scenario: The same graph as a Mermaid flowchart
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
        | query                       | answer   | jq                                                                                       |
        | requirement[maturity=ready] | REQ-b    | select(.type == "node" and .kind == "requirement" and .attrs.maturity == "ready") \| .id |
        | *[source~^specs/ARCH-]      | ARCH-x   | select(.type == "node" and (.file // "" \| startswith("specs/ARCH-"))) \| .id            |
        | #ARCH-x <-realized-by- *    | REQ-a    | select(.type == "edge" and .rel == "realized-by" and .to == "ARCH-x") \| .from           |
        | missing                     | REQ-gone | select(.type == "node" and .file == null) \| .id                                         |

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
      Then the output lines are "specs/ARCH-x.feature:1"

    Scenario: Another format is a line of jq
      When I run the pipeline:
        """
        echo 'digraph sdp {'
        sdp graph | jq -r 'select(.type == "edge") | "  \"\(.from)\" -> \"\(.to)\" [label=\"\(.rel)\"];"'
        echo '}'
        """
      Then the output contains '  "REQ-a" -> "ARCH-x" [label="realized-by"];'
