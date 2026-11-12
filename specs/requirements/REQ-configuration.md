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

A workspace is the directory sdp reads. Its root may hold `sdp.config.yaml` (or `sdp.config.yml`,
or `sdp.config.json`; the first one found wins). Every key is optional and an empty or missing file
means the defaults, so sdp works in any repository before anyone configures it. A malformed file
— or a key sdp does not know, such as a misspelled `spec:` — is an error that names the file and
the offending key.

| Key | Default | Effect |
| --- | --- | --- |
| `specs` | `**/*.md` | Markdown files read as specs (those whose front matter has an `id`) |
| `features` | `**/*.feature` | Gherkin feature files that join the graph |
| `code` | sources under `src/`, `lib/`, `app/` and `packages/` | files scanned for `@sdp` annotations |
| `steps` | `**/*.steps.{ts,mts,js,mjs}` | step definition modules: `sdp run` imports them, every other command only reads them |
| `exclude` | `**/node_modules/**`, `.sdp/**`, `**/dist/**`, `**/build/**`, `.git/**` | paths never read; the configured list adds to these |
| `evidence.inputs` | none | files the steps read while they run — fixtures, data — as globs: a result goes stale when one changes ([[REQ-executable-specs]]) |
| `evidence.env` | none | names of environment variables the steps read: a result goes stale when one changes; only a digest of the values is stored |
| `results` | `.sdp/results.json` | where `sdp run` records scenario results |
| `types` | `.sdp/ids.d.ts` | where `sdp types` writes the id declarations that type `annotate` ([[ARCH-code-annotations]]) |
| `ids` | see below | the id prefix of each kind |
| `vocabulary` | see below | the words sdp interprets ([[DEC-0002]]) |

Lists replace their default, except `exclude`, which extends it; `ids` merges key by key.

**Vocabulary.** The few words sdp reads meaning into are roles of one profile, each with a default
word ([[ARCH-vocabulary]]). `sdp vocabulary` prints the active profile role by role, and
`sdp vocabulary --json` holds it as `data.vocabulary` in the shape this section takes, so it can
be copied into the configuration and changed there. A role the section names replaces its default;
`disciplines` merge one by one. Under `made`, the same command lists the words that are not
configurable because sdp makes them itself: the kinds `scenario`, `code` and `missing`, the
attributes it derives, the stages beyond the ladder, and the names no link can have ([[DEC-0010]]).

| Section | What sdp reads its words for |
| --- | --- |
| `kinds` | decision records, milestones (their scenarios are gates), phases, iterations, patterns, the kinds that are the architecture, the architectural drivers, and the kind a node anchored in code gets when it names none |
| `relations` | superseding a decision, planning work into an iteration, putting an iteration or milestone into its phase, the prose mention, a scenario's link to its spec, and the code anchor |
| `attributes` | `activity`, a phase's `order`, an iteration's `start` and `end`, and the attribute whose value in `qualities` marks a quality requirement |
| `statuses` | the statuses a decision may have, which of them are `accepted` and `superseded`, and those that make a record inactive |
| `maturity` | the authoring ladder, lowest first ([[REQ-maturity-criteria]]) |
| `disciplines` | the kinds whose planned nodes are, by default, work in each discipline ([[REQ-lifecycle-view]]) |
| `links` | keys of the workspace's own that link like `links:` entries ([[DEC-0010]]) |
| `words` | `kinds`, `relations` and `attributes` of the workspace's own that nothing in its graph has yet, so that a rule can assert there is none of them without its query being taken for a typo ([[REQ-builtin-steps]]) |

A profile that cannot work is an error naming its path, where it is configured and not later in a
spec or a query:

- a word that is empty, or a kind, relation or decision-status role left without any word —
  renaming a role is free, removing it would switch off what sdp reads through it;
- an empty ladder, a level listed twice, or a level named like a stage sdp derives (`failing`,
  `in-progress`, `verified`);
- a role given a word sdp makes or reads itself: a kind sdp makes (`scenario`, `code`, `missing`),
  or a relation, link key or attribute named like an attribute sdp derives or checks (`stage`,
  `maturity`, `status`, …);
- the mention, scenario or anchor relation sharing its word with another of them or with a relation
  authors write as a link key (plan, phase, supersedes, `links`): one edge would be two things;
- `statuses.accepted` or `statuses.superseded` naming a status that `statuses.decision` does not list.

`sdp new` writes what the profile says ([[REQ-cli]]): the template of a kind is that of the role it
plays, and the keys, kinds and statuses it writes are the workspace's words.

**Id prefixes.** A spec that omits `kind` gets it from its id prefix — case-insensitive, followed
by `-` or `_` — and a prefix that maps to no kind gives `spec`. `sdp new` names new specs with the same prefixes: decisions and risks are
numbered (`DEC-0007`), everything else takes a slug of its title (`REQ-guest-checkout`). A kind has
one prefix, so moving requirements to `US-` makes `REQ-` ids plain specs unless they declare their
kind. A prefix is letters only and belongs to one kind, so every id sdp makes reads back as its kind.

| Kind | requirement | nfr | decision | element | pattern | milestone | capability | risk |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Prefix | `REQ` | `NFR` | `DEC` | `ARCH` | `PAT` | `MS` | `CAP` | `RISK` |

