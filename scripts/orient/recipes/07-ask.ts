/**
 * 7 ask: how to ask sdp further, each call shown on an id of this state so that it answers when
 * run. Few verbs: `context` for one node, `q` for a path through the graph, `graph` for any record
 * as data, and this orientation's own rows. Every call here was run on this repository.
 */
import { type Recipe, toCome } from "../lib.ts"

export default {
  title: "how to ask further",
  asks: ["graph", "lifecycle"],
  legend: "ask command what it answers",
  rows: ({ graph, lifecycle }) => {
    const features = graph.ofKind("feature")
    const planned = (id: string) => graph.out(id, "iteration").some((e) => e.to === lifecycle.calendar.iteration)
    const feature = features.find((f) => toCome(f) && planned(f.id)) ?? features.find(toCome) ?? features[0]
    const routed = features.find((f) => toCome(f) && graph.out(f.id, "realized-by").length > 0)
    const element = graph.out(routed?.id ?? "", "realized-by")[0]?.to ?? graph.ofKind("element")[0]?.id
    const decision = [...graph.ofKind("decision")].sort((a, b) => graph.into(b.id, "decided-by").length - graph.into(a.id, "decided-by").length)[0]
    return [
      { rec: "ask", command: `sdp context ${feature?.id}`, answers: "one node whole: its rules with reason and state, examples, steps still undefined, links, decisions, code" },
      { rec: "ask", command: `sdp q '#${routed?.id ?? feature?.id} -realized-by-> element <-is- code' --ids`, answers: "the code a feature is built in, through its elements" },
      { rec: "ask", command: `sdp q '#${element} <-is- code' --ids`, answers: "every file and declaration of an element" },
      { rec: "ask", command: `sdp q '#${decision?.id} <-decided-by- *' --ids`, answers: "what rests on a decision" },
      { rec: "ask", command: `sdp q 'rule[toCome][tags!~@open]' --ids`, answers: "every rule still to come; [key=v], -rel->, <-rel-, ! and + in: sdp q --help" },
      { rec: "ask", command: `sdp graph | jq -c 'select(.type=="node" and .attrs.toCome==true)'`, answers: "any record as data: {type:node,id,kind,title,file,line,attrs} {type:edge,from,rel,to}" },
      { rec: "ask", command: `sdp steps '<step text>'`, answers: "a step definition that already says it, before writing one" },
      { rec: "ask", command: `sdp check; sdp run ${feature?.id}`, answers: "a change verified: check validates the graph, run its examples" },
      { rec: "ask", command: `node scripts/orient/orient.ts --only to-come --json | jq -r '.id'`, answers: "this orientation as records; a recipe of your own: scripts/orient/README.md" }
    ]
  }
} satisfies Recipe
