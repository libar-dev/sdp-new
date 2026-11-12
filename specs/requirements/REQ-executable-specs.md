---
id: REQ-executable-specs
kind: requirement
title: Executable specifications
maturity: ready
iteration: C1
tags: [execution]
links:
  refines: CAP-living-specs
  realized-by: ARCH-runner
  decided-by: DEC-0005
---

# Executable specifications

The scenarios in a spec run as tests once step definitions exist — without rewriting them. Before
that, they are still valid specifications: a step without a definition is *undefined*, which means
"not automated yet", not "broken". Results roll up into each spec's `verification` and `stage`, so
the difference between specified and implemented is evidence, not a status someone remembered to
update.

| Scenario results | verification | stage |
| --- | --- | --- |
| no scenarios | none | declared maturity |
| never run | unrun | declared maturity |
| all steps undefined | undefined | declared maturity |
| some pending or undefined | pending | in-progress |
| any failure | failing | in-progress |
| all passed | passing | verified |

Step definitions are TypeScript modules (`*.steps.ts`) using Cucumber Expressions; handlers return
nothing, a Promise or an Effect. For an undefined step the runner suggests a definition.

## Scenarios

~~~gherkin
Background:
  Given a file "specs/REQ-cart.md" containing:
    """
    ---
    id: REQ-cart
    maturity: ready
    ---
    # Cart

    Shoppers collect items before paying.

    ```gherkin
    Scenario: Add an item
      Given an empty cart
      When I add a lamp
      Then the cart holds 1 item
    ```
    """

Scenario: Without step definitions a spec is simply not automated yet
  When the scenarios are run
  Then scenario "REQ-cart#add-an-item" has status "undefined"
  And node "REQ-cart" has attribute verification = "undefined"
  And node "REQ-cart" has attribute stage = "ready"
  And the step "an empty cart" suggests the definition 'Given("an empty cart"'
  And the step "an empty cart" suggests the definition "pending()"

Scenario: A partially automated spec is in progress
  Given a step definition "an empty cart" that passes
  And a step definition "I add a lamp" that pends
  When the scenarios are run
  Then scenario "REQ-cart#add-an-item" has status "pending"
  And node "REQ-cart" has attribute stage = "in-progress"

Scenario: Passing scenarios verify the spec
  Given a step definition "an empty cart" that passes
  And a step definition "I add a lamp" that passes
  And a step definition "the cart holds {int} item(s)" that passes
  When the scenarios are run
  Then scenario "REQ-cart#add-an-item" has status "passed"
  And node "REQ-cart" has attribute verification = "passing"
  And node "REQ-cart" has attribute stage = "verified"

Scenario: A failing step fails the scenario
  Given a step definition "an empty cart" that passes
  And a step definition "I add a lamp" that fails
  And a step definition "the cart holds {int} item(s)" that passes
  When the scenarios are run
  Then scenario "REQ-cart#add-an-item" has status "failed"
  And node "REQ-cart" has attribute verification = "failing"

Scenario: Editing a scenario makes its last result stale
  Given a step definition "an empty cart" that passes
  And a step definition "I add a lamp" that passes
  And a step definition "the cart holds {int} item(s)" that passes
  When the scenarios are run
  And a file "specs/REQ-cart.md" containing:
    """
    ---
    id: REQ-cart
    maturity: ready
    ---
    # Cart

    Shoppers collect items before paying.

    ```gherkin
    Scenario: Add an item
      Given an empty cart
      When I add two lamps
      Then the cart holds 2 items
    ```
    """
  Then node "REQ-cart#add-an-item" has attribute status = "stale"
  And node "REQ-cart" has attribute stage = "ready"
~~~
