@id=GUIDE @kind=guide
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

  Rule: A milestone is met by what ran, not by a status or a date

    Scenario: A gate that passes once the requirement's steps are written
      Given a file "specs/REQ-search.feature" containing:
        """
        @id=REQ-search @maturity=specified
        Feature: Search

          Rule: A product is found by its name

            Scenario: Find by name
              When I search for "lamp"
              Then I see 1 product
        """
      And a file "specs/MS-beta.feature" containing:
        """
        @id=MS-beta
        Feature: Beta

          Rule: Every requirement works

            Scenario: Nothing is unverified
              Then the query "requirement[stage!=verified]" returns no results
        """
      When I run "sdp gate MS-beta"
      Then the exit code is 1
      Given a file "specs/steps/search.steps.ts" containing:
        """
        import { defineSteps } from "sdp/steps"

        export default defineSteps(() => ({ found: 0 }), ({ When, Then }) => {
          When("I search for {string}", ({ world, args: [name] }) => {
            world.found = name === "lamp" ? 1 : 0
          })
          Then("I see {int} product", ({ world, args: [count] }) => {
            if (world.found !== count) throw new Error(`found ${world.found}`)
          })
        })
        """
      When I run "sdp run"
      Then the exit code is 0
      When I run "sdp gate MS-beta"
      Then the exit code is 0

  Rule: The architecture is what an architect declares, with what shaped it

    examples/shop is a small product specified this way: one of its modules is anchored as an
    element, and the rest of its code stays out of the architecture.

    Scenario: The architecture of the shop example
      Given the workspace is a copy of "examples/shop"
      When I run "sdp arch"
      Then the output contains "ARCH-pricing"
      And the output contains "DEC-integer-cents"
      And the output contains "NFR-pricing-latency"
      And the output does not contain "src/cart.ts"

  Rule: A repository of your own starts with sdp init

    Scenario: Start in a repository of your own
      When I run "sdp init"
      Then the output contains "created sdp.config.yaml"
      When I run "sdp new idea 'Gift wrapping'"
      Then the output contains "REQ-gift-wrapping"
      When I run "sdp new decision 'Use Postgres for orders'"
      Then the output contains "DEC-use-postgres-for-orders"
      When I run "sdp check"
      Then the exit code is 0
      When I run "sdp q 'requirement[maturity=idea]' --ids"
      Then the output contains "REQ-gift-wrapping"

  Rule: The sources run as they are, with no build step

    Node.js 24 or later runs the TypeScript sources of this repository: an agent that edits one
    runs the result with the next command, and there is no stale `dist/` to forget.

    Scenario: The entry points of a checkout with no build output
      Given this repository has no build output
      When a fresh Node process imports "sdp/steps"
      Then the output contains "/src/steps.ts"
      When I run "node bin/sdp.js --version" in the repository
      Then the exit code is 0

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
        | ARCH   | element     |
        | PAT    | pattern     |
        | MS     | milestone   |
        | IT     | iteration   |

  Rule: A spec is a feature file; Markdown is only for the pages sdp does not read

    A rule written in Markdown is in no graph, no run and no check, so it counts for nothing.

    Scenario: The Markdown files of this repository, the example's included
      When I run "find . -name '*.md' -not -path './node_modules/*' -not -path './.git/*'" in the repository
      Then the output lines are "./README.md, ./AGENTS.md, ./CLAUDE.md, ./.claude/skills/sdp/SKILL.md, ./examples/shop/README.md"

  Rule: What is built is in specs/features, and what is still to come is in specs/incoming

    So the folder alone tells what sdp does from what it might do. A feature in specs/features is
    its own test: every rule has an example and none is open. A change names the feature it changes,
    and is deleted once its rules have joined that feature.

    Scenario: Where each spec of this repository is
      Then the query "requirement|nfr|feature[file~^specs/features/][maturity!=ready]" returns no results
      And the query "requirement|nfr|feature|change[file!~^specs/(features|incoming)/]" returns no results
      And the query "change[file!~^specs/incoming/]" returns no results
      And the query "change !-changes-> *[file~^specs/features/]" returns no results
      And the query "element|pattern[file!~^specs/architecture/]" returns no results

  Rule: A decision is in specs/decisions, and only what no feature's rule can hold is one

    A decision is hard to reverse, surprising without context and a real trade-off, and it spans
    features. A reason that concerns one feature is written under the rule it explains.

    Scenario: The decisions of this repository
      Then the query "decision[file!~^specs/decisions/]" returns no results
      And the query "*[file~^specs/decisions/][kind!=decision]" returns no results

  @open
  Rule: Does a Markdown file where specs live make every answer incomplete, as a spec that cannot be read does, or is the warning from sdp check enough?

    The final review found that today only `sdp check` says so: a query of the same workspace is
    complete and carries no note, so an agent that never runs check never hears of the file.
