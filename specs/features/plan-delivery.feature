@id=plan-delivery
@realized-by:ARCH-lifecycle @realized-by:ARCH-application @realized-by:ARCH-reports @realized-by:ARCH-runner @realized-by:ARCH-checker
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
      | tags                                                                     | Feature     |
      | @id=PH-inception                                                         | Inception   |
      | @id=PH-elaboration                                                       | Elaboration |
      | @id=IT-scope @phase:PH-inception @start=2026-01-05 @end=2026-01-30       | Scope       |
      | @id=IT-prototype @phase:PH-elaboration @start=2026-02-02 @end=2026-02-13 | Prototype   |
      | @id=IT-baseline @phase:PH-elaboration @start=2026-02-16 @end=2026-02-27  | Baseline    |
      | @id=alpha @maturity=idea @iteration:IT-prototype                         | Alpha       |
      | @id=ARCH-x @maturity=idea @iteration:IT-prototype                        | An element  |
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

    Scenario: The milestones and the chart as text
      When I run "sdp lifecycle"
      Then the output line with "MS-objectives" contains "▶"
      And the output line with "MS-objectives" contains "Inception"
      And the output line with "MS-objectives" contains "IT-scope"
      And the output contains "DISCIPLINE ACTIVITY"
      And the output contains "░ ▒ ▓ █  more work in an iteration, relative to the discipline's busiest; blank: none"

    Scenario: Where the project is, as data
      When I run "sdp lifecycle --json"
      Then the JSON output has:
        | data.position.milestone        | MS-objectives                       |
        | data.position.phase            | PH-inception                        |
        | data.milestones                | MS-objectives, MS-architecture      |
        | data.milestones.gate.passed    | 0, 0                                |
        | data.phases                    | PH-inception, PH-elaboration        |
        | data.iterations                | IT-scope, IT-prototype, IT-baseline |
        | data.disciplines.requirements  | 0, 1, 0                             |
        | data.work.evidence.stages.idea | 2                                   |

  Rule: Before there is a plan, sdp lifecycle says how to write one, and the templates write a plan it shows

    Scenario: In a fresh workspace
      When I run "sdp -C fresh init"
      Then the output contains "created sdp.config.yaml"
      And the output contains 'a plan: sdp new phase "Elaboration", then sdp new iteration "<title>" and sdp new milestone "<title>"'
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
      And the output contains "next: set `@closes:` to the phase or the iteration this milestone ends"
      When I run "sdp -C fresh lifecycle"
      Then the output contains "project at MS-architecture-baseline"
      And the output line with "▶ MS-architecture-baseline" contains "0/1"
      And the output contains "… No errors in the specification graph  (unrun)"
      And the output line with "no milestone" contains "Elaboration"
      And the output line with "no milestone" contains "IT-architecture-baseline"

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

  Rule: The timeline is the iterations in the order they end, each under its phase; one without a last day has no place on it, and check says so

    A milestone is dated by the end of what it closes, and milestones are met in the order of their
    dates: so an iteration inside a longer one comes before it, and one needs no first day to have
    its place. An iteration without a last day is planned work all the same, after the timeline.

    Scenario: Inception's iteration, then Elaboration's two
      When the lifecycle is computed
      Then the iterations are:
        | id           | phase          |
        | IT-scope     | PH-inception   |
        | IT-prototype | PH-elaboration |
        | IT-baseline  | PH-elaboration |

    Scenario: An iteration inside a longer one ends first, and its milestone is the one to meet first
      Given these specs:
        | tags                                           | Feature |
        | @id=IT-long @start=2026-01-05 @end=2026-03-27  | Long    |
        | @id=IT-short @start=2026-01-12 @end=2026-01-23 | Short   |
        | @id=MS-long @closes:IT-long                    | Long    |
        | @id=MS-short @closes:IT-short                  | Short   |
      When the lifecycle is computed on "2026-01-20"
      Then the milestones are:
        | id              | planned    | next |
        | MS-short        | 2026-01-23 | yes  |
        | MS-objectives   | 2026-01-30 |      |
        | MS-architecture | 2026-02-27 |      |
        | MS-long         | 2026-03-27 |      |

    Scenario: Without a first day an iteration keeps its place; without a last day that is a date it has none, and check says why
      Given these specs:
        | tags                                                                    | Feature   |
        | @id=IT-prototype @phase:PH-elaboration @end=2026-02-13                  | Prototype |
        | @id=IT-baseline @phase:PH-elaboration @start=2026-02-16 @end=2026-02-30 | Baseline  |
        | @id=IT-hardening @phase:PH-elaboration                                  | Hardening |
        | @id=IT-release @phase:PH-elaboration @start=2026-04-31                  | Release   |
      When the lifecycle is computed
      Then the iterations are:
        | id           | phase          |
        | IT-scope     | PH-inception   |
        | IT-prototype | PH-elaboration |
        | IT-hardening | PH-elaboration |
        | IT-release   | PH-elaboration |
        | IT-baseline  | PH-elaboration |
      When the workspace is checked
      Then sdp reports:
        | rule      | at                           | message                                                                                                   |
        | plan-date | specs/IT-baseline.feature:1  | IT-baseline: end is "2026-02-30", which is not a date, so the timeline leaves it out                      |
        | plan-date | specs/IT-hardening.feature:1 | IT-hardening: end is not written, so the timeline leaves it out                                           |
        | plan-date | specs/IT-release.feature:1   | IT-release: end is not written, so the timeline leaves it out; start is "2026-04-31", which is not a date |

  Rule: An iteration without a last day is ended by the milestone that closes it, or else by its phase's

    It has no place on the timeline, so it is in no stretch between two milestones: the milestone
    that closes it ends it, and failing that the one that closes its phase.

    Scenario: IT-hardening closed by a milestone of its own, IT-polish by its phase's
      Given these specs:
        | tags                                   | Feature   |
        | @id=IT-hardening @phase:PH-elaboration | Hardening |
        | @id=IT-polish @phase:PH-elaboration    | Polish    |
        | @id=MS-hardened @closes:IT-hardening   | Hardened  |
      When the lifecycle is computed
      Then the milestones are:
        | id              | phase          | iterations                           | planned    | next |
        | MS-objectives   | PH-inception   | IT-scope                             | 2026-01-30 | yes  |
        | MS-architecture | PH-elaboration | IT-prototype, IT-baseline, IT-polish | 2026-02-27 |      |
        | MS-hardened     | PH-elaboration | IT-hardening                         |            |      |
      And the output does not contain "no milestone"

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
      And the iterations are:
        | id           | today |
        | IT-scope     | yes   |
        | IT-prototype |       |
        | IT-baseline  |       |

    Scenario: A timeline needs no phases, and a milestone nothing but what it closes
      Given these specs:
        | tags                                               | Feature        |
        | @id=IT-scope @start=2026-01-05 @end=2026-01-30     | Scope          |
        | @id=IT-prototype @start=2026-02-02 @end=2026-02-13 | Prototype      |
        | @id=IT-baseline @start=2026-02-16 @end=2026-02-27  | Baseline       |
        | @id=MS-objectives @closes:IT-scope                 | First release  |
        | @id=MS-architecture @closes:IT-prototype           | Second release |
      When the lifecycle is computed on "2026-02-20"
      Then the milestones are:
        | id              | closes       | phase | iterations   | planned    | next |
        | MS-objectives   | IT-scope     |       | IT-scope     | 2026-01-30 | yes  |
        | MS-architecture | IT-prototype |       | IT-prototype | 2026-02-13 |      |
      And the output contains "project at MS-objectives · calendar in IT-baseline"
      And the output line with "no milestone" contains "IT-baseline*"

    Scenario: A milestone that closes nothing is reported, with what to set
      Given these specs:
        | tags           | Feature |
        | @id=MS-release | Release |
      When the workspace is checked
      Then sdp reports:
        | rule           | severity | node       | at                         | message                                                               | hint                                             |
        | plan-reference | warning  | MS-release | specs/MS-release.feature:1 | MS-release: closes nothing, so no date places it among the milestones | set `@closes:` to the phase or iteration it ends |

  Rule: A new iteration follows the one that ends last, in its phase

    Scenario: After IT-baseline, which ends last
      When I run "sdp new iteration Packaging"
      Then the file "specs/plan/IT-packaging.feature" is:
        """
        @id=IT-packaging @phase:PH-elaboration @start=2026-02-28 @end=2026-03-13
        Feature: Packaging
        """
      And the output contains "next: check its dates and its `@phase:`"

    Scenario: Not after an iteration whose end is no date
      Given these specs:
        | tags                                                                    | Feature  |
        | @id=IT-baseline @phase:PH-elaboration @start=2026-02-16 @end=2026-02-30 | Baseline |
      When I run "sdp new iteration Packaging"
      Then the exit code is 1
      And the output contains 'IT-baseline ends on "2026-02-30", which is not a date'
      And the file "specs/plan/IT-packaging.feature" does not exist

  Rule: The project is at the first milestone not met; the calendar marks only today and lateness

    Where the project is follows from the files, which record what was met. A date says only what
    was planned, so the calendar can show a milestone late but never moves the project past it.

    Scenario: Inception met while the calendar is still in it
      Given these specs:
        | tags                                                   | Feature              |
        | @id=MS-objectives @closes:PH-inception @met=2026-01-30 | Lifecycle objectives |
      When the lifecycle is computed on "2026-01-20"
      Then the milestones are:
        | id              | met        | next |
        | MS-objectives   | 2026-01-30 |      |
        | MS-architecture |            | yes  |
      And the output contains "project in Elaboration · calendar in IT-scope"
      And the output line with "MS-objectives" contains "✔"
      And the output line with "MS-architecture" contains "▶"

    Scenario: A met that is no day of the calendar records nothing
      Given these specs:
        | tags                                                   | Feature              |
        | @id=MS-objectives @closes:PH-inception @met=2026-02-30 | Lifecycle objectives |
      When the lifecycle is computed on "2026-01-20"
      Then the milestones are:
        | id              | met | next |
        | MS-objectives   |     | yes  |
        | MS-architecture |     |      |

    Scenario: Past its date and not met, a milestone is late
      When the lifecycle is computed on "2026-02-20"
      Then the milestones are:
        | id              | met | next |
        | MS-objectives   |     | yes  |
        | MS-architecture |     |      |
      And the iterations are:
        | id           | today |
        | IT-scope     |       |
        | IT-prototype |       |
        | IT-baseline  | yes   |
      And the output contains "project in Inception · calendar in IT-baseline"
      And the output line with "MS-objectives" contains "late 21d"
      And the output line with "MS-architecture" does not contain "late"

    Scenario Outline: A milestone met off its date says by how many days
      Given these specs:
        | tags                                              | Feature              |
        | @id=MS-objectives @closes:PH-inception @met=<met> | Lifecycle objectives |
      When the lifecycle is computed on "2026-02-20"
      Then the output line with "MS-objectives" contains "met <met> (<off>)"

      Examples:
        | met        | off |
        | 2026-02-03 | +4d |
        | 2026-01-28 | -2d |

  Rule: An iteration without a first day is never today's, and lifecycle names each one today could be in

    Today is in an iteration from its first day to its last. Without a first day, sdp cannot say
    whether today falls in it, and says so rather than show a plan with no iteration today.

    Scenario: Two iterations dated only by their ends, on a day before both end
      Given these specs:
        | tags                                                                    | Feature   |
        | @id=IT-scope @phase:PH-inception @end=2026-01-30                        | Scope     |
        | @id=IT-prototype @phase:PH-elaboration @end=2026-02-13                  | Prototype |
      When the lifecycle is computed on "2026-01-20"
      Then the iterations are:
        | id           | today |
        | IT-scope     |       |
        | IT-prototype |       |
        | IT-baseline  |       |
      And the output contains "no iteration today: IT-scope, IT-prototype have no first day"
      When the lifecycle is computed on "2026-02-20"
      Then the output contains "calendar in IT-baseline"

  Rule: Off the timeline, the project is at a milestone not met only when no other is; otherwise the heading names those off it, and why

    Milestones are ordered by the dates of what they close, so those that close nothing dated are in
    no order: one alone not met is where the project is, for nothing else is left, but of two sdp
    cannot say which comes first.

    Scenario: The milestones on the timeline met, and one that closes nothing
      Given these specs:
        | tags                                                       | Feature                |
        | @id=MS-objectives @closes:PH-inception @met=2026-01-30     | Lifecycle objectives   |
        | @id=MS-architecture @closes:PH-elaboration @met=2026-02-27 | Lifecycle architecture |
        | @id=MS-release                                             | Release                |
      When the lifecycle is computed on "2026-03-02"
      Then the milestones are:
        | id              | planned    | met        | next |
        | MS-objectives   | 2026-01-30 | 2026-01-30 |      |
        | MS-architecture | 2026-02-27 | 2026-02-27 |      |
        | MS-release      |            |            | yes  |
      And the output contains "(2026-03-02 · project at MS-release · no iteration today)"
      And the output line with "▶ MS-release" contains "no gate"

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
        | id              | planned    | next |
        | MS-objectives   | 2026-01-30 |      |
        | MS-architecture | 2026-02-27 |      |
        | MS-beta         |            |      |
        | MS-release      |            |      |
      And the output contains "(2026-03-02 · not on the timeline: MS-beta, MS-release — they close nothing dated · no iteration today)"

    Scenario: Milestones none of which is on the timeline are in no order, and the project is at none of them
      Given these specs:
        | tags                                                     | Feature   |
        | @id=IT-scope @phase:PH-inception @start=2026-01-05       | Scope     |
        | @id=IT-prototype @phase:PH-elaboration @start=2026-02-02 | Prototype |
        | @id=IT-baseline @phase:PH-elaboration @start=2026-02-16  | Baseline  |
      When the lifecycle is computed on "2026-01-20"
      Then the milestones are:
        | id              | planned | next |
        | MS-architecture |         |      |
        | MS-objectives   |         |      |
      And the output contains "(2026-01-20 · not on the timeline: MS-architecture, MS-objectives — they close nothing dated · no iteration today)"

  Rule: Work is planned on the node itself: its iteration plans the discipline of its kind, an activity tag any other

    A requirement is written in one iteration and built in another, and a gate has to tell the two
    apart.

    Scenario: A feature and an element in IT-prototype
      When the lifecycle is computed
      Then the planned activity is:
        | discipline      | IT-prototype | IT-baseline |
        | requirements    | 1            | 0           |
        | analysis-design | 1            | 0           |
        | implementation  | 0            | 0           |

    Scenario: Analysed in IT-prototype, built over IT-prototype and IT-baseline, tested in IT-baseline
      Given these specs:
        | tags                                                                                                                                                                                         | Feature |
        | @id=beta @maturity=idea @iteration:IT-prototype @activity.analysis-design:IT-prototype @activity.implementation:IT-prototype @activity.implementation:IT-baseline @activity.test:IT-baseline | Beta    |
      When the lifecycle is computed
      Then the planned activity is:
        | discipline      | IT-prototype | IT-baseline |
        | requirements    | 2            | 0           |
        | analysis-design | 2            | 0           |
        | implementation  | 1            | 1           |
        | test            | 0            | 1           |
      And the iterations are:
        | id           | plans               |
        | IT-scope     |                     |
        | IT-prototype | ARCH-x, alpha, beta |
        | IT-baseline  | beta                |

    Scenario: A discipline with links of its own is planned only into the iterations they name
      Given these specs:
        | tags                                                                               | Feature |
        | @id=beta @maturity=idea @iteration:IT-prototype @activity.requirements:IT-baseline | Beta    |
      When the lifecycle is computed
      Then the planned activity is:
        | discipline   | IT-prototype | IT-baseline |
        | requirements | 1            | 1           |
      And the iterations are:
        | id           | plans               |
        | IT-scope     |                     |
        | IT-prototype | ARCH-x, alpha, beta |
        | IT-baseline  | beta                |

  Rule: The plan's own nodes are no work

    Scenario: A milestone planned into an iteration
      Given these specs:
        | tags                                                   | Feature |
        | @id=MS-demo @closes:IT-baseline @iteration:IT-baseline | Demo    |
      When the lifecycle is computed
      Then the iterations are:
        | id           | plans         |
        | IT-scope     |               |
        | IT-prototype | ARCH-x, alpha |
        | IT-baseline  |               |

  Rule: A kind no discipline names is no work: nothing lists it as unplanned, and check reports a maturity on it

    Work is what a discipline takes, and only work is still to come at a maturity, and planned. An
    activity tag plans a discipline's work on any node, but a risk or a policy is otherwise what it
    is, its rules with examples, until the team adds its kind to a discipline.

    Scenario: A risk at a maturity, and a rule of a live risk without an example
      Given these specs:
        | tags                                 | Feature |
        | @id=outage @kind=risk @maturity=idea | Outage  |
      And a file "specs/slow-index.feature" containing:
        """
        @id=slow-index @kind=risk
        Feature: Slow index

          Rule: The index may outgrow memory
        """
      When the lifecycle is computed
      Then the unplanned work is "nothing"
      When the workspace is checked
      Then sdp reports:
        | rule           | node                                    | at                         | message                                                                                       | hint                                                                                                                                                                  |
        | plan-reference | outage                                  | specs/outage.feature:1     | outage: kind risk belongs to no discipline, so its maturity marks work that nothing can plan | delete the maturity — what is no work is live, and its rules have examples — or add risk to a discipline under vocabulary.disciplines                                 |
        | untested-rule  | slow-index#the-index-may-outgrow-memory | specs/slow-index.feature:4 | slow-index#the-index-may-outgrow-memory is live, so it needs an example                       | write a Scenario under it; kind risk belongs to no discipline, so it is no work and declares no maturity, unless you add it to one under vocabulary.disciplines |

    Scenario: Once a discipline names risk, a risk at a maturity is work to plan
      Given a file "sdp.config.yaml" containing:
        """
        vocabulary: { disciplines: { risk-management: [risk] } }
        """
      And these specs:
        | tags                                 | Feature |
        | @id=outage @kind=risk @maturity=idea | Outage  |
      When the lifecycle is computed
      Then the unplanned work is "outage"
      When the workspace is checked
      Then sdp reports nothing

    Scenario: A risk at a maturity that an activity tag plans is that discipline's work
      Given these specs:
        | tags                                                                      | Feature |
        | @id=outage @kind=risk @maturity=idea @activity.implementation:IT-baseline | Outage  |
      When the lifecycle is computed
      Then the iterations are:
        | id           | plans         |
        | IT-scope     |               |
        | IT-prototype | ARCH-x, alpha |
        | IT-baseline  | outage        |
      When the workspace is checked
      Then sdp reports nothing

  Rule: A rule is planned on its own, as work of its spec's kind

    A change to a built feature is planned rule by rule. Planning a spec plans its rules, and a rule
    that plans itself is one more item of its iteration, whose evidence its examples are: each
    example is counted in one iteration.

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

            Shoppers come back to finish what they started.
        """
      When the workspace is checked
      Then sdp reports nothing
      When the lifecycle is computed
      Then the iterations are:
        | id           | plans                          | stages  |
        | IT-scope     |                                |         |
        | IT-prototype | ARCH-x, alpha                  | idea:2  |
        | IT-baseline  | cart#a-cart-is-kept-for-a-week | draft:1 |
      And the planned activity is:
        | discipline   | IT-prototype | IT-baseline |
        | requirements | 1            | 1           |

    Scenario Outline: A rule planned <planned>, and the evidence of its example
      Given a file "specs/wishlist.feature" containing:
        """
        @id=wishlist @maturity=draft @iteration:IT-prototype
        Feature: Wishlist

          Shoppers keep what they want for later.

          Rule: A wishlist keeps what a shopper wants for later

            Scenario: Keep a lamp
              Then the wishlist holds a lamp

          @maturity=draft @iteration:<iteration>
          Rule: A wishlist is shared with a friend

            Scenario: Share the list
              Then the wishlist holds a desk
        """
      And a step definition "the wishlist holds a {word}" that passes
      When the workspace is run
      And the lifecycle is computed
      Then the iterations are:
        | id           | scenarios   |
        | IT-scope     |             |
        | IT-prototype | <prototype> |
        | IT-baseline  | <baseline>  |

      Examples:
        | planned                | iteration    | prototype | baseline |
        | with its feature       | IT-prototype | passed:2  |          |
        | apart from its feature | IT-baseline  | passed:1  | passed:1 |

  Rule: Work still to come, at every maturity, is unplanned until it is planned

    What is built needs no plan, and whether it is built is read from the files, as the plan is. A
    rule still to come is planned with its spec, and listed with it while neither is planned.

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

            Shoppers come back to finish what they started.
        """
      When the lifecycle is computed
      Then the unplanned work is "<unplanned>"

      Examples:
        | case                                   | maturity        | plan                   | rule plan              | unplanned                      |
        | that is live, with a rule to come      |                 |                        |                        | cart#a-cart-is-kept-for-a-week |
        | that is live, its rule to come planned |                 |                        | @iteration:IT-baseline | nothing                        |
        | at the top of the ladder               | @maturity=ready |                        |                        | cart                           |
        | that is ready and planned              | @maturity=ready | @iteration:IT-baseline |                        | nothing                        |

    Scenario: An unplanned feature and an unplanned element
      Given these specs:
        | tags                     | Feature |
        | @id=later @maturity=idea | Later   |
        | @id=ARCH-cache           | Cache   |
      When the lifecycle is computed on "2026-01-20"
      Then the output line with "unplanned" contains "later"
      And the output line with "unplanned" does not contain "ARCH-cache"

    Scenario: A live feature, with no plan, before its scenarios have run and after
      Given a file "specs/done.feature" containing:
        """
        @id=done
        Feature: Done

          Something already built.

          Rule: It works

            Scenario: Works
              Then it works
        """
      And these specs:
        | tags                     | Feature |
        | @id=later @maturity=idea | Later   |
      And a step definition "it works" that passes
      When the lifecycle is computed on "2026-01-20"
      Then the output line with "unplanned" contains "later"
      And the output line with "unplanned" does not contain "done"
      When the workspace is run
      And the lifecycle is computed on "2026-01-20"
      Then the output line with "unplanned" contains "later"
      And the output line with "unplanned" does not contain "done"

    Scenario: A specified feature with scenarios, with no plan
      Given a file "specs/soon.feature" containing:
        """
        @id=soon @maturity=specified
        Feature: Soon

          Something to build next.

          Rule: It is fast

            Scenario: Fast
              Then it is fast

          Rule: It is cheap
        """
      When the lifecycle is computed on "2026-01-20"
      Then the output line with "unplanned" contains "soon"

  Rule: The chart shades each discipline relative to its busiest iteration

    Its columns are numbered as the planned work numbers the iterations, so that an iteration's id
    can say what it is at any length.

    Scenario: Half of IT-baseline's requirements work in IT-prototype
      Given these specs:
        | tags                                            | Feature |
        | @id=beta @maturity=idea @iteration:IT-baseline  | Beta    |
        | @id=gamma @maturity=idea @iteration:IT-baseline | Gamma   |
      When the lifecycle is computed on "2026-01-20"
      Then the output line with "requirements" contains "    ▒▒▒ ███"
      And the output contains "1   2   3"
      And the output contains "  3  IT-baseline "

  Rule: Evidence shows as the stages of an iteration's work, never as planned activity

    The chart is what was planned and the stages are what the scenarios showed. Kept apart, the two
    can be compared: a plan that counted what was verified could never fall behind.

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
      And the output contains "… There is a plan  (unrun)"
      When the workspace is run
      And the lifecycle is computed on "2026-01-20"
      Then the milestones are:
        | id              | gate | next |
        | MS-objectives   | 1/2  | yes  |
        | MS-architecture | 1/1  |      |
      And the output contains "✔ There is a plan"
      And the output contains "✘ Every feature is in an iteration"

    Scenario: A scenario of another spec that links to the milestone is not of its gate
      Given a file "specs/pay.feature" containing:
        """
        @id=pay
        Feature: Pay

          Rule: A card is charged once

            @verifies:MS-architecture
            Scenario: Charged
              Then the query "feature" returns no results
        """
      When the workspace is run
      And the lifecycle is computed on "2026-01-20"
      Then the milestones are:
        | id              | gate | next |
        | MS-objectives   | 1/2  | yes  |
        | MS-architecture | 1/1  |      |

  Rule: A gate passes only when every one of its scenarios passed, run against the current graph

    A criterion nobody has automated is not met, and a result from before the graph changed says
    nothing of the graph as it is now.

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

    A gate not met yet is where the project is going, not a regression: a run that failed on it
    would fail every build before the milestone. Whether to enforce it is the team's call.

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

    Scenario: A gate not met yet is no failing work
      Given these specs:
        | tags                    | Feature |
        | @id=beta @maturity=idea | Beta    |
      When the workspace is run
      Then node "MS-objectives#every-feature-is-in-an-iteration" has attribute status = "failed"
      And sdp status counts the stages "idea:3"

  Rule: sdp gate --record writes @met on a milestone whose gate passes as the workspace is when it is written, and on no other

    Met is recorded once, not read from the calendar or from today's results: a date would fail
    tomorrow the commit that passes today, and results are local and go stale. Recording is
    somebody's act, and a criterion edited while the gate ran has not run.

    Scenario: Nothing is recorded while the gate does not pass
      Given these specs:
        | tags                    | Feature |
        | @id=beta @maturity=idea | Beta    |
      When I run "sdp gate MS-objectives --record"
      Then the exit code is 1
      And the output contains "MS-objectives is not recorded as met"
      And the file "specs/MS-objectives.feature" does not contain "@met="

    Scenario: Written on the milestone's tag line, and the project moves to the next milestone
      Given a file "specs/MS-objectives.feature" containing:
        """
        @id=MS-objectives @closes:PH-inception   # the first phase
        Feature: Lifecycle objectives

          Rule: The work is planned

            Scenario: There is a plan
              Then the query "iteration" returns at least 1 result
        """
      When I run "sdp gate MS-objectives --record"
      Then the exit code is 0
      And the file "specs/MS-objectives.feature" contains "@id=MS-objectives @closes:PH-inception @met=20"
      And the file "specs/MS-objectives.feature" contains "   # the first phase"
      When I run "sdp q milestone[met=$TODAY] --ids"
      Then the output lines are "MS-objectives"
      When I run "sdp lifecycle --json"
      Then the JSON output has:
        | data.position.milestone | MS-architecture |
        | data.milestones.0.id    | MS-objectives   |
        | data.milestones.0.gate  | null            |

    Scenario: Nothing is recorded when the milestone changed while its gate ran
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
      When I run "sdp gate MS-objectives --record"
      Then the exit code is 1
      And the output contains "MS-objectives is not recorded as met: its gate changed while it ran, and MS-objectives#there-is-a-plan (stale) does not pass"
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
      When I run "sdp q milestone[met] --ids"
      Then the output lines are "MS-architecture, MS-objectives"

    Scenario: A milestone written as met before one dated earlier is reported
      Given these specs:
        | tags                                                       | Feature                |
        | @id=MS-architecture @closes:PH-elaboration @met=2026-02-27 | Lifecycle architecture |
      When the workspace is checked
      Then sdp reports at least:
        | rule          | node            | at                              |
        | milestone-met | MS-architecture | specs/MS-architecture.feature:1 |

  Rule: A milestone that is met is closed: its gate does not run again, nor is it needed once its criteria moved

    Met records that the gate passed when it was recorded. Run again, the gate would read a graph
    that has moved on, its own @met included; and once met, its criteria are a plan of work that is
    done, to be deleted or to become the tests of what was built.

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
      And the output contains "MS-objectives was met on 2026-01-30"
      When I run "sdp status"
      Then the output contains "milestones    met 1 · open 1"

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

            Scenario: Sales by day
              Then the report has one row per day
        """
      And a file "specs/export-to-csv.feature" containing:
        """
        @id=export-to-csv @maturity=ready <review> @depends-on:reports
        Feature: Export to CSV

          Analysts want data in Excel.

          Rule: Every row is exported

            Scenario: Export current rows
              When I export the report
              Then I get a CSV file with one line per row
        """
      When I run "sdp check --base none"
      Then the exit code is 0
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
        | tags                                                                          | problem                              |
        | @iteration:PH-elaboration                                                     | "PH-elaboration" names no iteration  |
        | @phase:IT-prototype                                                           | "IT-prototype" names no phase        |
        | @closes:alpha                                                                 | "alpha" names no phase or iteration  |
        | @activity.implementation:alpha                                                | "alpha" names no iteration           |
        | @activity.implementation:IT-prototype @activity.implementation:PH-elaboration | "PH-elaboration" names no iteration  |
        | @activity.testing:IT-prototype                                                | "testing", which is not a discipline |
        | @kind=risk @iteration:IT-prototype                                            | belongs to no discipline             |

    Scenario: A link whose prefix is another case of the plan's says so
      Given these specs:
        | tags                                                                  | Feature  |
        | @id=it-sprint-1                                                       | Sprint 1 |
        | @id=beta @maturity=idea @iteration:it-sprint-1 @iteration:it-sprint-2 | Beta     |
      When the workspace is checked
      Then sdp reports:
        | rule           | at                   | message                                          | hint                                                                        |
        | dangling-link  | specs/beta.feature:1 | beta -iteration-> it-sprint-2                    | the prefix of kind iteration is `IT-`, written as configured: `IT-sprint-2` |
        | plan-reference | specs/beta.feature:1 | beta: iteration "it-sprint-1" names no iteration | the prefix of kind iteration is `IT-`, written as configured: `IT-sprint-1` |

    Scenario: A feature planned into what the plan declares
      Given these specs:
        | tags                                                                                                                                                              | Feature |
        | @id=beta @maturity=idea @iteration:IT-prototype @activity.analysis-design:IT-prototype @activity.implementation:IT-prototype @activity.implementation:IT-baseline | Beta    |
      When the workspace is checked
      Then sdp reports nothing

  @maturity=draft
  Rule: Each iteration shows what git saw change in its dates beside what was planned

    Once people stop moving work between iterations, the chart of the plan is a drawing; git knows
    which specs, decisions and code changed when.

  @maturity=draft
  Rule: An iteration whose planned work saw no change stands out

  @open @maturity=draft
  Rule: Are phases and disciplines optional, with a plain sequence of iterations by default?

    The shape of the Rational Unified Process came from an example, not a need, and this repository
    uses neither. The case for phases: a backlog says nothing of the architecture being proven first.
