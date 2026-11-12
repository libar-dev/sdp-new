@id=serve-agents @maturity=ready
@realized-by:ARCH-reports @realized-by:ARCH-mcp
Feature: Serve AI agents

  AI agents work on specifications as much as people do. Before they change a node they need, in
  one call rather than a dozen greps, everything required to change it safely: its contract first,
  what is in reach of it, and the steps still to write. Agents that speak the Model Context
  Protocol need the same answers as tools, without a shell: `sdp mcp` serves them on stdio, reads
  the workspace afresh on every call and never runs its code.

  Not an agent, and nothing that writes: every tool only reads. An agent with a shell needs no
  server; the command line and grep answer it the same.

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
      import { annotate } from "sdp/annotations"

      /** Owns the order aggregate and its transaction boundary. */
      export class Orders {}
      annotate(Orders, { is: "ARCH-orders" })
      """

  Rule: One call gives everything needed to work on a node, its contract first

    For a spec that is built, the names of its scenarios are the reference and its text explains
    them, so the bundle leads with them; what is in reach follows, so nothing needs a second search.

    Scenario: The spec, its links, and the architecture, decisions and code in reach
      When I run "sdp context cart"
      Then the output contains "kind: feature, maturity: draft  ·  source: specs/cart.feature:1"
      And the sections of the output are "Not ready yet, Contract, Step definitions, Specification, Relationships, Architecture within 2 hops, Decisions in reach, Code"
      And the output section "Relationships" contains "cart -realized-by-> ARCH-orders (element)"
      And the output does not contain "ARCH-orders — ARCH-orders"
      And the output section "Code" contains "src/orders.ts:4 Orders — is ARCH-orders"

    Scenario: Each rule with its state, what it rests on and why it holds, then its examples
      When I ask for the context of "cart"
      Then the output contains:
        """
        3 rule(s), 1 scenario(s), 1 open

        ### A cart holds each item once
        [unrun] — specs/cart.feature:7 · decided-by one-line-per-item

        Two lines for one item would be charged twice.

        - [unrun] Adding an item twice raises its quantity — specs/cart.feature:11

        ### An empty cart cannot be paid
        [no example] — specs/cart.feature:16

        ### Does a cart expire?
        [open] — specs/cart.feature:19
        """
      And the output contains:
        """
        Shoppers collect items before paying.

          Scenario: Adding an item twice raises its quantity
            Given an empty cart
        """
      And the output section "Specification" does not contain "Rule:"
      When I ask for the context of "one-line-per-item"
      Then the output section "Rules that rest on this" contains "- [unrun] A cart holds each item once (decided-by) — cart specs/cart.feature:7"

  Rule: The bundle lists the steps still to write, before a run and after one, and runs no step file to know

    Asking must be safe: a step file is read as text, so no question runs the workspace's code.
    sdp_snippets lists the same steps, with a module to save their definitions in.

    Scenario: Before any run, each step without a definition, a definition to start from, and the step files to add it to
      Given a file "specs/steps/cart.steps.ts" containing:
        """
        import { defineSteps } from "sdp/steps"

        export default defineSteps(() => ({}), ({ Given }) => {
          Given("an empty cart", () => {})
        })
        """
      When I run "sdp context cart"
      Then the output section "Contract" contains "[unrun] Adding an item twice raises its quantity — specs/cart.feature:11"
      And the output section "Contract" contains 'suggested: `When("I add {string} twice", ({ world, args: [string] }) => pending())`'
      And the output section "Contract" does not contain "an empty cart"
      And the output section "Step definitions" contains "Step files: specs/steps/cart.steps.ts"

    Scenario: After a run, each scenario has its status and only the steps still undefined are listed
      Given a step definition "an empty cart" that passes
      When the workspace is run
      And I ask for the context of "cart"
      Then the output section "Contract" contains "[undefined] Adding an item twice raises its quantity — specs/cart.feature:11"
      And the output section "Contract" contains "undefined: When I add \"a lamp\" twice"
      And the output section "Contract" contains 'suggested: `Then("the cart holds {int} item", ({ world, args: [int] }) => pending())`'
      And the output section "Contract" does not contain "an empty cart"

    Scenario: A step that failed in the last run comes with its error and where it is defined
      Given a file "specs/steps/cart.steps.ts" containing:
        """
        import { defineSteps } from "sdp/steps"

        export default defineSteps(() => ({}), ({ Given }) => {
          Given("an empty cart", () => {
            throw new Error("the cart service is down")
          })
        })
        """
      When I run "sdp run"
      Then the exit code is 1
      When I run "sdp context cart"
      Then the output section "Contract" contains "- [failed] Adding an item twice raises its quantity — specs/cart.feature:11"
      And the output section "Contract" contains "failed: Given an empty cart — the cart service is down (defined at specs/steps/cart.steps.ts:4)"

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
        | tags                                                              | Feature  |
        | @id=pay @realized-by:ARCH-payments @iteration:IT-beta             | Pay      |
        | @id=ARCH-payments @instance-of:PAT-saga @publishes-to:ARCH-ledger | Payments |
        | @id=ARCH-ledger @replicates-to:ARCH-archive                       | Ledger   |
        | @id=ARCH-archive                                                  | Archive  |
        | @id=PAT-saga                                                      | Saga     |
        | @id=IT-beta @kind=iteration                                       | Beta     |
        | @id=ARCH-search @iteration:IT-beta                                | Search   |
      When I ask for the context of "pay"
      Then the output section "Relationships" contains "pay -iteration-> IT-beta"
      And the output section "Architecture within" contains "ARCH-ledger"
      And the output section "Architecture within" contains "PAT-saga"
      And the output section "Architecture within" does not contain "ARCH-archive"
      And the output does not contain "ARCH-search"
      When I run "sdp context pay --depth 3"
      Then the output section "Architecture within" contains "ARCH-archive"

  Rule: What is in reach comes with its own words, so none of it needs opening

    Scenario: An element by the code anchored to it, a quality requirement by its measure, a decision whole
      Given a file "specs/cart-latency.feature" containing:
        """
        @id=cart-latency @constrains:cart
        Feature: Cart latency

          @type=quality
          Rule: The cart keeps up with load

            Scenario: Adding under load
              Given 500 shoppers adding items at once
              When a shopper adds an item
              Then the cart shows it within 300 ms at p95
              And no item is lost
        """
      When I ask for the context of "cart"
      Then the output contains:
        """
        - ARCH-orders (element)
        Owns the order aggregate and its transaction boundary.
        """
      And the output section "Quality requirements" contains "The cart keeps up with load (rule)"
      And the output section "Quality requirements" contains "measure: the cart shows it within 300 ms at p95; no item is lost"
      And the output section "Decisions" contains "Not a line per addition, although it is simpler"
      And the output section "Decisions" contains "a dispute nobody wins."

  Rule: A spec below ready says what it lacks for ready, or that it lacks nothing

    Scenario Outline: What keeps a spec from ready, and a spec ready in all but name
      Given a file "specs/pay.feature" containing:
        """
        @id=pay @maturity=draft
        Feature: Pay

          Shoppers pay for their cart.

          Rule: A payment creates an order

            Scenario: Pay by card
              Then an order is created
        """
      When I ask for the context of "<spec>"
      Then the output section "Not ready yet" contains '<says>'

      Examples:
        | spec | says                                                     |
        | cart | 1 open question(s), e.g. "Does a cart expire?" (line 19) |
        | pay  | already meets the criteria of ready                      |

  Rule: The MCP server offers one tool per question, each read-only and idempotent, so a client can call it without asking

    Scenario: The tools
      When an agent lists the MCP tools
      Then the MCP tools are "sdp_architecture, sdp_check, sdp_context, sdp_lifecycle, sdp_query, sdp_show, sdp_snippets, sdp_status, sdp_steps"
      And every MCP tool is marked "readOnlyHint, idempotentHint"

  Rule: A tool answers what the command of the same name prints: the same text, or with json the same envelope

    The same code answers both, so a tool and its command never differ in what they accept, in their
    limits or in what they make of a workspace that cannot be fully read. An answer with nothing in
    it says so.

    Scenario Outline: Each tool, as text and as JSON
      When an agent calls the MCP tool "<tool>" with:
        """
        <arguments>
        """
      Then the output contains '<answer>'

      Examples:
        | tool             | arguments                                             | answer                                                      |
        | sdp_status       | {}                                                    | stages        draft 1                                       |
        | sdp_status       | { "json": true }                                      | "feature": 1                                                |
        | sdp_query        | { "expression": "feature[maturity=draft]" }           | cart\tfeature\tdraft\tCart\tspecs/cart.feature:1            |
        | sdp_query        | { "expression": "feature -*-> *", "paths": true }     | cart -realized-by-> ARCH-orders                             |
        | sdp_query        | { "expression": "feature -realised-by-> *" }          | note: no relation realised-by; closest: realized-by\nnothing |
        | sdp_query        | { "expression": "feature", "json": true }             | "file": "specs/cart.feature"                                |
        | sdp_show         | { "id": "cart" }                                      | -realized-by-> ARCH-orders                                  |
        | sdp_show         | { "id": "cart", "json": true }                        | "rel": "realized-by"                                        |
        | sdp_context      | { "id": "cart" }                                      | # cart — Cart                                               |
        | sdp_snippets     | { "id": "cart" }                                      | cart: 3 step(s) without exactly one definition (no step files yet) |
        | sdp_snippets     | { "id": "ARCH-orders" }                               | ARCH-orders has no scenarios                                |
        | sdp_steps        | { "text": "returns no results" }                      | \tThen\tthe query {string} returns no results               |
        | sdp_steps        | { "text": "returns no results", "json": true }        | "keyword": "Then"                                           |
        | sdp_check        | {}                                                    | info  [maturity-promotable] cart                            |
        | sdp_check        | { "json": true }                                      | "rule": "maturity-promotable"                               |
        | sdp_architecture | {}                                                    | Architecture: 1 node(s)                                     |
        | sdp_architecture | { "json": true }                                      | "architecture": [                                           |
        | sdp_lifecycle    | {}                                                    | No plan yet                                                 |
        | sdp_lifecycle    | { "json": true }                                      | "phases": []                                                |

  Rule: The server's instructions teach that code links to the architecture, and that the architecture is the architects' call

    An agent connected over MCP may read nothing else about sdp before it acts, and which parts of a
    system are significant is a judgement, not a metric of the code.

    Scenario: The server's instructions
      When an agent reads the MCP server's instructions
      Then the output contains 'Code links to the architecture, not to features'
      And the output contains '`annotate(Orders, { is: "ARCH-orders" })` imported from "sdp/annotations"'
      And the output contains "other languages use a comment line, `// @sdp is ARCH-orders`"
      And the output contains "`feature -realized-by-> element <-is- code`"
      And the output contains "propose an element, a pattern or an `is` annotation, do not add or remove one yourself"
      And the output does not contain "implements"

  Rule: A tool has no stderr and no exit code, so an answer that may miss something says so first

    Scenario Outline: Cut short by a limit, or from a workspace not read whole, as text and as JSON
      Given a chain of 14 nodes linked by "next"
      And a file "specs/broken.feature" containing:
        """
        @id=broken @owner=Two words
        Feature: A feature sdp cannot read
        """
      When an agent calls the MCP tool "<tool>" with:
        """
        <arguments>
        """
      Then the output contains:
        """
        <first>
        <then>
        """
      And the output contains '<note>'

      Examples:
        | tool        | arguments                                           | first                                      | then       | note                                                    |
        | sdp_query   | { "expression": "#N1 -next+-> #N14" }               | incomplete: this answer may miss something | note:      | note: cut short: a + edge reaches further than 12 hops  |
        | sdp_context | { "id": "cart" }                                    | incomplete: this answer may miss something | note:      | note: not read: specs/broken.feature:1 [gherkin-syntax] |
        | sdp_query   | { "expression": "#N1 -next+-> #N14", "json": true } | "complete": false                          | "notes": [ | "cut short: a + edge reaches further than 12 hops"      |

  Rule: Input a tool cannot use is a tool error that says what it takes, and nothing is ignored

    A misspelt argument that was ignored would answer another question than the one asked, and the
    agent could not tell.

    Scenario: A malformed query comes back as a tool error that teaches the syntax
      When an agent calls the MCP tool "sdp_query" with:
        """
        { "expression": "feature[" }
        """
      Then the MCP tool reports an error
      And the output contains "query error"
      And the output contains "SDPQ path patterns"
      And the output does not contain '"query error'

    Scenario Outline: An unknown id, and an argument that is misspelt, out of range or not the tool's
      When an agent calls the MCP tool "<tool>" with:
        """
        <arguments>
        """
      Then the MCP tool reports an error
      And the output contains '<problem>'

      Examples:
        | tool         | arguments                      | problem                                  |
        | sdp_snippets | { "id": "carts" }              | no node carts; closest: cart             |
        | sdp_context  | { "id": "cart", "depht": 3 }   | ["depht"]                                |
        | sdp_context  | { "id": "cart", "depth": 9 }   | depth must be a whole number from 1 to 6 |
        | sdp_context  | { "id": "cart", "depth": 1.5 } | ["depth"]                                |
        | sdp_context  | { "id": "cart", "json": true } | ["json"]                                 |

  @decided-by:files-are-the-source-of-truth
  Rule: Every call reads the workspace afresh, step files too, so an agent sees its own edits

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

    Scenario: A step definition added between two calls to a running server
      Given a file "specs/steps/cart.steps.ts" containing:
        """
        import { defineSteps } from "sdp/steps"

        export default defineSteps(() => ({}), ({ Given }) => {
          Given("an empty cart", () => {})
        })
        """
      When an agent calls the MCP tool "sdp_snippets" on the workspace directory with:
        """
        { "id": "cart" }
        """
      Then the output contains "cart: 2 step(s) without exactly one definition"
      When a file "specs/steps/cart.steps.ts" containing:
        """
        import { defineSteps } from "sdp/steps"

        export default defineSteps(() => ({}), ({ Given, When, Then }) => {
          Given("an empty cart", () => {})
          When("I add {string} twice", () => {})
          Then("the cart holds {int} item", () => {})
        })
        """
      And an agent calls the MCP tool "sdp_snippets" on the workspace directory with:
        """
        { "id": "cart" }
        """
      Then the output contains "every step of cart has exactly one definition (step files: specs/steps/cart.steps.ts)"
