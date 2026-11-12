@id=REQ-configuration @maturity=ready
@realized-by:ARCH-workspace @realized-by:ARCH-vocabulary
Feature: Workspace configuration

  A workspace is the directory sdp reads. Its root may hold an `sdp.config.yaml` (or `.yml`, or
  `.json`), and an empty or missing one means the defaults, so sdp works in any repository before
  anyone configures it.

  Rule: A key left out keeps its default; one written replaces it, except exclude, which adds to it, and ids, which merges into it

    Background:
      Given these specs:
        | tags                             | Feature |
        | @id=REQ-login @maturity=approved | Login   |
        | @id=US-signup @maturity=idea     | Sign-up |
      And a file "notes/REQ-scratch.feature" containing:
        """
        @id=REQ-scratch @maturity=idea
        Feature: Scratch
        """
      And a file "features/search.feature" containing:
        """
        @id=REQ-search @maturity=ready
        Feature: Search
        """
      And a file "src/orders.ts" containing:
        """
        // @sdp implements REQ-login
        export function order() {}
        """
      And a file "tools/report.ts" containing:
        """
        // @sdp implements REQ-login
        export function report() {}
        """

    Scenario Outline: Each key, in YAML or JSON
      Given a file "<file>" containing:
        """
        <config>
        """
      When I query "<query>"
      Then the result is "<result>"

      Examples:
        | key        | file            | config                                                              | query                          | result                             |
        | none       | sdp.config.yaml |                                                                     | requirement                    | REQ-login, REQ-scratch, REQ-search |
        | none       | sdp.config.yaml |                                                                     | code                           | code:src/orders.ts#order           |
        | features   | sdp.config.yaml | features: ["specs/**/*.feature"]                                    | requirement                    | REQ-login                          |
        | code       | sdp.config.yaml | code: ["tools/**/*.ts"]                                             | code                           | code:tools/report.ts#report        |
        | exclude    | sdp.config.yaml | exclude: ["notes/**"]                                               | requirement                    | REQ-login, REQ-search              |
        | ids        | sdp.config.yaml | ids: { requirement: US }                                            | requirement                    | US-signup                          |
        | vocabulary | sdp.config.yaml | vocabulary: { maturity: [idea, draft, specified, approved, ready] } | requirement[maturity<approved] | REQ-scratch                        |
        | json       | sdp.config.json | { "exclude": ["notes/**"] }                                         | requirement                    | REQ-login, REQ-search              |
        | yml        | sdp.config.yml  | exclude: ["notes/**"]                                               | requirement                    | REQ-login, REQ-search              |

    Scenario: A step module outside the configured steps is not loaded
      Given a file "sdp.config.yaml" containing:
        """
        steps: ["acceptance/steps/*.ts"]
        """
      And a file "acceptance/steps/cart.ts" containing:
        """
        export default {}
        """
      And a file "specs/legacy.steps.ts" containing:
        """
        export default {}
        """
      Then sdp run loads the step modules "acceptance/steps/cart.ts"

    Scenario: Results kept where results says
      Given a file "sdp.config.yaml" containing:
        """
        results: out/results.json
        """
      And a file "specs/REQ-cart.feature" containing:
        """
        @id=REQ-cart
        Feature: Cart

          Rule: A cart starts empty

            Scenario: A new cart is empty
              Then the cart is empty
        """
      And a step definition "the cart is empty" that passes
      When the workspace is run
      Then the file "out/results.json" contains '"REQ-cart#a-new-cart-is-empty"'
      And node "REQ-cart" has attribute verification = "passing"

  Rule: An id's prefix says its kind, in any case, before - or _; ids sets the prefixes, and an unknown one is a spec

    Scenario Outline: The default prefixes, and two that are none
      Given a file "specs/spec.feature" containing:
        """
        @id=<id>
        Feature: Spec
        """
      When the workspace is loaded
      Then node "<id>" has attribute kind = "<kind>"

      Examples:
        | id                  | kind        |
        | REQ-guest-login     | requirement |
        | NFR-latency         | nfr         |
        | DEC-0001            | decision    |
        | ARCH-orders         | element     |
        | PAT-outbox          | pattern     |
        | MS-LCO              | milestone   |
        | CAP-online-sales    | capability  |
        | RISK-vendor-lock-in | risk        |
        | EPIC-checkout       | epic        |
        | IT-beta             | iteration   |
        | req_guest_login     | requirement |
        | TODO-1              | spec        |
        | checkout            | spec        |

    Scenario Outline: New specs named with the configured prefixes
      Given a file "sdp.config.yaml" containing:
        """
        ids: { requirement: US, decision: ADR }
        """
      Then a new <kind> titled "<title>" gets the id "<id>"

      Examples:
        | kind        | title            | id                   |
        | requirement | Guest checkout   | US-guest-checkout    |
        | decision    | Use Postgres     | ADR-use-postgres     |
        | nfr         | Checkout latency | NFR-checkout-latency |

  @decided-by:free-vocabulary
  Rule: The vocabulary says which of the team's words play the roles sdp interprets, and every command reads them

    Scenario: A component is architecture, and an element no longer is
      Given a file "sdp.config.yaml" containing:
        """
        vocabulary: { kinds: { architectural: [component] } }
        """
      And these specs:
        | tags                                             | Feature |
        | @id=CMP-orders @kind=component @decided-by:DEC-1 | Orders  |
        | @id=ARCH-legacy                                  | Legacy  |
        | @id=DEC-1                                        | Events  |
      When I ask for the architecture view
      Then the output contains "CMP-orders -decided-by-> DEC-1"
      And the output does not contain "ARCH-legacy"

    Scenario: A risk is shown next to the architecture
      Given a file "sdp.config.yaml" containing:
        """
        vocabulary: { kinds: { driver: [decision, nfr, risk] } }
        """
      And these specs:
        | tags                                  | Feature                 |
        | @id=ARCH-orders @threatened-by:RISK-1 | Orders                  |
        | @id=RISK-1                            | Payment provider outage |
      When I ask for the architecture view
      Then the output contains "ARCH-orders -threatened-by-> RISK-1"

    Scenario: An adr is held to the shape of a decision
      Given a file "sdp.config.yaml" containing:
        """
        vocabulary: { kinds: { decision: [adr], driver: [adr, nfr] } }
        """
      And a file "specs/ADR-1.feature" containing:
        """
        @id=ADR-1 @kind=adr
        Feature: Use Postgres

          Rule: Every table has a primary key
        """
      When the workspace is checked
      Then sdp reports at least:
        | rule           | node  |
        | decision-shape | ADR-1 |

    Scenario: A runbook is work of an operations discipline
      Given a file "sdp.config.yaml" containing:
        """
        vocabulary: { disciplines: { operations: [runbook] } }
        """
      And these specs:
        | tags                                       | Feature             |
        | @id=C1 @kind=iteration                     | C1                  |
        | @id=RB-restore @kind=runbook @iteration:C1 | Restore from backup |
      When the lifecycle is computed
      Then the planned activity is:
        | discipline | C1 |
        | operations | 1  |

    Scenario: sprint plans work, and part-of puts an iteration in its phase
      Given a file "sdp.config.yaml" containing:
        """
        vocabulary: { relations: { plan: [sprint], phase: [part-of] } }
        """
      And these specs:
        | tags                                         | Feature |
        | @id=PH-build                                 | Build   |
        | @id=S1 @kind=iteration @part-of:PH-build     | S1      |
        | @id=S2 @kind=iteration @phase:PH-build       | S2      |
        | @id=REQ-search @maturity=idea @sprint:S1     | Search  |
        | @id=REQ-filters @maturity=idea @iteration:S1 | Filters |
      When the lifecycle is computed
      Then the iterations are:
        | id | phase    | plans      |
        | S1 | PH-build | REQ-search |
        | S2 |          |            |
      And the planned activity is:
        | discipline   | S1 |
        | requirements | 1  |

    Scenario: A milestone recorded as reached
      Given a file "sdp.config.yaml" containing:
        """
        vocabulary: { attributes: { met: reached } }
        """
      And a file "specs/MS-launch.feature" containing:
        """
        @id=MS-launch
        Feature: Launch

          Rule: Launch is planned

            Scenario: There is a milestone
              Then the query "milestone" returns 1 result
        """
      When I run "sdp gate MS-launch --record"
      Then the file "specs/MS-launch.feature" contains "@id=MS-launch @reached=20"
      When I run "sdp status"
      Then the output contains "milestones    met 1"

    Scenario: sdp new writes what a renamed profile reads
      Given a file "sdp.config.yaml" containing:
        """
        ids: { adr: ADR, era: ERA }
        vocabulary:
          kinds: { decision: [adr], milestone: [checkpoint], phase: [era], iteration: [sprint], driver: [adr, nfr] }
          relations: { plan: [sprint], phase: [part-of], closes: [ends], anchor: implements-element }
          attributes: { start: from, end: until }
        """
      When I run "sdp new adr 'Use Postgres'"
      Then the output contains "ADR-use-postgres\tspecs/decisions/ADR-use-postgres.feature"
      And the file "specs/decisions/ADR-use-postgres.feature" does not contain "@kind="
      When I run the pipeline:
        """
        sdp new era Elaboration
        sdp new sprint Baseline --id E1
        sdp new checkpoint Launch
        """
      Then the exit code is 0
      And the file "specs/delivery/E1.feature" contains "@id=E1 @kind=sprint @part-of:ERA-elaboration @from=2026"
      And the file "specs/delivery/CHEC-launch.feature" contains "@ends:ERA-elaboration"
      When I run "sdp q 'checkpoint -ends-> era <-part-of- sprint' --ids"
      Then the output lines are "E1"
      When I run "sdp check --json"
      Then the exit code is 0
      And the JSON output has:
        | data.rule | template-placeholder |

  Rule: sdp vocabulary prints the profile in force, as a configuration that reads back

    Scenario: A team's word for decisions, and the words sdp makes itself
      Given a file "sdp.config.yaml" containing:
        """
        vocabulary: { kinds: { decision: [adr] } }
        """
      When I run "sdp vocabulary --json"
      Then the JSON output has:
        | data.vocabulary.maturity    | idea, draft, specified, ready                                                              |
        | data.made.kinds             | scenario, rule, code, missing                                                              |
        | data.made.relations         | rule-of                                                                                    |
        | data.made.tags              | @gate, @serial, @open                                                                      |
        | data.made.stages            | failing, in-progress, verified                                                             |
        | data.made.reservedRelations | stage, verification, scenarios, summary, file, openQuestions, maturity, status |
      When I run "sdp vocabulary"
      Then the output line with "decision" contains "adr"
      And the output line with "scenarioAttributes" contains "staleBecause"

    Scenario: Printed, copied and read again
      When I run the pipeline:
        """
        sdp vocabulary --json | jq '{ vocabulary: .data.vocabulary }' > copied.json
        mv copied.json sdp.config.json
        sdp vocabulary --json | jq -r '.data.vocabulary.relations.plan[]'
        """
      Then the exit code is 0
      And the output lines are "iteration"

  Rule: A configuration that cannot work stops sdp with the file and the key, not later in a spec or a query

    Scenario Outline: A profile that cannot work
      Given a file "sdp.config.yaml" containing:
        """
        <config>
        """
      Then loading the workspace fails with "<problem>"
      And loading the workspace fails with '<path>'

      Examples:
        | config                                           | problem                                            | path                                        |
        | vocabulary: { maturity: [] }                     | needs at least one level                           | at ["vocabulary"]["maturity"]               |
        | vocabulary: { maturity: [idea, ready, idea] }    | idea repeats                                       | at ["vocabulary"]["maturity"]               |
        | vocabulary: { maturity: [idea, verified] }       | verified is a stage sdp derives                    | at ["vocabulary"]["maturity"]               |
        | vocabulary: { maturity: [idea, " "] }            | a word cannot be empty                             | at ["vocabulary"]["maturity"]               |
        | vocabulary: { relations: { anchor: "" } }        | a word cannot be empty                             | at ["vocabulary"]["relations"]["anchor"]    |
        | vocabulary: { kinds: { decision: [] } }          | a role needs at least one word                     | at ["vocabulary"]["kinds"]["decision"]      |
        | vocabulary: { kinds: { milestone: [scenario] } } | scenario is a kind sdp makes itself                | at ["vocabulary"]["kinds"]["milestone"]     |
        | vocabulary: { attributes: { activity: stage } }  | stage is an attribute sdp derives or checks itself | at ["vocabulary"]["attributes"]["activity"] |
        | vocabulary: { relations: { anchor: iteration } } | iteration is also a relation of the plan           | at ["vocabulary"]["relations"]["anchor"]    |
        | vocabulary: { relations: { scenario: is } }      | is is also relations.anchor                        | at ["vocabulary"]["relations"]["scenario"]  |
        | vocabulary: { relations: { scenario: rule-of } } | rule-of is a relation sdp makes itself             | at ["vocabulary"]["relations"]["scenario"]  |
        | vocabulary: { relations: { plan: [in sprint] } } | `in sprint` cannot be the key of a tag             | at ["vocabulary"]["relations"]["plan"]      |
        | vocabulary: { kinds: { phase: ["a:b"] } }        | `a:b` cannot be the value of a tag                 | at ["vocabulary"]["kinds"]["phase"]         |
        | ids: { component: MY-COMP }                      | must be letters only                               | at ["ids"]["component"]                     |
        | ids: { story: REQ }                              | requirement and story share the prefix REQ         | at ["ids"]                                  |

    Scenario: A list written as a string
      Given a file "sdp.config.yaml" containing:
        """
        features: specs/**/*.feature
        """
      Then loading the workspace fails with "sdp.config.yaml"
      And loading the workspace fails with 'at ["features"]'

    Scenario: A misspelled key is an error, not a silent default
      Given a file "sdp.config.yaml" containing:
        """
        feature: ["specs/**/*.feature"]
        """
      Then loading the workspace fails with "sdp.config.yaml"
      And loading the workspace fails with 'excess property'
      And loading the workspace fails with 'at ["feature"]'
