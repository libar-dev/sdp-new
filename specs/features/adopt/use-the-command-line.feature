@id=use-the-command-line
@realized-by:ARCH-cli @realized-by:ARCH-application @realized-by:ARCH-reports @realized-by:ARCH-workspace
Feature: Use the command line

  People, scripts and agents run one command, `sdp`. A script needs to know from the exit code
  whether a command did what it was asked, and an agent needs to know that an answer may miss
  something before it concludes that something is absent. So every subcommand keeps the same
  conventions; what each one takes is in `sdp <command> --help`.

  Not what each command answers: that belongs to the feature the command serves.

  Background:
    Given a file "specs/search.feature" containing:
      """
      @id=search @maturity=specified @realized-by:ARCH-index
      Feature: Search the catalogue

        Shoppers find products by name.

        Rule: A product is found by its name

          Scenario: Find a product by name
            When a shopper searches for "lamp"
            Then the desk lamp is found

        @open
        Rule: Do misspelled names match?
      """
    And a file "specs/MS-beta.feature" containing:
      """
      @id=MS-beta
      Feature: Beta

        Rule: Every feature is ready

          Scenario: None is below ready
            Then the query "feature[maturity<ready]" returns no results
      """

  Rule: A command exits with 0 when it did what it was asked and with 1 when it did not

    Scenario Outline: Done and not done
      When I run "<command>"
      Then the exit code is <exit code>

      Examples:
        | command          | exit code |
        | sdp q feature    | 0         |
        | sdp gate MS-beta | 1         |
        | sdp q 'feature[' | 1         |

  Rule: An answer that may miss something says why and exits with 2, while stdout keeps the answer alone

    In every output mode: the reader of `--ids` or `--json` is the one most likely to conclude that
    something is absent.

    Scenario Outline: Each thing that could change the answer and was not read
      Given a file "<file>" containing:
        """
        <content>
        """
      When I run "sdp q feature --ids"
      Then the exit code is 2
      And the output contains "note: not read: <file>:<line> [<rule>]"
      And the output lines are "search"

      Examples:
        | file               | line | rule                  | content                                                  |
        | specs/twin.feature | 1    | duplicate-id          | @id=search\nFeature: Search again                        |
        | specs/b.feature    | 1    | link-syntax           | @iteration=IT-beta\nFeature: B                           |
        | src/search.ts      | 2    | annotation-unreadable | // @sdp implements search\nexport const search = ( => 0 |

  Rule: With --json, stdout is one envelope: whether the answer is complete, the notes, and the data

    Scenario: A complete answer has no notes, and one that may miss something says what was not read
      When I run "sdp q feature --json"
      Then the exit code is 0
      And the JSON output has:
        | complete   | true    |
        | notes      | nothing |
        | data.nodes | search  |
      Given a file "specs/broken.feature" containing:
        """
        @id=broken @owner=Two words
        Feature: A feature sdp cannot read
        """
      When I run "sdp q feature --json"
      Then the exit code is 2
      And the JSON output has:
        | complete   | false  |
        | data.nodes | search |
      And the output contains '"not read: specs/broken.feature:1 [gherkin-syntax]'

  Rule: A command works on the nearest directory, the current one or above, that holds an sdp.config file, or on the one -C names

    The way git finds its repository: a command run anywhere inside a workspace works on all of it.

    Scenario: From a subdirectory
      Given a file "sdp.config.yaml" containing:
        """
        # every key at its default
        """
      When I run "sdp q feature --json" in "specs"
      Then the exit code is 0
      And the JSON output has:
        | data.nodes.file | specs/search.feature |

  Rule: Input sdp cannot use is refused in one line that says what it takes, and nothing is written

    Scenario Outline: Arguments and options
      When I run "sdp <command>"
      Then the exit code is 1
      And the output contains "<refusal>"
      And the file "<not written>" does not exist

      Examples:
        | command                                  | refusal                                                     | not written                  |
        | -C nowhere status                        | no such directory                                           | .sdp/results.json            |
        | run --timeout '60 parsecs'               | --timeout 60 parsecs is not a duration: a number and a unit | .sdp/results.json            |
        | new feature Carts --maturity implemented | implemented is no rung of the ladder                        | specs/features/carts.feature |

  Rule: status counts the graph on one screen: kinds, relations, stages, rules, scenarios, gates and milestones, each by where it stands

    Gates are counted apart from the other scenarios: a gate may be unmet with nothing broken. So
    are the examples of work still to come: what they do is no regression.

    Scenario: The counts, as data
      When I run "sdp status --json"
      Then the exit code is 0
      And the JSON output has:
        | data.kinds.feature         | 1 |
        | data.relations.realized-by | 1 |
        | data.stages.specified      | 1 |
        | data.toCome.unrun          | 1 |
        | data.rules.open            | 1 |
        | data.gates.unrun           | 1 |
        | data.milestones.open       | 1 |
