@id=install-from-npm
@realized-by:ARCH-cli @realized-by:ARCH-application @realized-by:ARCH-runner
Feature: Install sdp from npm

  Teams that adopt sdp install it as a development dependency of their repository, as they install
  any tool, not from a clone of this one.

  Rule: The package is published publicly as @libar-dev/software-delivery-protocol, and installed under the name sdp

    `sdp` on npm is another package, of utilities for WebRTC's session descriptions, which
    `npm install sdp` or `npx sdp` fetches. Installed through an alias,
    `npm install --save-dev sdp@npm:@libar-dev/software-delivery-protocol`, sdp has one name in every
    command and every import, those of the step definitions it writes too.

    Scenario: Installed under the name sdp
      Given the package npm packs from a checkout of this repository, installed in the workspace as "sdp"
      When I run "cat node_modules/sdp/package.json"
      Then the exit code is 0
      And the JSON output has:
        | name                 | @libar-dev/software-delivery-protocol |
        | publishConfig.access | public                                |
      And the JSON output has none of these fields:
        | private |
      When I run "node_modules/.bin/sdp init"
      Then the exit code is 0
      And the file ".claude/skills/sdp/SKILL.md" contains "name: sdp"

  Rule: Programs and step modules import sdp, sdp/effect and sdp/steps from the installed package, typed

    A project's own `tsc` checks the step modules and programs it writes against sdp.

    Scenario: A step module and a program import its entries, typed
      Given a file "package.json" containing:
        """
        {
          "type": "module",
          "devDependencies": { "sdp": "npm:@libar-dev/software-delivery-protocol", "@types/node": "*" }
        }
        """
      And a file "tsconfig.json" containing:
        """
        { "compilerOptions": { "module": "nodenext", "target": "es2024", "types": ["node"], "strict": true, "noEmit": true } }
        """
      And a file "specs/cart.feature" containing:
        """
        @id=cart
        Feature: Cart

          Rule: A cart holds what was added

            Scenario: Add a lamp
              When a lamp is added
              Then the cart holds 1 item
        """
      And a file "specs/steps/cart.steps.ts" containing:
        """
        import { strict as assert } from "node:assert"
        import { defineSteps } from "sdp/steps"

        export default defineSteps(() => ({ items: 0 }), ({ Then, When }) => {
          When("a lamp is added", ({ world }) => {
            world.items += 1
          })
          Then("the cart holds {int} item(s)", ({ args: [count], world }) => {
            assert.equal(world.items, count)
          })
        })
        """
      And a file "features.ts" containing:
        """
        import { query } from "sdp"
        import { GraphRecord } from "sdp/effect"

        const found = await query(".", { expression: "feature" })
        console.log(found.data.nodes.map((node) => node.id).join(", "), typeof GraphRecord)
        """
      And the package npm packs from a checkout of this repository, installed in the workspace as "sdp"
      When I run "tsc"
      Then the exit code is 0
      When I run "node_modules/.bin/sdp run"
      Then the exit code is 0
      When I run "node features.ts"
      Then the exit code is 0
      And the output contains "cart function"

  @maturity=ready @iteration:IT-packaging
  Rule: CI publishes each release with provenance, from a tagged commit whose scenarios passed

    The scenarios of the command line run against the package npm packs, as a team installs it, not
    only against the checkout.

  Rule: The package runs on Node.js 24 and later

    Scenario: The Node.js it declares
      Given the package npm packs from a checkout of this repository, installed in the workspace as "sdp"
      When I run "cat node_modules/sdp/package.json"
      Then the exit code is 0
      And the JSON output has:
        | engines.node | >=24 |

  Rule: The package depends on exactly the versions of Effect its scenarios ran with

    The modules of Effect that sdp uses are marked unstable, so a release of Effect may change them.

    Scenario: Effect as this repository runs it
      Given the package npm packs from a checkout of this repository, installed in the workspace as "sdp"
      When I run "cat node_modules/sdp/package.json"
      Then the exit code is 0
      And the JSON output depends on exactly the versions of "effect, @effect/platform-node" this repository runs with
