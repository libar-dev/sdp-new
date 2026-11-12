---
id: DEC-0002
kind: decision
title: Free-form kinds and relations, with a small vocabulary profile sdp interprets
status: accepted
category: architecture
date: 2026-11-04
deciders: [architecture]
iteration: I1
---

# Free-form kinds and relations, with a small vocabulary profile sdp interprets

## Context

Every team describes its system differently: one says `realized-by`, another `implemented-in`;
one models capabilities and value streams, another bounded contexts and ports. A fixed metamodel
(a closed set of node types and verbs) forces translation, and agents exploring ad hoc stumble on
vocabulary they were not told about.

Yet sdp cannot do its job without reading meaning into a few words: a decision has a status, a
milestone's scenarios are a gate, one relation plans work into an iteration, one kind is the
architecture. When those words hide in the code, renaming one quietly switches a
feature off instead of failing.

## Options

1. A fixed metamodel (ArchiMate-, C4- or SysML-style typed elements and relations).
2. A fixed core with extension points.
3. Free-form: `kind` and relation names are strings chosen by authors; the words sdp needs are
   conventions, read wherever the code needs them.
4. Free-form, with the words sdp interprets named as roles in one vocabulary profile, each with a
   default word a workspace can rename.

## Decision

Option 4. The graph has nodes (`id`, `kind`, `title`, attributes) and edges (`from`, `rel`, `to`,
attributes). Authors name kinds, relations and attributes freely. The words sdp interprets — kinds,
relations, attributes, statuses, the maturity ladder and the disciplines — are roles of one profile
([[ARCH-vocabulary]]), configured under `vocabulary:` ([[REQ-configuration]]) and printed by
`sdp vocabulary`. No other module names one of those words; each asks the profile. Queries treat
relation names as data (`-a|b->`, `-*->`).

## Consequences

- Renaming a role's word renames what sdp reads; nothing silently stops working.
- Typos create new kinds and relations instead of errors. `sdp status` lists those in use with
  counts, which makes outliers easy to spot. A link key, though, always links ([[DEC-0010]]), so
  `sdp check` reports every reference to a missing node.
- Inverse relations are not materialised: traverse either direction with `<-rel-` or `-rel-`.

~~~gherkin
Scenario: Every reference resolves
  Then the query "missing" returns no results

Scenario: Only the vocabulary profile names the words sdp interprets
  When the TypeScript files under "src" in the repository are searched for interpreted words
  Then only "src/model/Vocabulary.ts" interprets words of the vocabulary

Scenario: The search sees each way code can interpret a word
  Given a file "src/report.ts" containing:
    """
    const inactive = new Set(["superseded", "rejected"])
    export const report = (node: any, edge: any, graph: any, title: string) => [
      node.kind === "decision",
      "supersedes" !== edge.rel,
      inactive.has(String(node.attrs.status)),
      graph.ofKind("milestone"),
      node.attrs.order,
      title === "decision",
      ["quality"].includes(String(node.attrs.type))
    ]
    switch (edge.rel) {
      case "mentions":
        break
    }
    """
  When the TypeScript files under "src" are searched for interpreted words
  Then the search finds "src/report.ts:1 superseded, src/report.ts:1 rejected, src/report.ts:3 decision, src/report.ts:4 supersedes, src/report.ts:6 milestone, src/report.ts:7 order, src/report.ts:9 quality, src/report.ts:9 type, src/report.ts:12 mentions"
~~~
