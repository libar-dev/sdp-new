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

        Shoppers collect items before paying.

        @decided-by:one-line-per-item
        Rule: A cart holds each item once

          Two lines for one item would be charged twice.

          Scenario: Adding an item twice raises its quantity
            Given an empty cart
            When I add "a lamp" twice
            Then the cart holds 1 item

        Rule: An empty cart cannot be paid

        @open
        Rule: Does a cart expire?
      """
    And a file "specs/one-line-per-item.feature" containing:
      """
      @id=one-line-per-item @kind=decision
      Feature: One line per item

        Not a line per addition, although it is simpler: the payment provider charges per line, and
        a refund of one of two lines for the same item is a dispute nobody wins.
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

  Rule: One call gives a node's rules with their state and reason, then the links, architecture, decisions and code in reach, each in its own words

    Scenario: The spec, and what is in reach of it
      When I run "sdp context cart"
      Then the exit code is 0
      And the output contains "A cart holds each item once"
      And the output contains "Two lines for one item would be charged twice."
      And the output contains "cart -realized-by-> ARCH-orders"
      And the output contains "Owns the order aggregate and its transaction boundary."
      And the output contains "a dispute nobody wins."
      And the output contains "src/orders.ts:6"
      When I ask for the context of "one-line-per-item"
      Then the output contains "A cart holds each item once"

  Rule: The steps still to write are listed without running any step file

    Asking must be safe: no question runs the workspace's code.

    Scenario Outline: Over MCP, a step file that would write a file if it ran is read and not run
      Given a file "specs/steps/cart.steps.ts" containing:
        """
        import { writeFileSync } from "node:fs"
        import { defineSteps } from "sdp/steps"

        writeFileSync("executed.txt", "this step file ran")

        export default defineSteps(() => ({}), ({ Given }) => {
          Given("an empty cart", () => {})
        })
        """
      When an MCP client of "sdp mcp" calls "<tool>" with:
        """
        { "id": "cart" }
        """
      Then the output contains "undefined: When I add \"a lamp\" twice"
      And the output does not contain "undefined: Given an empty cart"
      And the file "executed.txt" does not exist

      Examples:
        | tool         |
        | sdp_context  |
        | sdp_snippets |

  Rule: Reach follows links, two hops unless asked otherwise, and never through the plan

    What shares an iteration with a node is planned alongside it, not part of its context.

    Scenario: Two hops reach an element's pattern and neighbour, three its neighbour's, and none an iteration's work
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
      And a file "src/saga.ts" containing:
        """
        /** @sdp is PAT-saga */
        export const compensate = (): void => {}
        """
      And a file "src/payments.ts" containing:
        """
        import { book } from "./ledger.ts"

        /**
         * @sdp is ARCH-payments
         * @sdp applies PAT-saga
         */
        export const charge = (): void => book()
        """
      When I ask for the context of "pay"
      Then the output section "Relationships" contains "pay -iteration-> IT-beta"
      And the output section "Architecture within" contains "ARCH-ledger"
      And the output section "Architecture within" contains "PAT-saga"
      And the output section "Architecture within" does not contain "ARCH-archive"
      And the output does not contain "wishlist"
      When I run "sdp context pay --depth 3"
      Then the output section "Architecture within" contains "ARCH-archive"

  Rule: The MCP server offers one tool per question, each read-only and idempotent, so a client can call it without asking

    Scenario: The tools
      When an agent lists the MCP tools
      Then the MCP tools are "sdp_architecture, sdp_check, sdp_context, sdp_lifecycle, sdp_query, sdp_show, sdp_snippets, sdp_status, sdp_steps"
      And every MCP tool is marked "readOnlyHint, idempotentHint"

  Rule: A tool answers what the command of the same name prints: the same text, or with json the same envelope

    The same code answers both, so a tool and its command never differ in what they accept or in
    what they make of a workspace that cannot be fully read.

    Scenario Outline: Each tool, as text and as JSON
      When an agent calls the MCP tool "<tool>" with:
        """
        <arguments>
        """
      Then the output contains '<answer>'

      Examples:
        | tool        | arguments                                   | answer                                           |
        | sdp_status  | {}                                          | stages        draft 1                            |
        | sdp_query   | { "expression": "feature[maturity=draft]" } | cart\tfeature\tdraft\tCart\tspecs/cart.feature:1 |
        | sdp_query   | { "expression": "feature", "json": true }   | "file": "specs/cart.feature"                     |
        | sdp_context | { "id": "cart" }                            | # cart — Cart                                    |
        | sdp_check   | { "json": true }                            | "data": []                                       |

  Rule: The server's instructions teach that code links to the architecture, and that the architecture is the architects' call

    An agent connected over MCP may read nothing else about sdp before it acts.

    Scenario: The server's instructions
      When an agent reads the MCP server's instructions
      Then the output contains 'Code links to the architecture, not to features'
      And the output contains "propose an element, a pattern or an `is` annotation, do not add or remove one yourself"

  Rule: A tool has no stderr and no exit code, so an answer that may miss something says so first

    Scenario Outline: Cut short by a limit, as text and as JSON
      Given a chain of 14 nodes linked by "next"
      When an agent calls the MCP tool "sdp_query" with:
        """
        <arguments>
        """
      Then the output contains '<first>'
      And the output contains '<note>'

      Examples:
        | arguments                                           | first                                      | note                                                   |
        | { "expression": "#N1 -next+-> #N14" }               | incomplete: this answer may miss something | note: cut short: a + edge reaches further than 12 hops |
        | { "expression": "#N1 -next+-> #N14", "json": true } | "complete": false                          | "cut short: a + edge reaches further than 12 hops"     |

  Rule: Input a tool cannot use is a tool error that says what it takes, and nothing is ignored

    A misspelt argument that was ignored would answer another question than the one asked.

    Scenario Outline: An unknown id, and an argument that is misspelt or out of range
      When an agent calls the MCP tool "<tool>" with:
        """
        <arguments>
        """
      Then the MCP tool reports an error
      And the output contains '<problem>'

      Examples:
        | tool         | arguments                    | problem                                  |
        | sdp_snippets | { "id": "carts" }            | no node carts; closest: cart             |
        | sdp_context  | { "id": "cart", "depht": 3 } | ["depht"]                                |
        | sdp_context  | { "id": "cart", "depth": 9 } | depth must be a whole number from 1 to 6 |

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
