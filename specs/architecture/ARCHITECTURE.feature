@id=ARCHITECTURE @kind=view
Feature: Architecture overview

  The rules that hold between all elements.

  Rule: A uses link between elements is exactly a value import between the modules anchored to them

    `A uses B` says one thing: a module anchored to `A` imports a function, a class or a constant
    from a module anchored to `B`. An import of types alone calls no code of the other element.

    Scenario: The uses links of this repository
      Then the "uses" links between elements are the value imports between the modules anchored to them

  Rule: No element depends on itself through others

    Scenario: The elements of this repository
      Then no element reaches itself over "uses" links

  Rule: Nothing depends on a transport, except the command line that starts the server

    Scenario: The command line and the MCP server
      Then the query "#ARCH-cli <-uses- *" returns no results
      And the query "#ARCH-mcp <-uses- *" returns:
        | ARCH-cli |

  Rule: Every element is anchored in the code it describes

    An element that no code stands behind is a diagram that stopped being true.

    Scenario: The elements of sdp's own architecture
      Then the query "element" returns at least 1 result
      And the query "element !<-is- code" returns no results

  Rule: Every annotation in this repository reads, and the ids it is typed against are current

    sdp only warns about either; this repository fails its run instead.

    Scenario: Annotations found, none unreadable, and no stale id types
      Then the query "code -is-> element|pattern" returns at least 1 result
      And there are no diagnostics for rule "annotation-unreadable"
      And there are no diagnostics for rule "types-stale"

  Rule: Code in this repository links only to the architecture, and every ready requirement or feature names the element that realizes it

    Scenario: No code outside the architecture, none linked to a requirement, no ready requirement or feature without an element
      Then the query "code !-is|instance-of-> element|pattern" returns no results
      And the query "code ?-*-> feature|change" returns no results
      And the query "requirement|feature[maturity=ready] !-realized-by-> element" returns no results

  Rule: The step API loads nothing of the parser, the graph or the workspace

    `sdp/steps` is all a step module needs, so importing it reads no workspace; what reads one is
    `sdp`, the programmatic API.

    Scenario: A fresh process that imports sdp/steps
      When a fresh Node process imports "sdp/steps"
      Then the output contains "/src/run/Steps.ts"
      And the output does not contain "oxc-parser"
      And the output does not contain "/src/parse/"
      And the output does not contain "/src/graph/"
      And the output does not contain "/src/workspace/"

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
  Rule: Does `src/app/` — the use cases, the answer envelope, the templates — get an element of its own?

  @open
  Rule: Which element is `src/model/Results.ts`, the results a run records as data?

  @open
  Rule: Is `src/run/Builtin.ts`, the built-in steps, part of the runner? An agent anchored it there so that the runner's uses links hold.

  @open
  Rule: May the spec parser depend on the vocabulary? An agent declared the link when the parser began to read which keys link.
