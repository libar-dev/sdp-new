@id=sdp-shown-by-running-it @kind=guide
Feature: sdp, shown by running it

  What README.md promises a reader, as scenarios that run. sdp does not read README.md, so a promise
  made there counts only where a scenario here pins it.

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

  Rule: The shop example is a workspace of its own

    Its configuration is how sdp finds it, so a command run anywhere in the shop reads the shop, not
    the repository around it.

    Scenario: A command run in the shop's code
      Given the workspace is a copy of "examples/shop"
      When I run "sdp q feature --ids" in "src"
      Then the output lines are "cart-totals, guest-checkout, wishlist"

  Rule: A repository of your own starts with sdp init

    Scenario: Start in a repository of your own
      When I run "sdp init"
      Then the output contains "created sdp.config.yaml"
      And the output contains 'next: sdp new feature "My first feature"'
      When I run "sdp new feature 'Gift wrapping'"
      Then the output lines are "gift-wrapping\tspecs/features/gift-wrapping.feature"
      When I run "sdp new decision 'Use Postgres for orders'"
      Then the output lines are "use-postgres-for-orders\tspecs/decisions/use-postgres-for-orders.feature"
      Given the files are committed on the branch "main"
      When I run "sdp check"
      Then the exit code is 0
      When I run "sdp q 'feature[maturity=idea]' --ids"
      Then the output lines are "gift-wrapping"

