@id=GUIDE @kind=guide
Feature: sdp, shown by running it

  What README.md promises a reader and AGENTS.md asks of an agent in this repository, as scenarios
  that run. sdp reads neither file, so what they say counts only where a scenario here pins it.

  Rule: A spec says how far it has come while it is still to come, and once it is live its run says whether it works

    While a feature is still to come, its maturity is the team's judgement, and its examples run and
    fail no run. Once it is built its maturity is deleted: it is live, its examples must pass, and
    verified is derived from the run, never written.

    Scenario: A feature goes from specified to verified without leaving its file
      Given a file "specs/guest-checkout.feature" containing:
        """
        @id=guest-checkout @maturity=specified
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
      And the output contains "1 scenario(s) of work still to come, none of which fails the run: 1 undefined"
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
      Then the output contains "guest-checkout is still to come, and every example of it passes: make it live, delete @maturity=specified at specs/guest-checkout.feature:1"
      Given a file "specs/guest-checkout.feature" containing:
        """
        @id=guest-checkout
        Feature: Guest checkout

          Shoppers without an account can buy.

          Rule: A guest pays without creating an account

            Scenario: Guest pays by card
              Given a cart with 2 items
              When the guest pays with a valid card
              Then an order is created
        """
      When I run "sdp q 'feature[stage=verified]' --ids"
      Then the output lines are "guest-checkout"

    Scenario: The shop example verifies itself
      Given the workspace is a copy of "examples/shop"
      When I run "sdp run"
      Then the exit code is 0
      And the output contains "3 scenario(s): 3 passed"
      And the output contains "1 scenario(s) of work still to come, none of which fails the run: 1 undefined"

  Rule: A milestone is met by what ran, not by a status or a date

    Scenario: A gate that passes once the feature's steps are written
      Given a file "specs/search.feature" containing:
        """
        @id=search
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

          Rule: Every feature works

            Scenario: Nothing is unverified
              Then the query "feature[stage!=verified]" returns no results
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

  Rule: The architecture is what an architect anchors in the code, with the decisions that shaped it

    examples/shop is a small product specified this way: one of its modules is anchored as an
    element, whose doc comment says what it is for and whose exports are its surface, and the rest
    of its code stays out of the architecture. A decision shapes the element through the rules of
    its features that rest on it, and the features built on it are its work.

    Scenario: The architecture of the shop example
      Given the workspace is a copy of "examples/shop"
      When I run "sdp arch"
      Then the exit code is 0
      And the output contains:
        """
        ARCH-pricing (element)
        Prices, VAT rates and rounding: every monetary figure flows through here
        ARCH-pricing <-is- code:src/pricing.ts
        type Cents = number
        const vatRates: Readonly<Record<string, number>>
        function vatFor(net: Cents, country: string): Cents
        cart-totals#the-total-of-a-thousand-line-cart-takes-under-2-ms-on-average, through cart-totals
        integer-cents, through cart-totals  Money is integer cents, rounded once
        live: cart-totals  Cart totals include VAT
        """
      And the output does not contain "src/cart.ts"

  Rule: A repository of your own starts with sdp init

    Scenario: Start in a repository of your own
      When I run "sdp init"
      Then the output contains "created sdp.config.yaml"
      When I run "sdp new idea 'Gift wrapping'"
      Then the output lines are "gift-wrapping\tspecs/features/gift-wrapping.feature"
      When I run "sdp new decision 'Use Postgres for orders'"
      Then the output lines are "use-postgres-for-orders\tspecs/decisions/use-postgres-for-orders.feature"
      Given the files are committed on the branch "main"
      When I run "sdp check"
      Then the exit code is 0
      When I run "sdp q 'feature[maturity=idea]' --ids"
      Then the output lines are "gift-wrapping"

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
      When I run "grep -rnE '[Mm]aturity gates?|NFR[s]|(draft|specified|ready).? gate|@kind=chang[e]|@change[s]:|incomin[g]/|maturity=implemente[d]|maturity-(criteri[a]|promotabl[e]|missin[g]|valu[e])|retired-maturit[y]|verificatio[n][^-a-z]|\[annotatio[n]\]|[|] annotatio[n] +[|]|Annotations are not tag[s]' README.md AGENTS.md .claude specs src examples" in the repository
      Then the exit code is 1

    Scenario Outline: An id with a prefix is of that prefix's kind, and the other way round
      Then every node matching "*[id~^<prefix>-[^#]*$]" also matches "<kind>"
      And every node matching "<kind>" also matches "*[id~^<prefix>-]"

      Examples:
        | prefix | kind        |
        | ARCH   | element     |
        | PAT    | pattern     |
        | MS     | milestone   |
        | IT     | iteration   |

  Rule: A spec is a feature file; Markdown is only for the pages sdp does not read

    A rule written in Markdown is in no graph, no run and no check, so it counts for nothing.

    Scenario: The Markdown files of this repository, the example's included
      When I run "find . -name '*.md' -not -path './node_modules/*' -not -path './.git/*'" in the repository
      Then the output lines are "./README.md, ./AGENTS.md, ./CLAUDE.md, ./.claude/skills/sdp/SKILL.md, ./examples/shop/README.md"

  Rule: A feature is in specs/features, and declares a maturity only while it is still to come

    Rule by rule: a change to a live feature is rules of it with a maturity of their own, so nothing
    moves when it is built.

    Scenario: Where each spec of this repository is
      When I run "ls specs" in the repository
      Then the output lines are "ARCHITECTURE.feature, GUIDE.feature, VISION.feature, decisions, features, plan, steps"
      And the query "feature[file!~^specs/features/]" returns no results

  Rule: Everything that is built is verified, and npm run verify fails when it is not

    A run fails on a live example that does not pass; this gate also catches one that did not run,
    so it runs with every `npm run verify`, not only at a milestone. A live rule beside rules still to
    come is built work too.

    @gate
    Scenario: The features and the rules that are built
      Then the query "feature[!toCome]" returns at least 1 result
      And the query "feature[!toCome][stage!=verified]" returns no results
      And the query "feature <-rule-of- rule[!toCome][stage!=verified]" returns no results

    Scenario: A live rule beside a rule still to come holds the gate until its example has passed
      Given the workspace is a copy of "specs/GUIDE.feature"
      And a file "specs/cart.feature" containing:
        """
        @id=cart
        Feature: Cart

          Shoppers collect items before paying.

          Rule: A cart holds what was added

            Scenario: Add an item
              Then there are no error diagnostics
        """
      And a file "specs/wishlist.feature" containing:
        """
        @id=wishlist
        Feature: Wishlist

          Shoppers keep what they want for later.

          Rule: A wishlist keeps what a shopper wants for later

            Scenario: Keep a lamp
              Then there are no error diagnostics

          @maturity=draft
          Rule: A wishlist is shared with a friend

            Friends buy presents from it.
        """
      When I run "sdp run cart"
      Then the exit code is 0
      When I run "sdp gate GUIDE"
      Then the exit code is 1
      When I run "sdp run wishlist"
      Then the exit code is 0
      When I run "sdp gate GUIDE"
      Then the exit code is 0

    Scenario: The build asks for this gate, and for no milestone's
      When I run "grep verify package.json" in the repository
      Then the output contains "gate GUIDE"
      And the output does not contain "gate MS-"

  Rule: Architecture is a decision, a rule of a spec, or what sdp shows from the code's annotations

    A rule this repository's code keeps is in specs/ARCHITECTURE.feature. An element is the code
    anchored to it, and that code's doc comment says what it is for, so no prose about it can stop
    being true.

    Scenario: No spec declares an element
      Then the query "element" returns at least 1 result
      And there are no diagnostics for rule "declared-in-spec"

  Rule: A decision is in specs/decisions, and only what no feature's rule can hold is one

    A decision is hard to reverse, surprising without context and a real trade-off, and it spans
    features. A reason that concerns one feature is written under the rule it explains.

    Scenario: The decisions of this repository
      Then the query "decision[file!~^specs/decisions/]" returns no results
      And the query "*[file~^specs/decisions/][kind!=decision]" returns no results
