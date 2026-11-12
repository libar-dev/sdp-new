@id=MS-mvp
@closes:IT-packaging
Feature: Minimum viable product

  What sdp must be before anyone outside this repository is asked to use it: what is built so far,
  decided and verified, with existing Cucumber suites running, questions interactive on large
  repositories, and the package installable. Its obligations are named here, by the ids they keep
  once built, so that no plan tag decides what MVP is.

  Rule: The features it needs are built

    Scenario: Running existing Cucumber suites, and installing from npm
      Then the query "#run-existing-cucumber-suites|install-from-npm[file~^specs/features/][stage=verified]" returns 2 results

  Rule: The changes it needs have joined the features they change

    A change is deleted once its rules are in its feature, so it is gone when it is built.

    Scenario: Questions stay interactive on large repositories on disk
      Then the query "rule[spec=ask-the-graph][title~on disk][verification=passing]" returns 1 result
      And the query "change[id=questions-stay-interactive-on-disk]" returns no results

  Rule: Nothing built is still undecided

    Scenario: Open questions outside what is still to come
      Then the query "*[openQuestions>0][file!~^specs/incoming/]" returns no results

  Rule: Every element says what it is for

    In the doc comment of the code anchored to it, which `sdp arch` shows.

    Scenario: The elements
      Then the query "element" returns at least 1 result
      And the query "element !<-is- code[doc]" returns no results

  Rule: The specification graph is consistent

    Scenario: No error and no failed scenario
      Then there are no error diagnostics
      And the query "scenario[status=failed]" returns no results
