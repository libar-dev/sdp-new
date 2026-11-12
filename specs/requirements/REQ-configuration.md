---
id: REQ-configuration
kind: requirement
title: Workspace configuration
maturity: ready
iteration: I1
activity: { implementation: I1, test: I1 }
tags: [configuration]
links:
  refines: CAP-living-specs
  realized-by: [ARCH-workspace, ARCH-vocabulary]
---

# Workspace configuration

A workspace is the directory sdp reads. Its root may hold an `sdp.config.yaml` (or `.yml`, or
`.json`); every key is optional, and an empty or missing file means the defaults, so sdp works in
any repository before anyone configures it. `sdp init` writes every key with its default, and
`sdp vocabulary` prints the words sdp interprets as the workspace configures them
([[ARCH-vocabulary]]). A configuration that cannot work is an error where it is written, naming
the file and the key, not later in a spec or a query.

## Scenarios

~~~gherkin
Background:
  Given a file "specs/REQ-login.md" containing:
    """
    ---
    id: REQ-login
    maturity: approved
    ---
    # Login
    """
  And a file "specs/US-signup.md" containing:
    """
    ---
    id: US-signup
    maturity: idea
    ---
    # Sign-up
    """
  And a file "notes/REQ-scratch.md" containing:
    """
    ---
    id: REQ-scratch
    maturity: idea
    ---
    # Scratch
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

Scenario Outline: Each key shapes what the graph holds: a list replaces its default, exclude adds to it, ids merges into it
  Given a file "<file>" containing:
    """
    <config>
    """
  When I query "<query>"
  Then the result is "<result>"

  Examples:
    | key      | file            | config                                              | query                          | result                             |
    | none     | sdp.config.yaml |                                                     | requirement                    | REQ-login, REQ-scratch, REQ-search |
    | none     | sdp.config.yaml |                                                     | code                           | code:src/orders.ts#order           |
    | specs    | sdp.config.yaml | specs: ["specs/**/*.md"]                            | requirement                    | REQ-login, REQ-search              |
    | features | sdp.config.yaml | features: []                                        | requirement                    | REQ-login, REQ-scratch             |
    | code     | sdp.config.yaml | code: ["tools/**/*.ts"]                             | code                           | code:tools/report.ts#report        |
    | exclude  | sdp.config.yaml | exclude: ["notes/**"]                               | requirement                    | REQ-login, REQ-search              |
    | ids      | sdp.config.yaml | ids: { requirement: US }                            | requirement                    | US-signup                          |
    | vocabulary | sdp.config.yaml | vocabulary: { maturity: [idea, draft, specified, approved, ready] } | requirement[maturity<approved] | REQ-scratch |
    | json     | sdp.config.json | { "exclude": ["notes/**"] }                         | requirement                    | REQ-login, REQ-search              |
    | yml      | sdp.config.yml  | exclude: ["notes/**"]                               | requirement                    | REQ-login, REQ-search              |

Scenario Outline: Without a declared kind the id prefix decides it, in any case, before - or _; an unknown prefix is a spec
  Given a file "specs/spec.md" containing:
    """
    ---
    id: <id>
    ---
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
    | req_guest_login     | requirement |
    | TODO-1              | spec        |
    | checkout            | spec        |

Scenario Outline: The configured prefixes name new specs, and every other kind keeps its default
  Given a file "sdp.config.yaml" containing:
    """
    ids: { requirement: US, decision: ADR }
    """
  Then a new <kind> titled "<title>" gets the id "<id>"

  Examples:
    | kind        | title            | id                   |
    | requirement | Guest checkout   | US-guest-checkout    |
    | decision    | Use Postgres     | ADR-0001             |
    | nfr         | Checkout latency | NFR-checkout-latency |

Scenario: steps chooses the step definition modules
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

Scenario: results says where scenario results are kept
  Given a file "sdp.config.yaml" containing:
    """
    results: out/results.json
    """
  And a file "specs/REQ-cart.md" containing:
    """
    ---
    id: REQ-cart
    maturity: ready
    ---
    # Cart

    Shoppers collect items before paying.

    ```gherkin
    Scenario: A new cart is empty
      Then the cart is empty
    ```
    """
  And a step definition "the cart is empty" that passes
  When the workspace is run
  Then the file "out/results.json" contains '"REQ-cart#a-new-cart-is-empty"'
  And node "REQ-cart" has attribute verification = "passing"

Scenario: rules says whether every scenario of a spec must be an example of a rule
  Until the scenarios of a workspace are grouped under the rules they illustrate, it can say that
  they need not be yet.

  Given a file "specs/REQ-cart.feature" containing:
    """
    @id=REQ-cart
    Feature: Cart

      Scenario: A new cart is empty
        Then the cart is empty
    """
  When the workspace is checked
  Then sdp reports at least:
    | rule                  | at                       |
    | scenario-outside-rule | specs/REQ-cart.feature:4 |
  Given a file "sdp.config.yaml" containing:
    """
    rules: optional
    """
  When the workspace is checked
  Then sdp does not report "scenario-outside-rule"

