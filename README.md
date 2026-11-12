---
id: README
kind: guide
title: sdp
links:
  introduces: [VISION, CAP-living-specs, CAP-curated-architecture, CAP-agent-collaboration]
---

# sdp

Requirements, decisions, architecture and the delivery plan as **one graph of plain files**:
written in Markdown, run as tests, read as data — by people and by AI agents alike.

This page is a spec too. `npm run verify` runs each scenario below with the real `sdp`, in an
empty directory, so what you read here is what the tool does.

## A spec is a file that runs

~~~gherkin
Scenario: A requirement goes from specified to verified without leaving its file
  Given a file "specs/REQ-guest-checkout.md" containing:
    """
    ---
    id: REQ-guest-checkout
    maturity: specified
    ---
    # Guest checkout

    Shoppers without an account can buy.

    ```gherkin
    Scenario: Guest pays by card
      Given a cart with 2 items
      When the guest pays with a valid card
      Then an order is created
    ```
    """
  When I run "sdp run"
  Then the exit code is 0
  And the output contains "1 scenario(s): 1 undefined"
  Given a file "specs/steps/checkout.steps.ts" containing:
    """
    import { defineSteps } from "sdp/steps"

    export default defineSteps(() => ({ items: 0, order: false }), ({ Given, When, Then }) => {
      Given("a cart with {int} items", ({ world, args: [items] }) => {
        world.items = items
      })
      When("the guest pays with a valid card", ({ world }) => {
        world.order = world.items > 0
      })
      Then("an order is created", ({ world }) => {
        if (!world.order) throw new Error("no order")
      })
    })
    """
  When I run "sdp run"
  Then the output contains "1 scenario(s): 1 passed"
  When I run "sdp q 'requirement[stage=verified]' --ids"
  Then the output contains "REQ-guest-checkout"
~~~

Front matter says what the file is, prose says why, Gherkin says what must be true. While the
behaviour is not built its steps are *undefined*, which is not a failure, and nobody ever writes
"done": `verified` is derived from the run. A one-line idea is the same kind of file with less in
it ([living specifications](specs/capabilities/CAP-living-specs.md)).

## The graph is data

Every spec, link and scenario is a node or an edge that knows the `file:line` it came from. Ask
with grep, with jq over `sdp graph` — one record per line — or with a one-line query. The three
agree, because each reads the files:

~~~gherkin
Scenario: grep, jq and sdp q give the same answer
  Given a file "specs/REQ-guest-checkout.md" containing:
    """
    ---
    id: REQ-guest-checkout
    links: { decided-by: DEC-0001 }
    ---
    # Guest checkout
    """
  And a file "specs/DEC-0001.md" containing:
    """
    ---
    id: DEC-0001
    ---
    # Pay without an account
    """
  When I run "grep -rl DEC-0001 specs"
  Then the output contains "specs/REQ-guest-checkout.md"
  When I run the pipeline:
    """
    sdp graph | jq -r 'select(.rel == "decided-by" and .to == "DEC-0001") | .from'
    """
  Then the output contains "REQ-guest-checkout"
  When I run "sdp q '#DEC-0001 <-decided-by- *' --ids"
  Then the output contains "REQ-guest-checkout"
~~~

`sdp context <id>` gathers everything about one node into one Markdown document, and `sdp mcp`
serves the same answers to an MCP client
([agent collaboration](specs/capabilities/CAP-agent-collaboration.md)).

## The architecture is what an architect declares

[examples/shop](examples/shop) is a small product specified this way. One of its modules is
anchored as an element; the rest of its code stays out of the architecture:

~~~gherkin
Scenario: The architecture view holds what was declared, with what shaped it
  Given the workspace is a copy of "examples/shop"
  When I run "sdp arch"
  Then the output contains "ARCH-pricing"
  And the output contains "DEC-0001"
  And the output contains "NFR-pricing-latency"
  And the output does not contain "src/cart.ts"

Scenario: The shop example verifies itself
  Given the workspace is a copy of "examples/shop"
  When I run "sdp run"
  Then the exit code is 0
  And the output contains "4 scenario(s): 3 passed, 1 undefined"
~~~

sdp never computes or suggests what belongs there
([curated architecture](specs/capabilities/CAP-curated-architecture.md)).

## Try it

Node.js 24 or later; the sources run as they are, with no build step. The piped example above
also needs `jq`.

```sh
npm install
npm run verify                    # typecheck, sdp check, and every scenario of this repository
node src/cli/main.ts status       # `sdp` is this, or `npm link` once
node src/cli/main.ts --help       # every command, one line each
```

~~~gherkin
Scenario: Start in a repository of your own
  When I run "sdp init"
  Then the output contains "created sdp.config.yaml"
  When I run "sdp new idea 'Gift wrapping'"
  Then the output contains "REQ-gift-wrapping"
  When I run "sdp new decision 'Use Postgres for orders'"
  Then the output contains "DEC-0001"
  When I run "sdp check"
  Then the exit code is 0
  When I run "sdp q 'requirement[maturity=idea]' --ids"
  Then the output contains "REQ-gift-wrapping"
~~~

To serve a workspace to an MCP client:

```json
{ "mcpServers": { "sdp": { "command": "node", "args": ["/path/to/sdp/src/cli/main.ts", "-C", "/path/to/workspace", "mcp"] } } }
```

## Where to go from here

This repository specifies itself, and there are no other tests: every check of sdp is a scenario
in one of its specs. Follow the links rather than a table of contents:

- why sdp exists and what it holds to: [specs/VISION.md](specs/VISION.md)
- what every command promises: [REQ-cli](specs/requirements/REQ-cli.md); what it takes: `--help`
- working with sdp, for agents and people: [the skill](.claude/skills/sdp/SKILL.md), and
  [AGENTS.md](AGENTS.md) for what is specific to this repository
- everything around one node: `node src/cli/main.ts context REQ-graph-query`
- the plan and where it stands: `node src/cli/main.ts lifecycle`
