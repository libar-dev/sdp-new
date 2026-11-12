@id=use-the-command-line
@realized-by:ARCH-cli @realized-by:ARCH-reports @realized-by:ARCH-workspace
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
    And these specs:
      | tags           | Feature      |
      | @id=ARCH-index | Search index |
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
        | sdp check        | 0         |
        | sdp run          | 0         |
        | sdp gate MS-beta | 1         |
        | sdp q 'feature[' | 1         |

  Rule: An answer that may miss something says why and exits with 2, while stdout keeps the answer alone

    In every output mode: the reader of `--ids` or `--json` is the one most likely to conclude that
    something is absent.

    Scenario Outline: From a workspace with a file sdp cannot read
      Given a file "specs/broken.feature" containing:
        """
        @id=broken @owner=Two words
        Feature: A feature sdp cannot read
        """
      When I run "<command>"
      Then the exit code is 2
      And the output contains "incomplete: this answer may miss something"
      And the output contains "specs/broken.feature:1 [gherkin-syntax]"

      Examples:
        | command              |
        | sdp q feature        |
        | sdp q feature --ids  |
        | sdp graph -q feature |
        | sdp show search      |
        | sdp context search   |
        | sdp status           |
        | sdp arch --json      |
        | sdp lifecycle        |

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
        | file               | line | rule                  | content                                                                                                                        |
        | specs/twin.feature | 1    | duplicate-id          | @id=search\nFeature: Search again                                                                                              |
        | src/search.ts      | 2    | annotation-unreadable | // @sdp implements search\nexport const search = ( => 0                                                                       |
        | specs/b.feature    | 1    | annotation            | @uses:search,ARCH-index\nFeature: B                                                                                            |
        | specs/b.feature    | 1    | link-syntax           | @iteration=IT-beta\nFeature: B                                                                                                 |

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

    Scenario: A gate that is not met is a complete answer
      When I run "sdp gate MS-beta --json"
      Then the exit code is 1
      And the JSON output has:
        | complete    | true  |
        | data.passed | false |

  Rule: A command works on the nearest directory, the current one or above, that holds an sdp.config file, or on the one -C names

    The way git finds its repository: a command run anywhere inside a workspace works on all of it.

    Scenario: Another directory, named with -C
      Given a file "elsewhere/specs/export.feature" containing:
        """
        @id=export
        Feature: Export
        """
      When I run "sdp -C elsewhere q feature --ids"
      Then the output lines are "export"

    Scenario: From a subdirectory
      Given a file "sdp.config.yaml" containing:
        """
        # every key at its default
        """
      When I run "sdp run" in "specs"
      Then the output contains "1 scenario(s) of work still to come, none of which fails the run: 1 undefined"
      And the output contains "1 gate scenario(s): 1 failed"
      And the file "specs/.sdp/results.json" does not exist

  Rule: Input sdp cannot use is refused in one line that says what it takes, and nothing is written

    Scenario Outline: Arguments and options
      When I run "sdp <command>"
      Then the exit code is 1
      And the output contains "<refusal>"
      And the output does not contain "FileSystem"
      And the file "<not written>" does not exist

      Examples:
        | command                               | refusal                                                                      | not written                         |
        | -C nowhere status                     | no such directory                                                            | .sdp/results.json                   |
        | -C specs/search.feature status        | a workspace is a directory, and this is a file                               | .sdp/results.json                   |
        | -C specs/search.feature init          | a workspace is a directory, and this is a file                               | sdp.config.yaml                     |
        | run --concurrency 0                   | the number of scenarios to run at once is 1 or more                          | .sdp/results.json                   |
        | run --tags '(@fast'                   | invalid --tags                                                               | .sdp/results.json                   |
        | run serach                            | nothing matches serach                                                       | .sdp/results.json                   |
        | gate search                           | search has no gate scenarios                                                 | .sdp/results.json                   |
        | context search --depth 0              | depth must be a whole number from 1 to 6                                     | .sdp/results.json                   |
        | context search --depth 7              | depth must be a whole number from 1 to 6                                     | .sdp/results.json                   |
        | new feature ''                        | a feature needs a title                                                      | specs/features/feature-0001.feature |
        | new a/b Carts                         | is not a kind: a kind is one word                                            | specs/a/b/carts.feature             |
        | new ../x Carts                        | is not a kind: a kind is one word                                            | x/carts.feature                     |
        | new feature Carts --id a/b            | cannot name a file: write it without a slash                                 | specs/features/a/b.feature          |
        | new feature Carts --dir ''            | --dir needs a directory                                                      | carts.feature                       |
        | new feature Carts --maturity 'not yet' | a maturity is one word: write it without a space, @, = or :                 | specs/features/carts.feature        |
        | new element Bad --id 'ARCH-bad other' | would not read back from a tag                                               | .sdp/results.json                   |
        | new element Bad --id ' '              | would not read back from a tag                                               | .sdp/results.json                   |

    Scenario: A configuration or a step module that cannot be loaded, without a stack trace
      Given a file "broken/sdp.config.yaml" containing:
        """
        features: 42
        """
      And a file "specs/steps/search.steps.ts" containing:
        """
        throw new Error("search index not reachable")
        """
      When I run "sdp -C broken status"
      Then the exit code is 1
      And the output contains "sdp.config.yaml: invalid configuration"
      And the output does not contain "    at "
      When I run "sdp run"
      Then the exit code is 1
      And the output contains "specs/steps/search.steps.ts: could not load step definitions: search index not reachable"
      And the output does not contain "    at "

  Rule: status counts the graph on one screen: kinds, relations, stages, rules, scenarios, gates and milestones, each by where it stands

    Gates are counted apart from the other scenarios: a gate may be unmet with nothing broken. So
    are the examples of work still to come: what they do is no regression.

    Scenario: On one screen, and as data
      Given a file "specs/cart.feature" containing:
        """
        @id=cart
        Feature: Cart

          Rule: A cart holds each item once

            Scenario: An item added twice
              Then the cart holds 1 item

          Rule: An empty cart cannot be paid
        """
      When I run "sdp status"
      Then the output contains "rules         unrun 2 · no example 1 · still to come 1 · open 1"
      And the output contains "scenarios     unrun 1"
      And the output contains "still to come unrun 1"
      And the output contains "gates         unrun 1"
      And the output contains "milestones    open 1"
      And the output contains "check         error 1"
      When I run "sdp status --json"
      Then the JSON output has:
        | data.kinds.feature         | 2 |
        | data.relations.realized-by | 1 |
        | data.stages.specified      | 1 |
        | data.scenarios.unrun       | 1 |
        | data.toCome.unrun          | 1 |
        | data.rules.unrun           | 2 |
        | data.rules.no example      | 1 |
        | data.rules.still to come   | 1 |
        | data.rules.open            | 1 |
