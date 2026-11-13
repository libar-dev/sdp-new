@id=use-the-command-line
@realized-by:ARCH-cli @realized-by:ARCH-application @realized-by:ARCH-reports @realized-by:ARCH-workspace
Feature: Use the command line

  People, scripts and agents run one command, `sdp`, whose subcommands keep the same conventions: a
  script reads from the exit code whether a command did what it was asked, and an agent learns that
  an answer may miss something before it concludes that something is absent.

  Not what each command answers: that belongs to the feature the command serves.

  Background:
    Given these specs:
      | tags                           | Feature |
      | @id=search @maturity=specified | Search  |
    And a file "specs/MS-beta.feature" containing:
      """
      @id=MS-beta
      Feature: Beta

        Rule: Every feature is ready

          Scenario: None is below ready
            Then the query "feature[maturity<ready]" returns no results
      """

  Rule: A command exits with 0 when it did what it was asked and with 1 when it did not, and input it cannot use writes nothing

    Scenario Outline: Done, not done, and refused
      When I run "<command>"
      Then the exit code is <exit code>
      And the file "specs/features/carts.feature" does not exist

      Examples:
        | command                                      | exit code |
        | sdp q feature                                | 0         |
        | sdp gate MS-beta                             | 1         |
        | sdp new feature Carts --maturity implemented | 1         |

  Rule: An answer that may miss something says what was not read and exits with 2, while stdout keeps the answer alone: with --json, one envelope of whether it is complete, the notes and the data

    Scenario: A spec that declares an id again
      Given a file "specs/twin.feature" containing:
        """
        @id=search
        Feature: Search again
        """
      When I run "sdp q feature --ids"
      Then the exit code is 2
      And the output contains "note: not read: specs/twin.feature:1 [duplicate-id]"
      And the output lines are "search"
      When I run "sdp q feature --json"
      Then the exit code is 2
      And the JSON output has:
        | complete   | false  |
        | data.nodes | search |

  Rule: A command works on the nearest directory, the current one or above, that holds an sdp.config file, or on the one -C names

    Scenario: From a subdirectory
      Given a file "sdp.config.yaml" containing:
        """
        # every key at its default
        """
      When I run "sdp q feature --json" in "specs"
      Then the exit code is 0
      And the JSON output has:
        | data.nodes.file | specs/search.feature |

  Rule: status counts the graph on one screen: kinds, relations, stages, rules, scenarios, gates and milestones, each by where it stands

    Scenario: The counts, as data
      When I run "sdp status --json"
      Then the exit code is 0
      And the JSON output has:
        | data.kinds.feature    | 1 |
        | data.stages.specified | 1 |
        | data.gates.unrun      | 1 |
        | data.milestones.open  | 1 |
