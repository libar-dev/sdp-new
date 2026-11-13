# Organizing Gherkin Specifications as Both Future Behavior and Executable Acceptance Tests

## Executive summary

The strongest overall pattern is to treat the Gherkin corpus as **durable behavioral documentation**, not as a mirror of your delivery backlog. In practice, that means organizing specifications primarily by **domain and capability**, using `Feature` for a coherent capability, `Rule` for a business rule within that capability, and `Scenario`/`Example` for a concrete illustration of one rule. This aligns closely with both modern Gherkin semantics and the Cucumber BDD model: a feature groups related behavior, a rule represents a business rule, and scenarios are concrete examples that are simultaneously specification, documentation, and executable tests. [cucumber.io](https://cucumber.io/docs/gherkin/reference/?utm_source=chatgpt.com)

The most important design decision is **not** folder depth or naming syntax. It is deciding which artifacts are **transient planning artifacts** and which are **long-lived behavioral truths**. Cucumber’s own BDD guidance makes this distinction explicit: stories and unresolved questions belong to discovery/planning, while rules and examples are the durable material that should be formulated into executable specifications. Matt Wynne and Seb Rose explicitly argue against creating a feature file per user story because stories are temporary delivery slices, whereas feature files should remain useful documentation after the story is done. [cucumber.io](https://cucumber.io/docs/bdd/example-mapping/?utm_source=chatgpt.com)

For a repository that contains both future behavior and already executable behavior, the best default is therefore **one canonical specification tree**, not separate “requirements” and “tests” trees. Planned behavior and executable behavior should usually be distinguished by metadata—typically lifecycle tags such as `@planned`, `@ready`, or `@implemented`—or by automation state, rather than by duplicating the same scenario in separate locations. Cucumber supports tags at `Feature`, `Rule`, `Scenario`, `Scenario Outline`, and `Examples` levels, supports inherited tags, Boolean tag expressions, and explicitly documents use of tags for both selective execution and links to external requirements. [cucumber.io](https://cucumber.io/docs/cucumber/api/?utm_source=chatgpt.com)

A good default hierarchy is:

text

```text
bounded-context
  └── capability
        └── feature file
              ├── Rule
              │    ├── Scenario
              │    └── Scenario
              └── Rule
                   └── Scenario
```

This gives folders responsibility for **navigation**, `Feature` responsibility for **capability-level cohesion**, `Rule` responsibility for **business semantics**, and `Scenario` responsibility for **concrete examples**. It also maps naturally onto Domain-Driven Design: bounded contexts define where a model and ubiquitous language are internally consistent, making them an appropriate top-level organizational boundary for specifications when the system is large enough to have genuinely distinct domain models. [martinfowler.com](https://martinfowler.com/bliki/BoundedContext.html?utm_source=chatgpt.com)

The main recommendation is to avoid putting **epic**, **story**, **sprint**, **ticket**, or **implementation status** into the permanent folder hierarchy. Those dimensions change too quickly. Keep them as tags or external references. Use the filesystem for dimensions that are structurally stable: bounded context, product area, capability, or stakeholder-facing documentation area. This follows the reasoning in Cucumber’s guidance on feature-file organization, which recommends hierarchical navigation and explicitly warns that user stories are poor long-term units for feature-file organization. [cucumber.io](https://cucumber.io/blog/bdd/solving-how-to-organise-feature-files/?utm_source=chatgpt.com)

A mature model looks like this:

The strongest implementation rule is: **organize Gherkin for the reader, select tests for execution through tags and CI configuration, and maintain traceability through stable identifiers rather than directory names.** That separation prevents the repository structure from becoming overloaded with execution concerns, backlog structure, ownership, environment, and test-layer distinctions simultaneously. Cucumber’s documentation itself separates these concerns: directory structure supports navigation, while tags support subsets, hooks, filtering, and external-document linkage. [cucumber.io](https://cucumber.io/blog/bdd/solving-how-to-organise-feature-files/?utm_source=chatgpt.com)

## Granularity and the semantic hierarchy

Gherkin already gives you a useful hierarchy, but it is important not to assign it meanings that are too closely tied to project-management terminology.

The official grammar defines `Feature` as the high-level grouping for related scenarios, `Rule` as a business rule that the software should implement, and `Scenario`/`Example` as a concrete example illustrating a rule. Gherkin allows only one `Feature` per `.feature` file. Cucumber recommends that examples remain concise—typically around three to five steps—because scenarios lose expressive value as they become longer. [cucumber.io](https://cucumber.io/docs/gherkin/reference/?utm_source=chatgpt.com)

A useful conceptual mapping is:

| Planning/domain concept | Recommended representation | Why |
| --- | --- | --- |
| Initiative / epic | Usually external planning system or tag | Too transient and often cross-cuts many capabilities |
| Bounded context | Directory or repository/module boundary | Stable domain-language boundary |
| Capability / functional area | Directory, sometimes `Feature` | Good navigational abstraction |
| Feature | One `.feature` file | Native Gherkin grouping unit |
| Business rule | `Rule:` | Native semantic unit introduced specifically for this purpose |
| Example / acceptance criterion | `Scenario:` or `Example:` | Concrete behavior |
| Data variations | `Scenario Outline` + `Examples` | Native parameterized examples |
| Story / ticket | Tag or external traceability link | Delivery unit, not durable behavior taxonomy |

This mapping follows the way Cucumber describes Example Mapping: a story contains rules, and rules are illustrated by examples. But when the behavior is formulated into Gherkin, the durable content is the **rules and examples**, not the story itself. Cucumber’s guidance specifically says the story card should not be reproduced in the feature file because the story is a transient planning artifact. [cucumber.io](https://cucumber.io/docs/bdd/example-mapping/?utm_source=chatgpt.com)

That distinction matters because the same rule can survive many stories. Suppose an epic is “Improve checkout,” with stories for card validation, address validation, and shipping limits. If files are created per story, the finished repository eventually reads like an archaeology of implementation work. If instead the repository says:

text

```text
checkout/
├── payment_authorization.feature
├── shipping_eligibility.feature
└── order_confirmation.feature
```

then the documentation remains meaningful after the implementation sequence has been forgotten.

Inside `shipping_eligibility.feature`, `Rule` can supply a finer-grained stable structure:

gherkin

```gherkin
@context:checkout
Feature: Shipping eligibility

  Customers may only select shipping methods available
  for the destination of the order.

  Rule: Hazardous products cannot be shipped internationally

    Scenario: Order containing a hazardous product
      Given an order contains a hazardous product
      And the delivery address is outside the domestic region
      When shipping options are determined
      Then international shipping is unavailable

    Scenario: Order without hazardous products
      Given an order contains no hazardous products
      And the delivery address is outside the domestic region
      When shipping options are determined
      Then international shipping may be offered
```

This structure corresponds closely to the Gherkin model: a `Feature` documents a capability and a `Rule` groups scenarios that illustrate a single business rule. [cucumber.io](https://cucumber.io/blog/bdd/gherkin-rules/?utm_source=chatgpt.com)

A practical granularity heuristic is that a feature file should answer one stable question such as **“How does shipping eligibility work?”**, not one delivery question such as **“What was completed in story ABC-123?”**. A `Rule` should express one independently discussable business rule. A scenario should demonstrate one illustrative example and should fail for one clear reason; Cucumber explicitly recommends scenario independence and says each scenario should test exactly one thing. [cucumber.io](https://cucumber.io/docs/faq/?utm_source=chatgpt.com)

The word _feature_ is inherently ambiguous, and Cucumber’s own guidance acknowledges that there is no universal definition. Consequently, folder hierarchy should compensate for that ambiguity by giving readers stable context around each feature file. [cucumber.io](https://cucumber.io/blog/bdd/solving-how-to-organise-feature-files/?utm_source=chatgpt.com)

## Domain-driven organization and repository structures

Domain-Driven Design offers a strong organizing principle when the software has multiple business models or areas with different language. A bounded context is the boundary within which a particular domain model and vocabulary are internally consistent; Fowler and the DDD community both emphasize that different contexts may legitimately use different meanings for otherwise identical terms. [martinfowler.com](https://martinfowler.com/bliki/BoundedContext.html?utm_source=chatgpt.com)

That makes bounded context a particularly good **top-level specification boundary**. Gherkin is supposed to use the language of the domain, so a directory tree that crosses inconsistent domain languages is likely to become confusing.

A recommended structure for a modular monolith or large application is:

text

```text
specs/
├── identity/
│   ├── registration/
│   │   ├── create_account.feature
│   │   └── verify_email.feature
│   ├── authentication/
│   │   ├── password_login.feature
│   │   ├── account_lockout.feature
│   │   └── multi_factor_authentication.feature
│   └── account_recovery/
│       └── recover_account.feature
│
├── ordering/
│   ├── cart/
│   │   ├── add_product.feature
│   │   └── calculate_cart_total.feature
│   ├── checkout/
│   │   ├── shipping_eligibility.feature
│   │   └── payment_authorization.feature
│   └── fulfillment/
│       └── dispatch_order.feature
│
└── billing/
    ├── invoicing/
    │   └── issue_invoice.feature
    └── payments/
        ├── capture_payment.feature
        └── refund_payment.feature
```

The filesystem here contains **stable domain dimensions only**. Environment, lifecycle, test speed, UI/API layer, release, ownership, and ticket identifiers belong elsewhere.

If the architecture is already split into services aligned with bounded contexts, colocation can be preferable:

text

```text
services/
├── identity-service/
│   ├── src/
│   └── specs/
│       ├── authentication/
│       └── recovery/
│
├── ordering-service/
│   ├── src/
│   └── specs/
│       ├── checkout/
│       └── fulfillment/
│
└── billing-service/
    ├── src/
    └── specs/
        ├── payments/
        └── invoicing/
```

Cucumber’s core guidance says Gherkin files are typically version-controlled alongside the software, reinforcing the value of keeping specifications near the implementation they describe. [github.com](https://github.com/cucumber/docs/blob/main/content/docs/guides/overview.md?utm_source=chatgpt.com)

A centralized specification repository can still be justified where behaviors cross multiple deployables or where product stakeholders use the specs heavily:

text

```text
product-specifications/
├── identity/
├── ordering/
├── billing/
└── cross_context/
    ├── customer_onboarding.feature
    └── end_to_end_order_lifecycle.feature
```

The tradeoff is that centralized specs gain navigability and product-level coherence but lose some proximity to implementation. Separate service-local specs gain ownership and change locality but make cross-context documentation harder to assemble.

| Structure | Strengths | Weaknesses | Best fit |
| --- | --- | --- | --- |
| Central `specs/` tree | Easy living-documentation navigation; one corpus | Can drift from implementation ownership | Product-centric or modular-monolith teams |
| Specs beside each service/module | Strong ownership and code proximity | Cross-service behavior becomes fragmented | Service-aligned bounded contexts |
| Separate acceptance-test repo | Independent deployment/testing cadence | Highest risk of behavioral drift | Organization-wide end-to-end suites |
| Story/epic directories | Easy during initial delivery | Quickly becomes obsolete as documentation | Rarely recommended |
| Test-layer directories such as `ui/`, `api/` | Convenient for automation engineers | Organizes by implementation, not behavior | Better as secondary technical test suites |

An instructive industry example is the GOV.UK One Login acceptance-test repository. It uses Cucumber for both UI and API acceptance testing and relies heavily on tags such as `@UI` and `@AccountManagementAPI` to select execution modes and environments, rather than requiring those execution dimensions to be the sole structural hierarchy. Its documentation also shows tag-based filtering through environment configuration and separate test execution profiles. [github.com](https://github.com/govuk-one-login/authentication-acceptance-tests)

The deeper design principle is that a folder hierarchy can represent only a small number of dimensions well. Cucumber itself notes that some cross-cutting concerns do not fit hierarchical organization and suggests tags as an index for those cases. [cucumber.io](https://cucumber.io/blog/bdd/solving-how-to-organise-feature-files/?utm_source=chatgpt.com)

A good relationship model is therefore:

The solid edges belong naturally in the repository tree and Gherkin syntax. The dotted edges are cross-cutting dimensions and are better represented by tags or external metadata.

## Planned behavior versus executable behavior

This is the central difficulty in your use case.

The most maintainable approach is usually **not** to have:

text

```text
specs/planned/
specs/executable/
```

because a behavior has to move physically when implementation begins, links change, history becomes harder to follow, and there is a temptation to copy rather than move. Once duplication occurs, the planned version and executable version can diverge.

Instead, use a **single canonical behavioral specification** whose lifecycle changes over time:

Cucumber’s own BDD process has essentially the first part of this lifecycle: **Discovery → Formulation → Automation**. It describes scenarios as starting life as executable specifications before production code and later becoming automated tests and living documentation as the production implementation emerges. [cucumber.io](https://cucumber.io/docs/bdd/?utm_source=chatgpt.com)

A sensible tag taxonomy might therefore be:

gherkin

```gherkin
@context:ordering
@capability:checkout
@lifecycle:planned
@req:PAY-241
Feature: Payment authorization
```

and later:

gherkin

```gherkin
@context:ordering
@capability:checkout
@lifecycle:implemented
@req:PAY-241
Feature: Payment authorization
```

Cucumber technically permits arbitrary tag names and explicitly documents Boolean tag expressions, inherited tags, and the use of tags for external document identifiers. [cucumber.io](https://cucumber.io/docs/cucumber/api/?utm_source=chatgpt.com)

There is, however, an important nuance: using lifecycle tags heavily is a **repository-management convention**, not an official Cucumber BDD requirement. Cucumber does demonstrate `@wip` as an example tag expression and supports undefined or pending steps, but the framework does not prescribe a canonical lifecycle vocabulary. [cucumber.io](https://cucumber.io/docs/cucumber/api/?utm_source=chatgpt.com)

Three competing approaches are viable:

| Approach | How future behavior is represented | Advantages | Risks |
| --- | --- | --- | --- |
| Single tree + lifecycle tags | Same feature files, tagged by lifecycle | No duplication; strongest living-documentation model | Requires CI discipline and tag governance |
| Separate `planned/` and `implemented/` trees | Files move between trees | Very obvious visual distinction | Moving files churns paths; duplication risk |
| Discovery outside Gherkin, Gherkin only after refinement | Backlog/example maps first; feature file added once ready | Keeps executable corpus clean | Future behavior is less visible in repository |
| One tree, automation inferred from undefined/pending steps | Missing step definitions imply future behavior | Minimal metadata | CI status becomes noisy and semantics are ambiguous |

The third option is closest to strict BDD practice. Example Mapping guidance explicitly recommends doing discovery rapidly before formalizing everything in Gherkin, and says questions and stories should not become part of the durable Gherkin corpus. [cucumber.io](https://cucumber.io/docs/bdd/example-mapping/?utm_source=chatgpt.com)

For teams that deliberately want repository-resident future specifications, the first option is the best compromise: **canonical Gherkin plus lifecycle metadata**.

A strong convention is to define a small state machine rather than inventing arbitrary tags:

text

```text
@lifecycle:planned
@lifecycle:ready
@lifecycle:implemented
@lifecycle:deprecated
```

Use exactly one lifecycle tag per scenario or feature. Then make CI semantics explicit:

text

```text
PR acceptance suite:
not @lifecycle:planned and not @lifecycle:deprecated

Specification validation:
all .feature files

Future-spec report:
@lifecycle:planned or @lifecycle:ready
```

Do not use undefined step definitions as your primary lifecycle mechanism. Cucumber treats undefined steps as an execution result in which subsequent steps are skipped, and pending steps similarly indicate work remains. That is useful during implementation but produces a weaker governance model than explicit lifecycle metadata. [cucumber.io](https://cucumber.io/docs/cucumber/api/?utm_source=chatgpt.com)

You can also put status at the `Rule` level:

gherkin

```gherkin
Feature: Refunds

  @lifecycle:implemented
  Rule: A settled payment may be refunded

    Scenario: Full refund
      ...

  @lifecycle:planned
  Rule: A refund may be scheduled for a future date

    Scenario: Schedule a refund
      ...
```

Because tags are inherited by descendant scenarios, rule-level status is both expressive and operationally useful. [cucumber.io](https://cucumber.io/docs/cucumber/api/?utm_source=chatgpt.com)

That is often better than tagging an entire feature as “planned” simply because one new rule is planned.

## Naming, tagging, traceability, and living documentation

Naming conventions should optimize for **semantic stability and navigation**, not sorting tricks.

A good file naming convention is lowercase snake case or kebab case using the capability phrase:

text

```text
payment_authorization.feature
account_lockout.feature
shipping_eligibility.feature
recover-account.feature
```

Avoid:

text

```text
EPIC-847.feature
story_2342.feature
sprint_17_checkout.feature
test_0045.feature
```

Those names encode transient project-management information rather than the behavior. Cucumber’s guidance against organizing features around stories is directly relevant here. [cucumber.io](https://cucumber.io/blog/bdd/solving-how-to-organise-feature-files/?utm_source=chatgpt.com)

Scenario names should reveal intent rather than mechanics. Cucumber’s formulation guidance emphasizes concise, intention-revealing examples and warns against scenarios full of UI mechanics such as clicking buttons or following links when the real business behavior can be expressed directly. [cucumber.io](https://cucumber.io/blog/bdd/keep-your-scenarios-brief/?utm_source=chatgpt.com)

Prefer:

gherkin

```gherkin
Scenario: Customer is blocked after repeated failed sign-ins
```

over:

gherkin

```gherkin
Scenario: Click sign in five times with wrong password
```

The latter bakes an interface workflow into what should be durable business documentation.

### Tag taxonomy

Tags should be treated like an API. Without governance, they become an uncontrolled secondary taxonomy.

A useful taxonomy separates orthogonal dimensions:

gherkin

```gherkin
@context:identity
@capability:authentication
@lifecycle:implemented
@layer:api
@risk:security
@speed:fast
@req:AUTH-194
Feature: Account lockout
```

Not every repository needs every dimension. In fact, the fewer dimensions you can support consistently, the better.

A robust set might be:

| Dimension | Examples | Primary use |
| --- | --- | --- |
| Lifecycle | `@lifecycle:planned`, `@lifecycle:implemented` | Future vs executable selection |
| Requirement | `@req:PAY-123` | Traceability |
| Runtime | `@layer:ui`, `@layer:api` | Select test architecture |
| Test suite | `@smoke`, `@regression` | CI subsets |
| Quality concern | `@security`, `@accessibility` | Cross-cutting reporting |
| Environment constraint | `@requires:payments-sandbox` | Setup and selective execution |
| Ownership | `@team:identity` | Optional reporting, not primary navigation |

Cucumber supports tag expressions such as `@smoke and @fast`, `@gui or @database`, and negation, making this approach portable across implementations. [cucumber.io](https://cucumber.io/docs/cucumber/api/?utm_source=chatgpt.com)

Avoid tags that duplicate the folder hierarchy unless they have an operational purpose. For instance, if every file under `identity/` is tagged `@identity` solely for documentation, the tag provides little new information. If CI needs to run all identity tests independently, the duplication may be justified.

### Traceability

Traceability should be explicit but lightweight:

gherkin

```gherkin
@req:PAY-421
@issue:CHECKOUT-938
Rule: Cards requiring strong customer authentication are challenged
```

Cucumber explicitly documents using tags to reference external requirement-management, issue-tracking, or test-management IDs and notes that custom reporters can transform such tags into links. [cucumber.io](https://cucumber.io/docs/cucumber/api/?utm_source=chatgpt.com)

A traceability chain can therefore be modeled as:

Do not try to establish a one-to-one mapping between scenario and production method or class. Gherkin describes observable behavior, while step definitions provide the adapter between the business-readable specification and the implementation. Cucumber itself emphasizes that steps should describe behavior rather than implementation details. [cucumber.io](https://cucumber.io/docs/faq/?utm_source=chatgpt.com)

### Living documentation

The specification corpus becomes “living” only if readers can trust that it represents current system behavior. Cucumber describes its executable specifications as documentation of how the system actually behaves, while Specification by Example literature stresses that living documentation must be understandable, consistent, organized, and automatically checked. [cucumber.io](https://cucumber.io/docs/?utm_source=chatgpt.com)

A directory of `.feature` files alone is not enough.

Generate HTML or another browsable artifact from CI and publish it. Cucumber provides built-in HTML, JSON, JUnit, message, and other report formatters, and also supports its reporting service. [cucumber.io](https://cucumber.io/docs/cucumber/reporting/?utm_source=chatgpt.com)

A healthy documentation pipeline looks like:

The report should visibly distinguish at least:

text

```text
implemented + passing
implemented + failing
planned
deprecated
```

That turns the repository into both a behavioral catalog and an implementation-status map without maintaining separate copies.

## CI architecture, test data, and execution

The Gherkin taxonomy and test runtime architecture should be intentionally decoupled.

The feature hierarchy answers:

> Where does this behavior belong conceptually?

The tags answer:

> Under which execution conditions should this scenario run?

This distinction matters because the same business rule may have UI, API, contract, component, or system-level realizations.

Cucumber officially supports tag filtering, conditional hooks, path and line filtering, and configuration profiles or build-system configuration for different execution subsets. [cucumber.io](https://cucumber.io/docs/cucumber/api/?utm_source=chatgpt.com)

A CI strategy might use:

text

```text
pull request:
  @lifecycle:implemented and not @slow

main branch:
  @lifecycle:implemented

smoke:
  @smoke and @lifecycle:implemented

UI pipeline:
  @layer:ui and @lifecycle:implemented

API pipeline:
  @layer:api and @lifecycle:implemented

specification report:
  all scenarios, including @lifecycle:planned
```

The GOV.UK One Login project demonstrates the same general pattern in practice: it uses Cucumber tags to distinguish UI versus account-management API suites and passes tag filters through environment configuration. [github.com](https://github.com/govuk-one-login/authentication-acceptance-tests)

### Parallelization

Scenarios should be designed to run independently, in any order, and in parallel. Cucumber’s FAQ explicitly states that scenarios should not interfere with each other and should be independently runnable; its state documentation says not to share state between scenarios. [cucumber.io](https://cucumber.io/docs/faq/?utm_source=chatgpt.com)

Parallelization therefore works best at scenario granularity, not feature-file granularity.

Cucumber-JVM, for example, supports parallel execution of scenarios and Scenario Outline rows and exposes thread configuration through several runners and CLI options. [cucumber.io](https://cucumber.io/docs/guides/parallel-execution/?utm_source=chatgpt.com)

The architectural requirement is:

rather than:

text

```text
Scenario A creates customer 123
Scenario B assumes customer 123 exists
Scenario C mutates customer 123
```

Cucumber specifically warns against shared global/static state and recommends cleaning databases and browser state between scenarios. [cucumber.io](https://cucumber.io/docs/cucumber/state/?utm_source=chatgpt.com)

### Test data

Test data should be **scenario-owned, deterministic, and disposable**.

A feature should say:

gherkin

```gherkin
Given a customer with an overdue invoice
```

not:

gherkin

```gherkin
Given production customer 483729 exists
```

Cucumber’s formulation guidance warns against relying on pre-existing production data and emphasizes using concrete examples that reveal business intent while removing incidental details. [cucumber.io](https://cucumber.io/blog/bdd/keep-your-scenarios-brief/?utm_source=chatgpt.com)

Create data at scenario setup time through APIs, fixtures, builders, domain services, or an isolated data layer. Clean it afterwards or use ephemeral environments. In lower-level acceptance suites, testable architecture can make this dramatically cheaper: Cucumber’s architecture guidance recommends ports-and-adapters designs where most tests can run against fast in-memory substitutes while contract tests verify that substitutes match real infrastructure. [cucumber.io](https://cucumber.io/docs/guides/testable-architecture/?utm_source=chatgpt.com)

For third-party dependencies, Cucumber recommends stubbing rather than extensive mocking in acceptance scenarios, particularly when the external system is outside your control. [cucumber.io](https://cucumber.io/docs/cucumber/mocking-and-stubbing-with-cucumber/?utm_source=chatgpt.com)

### Step-definition architecture

Do not mirror every feature file with a feature-specific step-definition file. Cucumber identifies “feature-coupled step definitions” as an anti-pattern because they cause duplication and maintenance costs. [cucumber.io](https://cucumber.io/docs/guides/anti-patterns/?lang=java&utm_source=chatgpt.com)

Instead, group glue around domain concepts or reusable interfaces:

text

```text
specs/
└── ordering/
    └── checkout/
        ├── payment_authorization.feature
        └── shipping_eligibility.feature

test-support/
├── customers/
├── orders/
├── payments/
├── shipping/
└── system/
```

Cucumber’s step-organization guidance notes that step-definition files may be split into meaningful groups as systems grow, and that the runtime does not fundamentally depend on matching feature-directory organization. [cucumber.io](https://cucumber.io/docs/gherkin/step-organization/?utm_source=chatgpt.com)

That is another reason not to force a symmetric `feature file ↔ step file ↔ production class` directory model.

## Competing approaches and recommended operating model

There is genuine latitude here. Some decisions are consensus BDD guidance; others are architectural tradeoffs.

| Question | Strong consensus | Reasonable tradeoff |
| --- | --- | --- |
| Should scenarios express behavior rather than implementation? | Yes | Little controversy in BDD guidance |
| Should scenarios be independent? | Yes | Required for reliable execution and parallelism |
| Should user stories define permanent feature files? | Generally no | Story IDs may still appear as traceability tags |
| Should `Rule` represent business rules? | Yes | This is its explicit Gherkin purpose |
| Should bounded contexts organize large spec suites? | Strongly defensible | Smaller systems may not need DDD terminology |
| Should planned and executable specs share one tree? | Usually best | Separate trees can work in regulated workflows |
| Should lifecycle be encoded as tags? | Practical convention | Not a standardized Cucumber lifecycle model |
| Should features be colocated with code? | Often desirable | Separate acceptance-test repos can be valid |
| Should all examples become automated? | No universal requirement | Automation value depends on risk and cost |
| Should folder structure encode test layer? | Usually secondary | Dedicated UI/system suites may justify it |

The important consensus comes from Cucumber’s model of BDD: discovery creates shared understanding; formulation turns useful examples into structured specifications; automation checks those specifications against the system. The feature files are intended to remain readable as business documentation, rather than becoming merely a test-script DSL. [cucumber.io](https://cucumber.io/docs/bdd/?utm_source=chatgpt.com)

The recommended operating model is therefore:

text

```text
specs/
└── <bounded-context>/
    └── <capability>/
        └── <behavior>.feature
```

with files such as:

gherkin

```gherkin
@context:billing
@capability:refunds
Feature: Refund payments

  Rule: A captured payment may be refunded up to the captured amount

    @lifecycle:implemented
    @req:BILL-231
    @smoke
    Scenario: Refund the full captured amount
      Given a payment of 80 EUR has been captured
      When the customer is refunded 80 EUR
      Then the payment is fully refunded

    @lifecycle:implemented
    @req:BILL-231
    Scenario: Reject a refund above the captured amount
      Given a payment of 80 EUR has been captured
      When a refund of 100 EUR is requested
      Then the refund is rejected

  @lifecycle:planned
  @req:BILL-488
  Rule: Refunds may be scheduled

    Scenario: Schedule a refund for tomorrow
      Given a captured payment
      When a refund is scheduled for tomorrow
      Then the refund remains pending until tomorrow
```

This structure has several desirable properties:

The `Feature` is durable. The two `Rule`s can evolve independently. Planned behavior lives alongside existing behavior without duplication. CI can exclude the planned rule. Requirements can trace directly to behavior. When implementation starts, the file does not move; only status and step definitions evolve.

For an existing repository organized around stories or epics, migrate incrementally:

A low-risk migration sequence is to first introduce tags and report generation without moving files. Next, identify obvious bounded contexts or product areas and move files one area at a time. Then merge story-centric files that describe the same capability. Only after the semantic hierarchy is stable should you change step-definition organization or CI sharding.

During migration, preserve traceability through Git history and stable requirement tags rather than preserving obsolete path conventions. If a file originally called `STORY-1824.feature` becomes `ordering/checkout/shipping_eligibility.feature`, keep `@req:STORY-1824` temporarily if historical linkage is useful.

The final target should optimize for five properties:

1.  **A domain expert can find the relevant behavior without knowing the implementation history.**
2.  **A developer can identify the business rule behind a failing scenario.**
3.  **CI can select arbitrary orthogonal subsets without reorganizing files.**
4.  **Planned behavior can mature into executable behavior without being copied.**
5.  **The generated documentation accurately distinguishes desired, implemented, and deprecated behavior.**

Those properties are more important than any precise directory depth.

The concise recommendation is: **use bounded context → capability → feature file as the stable navigational hierarchy; use `Rule` → `Scenario` as the behavioral hierarchy; use tags for lifecycle, execution, cross-cutting classification, and traceability; and keep planning artifacts such as stories and epics outside the permanent structure.** That combination is the closest fit to the semantics Gherkin itself provides, to Cucumber’s Discovery–Formulation–Automation model, to DDD’s bounded-context model, and to the goal of maintaining one source of behavioral truth rather than parallel requirements and test suites. [cucumber.io](https://cucumber.io/docs/gherkin/reference/?utm_source=chatgpt.com)