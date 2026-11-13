@id=plan-delivery
@realized-by:ARCH-lifecycle @realized-by:ARCH-application @realized-by:ARCH-reports @realized-by:ARCH-runner @realized-by:ARCH-checker
Feature: Plan delivery

  A team, and whoever leads its delivery, needs to see where the project stands from evidence
  rather than statuses: which milestone is next and whether its gate passes, what work is planned
  into which iteration, and what has been verified. The plan is part of the same graph as the work,
  so `sdp lifecycle` shows it beside the calendar and the evidence.

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
      | @id=staging @kind=environment @maturity=idea @iteration:IT-prototype     | Staging     |
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
        | data.work.evidence.stages.idea | 2                                   |

  Rule: Before there is a plan, sdp lifecycle says how to write one, and the templates write a plan it shows

    Scenario: In a fresh workspace
      When I run "sdp -C fresh init"
      Then the exit code is 0
      When I run "sdp -C fresh lifecycle"
      Then the output contains 'sdp new phase "Elaboration"'
      And the output contains 'sdp new iteration "<title>"'
      When I run the pipeline:
        """
        sdp -C fresh new phase Elaboration
        sdp -C fresh new iteration 'Architecture baseline'
        sdp -C fresh new milestone 'Architecture baseline'
        """
      Then the exit code is 0
      And the file "fresh/specs/plan/IT-architecture-baseline.feature" contains "@id=IT-architecture-baseline @phase:PH-elaboration"
      When I run "sdp -C fresh lifecycle"
      Then the output contains "project at MS-architecture-baseline"

  Rule: The timeline is the iterations in the order they end, each under its phase; one without a last day has no place on it, and check says so

    A milestone is dated by the end of what it closes, so an iteration needs no first day to have its
    place; one without a last day is planned work all the same, after the timeline.

    Scenario: Without a first day an iteration keeps its place; without a last day that is a date it has none, and check says why
      Given these specs:
        | tags                                                                    | Feature   |
        | @id=IT-prototype @phase:PH-elaboration @end=2026-02-13                  | Prototype |
        | @id=IT-baseline @phase:PH-elaboration @start=2026-02-16 @end=2026-02-30 | Baseline  |
        | @id=IT-hardening @phase:PH-elaboration                                  | Hardening |
      When the lifecycle is computed
      Then the iterations are:
        | id           | phase          |
        | IT-scope     | PH-inception   |
        | IT-prototype | PH-elaboration |
        | IT-hardening | PH-elaboration |
        | IT-baseline  | PH-elaboration |
      When the workspace is checked
      Then sdp reports:
        | rule      | at                           |
        | plan-date | specs/IT-baseline.feature:1  |
        | plan-date | specs/IT-hardening.feature:1 |

  Rule: An iteration without a last day is ended by the milestone that closes it, or else by its phase's

    Scenario: IT-hardening closed by a milestone of its own, IT-polish by its phase's
      Given these specs:
        | tags                                   | Feature   |
        | @id=IT-hardening @phase:PH-elaboration | Hardening |
        | @id=IT-polish @phase:PH-elaboration    | Polish    |
        | @id=MS-hardened @closes:IT-hardening   | Hardened  |
      When the lifecycle is computed
      Then the milestones are:
        | id              | iterations                           |
        | MS-objectives   | IT-scope                             |
        | MS-architecture | IT-prototype, IT-baseline, IT-polish |
        | MS-hardened     | IT-hardening                         |

  Rule: A milestone closes a phase or an iteration, and ends every iteration since the milestone before it

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

  Rule: A new iteration follows the one that ends last, in its phase

    Scenario: After IT-baseline, which ends last
      When I run "sdp new iteration Packaging"
      Then the file "specs/plan/IT-packaging.feature" is:
        """
        @id=IT-packaging @phase:PH-elaboration @start=2026-02-28 @end=2026-03-13
        Feature: Packaging
        """

  Rule: The project is at the first milestone not met; the calendar marks only today and lateness

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

  Rule: An iteration without a first day is never today's, and lifecycle names each one today could be in

    Scenario: Two iterations dated only by their ends, on a day before both end
      Given these specs:
        | tags                                                   | Feature   |
        | @id=IT-scope @phase:PH-inception @end=2026-01-30       | Scope     |
        | @id=IT-prototype @phase:PH-elaboration @end=2026-02-13 | Prototype |
      When the lifecycle is computed on "2026-01-20"
      Then the iterations are:
        | id           | today |
        | IT-scope     |       |
        | IT-prototype |       |
        | IT-baseline  |       |
      And the output contains "no iteration today: IT-scope, IT-prototype have no first day"

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

    Scenario: Analysed in IT-prototype, built over IT-prototype and IT-baseline, tested in IT-baseline
      Given these specs:
        | tags                                                                                                                                                                                         | Feature |
        | @id=beta @maturity=idea @iteration:IT-prototype @activity.analysis-design:IT-prototype @activity.implementation:IT-prototype @activity.implementation:IT-baseline @activity.test:IT-baseline | Beta    |
      When the lifecycle is computed
      Then the planned activity is:
        | discipline      | IT-prototype | IT-baseline |
        | requirements    | 2            | 0           |
        | analysis-design | 1            | 0           |
        | implementation  | 1            | 1           |
        | test            | 0            | 1           |

  Rule: The plan's own nodes are no work

    Scenario: A milestone planned into an iteration
      Given these specs:
        | tags                                                   | Feature |
        | @id=MS-demo @closes:IT-baseline @iteration:IT-baseline | Demo    |
      When the lifecycle is computed
      Then the iterations are:
        | id           | plans          |
        | IT-scope     |                |
        | IT-prototype | alpha, staging |
        | IT-baseline  |                |

  Rule: A rule of the architecture is analysis and design work, so one still to come declares a maturity as a feature's rule does

    A rule only the code observes, such as which element may import which, is no feature's: it is a
    rule of a spec of kind architecture, planned like any other work.

    Scenario: A rule of the architecture still to come, and a new spec of the architecture's rules at a maturity
      Given a file "specs/ARCHITECTURE.feature" containing:
        """
        @id=ARCHITECTURE @kind=architecture
        Feature: Architecture

          Rule: No element depends on itself through others

            Scenario: The elements
              Then there are no error diagnostics

          @maturity=draft
          Rule: Only the workspace reads files
        """
      When I run "sdp check --base none"
      Then the exit code is 0
      When I run "sdp new architecture 'Rules of the shop' --maturity draft"
      Then the exit code is 0
      When I run "sdp lifecycle --json"
      Then the JSON output has:
        | data.unplanned | ARCHITECTURE#only-the-workspace-reads-files, rules-of-the-shop |

  Rule: A kind no discipline names is no work: nothing lists it as unplanned, and check reports a maturity on it

    Only work is still to come at a maturity, and planned: a risk or a policy is what it is, its rules
    with examples, until the team adds its kind to a discipline.

    Scenario: A risk at a maturity
      Given these specs:
        | tags                                 | Feature |
        | @id=outage @kind=risk @maturity=idea | Outage  |
      When the lifecycle is computed
      Then the unplanned work is "nothing"
      When the workspace is checked
      Then sdp reports:
        | rule                | node   | at                     |
        | maturity-on-no-work | outage | specs/outage.feature:1 |

  Rule: A rule is planned on its own, as work of its spec's kind

    A change to a built feature is planned rule by rule.

    Scenario: A rule still to come of a live feature, planned into IT-baseline
      Given a file "specs/cart.feature" containing:
        """
        @id=cart
        Feature: Cart

          Shoppers collect items before paying.

          Rule: A cart holds what was added

            Scenario: Add an item
              Then the cart holds 1 item

          @maturity=draft @iteration:IT-baseline
          Rule: A cart is kept for a week
        """
      When the lifecycle is computed
      Then the iterations are:
        | id           | plans                          | stages  |
        | IT-scope     |                                |         |
        | IT-prototype | alpha, staging                 | idea:2  |
        | IT-baseline  | cart#a-cart-is-kept-for-a-week | draft:1 |
      And the planned activity is:
        | discipline   | IT-prototype | IT-baseline |
        | requirements | 1            | 1           |

  Rule: Work still to come, at every maturity, is unplanned until it is planned

    What is built needs no plan; a rule still to come is planned with its spec, or on its own.

    Scenario Outline: A feature <case>
      Given a file "specs/cart.feature" containing:
        """
        @id=cart <maturity> <plan>
        Feature: Cart

          Shoppers collect items before paying.

          Rule: A cart holds what was added

            Scenario: Add an item
              Then the cart holds 1 item

          @maturity=draft
          Rule: A cart is kept for a week
        """
      When the lifecycle is computed
      Then the unplanned work is "<unplanned>"

      Examples:
        | case                              | maturity        | plan                   | unplanned                      |
        | that is live, with a rule to come |                 |                        | cart#a-cart-is-kept-for-a-week |
        | at the top of the ladder          | @maturity=ready |                        | cart                           |
        | that is ready and planned         | @maturity=ready | @iteration:IT-baseline | nothing                        |

  Rule: The chart shades each discipline relative to its busiest iteration

    Scenario: Half of IT-baseline's requirements work in IT-prototype
      Given these specs:
        | tags                                            | Feature |
        | @id=beta @maturity=idea @iteration:IT-baseline  | Beta    |
        | @id=gamma @maturity=idea @iteration:IT-baseline | Gamma   |
      When the lifecycle is computed on "2026-01-20"
      Then the output line with "requirements" contains "    ▒▒▒ ███"

  Rule: Evidence shows as the stages of an iteration's work, never as planned activity

    Kept apart, the plan and the evidence can be compared: a plan that counted what was verified
    could never fall behind.

    Scenario: A feature verified in IT-baseline
      Given a file "specs/beta.feature" containing:
        """
        @id=beta @iteration:IT-baseline
        Feature: Beta

          Something worth testing.

          Rule: It works

            Scenario: Works
              Then it works
        """
      And a step definition "it works" that passes
      When the workspace is run
      And the lifecycle is computed on "2026-02-20"
      Then the planned activity is:
        | discipline     | IT-baseline |
        | implementation | 0           |
        | test           | 0           |
      And the iterations are:
        | id           | stages     |
        | IT-scope     |            |
        | IT-prototype | idea:2     |
        | IT-baseline  | verified:1 |

  Rule: The next milestone shows its gate one scenario at a time, as last run

    Scenario: Before a run and after it
      Given these specs:
        | tags                    | Feature |
        | @id=beta @maturity=idea | Beta    |
      When the lifecycle is computed on "2026-01-20"
      Then the milestones are:
        | id              | gate | next |
        | MS-objectives   | 0/2  | yes  |
        | MS-architecture | 0/1  |      |
      When the workspace is run
      And the lifecycle is computed on "2026-01-20"
      Then the milestones are:
        | id              | gate | next |
        | MS-objectives   | 1/2  | yes  |
        | MS-architecture | 1/1  |      |
      And the output contains "✘ Every feature is in an iteration"

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

  Rule: Nothing enforces a gate unasked: a run reports it apart from the work, and only sdp gate fails on it

    A gate not met yet is where the project is going, not a regression: a run that failed on it
    would fail every build before the milestone.

    Scenario: A run with a gate that is not met
      Given these specs:
        | tags                    | Feature |
        | @id=beta @maturity=idea | Beta    |
      When I run "sdp run --json"
      Then the exit code is 0
      And the JSON output has:
        | data.summary.failed | 0 |
        | data.gates.failed   | 1 |
      When I run "sdp gate MS-objectives"
      Then the exit code is 1

  Rule: sdp gate --record writes @met on a milestone whose gate passes as the workspace is when it is written, and on no other

    Met is recorded once, by somebody, not read from the calendar or today's results: a date would
    fail tomorrow the commit that passes today, and results are local and go stale.

    Scenario: Written on the milestone's tag line, and the project moves to the next milestone
      Given a file "specs/MS-objectives.feature" containing:
        """
        @id=MS-objectives @closes:PH-inception
        Feature: Lifecycle objectives

          Rule: The work is planned

            Scenario: There is a plan
              Then the query "iteration" returns at least 1 result
        """
      When I run "sdp gate MS-objectives --record"
      Then the exit code is 0
      And the file "specs/MS-objectives.feature" contains "@id=MS-objectives @closes:PH-inception @met=20"
      When I run "sdp lifecycle --json"
      Then the JSON output has:
        | data.position.milestone | MS-architecture |

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
      When I run "sdp gate MS-objectives --record"
      Then the exit code is 2
      And the output contains "MS-objectives is not recorded as met: sdp could not read the whole graph"
      And the file "specs/MS-objectives.feature" does not contain "@met="

  Rule: Milestones are met in the order of their dates

    Where the project is, is the first milestone not met: one met before an earlier one would leave
    the project at a milestone it is already past.

    Scenario: Recorded in order, and refused out of it
      When I run "sdp gate MS-architecture --record"
      Then the exit code is 1
      And the output contains "MS-architecture cannot be met before MS-objectives"
      When I run "sdp gate MS-objectives --record"
      Then the exit code is 0
      When I run "sdp gate MS-architecture --record"
      Then the exit code is 0

  Rule: A milestone that is met is closed: its gate does not run again, nor is it needed once its scenarios moved

    Run again, the gate would read a graph that has moved on; once met, its scenarios are a plan of
    work that is done, to be deleted or to become the tests of what was built.

    Scenario: A met milestone whose gate would fail now, and one whose gate is gone
      Given a file "specs/MS-objectives.feature" containing:
        """
        @id=MS-objectives @closes:PH-inception @met=2026-01-30
        Feature: Lifecycle objectives

          Rule: The work is planned

            Scenario: There is no plan
              Then the query "iteration" returns no results
        """
      When the workspace is run
      Then node "MS-objectives#there-is-no-plan" has attribute status = "unrun"
      When I run "sdp gate MS-objectives"
      Then the exit code is 0
      And the output contains "MS-objectives was met on 2026-01-30"
      Given a file "specs/MS-objectives.feature" containing:
        """
        @id=MS-objectives @closes:PH-inception @met=2026-01-30
        Feature: Lifecycle objectives
        """
      When I run "sdp gate MS-objectives"
      Then the exit code is 0

  @decided-by:declared-maturity-derived-stage
  Rule: What ready means is the team's Definition of Ready, a gate of its own

    sdp checks nothing a maturity claims: it cannot know whether the design behind a spec is
    decided or anyone has reviewed it.

    Scenario Outline: A ready feature, its review and what it depends on
      Given a file "specs/definition-of-ready.feature" containing:
        """
        @id=definition-of-ready @kind=policy
        Feature: Definition of Ready

          Rule: A ready feature is reviewed, and what it depends on is ready too

            @gate
            Scenario: Reviewed, and depending only on what is ready
              Then the query "feature[maturity=ready] ?-depends-on-> feature[maturity<ready]" returns no results
              And the query "feature[maturity=ready, !reviewed-by]" returns no results
        """
      And a file "specs/reports.feature" containing:
        """
        @id=reports @maturity=<dependency> @reviewed-by=analysts
        Feature: Reports

          Analysts see what was sold.

          Rule: Sales are reported by day
        """
      And a file "specs/export-to-csv.feature" containing:
        """
        @id=export-to-csv @maturity=ready <review> @depends-on:reports
        Feature: Export to CSV

          Analysts want data in a spreadsheet.

          Rule: Every row is exported
        """
      When I run "sdp gate definition-of-ready"
      Then the exit code is <exit code>

      Examples:
        | dependency | review                | exit code |
        | draft      | @reviewed-by=analysts | 1         |
        | ready      |                       | 1         |
        | ready      | @reviewed-by=analysts | 0         |

  Rule: A plan names declared iterations, phases and disciplines, and plans only work that belongs to a discipline

    Planned activity is counted by discipline, in iterations: a link to anything else, or work of a
    kind no discipline takes, would otherwise plan nothing without a word.

    Scenario Outline: What is wrong with each reference
      Given these specs:
        | tags                           | Feature |
        | @id=beta @maturity=idea <tags> | Beta    |
      When the workspace is checked
      Then sdp reports:
        | rule           | severity | node | at                   | message   |
        | plan-reference | warning  | beta | specs/beta.feature:1 | <problem> |

      Examples:
        | tags                               | problem                              |
        | @iteration:PH-elaboration          | "PH-elaboration" names no iteration  |
        | @activity.testing:IT-prototype     | "testing", which is not a discipline |
        | @kind=risk @iteration:IT-prototype | belongs to no discipline             |

  @maturity=idea
  Rule: Each iteration shows which specs and code changed in its dates beside what was planned, and one whose planned work saw no change stands out

    Once people stop moving work between iterations, the chart of the plan is a drawing.

  @maturity=ready @iteration:IT-agent-plugin
  Rule: lifecycle --brief prints the milestone, the work planned now and its open questions within 2,000 characters, and says what it left out

    It is what an agent is told as a session starts, where little text fits. The work planned now is
    the current iteration's, or the next one's when none is current.

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

  @decided-by:areas-for-reading-epics-for-work
  Rule: An epic is plan, as a milestone is: no discipline names it by default, so it declares no maturity and needs no rule

    Scenario: An epic that only names its work
      Given a file "specs/wishlist.feature" containing:
        """
        @id=wishlist @maturity=idea
        Feature: Wishlist
        """
      And a file "specs/saving.feature" containing:
        """
        @id=saving @kind=epic @includes:wishlist
        Feature: Saving for later
        """
      When I run "sdp check --base none"
      Then the exit code is 0
      And the output contains "0 error(s)"

  Rule: A date of the plan is written on what it dates, and one written on anything else is reported

    An iteration starts and ends, and a milestone is met; anywhere else a date plans nothing.

    Scenario Outline: @<fact>= on <what>
      Given these specs:
        | tags   | Feature |
        | <tags> | <title> |
      When the workspace is checked
      Then sdp reports "<reported>"

      Examples:
        | fact  | what         | tags                                          | title | reported  |
        | start | an iteration | @id=IT-beta @start=2026-11-16 @end=2026-11-27 | Beta  | nothing   |
        | start | a feature    | @id=cart @maturity=idea @start=2026-11-16     | Cart  | fact-kind |
        | met   | a feature    | @id=cart @maturity=idea @met=2026-11-27       | Cart  | fact-kind |

  @maturity=idea @decided-by:areas-for-reading-epics-for-work
  Rule: lifecycle shows each epic with where each of its items stands, and points out one whose every item is live, to be deleted

  @maturity=idea
  Rule: lifecycle lists the work planned into no iteration under its area and its spec, each with its maturity, not as one line of ids

    The backlog is read by whoever chooses what is next, and one line of forty ids is not read.
