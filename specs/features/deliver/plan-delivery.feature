@id=plan-delivery
@realized-by:ARCH-lifecycle @realized-by:ARCH-application @realized-by:ARCH-reports @realized-by:ARCH-runner @realized-by:ARCH-checker
Feature: Plan delivery

  A team, and whoever leads its delivery, needs to see where the project stands from evidence rather
  than statuses: which milestone is next and whether its gate passes, and what work is planned into
  which iteration.

  Not a tracker: sdp assigns no one, estimates nothing and moves no date.

  Background:
    Given these specs:
      | tags                                                                     | Feature     |
      | @id=PH-inception                                                         | Inception   |
      | @id=PH-elaboration                                                       | Elaboration |
      | @id=IT-scope @phase:PH-inception @start=2026-01-05 @end=2026-01-30       | Scope       |
      | @id=IT-prototype @phase:PH-elaboration @start=2026-02-02 @end=2026-02-13 | Prototype   |
      | @id=IT-baseline @phase:PH-elaboration @start=2026-02-16 @end=2026-02-27  | Baseline    |
      | @id=alpha @maturity=idea @iteration:IT-prototype                         | Alpha       |
    And a file "src/x.ts" containing:
      """
      /** @sdp is ARCH-x */
      export const x = 0
      """
    And a file "specs/MS-objectives.feature" containing:
      """
      @id=MS-objectives @closes:PH-inception
      Feature: Lifecycle objectives

        Rule: The work is planned

          Scenario: There is a plan
            Then the query "iteration" returns at least 1 result

          Scenario: Every feature is in an iteration
            Then the query "feature !-iteration-> iteration" returns no results
      """
    And a file "specs/MS-architecture.feature" containing:
      """
      @id=MS-architecture @closes:PH-elaboration
      Feature: Lifecycle architecture

        Rule: The architecture is baselined

          Scenario: There is an architecture
            Then the query "element" returns at least 1 result
      """

  Rule: sdp lifecycle shows where the project is, the first milestone not met, then the planned work, with the evidence apart from the plan

    Scenario: Where the project is, as data
      When I run "sdp lifecycle --json"
      Then the JSON output has:
        | data.position.milestone        | MS-objectives                       |
        | data.position.phase            | PH-inception                        |
        | data.milestones                | MS-objectives, MS-architecture      |
        | data.iterations                | IT-scope, IT-prototype, IT-baseline |
        | data.disciplines.requirements  | 0, 1, 0                             |
        | data.work.evidence.stages.idea | 1                                   |

  Rule: A new iteration follows the one that ends last, in its phase

    Scenario: After IT-baseline, which ends last
      When I run "sdp new iteration Packaging"
      Then the file "specs/plan/IT-packaging.feature" contains "@id=IT-packaging @phase:PH-elaboration @start=2026-02-28 @end=2026-03-13"

  Rule: The timeline is the iterations in the order they end, under their phases, and a milestone ends every iteration since the one before it, up to the phase or iteration it closes

    Scenario: A demo that closes IT-prototype, between the milestones of the two phases
      Given these specs:
        | tags                             | Feature |
        | @id=MS-demo @closes:IT-prototype | Demo    |
      When the lifecycle is computed on "2026-01-20"
      Then the milestones are:
        | id              | phase          | iterations   | planned    |
        | MS-objectives   | PH-inception   | IT-scope     | 2026-01-30 |
        | MS-demo         | PH-elaboration | IT-prototype | 2026-02-13 |
        | MS-architecture | PH-elaboration | IT-baseline  | 2026-02-27 |

  Rule: The project is at the first milestone not met; the calendar marks only today and lateness

    Scenario: Past its date and not met, a milestone is late
      When the lifecycle is computed on "2026-02-20"
      Then the milestones are:
        | id              | met | next |
        | MS-objectives   |     | yes  |
        | MS-architecture |     |      |
      And the output contains "project in Inception · calendar in IT-baseline"
      And the output line with "MS-objectives" contains "late 21d"

  Rule: Work is planned on the node itself: its iteration plans the discipline of its kind, an activity tag any other

    Scenario: Planned into IT-prototype but specified in IT-baseline, built over both, tested in IT-baseline
      Given these specs:
        | tags                                                                                                                                                                                    | Feature |
        | @id=beta @maturity=idea @iteration:IT-prototype @activity.requirements:IT-baseline @activity.implementation:IT-prototype @activity.implementation:IT-baseline @activity.test:IT-baseline | Beta    |
      When the lifecycle is computed
      Then the planned activity is:
        | discipline     | IT-prototype | IT-baseline |
        | requirements   | 1            | 1           |
        | implementation | 1            | 1           |
        | test           | 0            | 1           |

  Rule: Work still to come is unplanned until it is planned, a rule with its spec or on its own

    Scenario Outline: A feature <case>
      Given a file "specs/cart.feature" containing:
        """
        @id=cart <maturity> <plan>
        Feature: Cart

          Shoppers collect items before paying.

          Rule: A cart holds what was added

            Scenario: Add an item
              Then the cart holds 1 item

          @maturity=draft <rule plan>
          Rule: A cart is kept for a week
        """
      When the lifecycle is computed
      Then the unplanned work is "<unplanned>"

      Examples:
        | case                                      | maturity        | plan                   | rule plan              | unplanned                      |
        | that is live, with a rule to come         |                 |                        |                        | cart#a-cart-is-kept-for-a-week |
        | that is live, with a rule to come planned |                 |                        | @iteration:IT-baseline | nothing                        |
        | still to come                             | @maturity=ready |                        |                        | cart                           |
        | still to come and planned                 | @maturity=ready | @iteration:IT-baseline |                        | nothing                        |

  @decided-by:areas-for-reading-epics-for-work
  Rule: Only work of a discipline is planned: the plan's own nodes, an epic among them, and a kind no discipline names are no work, and declare no maturity

    Scenario Outline: No work: <case>
      Given these specs:
        | tags   | Feature |
        | <tags> | <title> |
      When the lifecycle is computed
      Then the unplanned work is "nothing"
      When the workspace is checked
      Then sdp reports "<reported>"

      Examples:
        | case                 | tags                                  | title  | reported            |
        | an epic              | @id=saving @kind=epic @includes:alpha | Saving | nothing             |
        | a risk at a maturity | @id=outage @kind=risk @maturity=idea  | Outage | maturity-on-no-work |

  Rule: A plan tag that would plan nothing is reported: an iteration or a discipline not declared, or a date on what it does not date

    Scenario Outline: A feature with <tags>
      Given these specs:
        | tags                           | Feature |
        | @id=beta @maturity=idea <tags> | Beta    |
      When the workspace is checked
      Then sdp reports "<reported>"

      Examples:
        | tags                           | reported       |
        | @iteration:PH-elaboration      | plan-reference |
        | @activity.testing:IT-prototype | plan-reference |
        | @start=2026-11-16              | fact-kind      |

  Rule: A run reports a gate apart from the work and never fails on it; lifecycle shows the next milestone's gate as last run, and only sdp gate fails on it

    Scenario: A run with a gate that is not met
      Given these specs:
        | tags                    | Feature |
        | @id=beta @maturity=idea | Beta    |
      When I run "sdp run --json"
      Then the exit code is 0
      And the JSON output has:
        | data.summary.failed | 0 |
        | data.gates.failed   | 1 |
      When I run "sdp lifecycle"
      Then the output line with "MS-objectives" contains "1/2"
      When I run "sdp gate MS-objectives"
      Then the exit code is 1

  Rule: A gate passes only when every one of its scenarios passed, run against the current graph

    Scenario: A gate scenario edited while it runs
      Given a file "specs/MS-release.feature" containing:
        """
        @id=MS-release
        Feature: Release

          Rule: The package is published

            Scenario: Published
              Given the gate is edited while it runs
        """
      And a file "specs/steps/edit.steps.ts" containing:
        """
        import { readFileSync, writeFileSync } from "node:fs"
        import { defineSteps } from "sdp/steps"

        export default defineSteps(() => ({}), ({ Step }) => {
          Step("the gate is edited while it runs", () => {
            const file = "specs/MS-release.feature"
            writeFileSync(file, readFileSync(file, "utf8").replace("the gate is edited while it runs", "a step nobody wrote"))
          })
        })
        """
      When I run "sdp gate MS-release --json"
      Then the exit code is 1
      And the JSON output has:
        | data.passed                     | false |
        | data.wentStale.scenario-changed | 1     |

  Rule: sdp gate --record writes @met on the next milestone when its gate passes, and on no other

    Scenario Outline: Recording <case>
      Given these specs:
        | tags                           | Feature |
        | @id=beta @maturity=idea <plan> | Beta    |
      When I run "sdp gate <milestone> --record"
      Then the exit code is <exit code>
      When I run "sdp lifecycle --json"
      Then the JSON output has:
        | data.position.milestone | <project at> |

      Examples:
        | case                                 | plan                | milestone       | exit code | project at      |
        | the next milestone, its gate passing | @iteration:IT-scope | MS-objectives   | 0         | MS-architecture |
        | the next milestone, its gate failing |                     | MS-objectives   | 1         | MS-objectives   |
        | a later milestone                    | @iteration:IT-scope | MS-architecture | 1         | MS-objectives   |

  Rule: A milestone that is met is closed: its gate does not run again

    Scenario: A met milestone whose gate would fail now
      Given a file "specs/MS-objectives.feature" containing:
        """
        @id=MS-objectives @closes:PH-inception @met=2026-01-30
        Feature: Lifecycle objectives

          Rule: The work is planned

            Scenario: There is no plan
              Then the query "iteration" returns no results
        """
      When I run "sdp gate MS-objectives"
      Then the exit code is 0
      And the output contains "MS-objectives was met on 2026-01-30"

  @decided-by:declared-maturity-derived-stage
  Rule: What ready means is the team's Definition of Ready, a gate of its own

    Scenario: A ready feature that depends on a draft
      Given a file "specs/definition-of-ready.feature" containing:
        """
        @id=definition-of-ready @kind=policy
        Feature: Definition of Ready

          Rule: What a ready feature depends on is ready too

            @gate
            Scenario: Depending only on what is ready
              Then the query "feature[maturity=ready] ?-depends-on-> feature[maturity<ready]" returns no results
        """
      And these specs:
        | tags                                                  | Feature       |
        | @id=reports @maturity=draft                           | Reports       |
        | @id=export-to-csv @maturity=ready @depends-on:reports | Export to CSV |
      When I run "sdp gate definition-of-ready"
      Then the exit code is 1

  @maturity=ready @iteration:IT-agent-plugin
  Rule: lifecycle --brief prints the milestone, the work planned now and its open questions within 2,000 characters, and says what it left out

    The work planned now is the current iteration's, or the next one's when none is current.

    Scenario: Between iterations, the next one's work and what waits on a decision
      Given these specs:
        | tags                                           | Feature |
        | @id=IT-later @start=2099-01-05 @end=2099-01-16 | Later   |
      And a file "specs/cart.feature" containing:
        """
        @id=cart @maturity=draft @iteration:IT-later
        Feature: Cart

          Rule: A cart holds what was added

          @open
          Rule: Does a cart expire?
        """
      When I run "sdp lifecycle --brief"
      Then the exit code is 0
      And the output line with "MS-objectives" contains "0/2"
      And the output line with "IT-later" contains "2099-01-05"
      And the output line with "cart" contains "draft"
      And the output line with "Does a cart expire?" contains "specs/cart.feature:7"
      And the output does not contain "alpha"
      And the output does not contain "DISCIPLINE ACTIVITY"

    Scenario: More work than fits, cut to the bound with what was left out and how to see it
      Given these specs:
        | tags                                           | Feature |
        | @id=IT-later @start=2099-01-05 @end=2099-01-16 | Later   |
      And 80 features planned into "IT-later", each with an open question
      When I run "sdp lifecycle --brief"
      Then the exit code is 0
      And the output is at most 2000 characters
      And the output contains "left out:"
      And the output contains "sdp lifecycle"

  @maturity=idea
  Rule: Each iteration shows which specs and code changed in its dates beside what was planned, and one whose planned work saw no change stands out

  @maturity=idea @decided-by:areas-for-reading-epics-for-work
  Rule: lifecycle shows each epic with where each of its items stands, and points out one whose every item is live, to be deleted

  @maturity=idea
  Rule: lifecycle lists the work planned into no iteration under its area and its spec, each with its maturity, not as one line of ids
