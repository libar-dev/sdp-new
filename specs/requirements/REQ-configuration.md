---
id: REQ-configuration
kind: requirement
title: Workspace configuration
maturity: ready
iteration: E1
tags: [configuration]
links:
  refines: CAP-living-specs
  realized-by: ARCH-workspace
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
| `steps` | `**/*.steps.{ts,mts,js,mjs}` | step definition modules `sdp run` imports |
| `exclude` | `**/node_modules/**`, `.sdp/**`, `**/dist/**`, `**/build/**`, `.git/**` | paths never read; the configured list adds to these |
| `results` | `.sdp/results.json` | where `sdp run` records scenario results |
| `maturity` | `[idea, draft, specified, ready]` | the maturity ladder, lowest first ([[REQ-maturity-gates]]) |
| `ids` | see below | the id prefix of each kind |
| `architecture.kinds` | `[element, pattern]` | kinds that are architectural abstractions, the pool for candidates |
| `architecture.drivers` | `[decision, nfr]` | kinds shown with the significant nodes they link to ([[REQ-curated-architecture]]) |
| `lifecycle.disciplines` | see below | the node kinds that represent work in each discipline ([[REQ-lifecycle-view]]) |

Lists replace their default, except `exclude`, which extends it; `ids` and `lifecycle.disciplines`
merge key by key.

**Id prefixes.** A spec that omits `kind` gets it from its id prefix; a prefix that maps to no
kind gives `spec`. `sdp new` names new specs with the same prefixes: decisions and risks are
numbered (`DEC-0007`), everything else takes a slug of its title (`REQ-guest-checkout`). A kind has
one prefix, so moving requirements to `US-` makes `REQ-` ids plain specs unless they declare their
kind.

| Kind | requirement | nfr | decision | element | pattern | milestone | capability | risk |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Prefix | `REQ` | `NFR` | `DEC` | `ARCH` | `PAT` | `MS` | `CAP` | `RISK` |

**Disciplines.** The RUP disciplines and the kinds whose planned nodes count as their work:

| Discipline | Kinds |
| --- | --- |
| business-modeling | capability, goal, actor, business-process, vision, stakeholder |
| requirements | requirement, nfr, feature, story, use-case, epic |
| analysis-design | decision, element, pattern |
| implementation | none by default; planned specs that are in progress or verified count |
| test | none by default; executed scenarios of planned specs count |
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
    | maturity | sdp.config.yaml | maturity: [idea, draft, specified, approved, ready] | requirement[maturity<approved] | REQ-scratch                        |
    | json     | sdp.config.json | { "exclude": ["notes/**"] }                         | requirement                    | REQ-login, REQ-search              |

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

Scenario: architecture.kinds says which kinds can be candidates
  Given a file "sdp.config.yaml" containing:
    """
    architecture: { kinds: [component] }
    """
  And a file "docs/model.md" containing:
    """
    ---
    id: MODEL
    kind: model
    nodes:
      - { id: CMP-orders, kind: component, links: { decided-by: DEC-1 } }
      - { id: DEC-1, kind: decision, status: accepted }
    ---
    # Model
    """
  When I ask for architecture candidates
  Then the output contains "CMP-orders"

Scenario: architecture.drivers says what is shown next to significant nodes
  Given a file "sdp.config.yaml" containing:
    """
    architecture: { drivers: [decision, nfr, risk] }
    """
  And a file "docs/model.md" containing:
    """
    ---
    id: MODEL
    kind: model
    nodes:
      - { id: ARCH-orders, kind: element, significant: true, rationale: owns checkout, links: { threatened-by: RISK-1 } }
      - { id: RISK-1, kind: risk, title: Payment provider outage }
    ---
    # Model
    """
  When I ask for the architecture view
  Then the output contains "ARCH-orders -threatened-by-> RISK-1"

Scenario: lifecycle.disciplines adds or redefines disciplines
  Given a file "sdp.config.yaml" containing:
    """
    lifecycle: { disciplines: { operations: [runbook] } }
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
