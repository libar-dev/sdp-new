@id=ARCH-vocabulary
@decided-by:DEC-0002 @configured-by:REQ-configuration
Feature: Vocabulary profile

  The few words sdp reads meaning into, each as a role with a default word that a workspace can
  rename, and the words sdp makes itself, which are fixed.

  Rule: Only the vocabulary profile names the words sdp interprets

    Every other module asks the profile what a role is called, so renaming a word changes what sdp
    reads instead of silently switching a feature off.

    Scenario: The source of this repository
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
          case "closes":
            break
        }
        """
      When the TypeScript files under "src" are searched for interpreted words
      Then the search finds "src/report.ts:1 phase, src/report.ts:1 iteration, src/report.ts:3 decision, src/report.ts:4 iteration, src/report.ts:6 milestone, src/report.ts:7 activity, src/report.ts:9 quality, src/report.ts:9 type, src/report.ts:12 closes"

  @open
  Rule: The role `quality` reads the attribute `type`, while this repository writes `@quality=` and nothing reads it: which of the two is renamed?