**Disciplines.** The default disciplines are RUP's, with the kinds whose planned nodes count as
their work unless `activity:` says otherwise; how activity is planned and counted is
[[REQ-lifecycle-view]]'s. No kind is implementation or test work by itself: specs plan those with
`activity:`.

| Discipline | Kinds |
| --- | --- |
| business-modeling | capability, goal, actor, business-process, vision, stakeholder |
| requirements | requirement, nfr, feature, story, use-case, epic |
| analysis-design | decision, element, pattern |
| implementation | none |
| test | none |
| deployment | release, environment, deployment |

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
    @id:REQ-search @maturity:ready
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

Scenario Outline: Each key shapes what the graph holds
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

Scenario Outline: Without a declared kind, the id prefix decides
  Given a file "specs/spec.md" containing:
    """
    ---
    id: <id>
    ---
    """
  When the workspace is loaded
  Then the workspace graph has node "<id>" of kind "<kind>"

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

Scenario Outline: The id prefixes name new specs
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
  When the scenarios are run
  Then the results are stored in "out/results.json"
  And node "REQ-cart" has attribute verification = "passing"

Scenario: kinds.architectural says which kinds are the architecture
  Given a file "sdp.config.yaml" containing:
    """
    vocabulary: { kinds: { architectural: [component] } }
    """
  And a file "docs/model.md" containing:
    """
    ---
    id: MODEL
    kind: model
    nodes:
      - { id: CMP-orders, kind: component, links: { decided-by: DEC-1 } }
      - { id: ARCH-legacy, kind: element }
      - { id: DEC-1, kind: decision, status: accepted }
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
  And a file "docs/model.md" containing:
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

Scenario: kinds.decision gives a team's own word for decisions the decision rules
  Given a file "sdp.config.yaml" containing:
    """
    vocabulary: { kinds: { decision: [adr], driver: [adr, nfr] } }
    """
  And a file "docs/ADR-1.md" containing:
    """
    ---
    id: ADR-1
    kind: adr
    ---
    # Use Postgres
    """
  When the workspace is checked
  Then the check reports "decision-status" for "ADR-1"

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
  Then "operations" activity in iteration "C1" is 1

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
      - { id: build, kind: phase, order: 1 }
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
  Then phase "build" has iterations "S1"
  And iteration "S1" plans "REQ-search"
  And "requirements" activity in iteration "S1" is 1

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
  And a file "docs/ARCH-index.md" containing:
    """
    ---
    id: ARCH-index
    kind: element
    ---
    # Search index
    """
  When the workspace is loaded
  Then the edges from "REQ-catalogue" are "REQ-catalogue -owner-> ARCH-index"
  And building the graph reports "nothing"

Scenario: sdp vocabulary prints the profile in force
  Given a file "sdp.config.yaml" containing:
    """
    vocabulary: { kinds: { decision: [adr] }, links: [owner] }
    """
  When I run "sdp vocabulary --json"
  Then the output is valid JSON
  And the output field "data.vocabulary.links" holds "owner"
  And the output field "data.vocabulary.maturity" holds "idea, draft, specified, ready"
  And the output field "data.made.kinds" holds "scenario, code, missing"
  And the output field "data.made.stages" holds "failing, in-progress, verified"
  And the output field "data.made.reservedRelations" holds "stage, verification, scenarios, summary, file, openQuestions, declaredIn, maturity, status"
  When I run "sdp vocabulary"
  Then the output line with "decision" contains "adr"
  And the output line with "scenarioAttributes" under "made by sdp, not configurable" contains "staleBecause"

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
      relations: { plan: [sprint], phase: [part-of], supersedes: [replaces], anchor: implements-element }
      attributes: { order: position, start: from, end: until }
      statuses: { decision: [pending, approved, retired], accepted: approved, superseded: retired, inactive: [retired] }
    """
  When I run "sdp new adr 'Use Postgres'"
  Then the output contains "ADR-0001\tdocs/decisions/ADR-0001-use-postgres.md"
  And the file "docs/decisions/ADR-0001-use-postgres.md" contains "status: pending # pending | approved | retired"
  And the file "docs/decisions/ADR-0001-use-postgres.md" contains "# replaces: ADR-…"
  When I run "sdp new plan Roadmap"
  Then the output contains "PLAN-roadmap\tdocs/delivery/PLAN-roadmap.md"
  When I run "sdp new checkpoint Launch"
  Then the file "docs/delivery/milestones/CHEC-launch.md" contains "part-of: ERA-elaboration"
  When I run "sdp q era|sprint --ids"
  Then the output lines are "ERA-inception, ERA-elaboration, ERA-construction, ERA-transition, I1, E1, C1, T1"
  When I run "sdp q 'sprint -part-of-> era[position=2]' --ids"
  Then the output lines are "ERA-elaboration"
  When I run "sdp check"
  Then the output does not contain "[decision-status]"
  And the output does not contain "[dangling-link]"
  And the output does not contain "[plan-reference]"
  When I run "sdp lifecycle --json"
  Then the output field "data.phases" holds "ERA-inception, ERA-elaboration, ERA-construction, ERA-transition"

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
    | vocabulary: { statuses: { accepted: approved } }  | approved is not one of statuses.decision | at ["vocabulary"]["statuses"]["accepted"] |
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
    spec: ["docs/**/*.md"]
    """
  Then loading the workspace fails with "sdp.config.yaml"
  And loading the workspace fails with 'excess property'
  And loading the workspace fails with 'at ["spec"]'
~~~
