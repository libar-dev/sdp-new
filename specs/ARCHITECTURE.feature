@id=ARCHITECTURE @kind=architecture
Feature: Architecture

  The rules this repository's code keeps, over the elements its annotations declare and what each
  imports: `sdp arch` shows the elements and their imports, and `sdp context ARCHITECTURE` the rules.

  Rule: No element depends on itself through others

    Each element can then be changed and understood apart from the elements that import it; one
    that reaches itself cannot.

    Scenario: The elements of this repository
      Then no element reaches itself over "imports" links

    Scenario: A cycle through code of no element
      Given a file "src/orders.ts" containing:
        """
        import { notify } from "./notify.ts"

        /** @sdp is ARCH-orders */
        export const place = (): number => notify()
        """
      And a file "src/notify.ts" containing:
        """
        import { send } from "./mailer.ts"

        export const notify = (): number => send()
        """
      And a file "src/mailer.ts" containing:
        """
        import { place } from "./orders.ts"

        /** @sdp is ARCH-mailer */
        export const send = (): number => place()
        """
      Then the elements that reach themselves over "imports" links are "ARCH-mailer, ARCH-orders"

  Rule: Nothing depends on a transport, except the command line that starts the server

    Scenario: The command line and the MCP server
      Then the query "#ARCH-cli <-imports- *" returns no results
      And the query "#ARCH-mcp <-imports- *" returns:
        | ARCH-cli |

  @decided-by:effect-for-io
  Rule: Parsing, the model, the graph and what is computed from it do no IO, and sdp reads and writes a workspace through the `FileSystem` service, but for what Node reads to load step code

    That is what lets executable specs run the real pipeline against an in-memory file system. Node
    loads step code from disk, and what sdp records of how it loaded it, its package.json files
    included, is what Node read there.

    Scenario: The core does no IO
      When I run "grep -rlE 'FileSystem|[[:punct:]]fs[[:punct:]]|child_process|ChildProcess' src/parse src/model src/graph src/check src/lifecycle src/arch" in the repository
      Then the exit code is 1

    Scenario: A workspace in memory reads as one on disk
      Given a file "notes/outside.feature" containing:
        """
        @id=outside
        Feature: Outside the workspace
        """
      And a file "shop/specs/cart.feature" containing:
        """
        @id=cart
        Feature: Cart
        """
      When the workspace "shop" is loaded from memory and from disk
      Then both graphs have exactly the nodes "cart"

  Rule: A built graph cannot be changed, through what it was built from or what it returns

    It keeps a frozen copy of what it is given. What is not JSON data would stay shared with whoever
    passed it, so a graph refuses it.

    Scenario: The nodes and edges it was built from are changed afterwards
      Given a graph built from a node "a" linked to "b" by "uses"
      When the nodes and edges it was built from are changed
      Then the graph still has "a" -uses-> "b", declared twice
      And nothing read from the graph can be changed

    Scenario Outline: An attribute that is not JSON data
      Then no graph can be built from a node whose attribute is <value>

      Examples:
        | value      |
        | a Date     |
        | a Map      |
        | a function |

  Rule: Every element is anchored in the code it describes

    An element that no code stands behind is a diagram that stopped being true.

    Scenario: The elements of sdp's own architecture
      Then the query "element" returns at least 1 result
      And the query "element !<-is- code" returns no results

  Rule: Every annotation in this repository reads

    sdp warns of one it cannot read, and an answer that could miss what it says is incomplete; this
    repository fails its run instead.

    Scenario: Annotations found, none unreadable and none ignored
      Then the query "code -is-> element" returns at least 1 result
      And there are no diagnostics for rule "annotation-unreadable"
      And there are no diagnostics for rule "annotation-ignored"

  Rule: Code in this repository links only to the architecture, and every live feature names the element that realizes it

    Scenario: No code outside the architecture, none linked to anything else, no live feature without an element
      Then the query "code !-is-> element|pattern" returns no results
      And the query "code ?-*-> *[kind!=element|pattern]" returns no results
      And the query "feature[!toCome] !-realized-by-> element" returns no results

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

  @decided-by:free-vocabulary
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
          ["decision", "milestone"].includes(String(node.kind))
        ]
        switch (edge.rel) {
          case "closes":
            break
        }
        """
      When the TypeScript files under "src" are searched for interpreted words
      Then the search finds "src/report.ts:1 phase, src/report.ts:1 iteration, src/report.ts:3 decision, src/report.ts:4 iteration, src/report.ts:6 milestone, src/report.ts:7 activity, src/report.ts:9 decision, src/report.ts:9 milestone, src/report.ts:12 closes"

  @open
  Rule: Which element claims src/model/Diagnostic.ts, src/model/Records.ts, src/model/TagValue.ts and src/model/PackageJson.ts, code no element claims that elements import?

    `sdp arch` shows them under no element, though ten files of seven elements import Diagnostic.ts.
    Candidates that make no cycle: ARCH-graph, which imports nothing, for Diagnostic.ts and the record
    schemas of Records.ts; ARCH-vocabulary for TagValue.ts, which both parsers ask; ARCH-code-annotations
    for PackageJson.ts, which ARCH-workspace already imports. ARCH-checker would make a cycle.

  @open @maturity=idea
  Rule: Does sdp report code that no element claims, now that what elements import is followed through it?

    Followed, it hides no dependency, but it is in no view: `sdp arch` shows no element for it, and
    a change to it reaches the elements that import it unseen. A report would make each such file
    the architect's call, where sdp otherwise never judges what belongs in the architecture.

  @maturity=idea
  Rule: No code compares with a tag sdp interprets, such as `@open`, as a literal either

  @maturity=idea
  Rule: The typecheck fails on an effect that is built and never run, and on an optional property set to undefined

    Plain TypeScript accepts both, and both are bugs in this code.