Scenario: kinds.architectural says which kinds are the architecture
  Given a file "sdp.config.yaml" containing:
    """
    vocabulary: { kinds: { architectural: [component] } }
    """
  And a file "specs/model.md" containing:
    """
    ---
    id: MODEL
    kind: model
    nodes:
      - { id: CMP-orders, kind: component, links: { decided-by: DEC-1 } }
      - { id: ARCH-legacy, kind: element }
      - { id: DEC-1, kind: decision }
    ---
    # Model
    """
  When I ask for the architecture view
  Then the output contains "CMP-orders -decided-by-> DEC-1"
  And the output does not contain "ARCH-legacy"

Scenario: kinds.driver says what is shown next to the architecture
  Given a file "sdp.config.yaml" containing:
    """
    vocabulary: { kinds: { driver: [decision, nfr, risk] } }
    """
  And a file "specs/model.md" containing:
    """
    ---
    id: MODEL
    kind: model
    nodes:
      - { id: ARCH-orders, kind: element, links: { threatened-by: RISK-1 } }
      - { id: RISK-1, kind: risk, title: Payment provider outage }
    ---
    # Model
    """
  When I ask for the architecture view
  Then the output contains "ARCH-orders -threatened-by-> RISK-1"

Scenario: kinds.decision gives a team's own word for decisions the shape of one
  Given a file "sdp.config.yaml" containing:
    """
    vocabulary: { kinds: { decision: [adr], driver: [adr, nfr] } }
    """
  And a file "specs/ADR-1.md" containing:
    """
    ---
    id: ADR-1
    kind: adr
    ---
    # Use Postgres

    ## Options
    """
  When the workspace is checked
  Then sdp reports at least:
    | rule           | node  |
    | decision-shape | ADR-1 |

Scenario: disciplines adds or redefines disciplines
  Given a file "sdp.config.yaml" containing:
    """
    vocabulary: { disciplines: { operations: [runbook] } }
    """
  And a file "plan.md" containing:
    """
    ---
    id: PLAN
    kind: plan
    nodes:
      - { id: C1, kind: iteration }
      - { id: RB-restore, kind: runbook, title: Restore from backup, iteration: C1 }
    ---
    # Plan
    """
  When the lifecycle is computed
  Then the planned activity is:
    | discipline | C1 |
    | operations | 1  |

Scenario: relations.plan and relations.phase name the relations the plan uses
  Given a file "sdp.config.yaml" containing:
    """
    vocabulary: { relations: { plan: [sprint], phase: [part-of] } }
    """
  And a file "plan.md" containing:
    """
    ---
    id: PLAN
    kind: plan
    nodes:
      - { id: build, kind: phase }
      - { id: S1, kind: iteration, part-of: build }
      - { id: S2, kind: iteration, phase: build }
    ---
    # Plan
    """
  And a file "specs/REQ-search.md" containing:
    """
    ---
    id: REQ-search
    maturity: idea
    sprint: S1
    ---
    # Search
    """
  And a file "specs/REQ-filters.md" containing:
    """
    ---
    id: REQ-filters
    maturity: idea
    iteration: S1
    ---
    # Filters
    """
  When the lifecycle is computed
  Then the iterations are:
    | id | phase | plans      |
    | S1 | build | REQ-search |
    | S2 |       |            |
  And the planned activity is:
    | discipline   | S1 |
    | requirements | 1  |

Scenario: attributes.met names the key a milestone is recorded as met with
  Given a file "sdp.config.yaml" containing:
    """
    vocabulary: { attributes: { met: reached } }
    """
  And a file "specs/MS-launch.md" containing:
    """
    ---
    id: MS-launch
    ---
    # Launch

    ```gherkin
    Scenario: There is something to launch
      Then the query "requirement" returns at least 1 result
    ```
    """
  When I run "sdp gate MS-launch --record"
  Then the file "specs/MS-launch.md" contains "reached: 20"
  When I run "sdp status"
  Then the output contains "milestones    met 1"

Scenario: links names keys of the workspace's own that link
  Given a file "sdp.config.yaml" containing:
    """
    vocabulary: { links: [owner] }
    """
  And a file "specs/REQ-catalogue.md" containing:
    """
    ---
    id: REQ-catalogue
    owner: ARCH-index
    reviewer: ARCH-gone
    ---
    # Catalogue
    """
  And a file "specs/ARCH-index.md" containing:
    """
    ---
    id: ARCH-index
    kind: element
    ---
    # Search index
    """
  When the workspace is loaded
  Then the edges from "REQ-catalogue" are "REQ-catalogue -owner-> ARCH-index"
  And sdp reports "nothing"

