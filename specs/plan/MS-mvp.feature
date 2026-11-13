@id=MS-mvp
@closes:IT-packaging
Feature: Minimum viable product

  What sdp must be before anyone outside this repository is asked to use it, named by id so that no
  plan tag decides it.

  Rule: The features and rules it needs are built

    Scenario: Installing from npm
      Then the query "#install-from-npm[stage=verified]" returns 1 result

    Scenario: Questions stay interactive on large repositories on disk
      Then the query "rule[spec=ask-the-graph][title~on disk][stage=verified]" returns 1 result

  Rule: Nothing built is still undecided

    Scenario: Open questions about what is built
      Then the query "rule[tags=@open][!maturity] -rule-of-> *[!toCome]" returns no results

  Rule: Every element says what it is for

    Scenario: The elements
      Then the query "element" returns at least 1 result
      And the query "element !<-is- code[doc]" returns no results

  Rule: The specification graph is consistent

    Scenario: No error, and no live example that does not pass
      Then there are no error diagnostics
      And the query "scenario[!toCome][status=failed|ambiguous|pending|undefined]" returns no results
