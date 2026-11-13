@id=serve-agents
@realized-by:ARCH-application @realized-by:ARCH-reports @realized-by:ARCH-mcp
Feature: Serve AI agents

  An agent about to change a node did not write what bears on it, and finding that out by reading
  the repository costs more than the change. An agent that speaks the Model Context Protocol may
  have no shell to run sdp from.

  Not an agent: sdp answers, and the agent decides what to change and changes it.

  Background:
    Given a file "specs/cart.feature" containing:
      """
      @id=cart @maturity=draft @realized-by:ARCH-orders
      Feature: Cart

        @decided-by:one-line-per-item
        Rule: A cart holds each item once

          Two lines for one item would be charged twice.

          Scenario: Adding an item twice raises its quantity
            Given an empty cart
            When I add "a lamp" twice
      """
    And a file "specs/one-line-per-item.feature" containing:
      """
      @id=one-line-per-item @kind=decision
      Feature: One line per item

        Not a line per addition: a refund of one of two lines for the same item is a dispute nobody wins.
      """
    And a file "src/orders.ts" containing:
      """
      /**
       * Owns the order aggregate and its transaction boundary.
       *
       * @sdp is ARCH-orders
       */
      export class Orders {}
      """

  Rule: One call gives a node's rules with their state and reason, the links, architecture, decisions and code in reach, and the steps still to write, without running any step file

    An agent that reads the rules first changes what they allow, where one that greps finds the code
    before the reason. Asking is safe on any checkout: a step file is the workspace's code, and
    running it could change files.

    Scenario: The cart, what is in reach of it, and the step still to write
      Given a file "specs/steps/cart.steps.ts" containing:
        """
        import { writeFileSync } from "node:fs"
        import { defineSteps } from "sdp/steps"

        writeFileSync("executed.txt", "this step file ran")

        export default defineSteps(() => ({}), ({ Given }) => {
          Given("an empty cart", () => {})
        })
        """
      When I run "sdp context cart"
      Then the exit code is 0
      And the output contains "Two lines for one item would be charged twice."
      And the output contains "cart -realized-by-> ARCH-orders"
      And the output contains "Owns the order aggregate and its transaction boundary."
      And the output contains "a dispute nobody wins."
      And the output contains "undefined: When I add \"a lamp\" twice"
      And the output does not contain "undefined: Given an empty cart"
      And the file "executed.txt" does not exist

  Rule: The context of a decision lists the rules that rest on it, that of an element the work on it, live and still to come, and a quality requirement in reach comes with its measure

    A change to a decision can break every rule that rests on it, and a change to an element the
    work planned on it. A quality requirement tells an agent nothing without the measure it is held to.

    Scenario Outline: What rests on a decision, the work on an element, and a measure
      Given a file "specs/checkout.feature" containing:
        """
        @id=checkout @realized-by:ARCH-orders
        Feature: Checkout

          @quality
          Rule: A guest pays within two seconds

            Scenario: Paying by card
              When a guest pays by card
              Then the order is confirmed within 2 s
        """
      When I ask for the context of "<id>"
      Then the output section "<section>" contains "<line>"

      Examples:
        | id                | section                       | line                                                                      |
        | one-line-per-item | Rules that rest on this       | [still to come at draft] A cart holds each item once (decided-by) — cart |
        | ARCH-orders       | Work                          | - live: checkout — Checkout                                               |
        | ARCH-orders       | Work                          | - still to come: cart (draft) — Cart                                      |
        | ARCH-orders       | Quality requirements in reach | measure: the order is confirmed within 2 s                                |

  Rule: Reach follows links two hops unless asked otherwise, and never through the plan

    Two hops reach the elements a feature is realized by and what they import; with more, much of
    the graph is in reach of everything. What shares an iteration with a node is planned beside it,
    not built from it.

    Scenario: Two hops reach an element's neighbour, three its neighbour's, and none an iteration's work
      Given these specs:
        | tags                                                    | Feature  |
        | @id=pay @realized-by:ARCH-payments @iteration:IT-beta   | Pay      |
        | @id=IT-beta @kind=iteration                             | Beta     |
        | @id=wishlist @maturity=idea @quality @iteration:IT-beta | Wishlist |
      And a file "src/archive.ts" containing:
        """
        /** @sdp is ARCH-archive */
        export const keep = (): void => {}
        """
      And a file "src/ledger.ts" containing:
        """
        import { keep } from "./archive.ts"

        /** @sdp is ARCH-ledger */
        export const book = (): void => keep()
        """
      And a file "src/payments.ts" containing:
        """
        import { book } from "./ledger.ts"

        /** @sdp is ARCH-payments */
        export const charge = (): void => book()
        """
      When I ask for the context of "pay"
      Then the output section "Architecture within" contains "ARCH-ledger"
      And the output section "Architecture within" does not contain "ARCH-archive"
      And the output does not contain "wishlist"
      When I run "sdp context pay --depth 3"
      Then the output section "Architecture within" contains "ARCH-archive"

  Rule: The MCP server offers one read-only, idempotent tool per question, and instructions that say code links to the architecture and the architecture is the architects' call

    A host may let an agent call a tool that only reads without asking its user each time. An agent
    that reaches sdp over MCP may never read the skill, so the instructions are all it learns of the
    way of working before it edits.

    Scenario: The tools and the server's instructions
      When an agent lists the MCP tools
      Then the MCP tools are "sdp_architecture, sdp_check, sdp_context, sdp_lifecycle, sdp_query, sdp_show, sdp_snippets, sdp_status, sdp_steps"
      And every MCP tool is marked "readOnlyHint, idempotentHint"
      When an agent reads the MCP server's instructions
      Then the output contains 'Code links to the architecture, not to features'
      And the output contains "propose an element, a pattern or an `is` annotation, do not add or remove one yourself"

  Rule: A tool answers what the command of the same name prints, as text or as the same JSON envelope, and an answer that may miss something says so first

    What an agent was told and what a person reads then agree. A tool has no stderr and no exit
    code, so what the command says there comes first in the tool's answer; sdp_snippets, whose name
    no command shares, answers with the module `sdp run <id> --snippets` prints.

    @replaces:serve-agents#each-tool-as-text-and-as-json
    Scenario Outline: Each tool beside its command
      When an agent calls the MCP tool "<tool>" with:
        """
        <arguments>
        """
      Then the answer is what "<command>" prints

      Examples:
        | tool             | arguments                                 | command                      |
        | sdp_status       | { "json": true }                          | sdp status --json            |
        | sdp_query        | { "expression": "feature", "json": true } | sdp q feature --json         |
        | sdp_show         | { "id": "cart", "json": true }            | sdp show cart --json         |
        | sdp_context      | { "id": "cart" }                          | sdp context cart             |
        | sdp_steps        | { "json": true }                          | sdp steps --json             |
        | sdp_check        | { "base": "none", "json": true }          | sdp check --base none --json |
        | sdp_architecture | { "json": true }                          | sdp arch --json              |
        | sdp_lifecycle    | { "json": true }                          | sdp lifecycle --json         |

    Scenario: The definitions still to write, beside the module a run prints
      When an agent calls the MCP tool "sdp_snippets" with:
        """
        { "id": "cart" }
        """
      Then the answer contains the "data.snippets" of what "sdp run cart --snippets --json" prints

    Scenario: An answer that may miss something says so first
      Given a chain of 14 nodes linked by "next"
      When an agent calls the MCP tool "sdp_query" with:
        """
        { "expression": "#N1 -next+-> #N14" }
        """
      Then the output contains 'incomplete: this answer may miss something'

  Rule: Input a tool cannot use is a tool error that says what it takes, and nothing is ignored

    An agent that misspelt an argument and got an answer would trust it as the answer to the
    question it meant to ask.

    Scenario Outline: An unknown id, and a misspelt argument
      When an agent calls the MCP tool "<tool>" with:
        """
        <arguments>
        """
      Then the MCP tool reports an error
      And the output contains '<problem>'

      Examples:
        | tool         | arguments                    | problem       |
        | sdp_snippets | { "id": "carts" }            | no node carts |
        | sdp_context  | { "id": "cart", "depht": 3 } | ["depht"]     |

  @decided-by:files-are-the-source-of-truth
  Rule: Every call reads the workspace afresh, so an agent sees its own edits

    Scenario: A spec added between two calls
      When an agent calls the MCP tool "sdp_query" with:
        """
        { "expression": "feature" }
        """
      Then the output does not contain "pay"
      Given these specs:
        | tags    | Feature |
        | @id=pay | Pay     |
      When an agent calls the MCP tool "sdp_query" with:
        """
        { "expression": "feature" }
        """
      Then the output contains "pay\t"