Scenario: sdp vocabulary prints the profile in force
  Given a file "sdp.config.yaml" containing:
    """
    vocabulary: { kinds: { decision: [adr] }, links: [owner] }
    """
  When I run "sdp vocabulary --json"
  Then the JSON output has:
    | data.vocabulary.links       | owner                                                                                      |
    | data.vocabulary.maturity    | idea, draft, specified, ready                                                              |
    | data.made.kinds             | scenario, rule, code, missing                                                              |
    | data.made.relations         | rule-of                                                                                    |
    | data.made.tags              | @gate, @serial, @open                                                                      |
    | data.made.stages            | failing, in-progress, verified                                                             |
    | data.made.reservedRelations | stage, verification, scenarios, summary, file, openQuestions, declaredIn, maturity, status |
  When I run "sdp vocabulary"
  Then the output line with "decision" contains "adr"
  And the output line with "scenarioAttributes" contains "staleBecause"

Scenario: What sdp vocabulary prints as the profile is a configuration that reads back
  When I run the pipeline:
    """
    sdp vocabulary --json | jq '{ vocabulary: .data.vocabulary }' > copied.json
    mv copied.json sdp.config.json
    sdp vocabulary --json | jq -r '.data.vocabulary.relations.plan[]'
    """
  Then the exit code is 0
  And the output lines are "iteration"

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
  Then the output contains "ADR-0001\tspecs/decisions/ADR-0001-use-postgres.md"
  And the file "specs/decisions/ADR-0001-use-postgres.md" contains "id: ADR-0001"
  And the file "specs/decisions/ADR-0001-use-postgres.md" does not contain "kind:"
  When I run "sdp new plan Roadmap"
  Then the output contains "PLAN-roadmap\tspecs/delivery/PLAN-roadmap.md"
  When I run "sdp new checkpoint Launch"
  Then the file "specs/delivery/CHEC-launch.md" contains "ends: ERA-elaboration"
  When I run "sdp q era|sprint --ids"
  Then the output lines are "ERA-inception, ERA-elaboration, ERA-construction, ERA-transition, I1, E1, C1, T1"
  When I run "sdp q 'checkpoint -ends-> era' --ids"
  Then the output lines are "ERA-elaboration"
  When I run "sdp check --json"
  Then the exit code is 1
  And the JSON output has:
    | data.rule | maturity-criteria, maturity-value, template-placeholder |
  When I run "sdp lifecycle --json"
  Then the JSON output has:
    | data.phases | ERA-inception, ERA-elaboration, ERA-construction, ERA-transition |

Scenario Outline: A profile that cannot work is rejected where it is wrong
  Given a file "sdp.config.yaml" containing:
    """
    <config>
    """
  Then loading the workspace fails with "<problem>"
  And loading the workspace fails with '<path>'

  Examples:
    | config                                            | problem                              | path                          |
    | vocabulary: { maturity: [] }                      | needs at least one level             | at ["vocabulary"]["maturity"] |
    | vocabulary: { maturity: [idea, ready, idea] }     | idea repeats                         | at ["vocabulary"]["maturity"] |
    | vocabulary: { maturity: [idea, verified] }        | verified is a stage sdp derives      | at ["vocabulary"]["maturity"] |
    | vocabulary: { maturity: [idea, " "] }             | a word cannot be empty               | at ["vocabulary"]["maturity"] |
    | vocabulary: { relations: { anchor: "" } }         | a word cannot be empty               | at ["vocabulary"]["relations"]["anchor"] |
    | vocabulary: { kinds: { decision: [] } }           | a role needs at least one word       | at ["vocabulary"]["kinds"]["decision"] |
    | vocabulary: { kinds: { milestone: [scenario] } }  | scenario is a kind sdp makes itself  | at ["vocabulary"]["kinds"]["milestone"] |
    | vocabulary: { attributes: { activity: stage } }   | stage is an attribute sdp derives or checks itself | at ["vocabulary"]["attributes"]["activity"] |
    | vocabulary: { links: [status] }                   | status is an attribute sdp derives or checks itself | at ["vocabulary"]["links"] |
    | vocabulary: { relations: { mention: iteration } } | iteration is also a relation authors write as a link key | at ["vocabulary"]["relations"]["mention"] |
    | vocabulary: { relations: { scenario: is } }       | is is also relations.anchor          | at ["vocabulary"]["relations"]["scenario"] |
    | ids: { component: MY-COMP }                       | must be letters only                 | at ["ids"]["component"]       |
    | ids: { story: REQ }                               | requirement and story share the prefix REQ | at ["ids"]              |

Scenario: A malformed configuration names the file and the key
  Given a file "sdp.config.yaml" containing:
    """
    specs: specs/**/*.md
    """
  Then loading the workspace fails with "sdp.config.yaml"
  And loading the workspace fails with 'at ["specs"]'

Scenario: A misspelled key is an error, not a silent default
  Given a file "sdp.config.yaml" containing:
    """
    spec: ["specs/**/*.md"]
    """
  Then loading the workspace fails with "sdp.config.yaml"
  And loading the workspace fails with 'excess property'
  And loading the workspace fails with 'at ["spec"]'
~~~
