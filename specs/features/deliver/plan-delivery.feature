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

  Rule: sdp lifecycle lines up its columns, whatever the length of an iteration's id

    An iteration's id says what it is, at any length; the columns make room for the longest.

    Scenario: Iterations whose ids differ in length
      When the lifecycle is computed
      Then "Prototype" and "Scope" start in the same column of the output

  Rule: Before there is a plan, sdp lifecycle names the commands that start one

    An empty chart tells a team that has not planned yet nothing; the commands it needs do.

    Scenario: A workspace with no plan
      Given a file "fresh/sdp.config.yaml" containing:
        """
        # every key at its default
        """
      When I run "sdp -C fresh lifecycle"
      Then the exit code is 0
      And the output contains 'sdp new phase "Elaboration"'
      And the output contains 'sdp new milestone "<title>"'

  Rule: A new iteration follows the one that ends last, in its phase

    Scenario: After IT-baseline, which ends last
      When I run "sdp new iteration Packaging"
      Then the file "specs/plan/IT-packaging.feature" contains "@id=IT-packaging @phase:PH-elaboration @start=2026-02-28 @end=2026-03-13"

  Rule: The timeline is the iterations in the order they end, under their phases, and a milestone ends every iteration since the one before it, up to the phase or iteration it closes; those after the last milestone end in none

    Phases are optional: a team without them closes iterations, and a team with them can close one
    inside a phase, as a demo does.

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

    Scenario: An iteration after the last milestone
      Given these specs:
        | tags                                               | Feature   |
        | @id=IT-hardening @start=2026-03-02 @end=2026-03-13 | Hardening |
      When the lifecycle is computed
      Then the output line with "no milestone" contains "IT-hardening"

  Rule: The project is at the first milestone not met, and a later one met before it is reported; the calendar marks only today and lateness

    What was met is recorded in the files; a date says only what was planned, so the calendar can
    show a milestone late but never moves the project past it.

    Scenario: Past its date and not met, a milestone is late
      When the lifecycle is computed on "2026-02-20"
      Then the milestones are:
        | id              | met | next |
        | MS-objectives   |     | yes  |
        | MS-architecture |     |      |
      And the output contains "project in Inception · calendar in IT-baseline"
      And the output line with "MS-objectives" contains "late 21d"
      And the output line with "MS-architecture" contains "IT-baseline*"

    Scenario Outline: Milestones met <case>
      Given these specs:
        | tags                                                       | Feature                |
        | @id=MS-objectives @closes:PH-inception <objectives>        | Lifecycle objectives   |
        | @id=MS-architecture @closes:PH-elaboration @met=2026-03-02 | Lifecycle architecture |
      When the lifecycle is computed on "2026-03-10"
      Then the milestones are:
        | id              | met        | next   |
        | MS-objectives   | <met>      | <next> |
        | MS-architecture | 2026-03-02 |        |
      And the output contains "<position>"
      And the output line with "MS-architecture" contains "met 2026-03-02 (+3d)"
      When the workspace is checked
      Then sdp reports "<reported>"

      Examples:
        | case         | objectives      | met        | next | position               | reported      |
        | in order     | @met=2026-01-30 | 2026-01-30 |      | every milestone is met | nothing       |
        | out of order |                 |            | yes  | project in Inception   | milestone-met |

  Rule: Off the timeline, the project is at a milestone not met only when no other is; otherwise the heading names those off it, and why

    Milestones that close nothing dated are in no order: one alone not met is where the project is,
    but of two sdp cannot say which comes first.

    Scenario: The milestones on the timeline met, and two that close nothing dated
      Given these specs:
        | tags                                                       | Feature                |
        | @id=MS-objectives @closes:PH-inception @met=2026-01-30     | Lifecycle objectives   |
        | @id=MS-architecture @closes:PH-elaboration @met=2026-02-27 | Lifecycle architecture |
        | @id=PH-transition                                          | Transition             |
        | @id=MS-release @closes:PH-transition                       | Release                |
        | @id=MS-beta                                                | Beta                   |
      When the lifecycle is computed on "2026-03-02"
      Then the milestones are:
        | id              | next |
        | MS-objectives   |      |
        | MS-architecture |      |
        | MS-beta         |      |
        | MS-release      |      |
      And the output contains "not on the timeline: MS-beta, MS-release — they close nothing dated"

  Rule: Work is planned on the node itself: its iteration plans the discipline of its kind, an activity tag any other

    A feature is written in one iteration and built in another, and a gate has to tell the two apart.

    Scenario: Planned into IT-prototype but specified in IT-baseline, built over both, tested in IT-baseline
      Given these specs:
        | tags                                                                                                                                                                                    | Feature |
        | @id=beta @maturity=idea @iteration:IT-prototype @activity.requirements:IT-baseline @activity.implementation:IT-prototype @activity.implementation:IT-baseline @activity.test:IT-baseline | Beta    |
      When the lifecycle is computed
      Then the planned activity is:
        | discipline        | IT-prototype | IT-baseline |
        | business-modeling | 0            | 0           |
        | requirements      | 1            | 1           |
        | analysis-design   | 0            | 0           |
        | implementation    | 1            | 1           |
        | test              | 0            | 1           |
        | deployment        | 0            | 0           |

  Rule: The chart shades each discipline relative to its busiest iteration

    Where a discipline's work piles up shows at a glance, in a team of any size; the counts are in
    sdp lifecycle --json.

    Scenario: Half of IT-baseline's requirements work in IT-prototype
      Given these specs:
        | tags                                            | Feature |
        | @id=beta @maturity=idea @iteration:IT-baseline  | Beta    |
        | @id=gamma @maturity=idea @iteration:IT-baseline | Gamma   |
      When the lifecycle is computed
      Then the output line with "requirements" contains "    ▒▒▒ ███"

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
        | case                  | tags                                                 | title  | reported            |
        | an epic at a maturity | @id=saving @kind=epic @maturity=idea @includes:alpha | Saving | maturity-on-no-work |
        | a risk at a maturity  | @id=outage @kind=risk @maturity=idea                 | Outage | maturity-on-no-work |

  Rule: A plan tag that would plan nothing is reported: an iteration not declared or on a kind no discipline names, an activity of no declared discipline, or a date on what it does not date

    Planned activity is counted by discipline, in iterations: a link to anything else, or work of a
    kind no discipline takes, would otherwise plan nothing without a word.

    Scenario Outline: A spec with <tags>
      Given these specs:
        | tags                           | Feature |
        | @id=beta @maturity=idea <tags> | Beta    |
      When the workspace is checked
      Then sdp reports:
        | rule       | message   |
        | <reported> | <problem> |

      Examples:
        | tags                               | reported       | problem                                    |
        | @iteration:PH-elaboration          | plan-reference | "PH-elaboration" names no iteration        |
        | @kind=risk @iteration:IT-prototype | plan-reference | kind risk belongs to no discipline         |
        | @activity.testing:IT-prototype     | plan-reference | names "testing", which is not a discipline |
        | @activity:IT-prototype             | plan-reference | activity names no discipline               |
        | @start=2026-11-16                  | fact-kind      | @start= dates an iteration                 |

  Rule: A gate is reported apart from the work: a run never fails on it, status counts a rule by its examples that are no gate and one with none as a gate, lifecycle shows the next milestone's gate as last run, and only sdp gate fails on it

    A gate not met yet is where the project is going, not a regression: a run that failed on it
    would fail every build before the milestone, and a rule counted as failing for it reads as one.

    Scenario: A run with a gate that is not met
      Given a file "specs/beta.feature" containing:
        """
        @id=beta
        Feature: Beta

          Rule: Beta is planned

            Scenario: There is a plan
              Then the query "iteration" returns at least 1 result

            @gate
            Scenario: Every feature is planned
              Then the query "feature !-iteration-> iteration" returns no results
        """
      When I run "sdp run --json"
      Then the exit code is 0
      And the JSON output has:
        | data.summary.failed | 0 |
        | data.gates.failed   | 2 |
      When I run "sdp status --json"
      Then the JSON output has:
        | data.rules | {"verified":1,"gate":2} |
      When I run "sdp lifecycle"
      Then the output line with "MS-objectives" contains "1/2"
      When I run "sdp gate MS-objectives"
      Then the exit code is 1

  Rule: A gate passes only when every one of its scenarios passed, run against the current graph

    A gate scenario nobody has automated has not passed, and a result from before the graph changed,
    one that went stale while the gate ran included, says nothing of the graph as it is now.

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

    Scenario: A gate scenario added while it runs
      Given a file "specs/MS-release.feature" containing:
        """
        @id=MS-release
        Feature: Release

          Rule: The package is published

            Scenario: Published
              Given a scenario is added to the gate while it runs
        """
      And a file "specs/steps/add.steps.ts" containing:
        """
        import { appendFileSync } from "node:fs"
        import { defineSteps } from "sdp/steps"

        export default defineSteps(() => ({}), ({ Step }) => {
          Step("a scenario is added to the gate while it runs", () => {
            appendFileSync("specs/MS-release.feature", "\n    Scenario: Announced\n      Given a step nobody wrote\n")
          })
        })
        """
      When I run "sdp gate MS-release --json"
      Then the exit code is 1
      And the JSON output has:
        | data.passed | false |

    Scenario: A spec without gate scenarios
      When I run "sdp gate alpha"
      Then the exit code is 1
      And the output contains "alpha has no gate scenarios"

  Rule: sdp gate --record reports the gate as sdp gate does, and writes @met on the next milestone when it passes, and on no other

    Met is recorded once, by somebody, not read from the calendar or today's results: a date would
    fail tomorrow the commit that passes today, and results are local and go stale.

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

    Scenario: A gate edited while it runs
      Given a file "specs/MS-objectives.feature" containing:
        """
        @id=MS-objectives @closes:PH-inception
        Feature: Lifecycle objectives

          Rule: The work is planned

            Scenario: There is a plan
              Given the gate is edited while it runs
        """
      And a file "specs/steps/edit.steps.ts" containing:
        """
        import { readFileSync, writeFileSync } from "node:fs"
        import { defineSteps } from "sdp/steps"

        export default defineSteps(() => ({}), ({ Step }) => {
          Step("the gate is edited while it runs", () => {
            const file = "specs/MS-objectives.feature"
            writeFileSync(file, readFileSync(file, "utf8").replace("the gate is edited while it runs", "a step nobody wrote"))
          })
        })
        """
      When I run "sdp gate MS-objectives --record --json"
      Then the exit code is 1
      And the JSON output has:
        | data.passed                     | false |
        | data.wentStale.scenario-changed | 1     |
      When I run "sdp lifecycle --json"
      Then the JSON output has:
        | data.position.milestone | MS-objectives |

    Scenario: A milestone dated before it, added while its gate runs
      Given a file "specs/MS-objectives.feature" containing:
        """
        @id=MS-objectives @closes:PH-inception
        Feature: Lifecycle objectives

          Rule: The work is planned

            Scenario: There is a plan
              Given a milestone dated before it is added while it runs
        """
      And a file "specs/steps/kickoff.steps.ts" containing:
        """
        import { writeFileSync } from "node:fs"
        import { defineSteps } from "sdp/steps"

        export default defineSteps(() => ({}), ({ Step }) => {
          Step("a milestone dated before it is added while it runs", () => {
            writeFileSync("specs/IT-kickoff.feature", "@id=IT-kickoff @start=2026-01-01 @end=2026-01-02\nFeature: Kickoff\n")
            writeFileSync("specs/MS-kickoff.feature", "@id=MS-kickoff @closes:IT-kickoff\nFeature: Kicked off\n")
          })
        })
        """
      When I run "sdp gate MS-objectives --record"
      Then the exit code is 1
      And the output contains "MS-objectives cannot be met before MS-kickoff"

    Scenario: A policy's gate
      Given a file "specs/definition-of-ready.feature" containing:
        """
        @id=definition-of-ready @kind=policy
        Feature: Definition of Ready

          Rule: Every feature is planned

            @gate
            Scenario: Planned
              Then the query "feature !-iteration-> iteration" returns no results
        """
      When I run "sdp gate definition-of-ready --record"
      Then the exit code is 1
      And the output contains "only a milestone is recorded as met"

  Rule: sdp gate --record records nothing on a graph sdp could not read whole

    What sdp did not read could change whether the gate holds, and a milestone that is met is
    closed: its gate does not run again to find out.

    Scenario: An import sdp cannot follow
      Given a file "specs/MS-objectives.feature" containing:
        """
        @id=MS-objectives @closes:PH-inception
        Feature: Lifecycle objectives

          Rule: The work is planned without an error

            Scenario: No error
              Then there are no error diagnostics
        """
      And a file "src/plan.ts" containing:
        """
        /** @sdp is ARCH-plan */
        import "./missing.ts"
        export const plan = 1
        """
      When I run "sdp gate MS-objectives --record --json"
      Then the exit code is 2
      And the JSON output has:
        | complete    | false |
        | data.passed | true  |
      When I run "sdp lifecycle --json"
      Then the exit code is 2
      And the JSON output has:
        | data.position.milestone | MS-objectives |

  Rule: A milestone that is met is closed: its gate does not run again

    Run again, the gate would read a graph that has moved on; once met, its scenarios are a plan of
    work that is done, to be deleted or to become the tests of what was built.

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
      When I run "sdp gate definition-of-ready --json"
      Then the exit code is 1
      And the JSON output has:
        | data.passed       | false |
        | data.gates.failed | 1     |

  Rule: lifecycle --brief prints the milestone, the work planned now and its open questions within 2,000 characters, and says what it left out

    An agent is shown it as a session starts, where little text fits. The work planned now is the
    current iteration's, or, when none is current, that of the one that starts next.

    Scenario: During an iteration, its work and not the next one's
      Given these specs:
        | tags                                            | Feature |
        | @id=beta @maturity=draft @iteration:IT-baseline | Beta    |
      When the brief is computed on "2026-02-03"
      Then the output line with "IT-prototype" contains "2026-02-13"
      And the output line with "alpha" contains "idea"
      And the output does not contain "beta"

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

  @open @maturity=idea
  Rule: How is an iteration ordered, and which is the current one, when it declares no dates?

    Dates order the timeline today: an iteration without them is off it, so lifecycle cannot say
    which comes next, and `lifecycle --brief`, which the hook shows, finds no work planned now. Early
    iterations are planned by their order more than by a calendar.
