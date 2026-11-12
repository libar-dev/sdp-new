@id=plan-delivery @kind=feature @maturity=ready
@realized-by:ARCH-lifecycle @realized-by:ARCH-reports @realized-by:ARCH-runner @realized-by:ARCH-checker
Feature: Plan delivery

  A team, and whoever leads its delivery, needs to see where the project stands, read from evidence
  rather than from statuses: which milestone is next and whether its gate passes, what work is
  planned into which iteration, and what has been verified. A status in a tracker is what someone
  last remembered to set, where no scenario can read it. Here the plan is part of the same graph as
  the work: iterations on a timeline, milestones whose gates are scenarios, and work that names the
  iteration it is done in, so `sdp lifecycle` shows it next to the calendar and the evidence.

  Not a tracker: sdp assigns no one, estimates nothing and moves no date, and nothing in the plan
  is a status set by hand.

  Background:
    Given these specs:
      | tags                                                                           | Feature     |
      | @id=PH-inception                                                               | Inception   |
      | @id=PH-elaboration                                                             | Elaboration |
      | @id=I1 @kind=iteration @phase:PH-inception @start=2026-01-05 @end=2026-01-30   | I1          |
      | @id=E1 @kind=iteration @phase:PH-elaboration @start=2026-02-02 @end=2026-02-13 | E1          |
      | @id=E2 @kind=iteration @phase:PH-elaboration @start=2026-02-16 @end=2026-02-27 | E2          |
      | @id=REQ-a @maturity=idea @iteration:E1                                         | Alpha       |
      | @id=ARCH-x @iteration:E1                                                       | An element  |
    And a file "specs/MS-LCO.feature" containing:
      """
      @id=MS-LCO @closes:PH-inception
      Feature: Lifecycle objectives

        Rule: The work is planned

          Scenario: There is a plan
            Then the query "iteration" returns at least 1 result

          Scenario: Every requirement is in an iteration
            Then the query "requirement !-iteration-> iteration" returns no results
      """
    And a file "specs/MS-LCA.feature" containing:
      """
      @id=MS-LCA @closes:PH-elaboration
      Feature: Lifecycle architecture

        Rule: The architecture is baselined

          Scenario: There is an architecture
            Then the query "element" returns at least 1 result
      """

  Rule: sdp lifecycle shows where the project is, the first milestone not met, then the planned work, with the evidence apart from the plan

    Scenario: The milestones and the chart as text
      When I run "sdp lifecycle"
      Then the output line with "MS-LCO" contains "▶"
      And the output line with "MS-LCO" contains "Inception"
      And the output line with "MS-LCO" contains "I1"
      And the output contains "DISCIPLINE ACTIVITY"
      And the output contains "░ ▒ ▓ █  more work in an iteration, relative to the discipline's busiest; blank: none"

    Scenario: Where the project is, as data
      When I run "sdp lifecycle --json"
      Then the JSON output has:
        | data.position.milestone        | MS-LCO                       |
        | data.position.phase            | PH-inception                 |
        | data.milestones                | MS-LCO, MS-LCA               |
        | data.milestones.gate.passed    | 0, 0                         |
        | data.phases                    | PH-inception, PH-elaboration |
        | data.iterations                | I1, E1, E2                   |
        | data.disciplines.requirements  | 0, 1, 0                      |
        | data.work.evidence.stages.idea | 1                            |

  Rule: Before there is a plan, sdp lifecycle says how to write one, and the templates write a plan it shows

    Scenario: In a fresh workspace
      When I run "sdp -C fresh init"
      Then the output contains "created sdp.config.yaml"
      When I run "sdp -C fresh lifecycle"
      Then the output contains 'sdp new phase "Elaboration"'
      And the output contains 'sdp new iteration "<title>"'
      When I run "sdp -C fresh new plan 'Delivery plan'"
      Then the output contains "PLAN-delivery-plan\tspecs/delivery/PLAN-delivery-plan.feature"
      And the output contains 'next: end each phase with a milestone: sdp new milestone "<title>" writes one that `@closes:PH-elaboration`'
      When I run the pipeline:
        """
        sdp -C fresh new phase Elaboration
        sdp -C fresh new iteration 'Architecture baseline' --id E1
        sdp -C fresh new milestone 'Architecture baseline'
        """
      Then the exit code is 0
      And the file "fresh/specs/delivery/E1.feature" contains "@id=E1 @kind=iteration @phase:PH-elaboration"
      And the file "fresh/specs/delivery/MS-architecture-baseline.feature" contains "@id=MS-architecture-baseline @closes:PH-elaboration"
      When I run "sdp -C fresh lifecycle"
      Then the output line with "MS-architecture-baseline" contains "Elaboration"
      And the output line with "MS-architecture-baseline" contains "E1"

    Scenario: In the workspace's own words
      Given a file "fresh/sdp.config.yaml" containing:
        """
        vocabulary:
          kinds: { phase: [stage], iteration: [sprint] }
          relations: { phase: [in-stage], plan: [in-sprint] }
        """
      When I run "sdp -C fresh lifecycle"
      Then the output contains 'sdp new stage "Elaboration"'
      And the output contains 'sdp new sprint "<title>"'

  Rule: The timeline is the iterations in the order they end, each under its phase

    A milestone is dated by the end of what it closes, and milestones are met in the order of their
    dates: so an iteration inside a longer one comes before it.

    Scenario: Inception's iteration, then Elaboration's two
      When the lifecycle is computed
      Then the iterations are:
        | id | phase          |
        | I1 | PH-inception   |
        | E1 | PH-elaboration |
        | E2 | PH-elaboration |

    Scenario: An iteration inside a longer one ends first, and its milestone is the one to meet first
      Given these specs:
        | tags                                                     | Feature |
        | @id=X1 @kind=iteration @start=2026-01-05 @end=2026-03-27 | Long    |
        | @id=X2 @kind=iteration @start=2026-01-12 @end=2026-01-23 | Short   |
        | @id=MS-long @closes:X1                                   | Long    |
        | @id=MS-short @closes:X2                                  | Short   |
      When the lifecycle is computed on "2026-01-20"
      Then the milestones are:
        | id       | planned    | next |
        | MS-short | 2026-01-23 | yes  |
        | MS-LCO   | 2026-01-30 |      |
        | MS-LCA   | 2026-02-27 |      |
        | MS-long  | 2026-03-27 |      |

  Rule: A milestone closes a phase or an iteration, and ends every iteration since the milestone before it

    Scenario: A demo that closes E1, between the milestones of the two phases
      Given these specs:
        | tags                   | Feature |
        | @id=MS-demo @closes:E1 | Demo    |
      When the lifecycle is computed on "2026-01-20"
      Then the milestones are:
        | id      | phase          | iterations | planned    |
        | MS-LCO  | PH-inception   | I1         | 2026-01-30 |
        | MS-demo | PH-elaboration | E1         | 2026-02-13 |
        | MS-LCA  | PH-elaboration | E2         | 2026-02-27 |
      And the iterations are:
        | id | today |
        | I1 | yes   |
        | E1 |       |
        | E2 |       |

    Scenario: A timeline needs no phases, and a milestone nothing but what it closes
      Given these specs:
        | tags                                                     | Feature        |
        | @id=I1 @kind=iteration @start=2026-01-05 @end=2026-01-30 | I1             |
        | @id=E1 @kind=iteration @start=2026-02-02 @end=2026-02-13 | E1             |
        | @id=E2 @kind=iteration @start=2026-02-16 @end=2026-02-27 | E2             |
        | @id=MS-LCO @closes:I1                                    | First release  |
        | @id=MS-LCA @closes:E1                                    | Second release |
      When the lifecycle is computed on "2026-02-20"
      Then the milestones are:
        | id     | closes | phase | iterations | planned    | next |
        | MS-LCO | I1     |       | I1         | 2026-01-30 | yes  |
        | MS-LCA | E1     |       | E1         | 2026-02-13 |      |
      And the output contains "project at MS-LCO · calendar in E2"
      And the output line with "no milestone" contains "E2*"

  Rule: A new iteration follows the one that ends last, in its phase

    Scenario: After E2, which ends last
      When I run "sdp new iteration Packaging --id E3"
      Then the file "specs/delivery/E3.feature" is:
        """
        @id=E3 @kind=iteration @phase:PH-elaboration @start=2026-02-28 @end=2026-03-13
        Feature: Packaging
        """
      And the output contains "next: check its dates and its `@phase:`"

    Scenario: Not after an iteration whose end is no date
      Given these specs:
        | tags                                                                           | Feature |
        | @id=E2 @kind=iteration @phase:PH-elaboration @start=2026-02-16 @end=2026-02-30 | E2      |
      When I run "sdp new iteration Packaging --id E3"
      Then the exit code is 1
      And the output contains 'E2 ends on "2026-02-30", which is not a date'
      And the file "specs/delivery/E3.feature" does not exist

  Rule: The project is at the first milestone not met; the calendar marks only today and lateness

    Scenario: Inception met while the calendar is still in it
      Given these specs:
        | tags                                            | Feature              |
        | @id=MS-LCO @closes:PH-inception @met=2026-01-30 | Lifecycle objectives |
      When the lifecycle is computed on "2026-01-20"
      Then the milestones are:
        | id     | met        | next |
        | MS-LCO | 2026-01-30 |      |
        | MS-LCA |            | yes  |
      And the output contains "project in Elaboration · calendar in I1"
      And the output line with "MS-LCO" contains "✔"
      And the output line with "MS-LCA" contains "▶"

    Scenario: A met that is no day of the calendar records nothing
      Given these specs:
        | tags                                            | Feature              |
        | @id=MS-LCO @closes:PH-inception @met=2026-02-30 | Lifecycle objectives |
      When the lifecycle is computed on "2026-01-20"
      Then the milestones are:
        | id     | met | next |
        | MS-LCO |     | yes  |
        | MS-LCA |     |      |

    Scenario: Past its date and not met, a milestone is late
      When the lifecycle is computed on "2026-02-20"
      Then the milestones are:
        | id     | met | next |
        | MS-LCO |     | yes  |
        | MS-LCA |     |      |
      And the iterations are:
        | id | today |
        | I1 |       |
        | E1 |       |
        | E2 | yes   |
      And the output contains "project in Inception · calendar in E2"
      And the output line with "MS-LCO" contains "late 21d"
      And the output line with "MS-LCA" does not contain "late"

    Scenario Outline: A milestone met off its date says by how many days
      Given these specs:
        | tags                                       | Feature              |
        | @id=MS-LCO @closes:PH-inception @met=<met> | Lifecycle objectives |
      When the lifecycle is computed on "2026-02-20"
      Then the output line with "MS-LCO" contains "met <met> (<off>)"

      Examples:
        | met        | off |
        | 2026-02-03 | +4d |
        | 2026-01-28 | -2d |

  Rule: Work is planned on the node itself: its iteration plans the discipline of its kind, an activity tag any other

    A requirement is written in one iteration and built in another, and a gate has to tell the two
    apart.

    Scenario: A requirement and an element in E1
      When the lifecycle is computed
      Then the planned activity is:
        | discipline      | E1 | E2 |
        | requirements    | 1  | 0  |
        | analysis-design | 1  | 0  |
        | implementation  | 0  | 0  |

    Scenario: Analysed in E1, built over E1 and E2, tested in E2
      Given these specs:
        | tags                                                                                                                                          | Feature |
        | @id=REQ-b @maturity=idea @iteration:E1 @activity.analysis-design:E1 @activity.implementation:E1 @activity.implementation:E2 @activity.test:E2 | Beta    |
      When the lifecycle is computed
      Then the planned activity is:
        | discipline      | E1 | E2 |
        | requirements    | 2  | 0  |
        | analysis-design | 2  | 0  |
        | implementation  | 1  | 1  |
        | test            | 0  | 1  |
      And the iterations are:
        | id | plans                |
        | I1 |                      |
        | E1 | ARCH-x, REQ-a, REQ-b |
        | E2 | REQ-b                |

    Scenario: A discipline with links of its own is planned only into the iterations they name
      Given these specs:
        | tags                                                             | Feature |
        | @id=REQ-b @maturity=idea @iteration:E1 @activity.requirements:E2 | Beta    |
      When the lifecycle is computed
      Then the planned activity is:
        | discipline   | E1 | E2 |
        | requirements | 1  | 1  |
      And the iterations are:
        | id | plans                |
        | I1 |                      |
        | E1 | ARCH-x, REQ-a, REQ-b |
        | E2 | REQ-b                |

  Rule: The plan's own nodes are no work

    Scenario: A milestone planned into an iteration
      Given these specs:
        | tags                                 | Feature |
        | @id=MS-demo @closes:E2 @iteration:E2 | Demo    |
      When the lifecycle is computed
      Then the iterations are:
        | id | plans         |
        | I1 |               |
        | E1 | ARCH-x, REQ-a |
        | E2 |               |

  Rule: Only work still to do can be unplanned: what has a maturity and is not verified

    Once a spec is built, its scenarios are the record of it, and a plan of it is history.

    Scenario: An unplanned requirement and an unplanned element
      Given these specs:
        | tags                         | Feature |
        | @id=REQ-later @maturity=idea | Later   |
        | @id=ARCH-cache               | Cache   |
      When the lifecycle is computed on "2026-01-20"
      Then the output line with "unplanned" contains "REQ-later"
      And the output line with "unplanned" does not contain "ARCH-cache"

    Scenario: A requirement that is built, with no plan
      Given a file "specs/REQ-done.feature" containing:
        """
        @id=REQ-done @maturity=ready
        Feature: Done

          Something already built.

          Rule: It works

            Scenario: Works
              Then it works
        """
      And these specs:
        | tags                         | Feature |
        | @id=REQ-later @maturity=idea | Later   |
      And a step definition "it works" that passes
      When the workspace is run
      And the lifecycle is computed on "2026-01-20"
      Then the output line with "unplanned" contains "REQ-later"
      And the output line with "unplanned" does not contain "REQ-done"

  Rule: The chart shades each discipline relative to its busiest iteration

    Its columns are numbered as the planned work numbers the iterations, so that an iteration's id
    can say what it is at any length.

    Scenario: Half of E2's requirements work in E1
      Given these specs:
        | tags                                   | Feature |
        | @id=REQ-b @maturity=idea @iteration:E2 | Beta    |
        | @id=REQ-c @maturity=idea @iteration:E2 | Gamma   |
      When the lifecycle is computed on "2026-01-20"
      Then the output line with "requirements" contains "    ▒▒▒ ███"
      And the output contains "1   2   3"
      And the output contains "  3  E2 "

  Rule: Evidence shows as the stages of an iteration's work, never as planned activity

    Scenario: A requirement verified in E2
      Given a file "specs/REQ-b.feature" containing:
        """
        @id=REQ-b @maturity=ready @iteration:E2
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
        | discipline     | E2 |
        | implementation | 0  |
        | test           | 0  |
      And the iterations are:
        | id | stages     |
        | I1 |            |
        | E1 | idea:1     |
        | E2 | verified:1 |

  Rule: The next milestone shows its gate one scenario at a time, as last run

    Scenario: Before a run and after it
      Given these specs:
        | tags                     | Feature |
        | @id=REQ-b @maturity=idea | Beta    |
      When the lifecycle is computed on "2026-01-20"
      Then the milestones are:
        | id     | gate | next |
        | MS-LCO | 0/2  | yes  |
        | MS-LCA | 0/1  |      |
      And the output contains "… There is a plan  (unrun)"
      When the workspace is run
      And the lifecycle is computed on "2026-01-20"
      Then the milestones are:
        | id     | gate | next |
        | MS-LCO | 1/2  | yes  |
        | MS-LCA | 1/1  |      |
      And the output contains "✔ There is a plan"
      And the output contains "✘ Every requirement is in an iteration"

  Rule: A gate passes only when every one of its scenarios passed, run against the current graph

    Scenario: A step not automated yet
      Given a file "specs/MS-release.feature" containing:
        """
        @id=MS-release
        Feature: Release

          Rule: The package is published

            Scenario: Published
              Given the release candidate is tagged
        """
      When I run "sdp gate MS-release"
      Then the exit code is 1
      And the output contains "1 undefined"

  Rule: Nothing enforces a gate unasked: a run reports it apart from the work, and only sdp gate fails on it

    Scenario: A run with a gate that is not met
      Given these specs:
        | tags                     | Feature |
        | @id=REQ-b @maturity=idea | Beta    |
      When I run "sdp run --json"
      Then the exit code is 0
      And the JSON output has:
        | data.summary.failed | 0 |
        | data.gates.failed   | 1 |
      When I run "sdp gate MS-LCO"
      Then the exit code is 1

    Scenario: A gate not met yet is no failing work
      Given these specs:
        | tags                     | Feature |
        | @id=REQ-b @maturity=idea | Beta    |
      When the workspace is run
      Then node "MS-LCO#every-requirement-is-in-an-iteration" has attribute status = "failed"
      And sdp status counts the stages "idea:2"

    Scenario: The build of sdp itself enforces no gate
      When I run "grep verify package.json" in the repository
      Then the output does not contain "gate"

  Rule: sdp gate --record writes @met on a milestone whose gate passes as the workspace is when it is written, and on no other

    Met is recorded once, not read from the calendar or from today's results: a date would fail
    tomorrow the commit that passes today, and results are local and go stale. Recording is
    somebody's act, and a criterion edited while the gate ran has not run.

    Scenario: Nothing is recorded while the gate does not pass
      Given these specs:
        | tags                     | Feature |
        | @id=REQ-b @maturity=idea | Beta    |
      When I run "sdp gate MS-LCO --record"
      Then the exit code is 1
      And the output contains "MS-LCO is not recorded as met"
      And the file "specs/MS-LCO.feature" does not contain "@met="

    Scenario: Written on the milestone's tag line, and the project moves to the next milestone
      Given a file "specs/MS-LCO.feature" containing:
        """
        @id=MS-LCO @closes:PH-inception   # the first phase
        Feature: Lifecycle objectives

          Rule: The work is planned

            Scenario: There is a plan
              Then the query "iteration" returns at least 1 result
        """
      When I run "sdp gate MS-LCO --record"
      Then the exit code is 0
      And the file "specs/MS-LCO.feature" contains "@id=MS-LCO @closes:PH-inception @met=20"
      And the file "specs/MS-LCO.feature" contains "   # the first phase"
      When I run "sdp q milestone[met=$TODAY] --ids"
      Then the output lines are "MS-LCO"
      When I run "sdp lifecycle --json"
      Then the JSON output has:
        | data.position.milestone | MS-LCA |
        | data.milestones.0.id    | MS-LCO |
        | data.milestones.0.gate  | null   |

    Scenario: Nothing is recorded when the milestone changed while its gate ran
      Given a file "specs/MS-LCO.feature" containing:
        """
        @id=MS-LCO @closes:PH-inception
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
            const file = "specs/MS-LCO.feature"
            writeFileSync(file, readFileSync(file, "utf8").replace("the gate is edited while it runs", "a step nobody wrote"))
          })
        })
        """
      When I run "sdp gate MS-LCO --record"
      Then the exit code is 1
      And the output contains "MS-LCO is not recorded as met: its gate changed while it ran, and MS-LCO#there-is-a-plan (stale) does not pass"
      And the file "specs/MS-LCO.feature" does not contain "@met="

  Rule: Milestones are met in the order of their dates

    Scenario: Recorded in order, and refused out of it
      When I run "sdp gate MS-LCA --record"
      Then the exit code is 1
      And the output contains "MS-LCA cannot be met before MS-LCO"
      When I run "sdp gate MS-LCO --record"
      Then the exit code is 0
      When I run "sdp gate MS-LCA --record"
      Then the exit code is 0
      When I run "sdp q milestone[met] --ids"
      Then the output lines are "MS-LCA, MS-LCO"

    Scenario: A milestone written as met before one dated earlier is reported
      Given these specs:
        | tags                                              | Feature                |
        | @id=MS-LCA @closes:PH-elaboration @met=2026-02-27 | Lifecycle architecture |
      When the workspace is checked
      Then sdp reports at least:
        | rule          | node   | at                     |
        | milestone-met | MS-LCA | specs/MS-LCA.feature:1 |

  Rule: A milestone that is met is closed: its gate does not run again, nor is it needed once its criteria moved

    Scenario: A met milestone whose gate would fail now, and one whose gate is gone
      Given a file "specs/MS-LCO.feature" containing:
        """
        @id=MS-LCO @closes:PH-inception @met=2026-01-30
        Feature: Lifecycle objectives

          Rule: The work is planned

            Scenario: There is no plan
              Then the query "iteration" returns no results
        """
      When the workspace is run
      Then node "MS-LCO#there-is-no-plan" has attribute status = "unrun"
      When I run "sdp gate MS-LCO"
      Then the exit code is 0
      And the output contains "MS-LCO was met on 2026-01-30"
      Given a file "specs/MS-LCO.feature" containing:
        """
        @id=MS-LCO @closes:PH-inception @met=2026-01-30
        Feature: Lifecycle objectives
        """
      When I run "sdp gate MS-LCO"
      Then the exit code is 0
      And the output contains "MS-LCO was met on 2026-01-30"
      When I run "sdp status"
      Then the output contains "milestones    met 1 · open 1"

  @decided-by:declared-maturity-derived-stage
  Rule: What ready means beyond the shape of a spec is the team's Definition of Ready, a gate of its own

    sdp cannot know whether the design behind a spec is decided or anyone has reviewed it: a
    placeholder paragraph with a token scenario meets every criterion.

    Scenario Outline: A ready requirement, its review and what it depends on
      Given a file "specs/POL-definition-of-ready.feature" containing:
        """
        @id=POL-definition-of-ready @kind=policy
        Feature: Definition of Ready

          Rule: A ready requirement is reviewed, and what it depends on is ready too

            @gate
            Scenario: Reviewed, and depending only on what is ready
              Then the query "requirement[maturity=ready] ?-depends-on-> requirement[maturity<ready]" returns no results
              And the query "requirement[maturity=ready, !reviewed-by]" returns no results
        """
      And a file "specs/REQ-reports.feature" containing:
        """
        @id=REQ-reports @maturity=<dependency> @reviewed-by=analysts
        Feature: Reports

          Analysts see what was sold.

          Rule: Sales are reported by day

            Scenario: Sales by day
              Then the report has one row per day
        """
      And a file "specs/REQ-csv.feature" containing:
        """
        @id=REQ-csv @maturity=ready <review> @depends-on:REQ-reports
        Feature: Export to CSV

          Analysts want data in Excel.

          Rule: Every row is exported

            Scenario: Export current rows
              When I export the report
              Then I get a CSV file with one line per row
        """
      When I run "sdp check"
      Then the exit code is 0
      When I run "sdp gate POL-definition-of-ready"
      Then the exit code is <exit code>

      Examples:
        | dependency | review                | exit code |
        | draft      | @reviewed-by=analysts | 1         |
        | ready      |                       | 1         |
        | ready      | @reviewed-by=analysts | 0         |

  Rule: A plan names declared iterations, phases and disciplines, and plans only work that belongs to a discipline

    Scenario Outline: What is wrong with each reference
      Given these specs:
        | tags             | Feature |
        | @id=REQ-b <tags> | Beta    |
      When the workspace is checked
      Then sdp reports:
        | rule           | severity | node  | at                    | message   |
        | plan-reference | warning  | REQ-b | specs/REQ-b.feature:1 | <problem> |

      Examples:
        | tags                                                                | problem                              |
        | @iteration:PH-elaboration                                           | "PH-elaboration" names no iteration  |
        | @phase:E1                                                           | "E1" names no phase                  |
        | @closes:REQ-a                                                       | "REQ-a" names no phase or iteration  |
        | @activity.implementation:REQ-a                                      | "REQ-a" names no iteration           |
        | @activity.implementation:E1 @activity.implementation:PH-elaboration | "PH-elaboration" names no iteration  |
        | @activity.testing:E1                                                | "testing", which is not a discipline |
        | @kind=risk @iteration:E1                                            | belongs to no discipline             |

    Scenario: A requirement planned into what the plan declares
      Given these specs:
        | tags                                                                                                         | Feature |
        | @id=REQ-b @iteration:E1 @activity.analysis-design:E1 @activity.implementation:E1 @activity.implementation:E2 | Beta    |
      When the workspace is checked
      Then sdp reports nothing
