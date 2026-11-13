@id=serve-agents
@realized-by:ARCH-application @realized-by:ARCH-reports @realized-by:ARCH-mcp
Feature: Serve AI agents

  An agent needs, in one call, what it takes to change a node safely: its rules first, then what is
  in reach of it, and the steps still to write. Agents that speak the Model Context Protocol get the
  same answers as tools, without a shell.

  Not an agent, and nothing that writes: every tool only reads.

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

  Rule: Reach follows links two hops unless asked otherwise, and never through the plan

    Scenario: Two hops reach an element's neighbour, three its neighbour's, and none an iteration's work
      Given these specs:
        | tags                                                  | Feature  |
        | @id=pay @realized-by:ARCH-payments @iteration:IT-beta | Pay      |
        | @id=IT-beta @kind=iteration                           | Beta     |
        | @id=wishlist @maturity=idea @iteration:IT-beta        | Wishlist |
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

    Scenario: The tools and the server's instructions
      When an agent lists the MCP tools
      Then the MCP tools are "sdp_architecture, sdp_check, sdp_context, sdp_lifecycle, sdp_query, sdp_show, sdp_snippets, sdp_status, sdp_steps"
      And every MCP tool is marked "readOnlyHint, idempotentHint"
      When an agent reads the MCP server's instructions
      Then the output contains 'Code links to the architecture, not to features'
      And the output contains "propose an element, a pattern or an `is` annotation, do not add or remove one yourself"

  Rule: A tool answers what the command of the same name prints, as text or as the same JSON envelope, and an answer that may miss something says so first

    Scenario Outline: Each tool, as text and as JSON
      Given a chain of 14 nodes linked by "next"
      When an agent calls the MCP tool "<tool>" with:
        """
        <arguments>
        """
      Then the output contains '<answer>'

      Examples:
        | tool        | arguments                                 | answer                                     |
        | sdp_context | { "id": "cart" }                          | # cart — Cart                              |
        | sdp_query   | { "expression": "feature", "json": true } | "file": "specs/cart.feature"               |
        | sdp_query   | { "expression": "#N1 -next+-> #N14" }     | incomplete: this answer may miss something |

  Rule: Input a tool cannot use is a tool error that says what it takes, and nothing is ignored

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
