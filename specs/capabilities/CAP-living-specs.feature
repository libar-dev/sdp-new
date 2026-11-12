@id=CAP-living-specs
@refines:VISION
@iteration:I1
Feature: Living specifications

  Teams capture what a system should do — from a one-line idea to a fully designed, executable
  specification — in one format that stays true as the system changes, because it runs. The plan
  and its milestones live in the same graph, so progress is read from evidence rather than reported.

  The README shows a requirement going from specified to verified in one file. This is the
  other half: a milestone that is met by what ran.

  Scenario: A milestone is met by what ran, not by a status or a date
    Given a file "specs/REQ-search.md" containing:
      """
      ---
      id: REQ-search
      maturity: specified
      ---
      # Search

      Shoppers find a product by its name.

      ```gherkin
      Scenario: Find by name
        When I search for "lamp"
        Then I see 1 product
      ```
      """
    And a file "specs/MS-beta.md" containing:
      """
      ---
      id: MS-beta
      kind: milestone
      ---
      # Beta

      ```gherkin
      Scenario: Everything specified works
        Then the query "requirement[stage!=verified]" returns no results
      ```
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
