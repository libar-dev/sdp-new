@id=REQ-cli @maturity=ready
@realized-by:ARCH-cli
Feature: Command line

  `sdp` is one command for people, scripts and agents. Every command reads the workspace afresh and
  is one use case of the application layer, the one the MCP server calls too, so the two cannot
  answer differently. What a command takes is in `sdp <command> --help`.

  Background:
    Given a file "specs/REQ-search.feature" containing:
      """
      @id=REQ-search @maturity=specified @iteration:C1 @realized-by:ARCH-index
      Feature: Search the catalogue

        Shoppers find products by name.

        Rule: A product is found by its name

          Scenario: Find a product by name
            Given a catalogue with a desk lamp
            When a shopper searches for "lamp"
            Then the desk lamp is found

        @open
        Rule: Do misspelled names match?
      """
    And these specs:
      | tags                                          | Feature               |
      | @id=ARCH-index @decided-by:DEC-0001           | Search index          |
      | @id=ARCH-cache @decided-by:DEC-0001           | Page cache            |
      | @id=DEC-0001                                  | Use an inverted index |
      | @id=PH-construction                           | Construction          |
      | @id=C1 @kind=iteration @phase:PH-construction | Search                |
    And a file "specs/MS-beta.feature" containing:
      """
      @id=MS-beta @closes:PH-construction
      Feature: Beta

        Rule: Every requirement is ready

          Scenario: None is below ready
            Then the query "requirement[maturity<ready]" returns no results
      """

  Rule: A command exits with 0 when it did what it was asked and with 1 when it did not

    Scenario Outline: Done and not done
      When I run "<command>"
      Then the exit code is <exit code>

      Examples: An answer, a check, a run without a failing scenario
        | command           | exit code |
        | sdp q requirement | 0         |
        | sdp check         | 0         |
        | sdp run           | 0         |

      Examples: A gate that is not met, input that is refused, a workspace that cannot be used
        | command               | exit code |
        | sdp gate MS-beta      | 1         |
        | sdp q 'requirement['  | 1         |
        | sdp show REQ-serach   | 1         |
        | sdp -C nowhere status | 1         |

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
        | sdp q requirement --json |
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
        | specs/b.feature    | 6    | gherkin-syntax        | Feature: B\n  Scenario: Half written\n    Given a note:\n      ```\n      never closed                                             |
        | specs/copy.feature | 1    | duplicate-id          | @id=REQ-search\nFeature: Search again                                                                                              |
        | src/search.ts      | 4    | annotation-unreadable | import { annotate } from "sdp/annotations"\nexport const search = 0\nconst id = "REQ-search"\nannotate(search, { implements: id }) |
        | specs/b.feature    | 1    | annotation            | @uses:REQ-search,ARCH-index\nFeature: B                                                                                             |
        | specs/b.feature    | 1    | link-syntax           | @iteration=C1\nFeature: B                                                                                                           |

  Rule: With --json, stdout is one envelope: whether the answer is complete, the notes, and the data

    Scenario: An answer that may miss something
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

    Scenario: A complete answer has no notes
      When I run "sdp q requirement --json"
      Then the JSON output has:
        | complete   | true       |
        | notes      | nothing    |
        | data.nodes | REQ-search |

    Scenario: A gate that is not met
      When I run "sdp gate MS-beta --json"
      Then the exit code is 1
      And the JSON output has:
        | complete    | true  |
        | data.passed | false |

  Rule: A command works on the nearest directory, the current one or above, that holds an sdp.config file, or on the one -C names

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

    Scenario: An invalid configuration
      Given a file "broken/sdp.config.yaml" containing:
        """
        features: 42
        """
      When I run "sdp -C broken status"
      Then the exit code is 1
      And the output contains "sdp.config.yaml: invalid configuration"
      And the output does not contain "    at "

    Scenario: A step definition module that does not load
      Given a file "specs/steps/search.steps.ts" containing:
        """
        throw new Error("search index not reachable")
        """
      When I run "sdp run"
      Then the exit code is 1
      And the output contains "specs/steps/search.steps.ts: could not load step definitions: search index not reachable"
      And the output does not contain "    at "

  Rule: status counts the graph on one screen: kinds, relations, stages, rules, scenarios, gates and milestones, each by where it stands

    Gates are counted apart from the other scenarios: a gate may be unmet with nothing broken.

    Scenario: The counts as data
      When I run "sdp status --json"
      Then the JSON output has:
        | data.kinds.requirement     | 1 |
        | data.relations.realized-by | 1 |
        | data.stages.specified      | 1 |
        | data.scenarios.unrun       | 1 |

    Scenario: Gates apart from the other scenarios
      When I run "sdp status"
      Then the output contains "scenarios     unrun 1"
      And the output contains "gates         unrun 1"
      And the output contains "milestones    open 1"
      And the output contains "check         no diagnostics"

    Scenario: Rules by where they stand: what their examples verify, or that they have none yet or are open
      Given a file "specs/REQ-cart.feature" containing:
        """
        @id=REQ-cart
        Feature: Cart

          Rule: A cart holds each item once

            Scenario: An item added twice
              Then the cart holds 1 item

          Rule: An empty cart cannot be paid

          @open
          Rule: Does a cart expire?
        """
      When I run "sdp status --json"
      Then the JSON output has:
        | data.rules.unrun      | 3 |
        | data.rules.no example | 1 |
        | data.rules.open       | 2 |
      When I run "sdp status"
      Then the output contains "rules         unrun 3 · no example 1 · open 2"

  Rule: vocabulary prints the words sdp interprets, as the workspace configures them, and the words it makes itself, which nothing configures

    Scenario: The default profile
      When I run "sdp vocabulary --json"
      Then the JSON output has:
        | data.vocabulary.maturity     | idea, draft, specified, ready                                                                |
        | data.made.attributes         | stage, verification, scenarios, summary, file, openQuestions                                 |
        | data.made.scenarioAttributes | spec, keyword, tags, description, rule, steps, examples, status, staleBecause, lastRun, hash |
        | data.made.ruleAttributes     | spec, description, tags, scenarios, verification                                             |
        | data.made.codeAttributes     | file, symbol, doc                                                                            |
      When I run "sdp vocabulary"
      Then the output line with "stages" contains "failing, in-progress, verified"
