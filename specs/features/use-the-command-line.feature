@id=use-the-command-line @kind=feature @maturity=ready
@realized-by:ARCH-cli @realized-by:ARCH-reports @realized-by:ARCH-workspace
Feature: Use the command line

  People, scripts and agents run one command, `sdp`. A script needs to know from the exit code
  whether a command did what it was asked, and an agent needs to know that an answer may miss
  something before it concludes that something is absent. So every subcommand keeps the same
  conventions; what each one takes is in `sdp <command> --help`.

  Not what each command answers: that belongs to the feature the command serves.

  Background:
    Given a file "specs/REQ-search.feature" containing:
      """
      @id=REQ-search @maturity=specified @realized-by:ARCH-index
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

        Rule: Every requirement is ready

          Scenario: None is below ready
            Then the query "requirement[maturity<ready]" returns no results
      """

  Rule: A command exits with 0 when it did what it was asked and with 1 when it did not

    Scenario Outline: Done and not done
      When I run "<command>"
      Then the exit code is <exit code>

      Examples:
        | command              | exit code |
        | sdp q requirement    | 0         |
        | sdp check            | 0         |
        | sdp run              | 0         |
        | sdp gate MS-beta     | 1         |
        | sdp q 'requirement[' | 1         |

  Rule: An answer that may miss something says why and exits with 2, while stdout keeps the answer alone

    In every output mode: the reader of `--ids` or `--json` is the one most likely to conclude that
    something is absent.

    Scenario Outline: From a workspace with a file sdp cannot read
      Given a file "specs/REQ-broken.feature" containing:
        """
        @id=REQ-broken @owner=Two words
        Feature: A requirement sdp cannot read
        """
      When I run "<command>"
      Then the exit code is 2
      And the output contains "incomplete: this answer may miss something"
      And the output contains "specs/REQ-broken.feature:1 [gherkin-syntax]"

      Examples:
        | command                  |
        | sdp q requirement        |
        | sdp q requirement --ids  |
        | sdp graph -q requirement |
        | sdp show REQ-search      |
        | sdp context REQ-search   |
        | sdp status               |
        | sdp arch --json          |
        | sdp lifecycle            |

    Scenario Outline: Each thing that could change the answer and was not read
      Given a file "<file>" containing:
        """
        <content>
        """
      When I run "sdp q requirement --ids"
      Then the exit code is 2
      And the output contains "note: not read: <file>:<line> [<rule>]"
      And the output lines are "REQ-search"

      Examples:
        | file               | line | rule                  | content                                                                                                                            |
        | specs/copy.feature | 1    | duplicate-id          | @id=REQ-search\nFeature: Search again                                                                                              |
        | src/search.ts      | 4    | annotation-unreadable | import { annotate } from "sdp/annotations"\nexport const search = 0\nconst id = "REQ-search"\nannotate(search, { implements: id }) |
        | specs/b.feature    | 1    | annotation            | @uses:REQ-search,ARCH-index\nFeature: B                                                                                            |
        | specs/b.feature    | 1    | link-syntax           | @iteration=C1\nFeature: B                                                                                                          |

  Rule: With --json, stdout is one envelope: whether the answer is complete, the notes, and the data

    Scenario: A complete answer has no notes, and one that may miss something says what was not read
      When I run "sdp q requirement --json"
      Then the exit code is 0
      And the JSON output has:
        | complete   | true       |
        | notes      | nothing    |
        | data.nodes | REQ-search |
      Given a file "specs/REQ-broken.feature" containing:
        """
        @id=REQ-broken @owner=Two words
        Feature: A requirement sdp cannot read
        """
      When I run "sdp q requirement --json"
      Then the exit code is 2
      And the JSON output has:
        | complete   | false      |
        | data.nodes | REQ-search |
      And the output contains '"not read: specs/REQ-broken.feature:1 [gherkin-syntax]'

    Scenario: A gate that is not met is a complete answer
      When I run "sdp gate MS-beta --json"
      Then the exit code is 1
      And the JSON output has:
        | complete    | true  |
        | data.passed | false |

  Rule: A command works on the nearest directory, the current one or above, that holds an sdp.config file, or on the one -C names

    The way git finds its repository: a command run anywhere inside a workspace works on all of it.

    Scenario: Another directory, named with -C
      Given a file "elsewhere/specs/REQ-export.feature" containing:
        """
        @id=REQ-export
        Feature: Export
        """
      When I run "sdp -C elsewhere q requirement --ids"
      Then the output lines are "REQ-export"

    Scenario: From a subdirectory
      Given a file "sdp.config.yaml" containing:
        """
        # every key at its default
        """
      When I run "sdp run" in "specs"
      Then the output contains "1 scenario(s): 1 undefined"
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
        | command                               | refusal                                                         | not written                          |
        | -C nowhere status                     | no such directory                                               | .sdp/results.json                    |
        | -C specs/REQ-search.feature status    | a workspace is a directory, and this is a file                  | .sdp/results.json                    |
        | -C specs/REQ-search.feature init      | a workspace is a directory, and this is a file                  | sdp.config.yaml                      |
        | run --concurrency 0                   | the number of scenarios to run at once is 1 or more             | .sdp/results.json                    |
        | run --tags '(@fast'                   | invalid --tags                                                  | .sdp/results.json                    |
        | run REQ-serach                        | nothing matches REQ-serach                                      | .sdp/results.json                    |
        | gate REQ-search                       | REQ-search has no gate scenarios                                | .sdp/results.json                    |
        | context REQ-search --depth 0          | depth must be a whole number from 1 to 6                        | .sdp/results.json                    |
        | context REQ-search --depth 7          | depth must be a whole number from 1 to 6                        | .sdp/results.json                    |
        | new requirement ''                    | a requirement needs a title                                     | specs/requirements/REQ-0001.feature  |
        | new a/b Carts                         | is not a kind: a kind is one word                               | specs/a/b/AB-carts.feature           |
        | new ../x Carts                        | is not a kind: a kind is one word                               | x/X-carts.feature                    |
        | new requirement Carts --id a/b        | cannot name a file: write it without a slash                    | specs/requirements/a/b.feature       |
        | new requirement Carts --dir ''        | --dir needs a directory                                         | REQ-carts.feature                    |
        | new requirement Carts --maturity done | unknown maturity done: use one of idea, draft, specified, ready | specs/requirements/REQ-carts.feature |

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

    Gates are counted apart from the other scenarios: a gate may be unmet with nothing broken.

    Scenario: On one screen, and as data
      Given a file "specs/REQ-cart.feature" containing:
        """
        @id=REQ-cart
        Feature: Cart

          Rule: A cart holds each item once

            Scenario: An item added twice
              Then the cart holds 1 item

          Rule: An empty cart cannot be paid
        """
      When I run "sdp status"
      Then the output contains "rules         unrun 3 · no example 1 · open 1"
      And the output contains "scenarios     unrun 2"
      And the output contains "gates         unrun 1"
      And the output contains "milestones    open 1"
      And the output contains "check         no diagnostics"
      When I run "sdp status --json"
      Then the JSON output has:
        | data.kinds.requirement     | 2 |
        | data.relations.realized-by | 1 |
        | data.stages.specified      | 1 |
        | data.scenarios.unrun       | 2 |
        | data.rules.unrun           | 3 |
        | data.rules.no example      | 1 |
        | data.rules.open            | 1 |
