@id=REQ-builtin-steps @maturity=ready @execution @quality-gates
@refines:CAP-living-specs @realized-by:ARCH-runner
@iteration:I1 @activity.implementation:I1 @activity.test:I1
Feature: Built-in steps over the graph

  Every run includes step definitions that assert against the project graph instead of the product
  (`sdp steps` lists them). With them, rules about the specifications themselves — architecture
  fitness functions, milestone gates, a team's own definition of done — are ordinary scenarios in
  the same format as everything else, and need no code.

  Background:
    Given these specs:
      | tags                                                  | Feature      |
      | @id=REQ-search @maturity=idea @realized-by:ARCH-index | Search       |
      | @id=ARCH-index                                        | Search index |
    And a file "specs/DEC-0001.feature" containing:
      """
      @id=DEC-0001
      Feature: Use an inverted index

        Rule: The index is rebuilt every night
      """

  Rule: A built-in step passes when the graph agrees, and otherwise says what it expected and what it found

    Scenario Outline: Each step, where the graph agrees
      Given a file "specs/guard.feature" containing:
        """
        Feature: Guard
          Scenario: Guard
            Then <step>
        """
      When the workspace is run
      Then the step '<step>' has status "passed"

      Examples:
        | step                                                                       |
        | the query "requirement" returns 1 result                                   |
        | the query "requirement[maturity=ready]" returns no results                 |
        | the query "requirement\|element" returns at least 2 results                |
        | the query "element" returns at most 1 result                               |
        | every node matching "requirement" also matches "* ?-realized-by-> element" |
        | there are no error diagnostics                                             |
        | there are no diagnostics for rule "dangling-link"                          |
        | the node "REQ-search" has maturity "idea"                                  |
        | the node "ARCH-index" has kind "element"                                   |

    Scenario Outline: Each step, where the graph differs
      Given a file "specs/guard.feature" containing:
        """
        Feature: Guard
          Scenario: Guard
            Then <step>
        """
      When the workspace is run
      Then the step '<step>' has status "failed"
      And the step '<step>' reports '<reason>'

      Examples:
        | step                                                      | reason                                              |
        | the query "requirement" returns 2 results                 | returned 1 result(s), expected 2                    |
        | the query "requirement" returns no results                | REQ-search (requirement) specs/REQ-search.feature:1 |
        | the query "element" returns at least 2 results            | returned 1 result(s), expected at least 2           |
        | the query "requirement\|element" returns at most 1 result | returned 2 result(s), expected at most 1            |
        | every node matching "element" also matches "*[maturity]"  | ARCH-index (element) specs/ARCH-index.feature:1     |
        | there are no warning diagnostics                          | [decision-shape] DEC-0001                           |
        | there are no diagnostics for rule "decision-shape"        | DEC-0001 has a rule ("The index is rebuilt every night") |
        | the node "REQ-search" has maturity "ready"                | REQ-search.maturity is "idea", expected "ready"     |

    Scenario: A query result is compared with a table of ids, in any order, with or without a header
      Given a file "specs/guard.feature" containing:
        """
        Feature: Guard
          Scenario: Exactly these
            Then the query "requirement|element" returns:
              | id         |
              | REQ-search |
              | ARCH-index |

          Scenario: Not these
            Then the query "requirement" returns:
              | REQ-search |
              | ARCH-index |
        """
      When the workspace is run
      Then the step 'the query "requirement|element" returns:' has status "passed"
      And the step 'the query "requirement" returns:' has status "failed"
      And the step 'the query "requirement" returns:' reports "returned [REQ-search], expected [ARCH-index, REQ-search]"

  Rule: A built-in step fails when its answer cannot be trusted

    "There is none" is the easiest thing to prove by accident. `sdp q` only notes what a step fails
    on: exploring is not asserting.

    Scenario Outline: A query that does not parse, or names what nothing in the workspace has, fails with the closest known word
      Given a file "specs/guard.feature" containing:
        """
        Feature: Guard
          Scenario: Guard
            Then <step>
        """
      When the workspace is run
      Then the step '<step>' has status "failed"
      And the step '<step>' reports '<reason>'

      Examples:
        | step                                                                         | reason                                                  |
        | the query "requirement[" returns no results                                  | invalid query                                           |
        | the query "requirment" returns no results                                    | no kind requirment; closest: requirement                |
        | the query "* -realised-by-> *" returns no results                            | no relation realised-by; closest: realized-by           |
        | the query "#REQ-serach[maturity=ready]" returns no results                   | no node has the id REQ-serach; closest: REQ-search      |
        | the query "requirement[maturty=ready]" returns no results                    | requirement has no attribute maturty; closest: maturity |
        | the query "#REQ-search -realized-by-> *[ownr]" returns no results            | * has no attribute ownr                                 |
        | every node matching "#REQ-serach" also matches "requirement[maturity=ready]" | no node has the id REQ-serach                           |
        | the node "REQ-lost" has maturity "ready"                                     | no node REQ-lost                                        |
        | the node "REQ-search" has maturty "undefined"                                | REQ-search has no attribute maturty; closest: maturity  |
        | there are no eror diagnostics                                                | unknown severity "eror"                                 |
        | there are no constructor diagnostics                                         | unknown severity "constructor"                          |
        | there are no diagnostics for rule "decision-stats"                           | unknown rule "decision-stats"                           |

    Scenario Outline: A word the vocabulary declares, or a kind an id prefix names, can be asserted absent
      Given a file "sdp.config.yaml" containing:
        """
        vocabulary:
          words: { kinds: [incident], relations: [leaks-to], attributes: [exposure] }
        """
      And a file "specs/guard.feature" containing:
        """
        Feature: Guard
          Scenario: Guard
            Then <step>
        """
      When the workspace is run
      Then the step '<step>' has status "<status>"

      Examples:
        | step                                                      | status |
        | the query "* -leaks-to-> *" returns no results            | passed |
        | the query "incident[!owner]" returns no results           | failed |
        | the query "incident" returns no results                   | passed |
        | the query "requirement[exposure=high]" returns no results | passed |
        | the query "risk[status=open]" returns no results          | passed |
        | the query "* -leaks-into-> *" returns no results          | failed |

    Scenario: A graph that could not be fully read proves nothing, so a query step fails
      Given a file "src/search.ts" containing:
        """
        import { annotate } from "sdp/annotations"

        export const search = () => []
        const requirement = "REQ-search"
        annotate(search, { implements: requirement })
        """
      And a file "specs/guard.feature" containing:
        """
        Feature: Guard
          Scenario: Guard
            Then the query "code -implements-> #REQ-search" returns no results
        """
      When the workspace is run
      Then the step 'the query "code -implements-> #REQ-search" returns no results' has status "failed"
      And the step 'the query "code -implements-> #REQ-search" returns no results' reports "src/search.ts:5 [annotation-unreadable]"

    Scenario Outline: A query cut short by a limit proves nothing, so the step fails
      Given a chain of 14 nodes linked by "next"
      And 25 nodes, each linked to all the others by "knows"
      And a file "specs/guard.feature" containing:
        """
        Feature: Guard
          Scenario: Guard
            Then <step>
        """
      When the workspace is run
      Then the step '<step>' has status "failed"
      And the step '<step>' reports 'was cut short (<limit>), so its result is incomplete'

      Examples:
        | step                                                                               | limit                                 |
        | the query "#N1 -next+-> #N14" returns no results                                   | a + edge reaches further than 12 hops |
        | the query "#N1 -next+-> *" returns at least 12 results                             | a + edge reaches further than 12 hops |
        | the query "#N1 !-next+-> #N14" returns 1 result                                    | a + edge reaches further than 12 hops |
        | the query "member -knows-> member -knows-> member" returns at most 25 results      | a step has more than 10000 paths      |
        | every node matching "member -knows-> member -knows-> member" also matches "member" | a step has more than 10000 paths      |
