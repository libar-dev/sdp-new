---
id: REQ-quality-scenarios
kind: requirement
title: Quality requirements as quality attribute scenarios
maturity: ready
iteration: I1
activity: { implementation: I1, test: I1 }
tags: [spec-format, architecture]
links:
  refines: CAP-living-specs
  realized-by: ARCH-architecture-view
  decided-by: DEC-0001
---

# Quality requirements as quality attribute scenarios

Quality requirements — performance, availability, modifiability, usability — use the same format
as every other spec, written as *quality attribute scenarios*: the *Given* carries the source of
the stimulus, the environment and the artifact; the *When* the stimulus; the *Then* the response
and its measure. A quality requirement is marked `kind: nfr`, or `type: quality`,
`non-functional`, `nfr` or `constraint` on any kind.

Quality requirements are architectural drivers: the architecture view shows them next to the
elements they constrain ([[REQ-curated-architecture]]). Once their steps are automated,
the scenarios are fitness functions that run with every `sdp run` — this repository's own
[[NFR-query-performance]] measures query and build latency that way.

## Scenarios

~~~gherkin
Scenario Outline: Quality requirements appear next to the elements they constrain
  Given a file "docs/model.md" containing:
    """
    ---
    id: MODEL
    kind: model
    nodes:
      - { id: ARCH-orders, kind: element, links: { constrained-by: Q-latency } }
      - { id: Q-latency, <marker>, title: Checkout latency }
    ---
    # Model
    """
  When I ask for the architecture view
  Then the output contains "ARCH-orders -constrained-by-> Q-latency"

  Examples:
    | marker                              |
    | kind: nfr                           |
    | kind: requirement, type: quality    |
    | kind: requirement, type: constraint |

Scenario: An automated quality attribute scenario verifies its requirement
  Given a file "specs/NFR-checkout-latency.md" containing:
    """
    ---
    id: NFR-checkout-latency
    maturity: ready
    quality: performance
    ---
    # Checkout latency

    Shoppers abandon a slow checkout.

    ```gherkin
    Scenario: Checkout under peak load
      Given 500 concurrent shoppers on the production topology
      When a shopper submits an order
      Then the confirmation is shown within 300 ms at p95
    ```
    """
  And a step definition "{int} concurrent shoppers on the production topology" that passes
  And a step definition "a shopper submits an order" that passes
  And a step definition "the confirmation is shown within {int} ms at p95" that passes
  When the scenarios are run
  Then node "NFR-checkout-latency" has attribute kind = "nfr"
  And node "NFR-checkout-latency" has attribute stage = "verified"
~~~
