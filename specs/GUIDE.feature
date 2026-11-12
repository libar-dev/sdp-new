@id=GUIDE @kind=guide
@introduces:VISION @introduces:CAP-living-specs @introduces:CAP-curated-architecture @introduces:CAP-agent-collaboration
Feature: sdp, shown by running it

  What README.md promises a reader and AGENTS.md asks of an agent in this repository, as scenarios
  that run. sdp reads neither file, so what they say counts only where a scenario here pins it.

  Rule: A spec is a file that runs, and nobody writes that it is done

    While the behaviour is not built its steps are undefined, which is not a failure; verified is
    derived from the run.

    Scenario: A requirement goes from specified to verified without leaving its file
      Given a file "specs/REQ-guest-checkout.feature" containing:
        """
        @id=REQ-guest-checkout @maturity=specified
        Feature: Guest checkout

          Shoppers without an account can buy.

          Rule: A guest pays without creating an account

            Scenario: Guest pays by card
              Given a cart with 2 items
              When the guest pays with a valid card
              Then an order is created
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

    Scenario: The shop example verifies itself
      Given the workspace is a copy of "examples/shop"
      When I run "sdp run"
      Then the exit code is 0
      And the output contains "4 scenario(s): 3 passed, 1 undefined"

  Rule: The graph is data: grep, jq and a query give the same answer

    Each reads the files, and every node and link knows the file and line it came from.

    Scenario: The specs a decision constrains
      Given these specs:
        | tags                                        | Feature                |
        | @id=REQ-guest-checkout @decided-by:DEC-0001 | Guest checkout         |
        | @id=DEC-0001                                | Pay without an account |
      When I run "grep -rl ':DEC-0001' specs"
      Then the output contains "specs/REQ-guest-checkout.feature"
      When I run the pipeline:
        """
        sdp graph | jq -r 'select(.rel == "decided-by" and .to == "DEC-0001") | .from'
        """
      Then the output contains "REQ-guest-checkout"
      When I run "sdp q '#DEC-0001 <-decided-by- *' --ids"
      Then the output contains "REQ-guest-checkout"

  Rule: The architecture is what an architect declares, with what shaped it

    examples/shop is a small product specified this way: one of its modules is anchored as an
    element, and the rest of its code stays out of the architecture.

    Scenario: The architecture of the shop example
      Given the workspace is a copy of "examples/shop"
      When I run "sdp arch"
      Then the output contains "ARCH-pricing"
      And the output contains "DEC-0001"
      And the output contains "NFR-pricing-latency"
      And the output does not contain "src/cart.ts"

  Rule: A repository of your own starts with sdp init

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

  Rule: In this repository a word means one thing, and so does an id's prefix

    So grep finds a thing under one name, and an id says what kind of thing it is.

    Scenario: A word this repository replaced does not come back
      When I run "grep -rnE '[Mm]aturity gates?|NFR[s]|(draft|specified|ready).? gate' README.md AGENTS.md .claude specs src examples" in the repository
      Then the exit code is 1

    Scenario Outline: An id with a prefix is of that prefix's kind, and the other way round
      Then every node matching "*[id~^<prefix>-[^#]*$]" also matches "<kind>"
      And every node matching "<kind>" also matches "*[id~^<prefix>-]"

      Examples:
        | prefix | kind        |
        | REQ    | requirement |
        | NFR    | nfr         |
        | DEC    | decision    |
        | ARCH   | element     |
        | PAT    | pattern     |
        | MS     | milestone   |
        | CAP    | capability  |
        | RISK   | risk        |
        | PH     | phase       |

  Rule: A spec is a feature file; Markdown is only for the pages sdp does not read

    A rule written in Markdown is in no graph, no run and no check, so it counts for nothing.

    Scenario: The Markdown files of this repository, the example's included
      When I run "find . -name '*.md' -not -path './node_modules/*' -not -path './.git/*'" in the repository
      Then the output lines are "./README.md, ./AGENTS.md, ./CLAUDE.md, ./.claude/skills/sdp/SKILL.md, ./examples/shop/README.md"

  @open
  Rule: Does a Markdown file where specs live make every answer incomplete, as a spec that cannot be read does, or is the warning from sdp check enough?

    The final review found that today only `sdp check` says so: a query of the same workspace is
    complete and carries no note, so an agent that never runs check never hears of the file.
