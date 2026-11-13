@id=install-from-npm
@realized-by:ARCH-cli @realized-by:ARCH-application @realized-by:ARCH-runner
Feature: Install sdp from npm

  Teams that adopt sdp install it as a development dependency of their repository, as they install
  any tool, not from a clone of this one.

  Rule: The package is published public as `@libar-dev/software-delivery-protocol` and installed as `sdp`: it gives the command `sdp`, and programs and step modules import `sdp`, `sdp/effect` and `sdp/steps`, typed

    `sdp` is taken on npm, by a package of utilities for WebRTC's session descriptions. Installed
    through an npm alias, `npm install --save-dev sdp@npm:@libar-dev/software-delivery-protocol`, sdp
    has one name in every import, which its step reader, loader and snippets write; `npm install sdp`
    or `npx sdp` without the alias fetches that other package. A project's own `tsc` checks its step
    modules and programs, so the package ships declarations beside the JavaScript it runs. The
    checkout is private, so that `npm publish` run in it publishes nothing: a release publishes the
    package npm packs.

    Scenario: The command sdp writes the skill it ships
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

          Shoppers collect what they buy.

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
  Rule: A release is published by CI, with provenance, from a tag on a commit that passed npm run verify and the command-line scenarios run against the packed package

  Rule: The published package depends on the exact versions of Effect its checks passed with, and runs on Node.js 24 and later

    The modules of Effect that sdp uses are marked unstable, so a release of Effect may change them:
    a release of sdp runs on the Effect its scenarios ran on.

    Scenario: Effect as this repository runs it, and Node.js 24 or later
      Given the package npm packs from a checkout of this repository, installed in the workspace as "sdp"
      When I run "cat node_modules/sdp/package.json"
      Then the exit code is 0
      And the JSON output has:
        | engines.node | >=24 |
      And the JSON output depends on exactly the versions of "effect, @effect/platform-node" this repository runs with
