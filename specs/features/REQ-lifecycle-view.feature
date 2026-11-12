@id=REQ-lifecycle-view @maturity=ready
@realized-by:ARCH-lifecycle
Feature: Lifecycle view

  The plan is part of the graph: iterations on a timeline, milestones that each end a stretch of it,
  and work that names the iterations it is done in. `sdp lifecycle` shows where the project is next
  to where the calendar is, the work planned into each iteration, and the evidence for it.

  Background:
    Given these specs:
      | tags                                                                           | Feature     |
      | @id=PH-inception                                                               | Inception   |
      | @id=PH-elaboration                                                             | Elaboration |
      | @id=I1 @kind=iteration @phase:PH-inception @start=2026-01-05 @end=2026-01-30   | I1          |
      | @id=E1 @kind=iteration @phase:PH-elaboration @start=2026-02-02 @end=2026-02-13 | E1          |
      | @id=E2 @kind=iteration @phase:PH-elaboration @start=2026-02-16 @end=2026-02-27 | E2          |
      | @id=REQ-a @maturity=ready @iteration:E1                                        | Alpha       |
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

  Rule: A milestone's gate is shown as last run and is no work: it has no stage, and once met it does not run again

    Scenario: The next milestone shows its gate one scenario at a time, as last run
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

    Scenario: A gate not met yet is no failing work
      Given these specs:
        | tags                     | Feature |
        | @id=REQ-b @maturity=idea | Beta    |
      When the workspace is run
      Then node "MS-LCO#every-requirement-is-in-an-iteration" has attribute status = "failed"
      And sdp status counts the stages "idea:1 ready:1"

    Scenario: A met milestone whose gate would fail now
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
        | E1 | ready:1    |
        | E2 | verified:1 |
