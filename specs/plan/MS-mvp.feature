@id=MS-mvp
@closes:IT-packaging
Feature: Minimum viable product

  What sdp must be before anyone outside this repository is asked to use it: what is built so far,
  decided and verified, with the runner settled and the package installable.

  Rule: Everything built is verified

    Scenario: The features
      Then the query "requirement|nfr|feature[file~^specs/features/][stage!=verified]" returns no results

  Rule: The work planned for it is built

    Scenario: The work planned into its iterations
      Then the query "requirement|nfr|feature|change ?-iteration-> #IT-scale-and-compatibility|IT-packaging" returns at least 1 result
      And the query "requirement|nfr|feature|change[stage!=verified] ?-iteration-> #IT-scale-and-compatibility|IT-packaging" returns no results

  Rule: Nothing built is still undecided

    Scenario: Open questions outside what is still to come
      Then the query "*[openQuestions>0][file!~^specs/incoming/]" returns no results

  Rule: Every element and pattern says what it is for

    Scenario: The elements and patterns
      Then the query "element|pattern" returns at least 1 result
      And the query "element|pattern[!summary]" returns no results

  Rule: The specification graph is consistent

    Scenario: No error and no failed scenario
      Then there are no error diagnostics
      And the query "scenario[status=failed]" returns no results
