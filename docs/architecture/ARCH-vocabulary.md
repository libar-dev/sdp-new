---
id: ARCH-vocabulary
kind: element
title: Vocabulary profile
links:
  decided-by: DEC-0002
  configured-by: REQ-configuration
---

# Vocabulary profile

The few words sdp reads meaning into — kinds such as `decision` and `milestone`, relations such as
the plan relation, attributes such as `activity`, the maturity ladder and the disciplines — each as a role with a default word that a workspace can
rename under `vocabulary:` ([[REQ-configuration]]). Every other module asks the profile what a role
is called, so renaming a word changes what sdp reads instead of silently switching a feature off
([[DEC-0002]]). Lookups keyed by authors' words see only own properties: `constructor` is a legal
kind. The profile is validated when the configuration is read — every role has a word, and no two
roles contradict each other; `sdp vocabulary` prints it.

The words sdp makes itself are fixed and listed in the profile too, and printed with it: the
`scenario`, `code` and `missing` kinds, the derived attributes (`derived-attribute`,
[[ARCH-graph-builder]]), the stages beyond maturity, and the names no link can have because sdp
reads them as attributes ([[ARCH-graph-builder]]).

Code: `src/model/Vocabulary.ts`.

~~~gherkin
Scenario: Only the vocabulary profile names the words sdp interprets
  When the TypeScript files under "src" in the repository are searched for interpreted words
  Then only "src/model/Vocabulary.ts" interprets words of the vocabulary

Scenario: The search sees each way code can interpret a word
  Given a file "src/report.ts" containing:
    """
    const planned = new Set(["phase", "iteration"])
    export const report = (node: any, edge: any, graph: any, title: string) => [
      node.kind === "decision",
      "iteration" !== edge.rel,
      planned.has(String(node.kind)),
      graph.ofKind("milestone"),
      node.attrs.activity,
      title === "decision",
      ["quality"].includes(String(node.attrs.type))
    ]
    switch (edge.rel) {
      case "mentions":
        break
    }
    """
  When the TypeScript files under "src" are searched for interpreted words
  Then the search finds "src/report.ts:1 phase, src/report.ts:1 iteration, src/report.ts:3 decision, src/report.ts:4 iteration, src/report.ts:6 milestone, src/report.ts:7 activity, src/report.ts:9 quality, src/report.ts:9 type, src/report.ts:12 mentions"
~~~
