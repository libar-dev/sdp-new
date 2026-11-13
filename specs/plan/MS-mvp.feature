@id=MS-mvp
@closes:IT-packaging
Feature: Minimum viable product

  What sdp must be before anyone outside this repository is asked to use it: what is built so far,
  decided and verified, with questions interactive on large repositories, and the package
  installable. Its obligations are named here by their ids, so that no plan tag decides what MVP
  is.

  Rule: The features it needs are built

    Scenario: Installing from npm
      Then the query "#install-from-npm[stage=verified]" returns 1 result

  Rule: The rules it needs are built

    Scenario: Questions stay interactive on large repositories on disk
      Then the query "rule[spec=ask-the-graph][title~on disk][stage=verified]" returns 1 result

  Rule: Nothing built is still undecided

    A question about live work declares no maturity of its own; one about work still to come declares one.

    Scenario: Open questions about what is built
      Then the query "rule[tags=@open][!maturity] -rule-of-> *[!toCome]" returns no results

  Rule: Every element says what it is for

    In the doc comment of the code anchored to it, which `sdp arch` shows.

    Scenario: The elements
      Then the query "element" returns at least 1 result
      And the query "element !<-is- code[doc]" returns no results

  Rule: The specification graph is consistent

    Scenario: No error, and no live example that does not pass
      Then there are no error diagnostics
      And the query "scenario[!toCome][status=failed|ambiguous|pending|undefined]" returns no results
