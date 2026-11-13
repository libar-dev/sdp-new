@id=everything-built-is-verified @kind=guide
Feature: A change to sdp is done when everything built is verified

  What `npm run verify` holds every change of this repository to, and what is still to come to hold
  it there without anyone remembering to run it.

  Rule: A checkout runs its TypeScript sources with no build step, and npm pack builds the JavaScript an installed sdp runs without leaving it in the checkout

    Node.js 24 or later runs the TypeScript sources of this repository: an agent that edits one
    runs the result with the next command, and there is no stale `dist/` to forget. Node strips no
    types under node_modules, so what npm installs is built when it is packed.

    Scenario: The entry points of a checkout with no build output
      Given this repository has no build output
      When a fresh Node process imports "sdp/steps"
      Then the output contains "/src/steps.ts"
      When I run "node bin/sdp.js --version" in the repository
      Then the exit code is 0

    Scenario: Packing leaves the checkout as it was
      When a checkout of this repository is packed with npm
      Then the exit code is 0
      And the checkout is as it was before it was packed

    Scenario: The package npm packs runs from where it is installed
      Given the package npm packs from a checkout of this repository, installed in the workspace as "sdp"
      When I run "node_modules/.bin/sdp --version"
      Then the exit code is 0

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
      Given the workspace is a copy of "specs/guide/everything-built-is-verified.feature"
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
      When I run "sdp gate everything-built-is-verified"
      Then the exit code is 1
      When I run "sdp run wishlist"
      Then the exit code is 0
      When I run "sdp gate everything-built-is-verified"
      Then the exit code is 0

    Scenario: The build asks for this gate, and for no milestone's
      When I run "grep verify package.json" in the repository
      Then the output contains "gate everything-built-is-verified"
      And the output does not contain "gate MS-"

  @maturity=idea
  Rule: Work reaches main through a pull request that passed npm run verify and was reviewed by the other model family

    What AGENTS.md asks of every agent then holds without anyone remembering it.

  Rule: CI runs npm run verify for every pull request and every push to main

    What one machine verified is verified again where everyone sees the result, before a change is
    merged and once it is on main.

    Scenario: The workflow every pull request and every push to main runs
      When the file ".github/workflows/verify.yml" in the repository is read as data
      Then the JSON output has:
        | on.pull_request                       | null                     |
        | on.push                               | {"branches":["main"]}    |
        | jobs.verify.steps.1.with.node-version | 24                       |
        | jobs.verify.steps.2                   | {"run":"npm ci"}         |
        | jobs.verify.steps.3                   | {"run":"npm run verify"} |
      And the JSON output has none of these fields:
        | jobs.verify.if                |
        | jobs.verify.continue-on-error |

  @maturity=idea
  Rule: A commit runs sdp check and a push runs npm run verify, through git hooks that npm install sets up
