@id=REQ-quality-scenarios @maturity=ready
@realized-by:ARCH-architecture-view @decided-by:specs-are-gherkin-files
Feature: Quality requirements as quality attribute scenarios

  Quality requirements — performance, availability, modifiability, usability — use the same format
  as every other spec, written as *quality attribute scenarios*: the *Given* carries the source of
  the stimulus, the environment and the artifact; the *When* the stimulus; the *Then* the response
  and its measure. They are architectural drivers, and once their steps are automated they are
  fitness functions that run with every `sdp run`.

  Rule: A quality requirement is of kind nfr, or of any kind whose type says so, and is shown beside what it constrains

    Scenario Outline: Marked by its kind or by its type
      Given these specs:
        | tags                                      | Feature          |
        | @id=ARCH-orders @constrained-by:Q-latency | Orders           |
        | @id=Q-latency <marker>                    | Checkout latency |
      When I ask for the architecture view
      Then the output contains "ARCH-orders -constrained-by-> Q-latency"

      Examples:
        | marker                                 |
        | @kind=nfr                              |
        | @kind=requirement @type=quality        |
        | @kind=requirement @type=constraint     |
        | @kind=requirement @type=non-functional |
        | @kind=story @type=nfr                  |

  Rule: A quality attribute scenario runs like any other, and verifies its quality requirement

    Scenario: Every step of the scenario automated
      Given a file "specs/NFR-checkout-latency.feature" containing:
        """
        @id=NFR-checkout-latency
        Feature: Checkout latency

          Rule: Checkout keeps up with peak load

            Scenario: Checkout under peak load
              Given 500 concurrent shoppers on the production topology
              When a shopper submits an order
              Then the confirmation is shown within 300 ms at p95
        """
      And a step definition "{int} concurrent shoppers on the production topology" that passes
      And a step definition "a shopper submits an order" that passes
      And a step definition "the confirmation is shown within {int} ms at p95" that passes
      When the workspace is run
      Then node "NFR-checkout-latency" has attribute kind = "nfr"
      And node "NFR-checkout-latency" has attribute stage = "verified"
