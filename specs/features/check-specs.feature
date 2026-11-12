@id=check-specs
@realized-by:ARCH-checker @realized-by:ARCH-application
Feature: Check specs

  Authors and reviewers, people and agents, need every problem in the specs reported at the line to
  fix, with what to write instead, so that they can fix it without reading sdp's code. And what is
  built must stay tested: a live rule has an example, and nothing live stops being live without an
  error, so that a test is never turned off in silence.

  Not a linter of style or wording, nor a judge of how far work still to come has come: sdp checks
  what it reads and what is live, and fixes nothing itself.

  Rule: check reports each diagnostic at the line to fix, down to the severity asked for, and fails only on an error

    An error means the graph is wrong or a claim is false; a warning, that something was ignored or
    is probably a slip; an info is a suggestion.

    Scenario: A warning passes the check, an error fails it, and --severity leaves out what is less severe
      Given a file "specs/reports.feature" containing:
        """
        @id=reports @maturity=idea
        Feature: Reports

          Rule: Something holds

            Scenario: Nothing yet
        """
      When I run "sdp check --base none"
      Then the exit code is 0
      And the output contains "[scenario-empty] reports#nothing-yet has no steps  specs/reports.feature:6"
      And the output contains "0 error(s), 1 warning(s), 0 info"
      Given these specs:
        | tags                          | Feature  |
        | @id=invoices @depends-on:gone | Invoices |
      When I run "sdp check --severity error --json --base none"
      Then the exit code is 1
      And the JSON output has:
        | data.rule     | dangling-link          |
        | data.severity | error                  |
        | data.node     | invoices               |
        | data.file     | specs/invoices.feature |
        | data.line     | 1                      |

  Rule: Every diagnostic names its rule, its severity and the line to fix

    Scenario Outline: The smallest workspace that breaks each rule
      Given a file "<file>" containing:
        """
        <content>
        """
      When the workspace is checked
      Then sdp reports at least:
        | rule   | severity   | at            |
        | <rule> | <severity> | <file>:<line> |

      Examples:
        | rule                  | severity | file                           | line | content                                                                                                                                                                       |
        | duplicate-id          | error    | specs/reports.feature          | 4    | @id=reports\nFeature: Reports\n  Rule: R\n  Rule: R                                                                                                                           |
        | dangling-link         | error    | specs/reports.feature          | 1    | @id=reports @depends-on:gone\nFeature: Reports                                                                                                                                |
        | link-syntax           | error    | specs/reports.feature          | 1    | @id=reports @maturity:ready\nFeature: Reports                                                                                                                                 |
        | declaration-conflict  | warning  | src/billing.py                 | 2    | # @sdp is ARCH-billing owner=payments\n# @sdp is ARCH-billing owner=finance\nclass Billing: pass                                                                          |
        | derived-attribute     | error    | specs/reports.feature          | 1    | @id=reports @verification=passing\nFeature: Reports                                                                                                                           |
        | gherkin-syntax        | error    | specs/reports.feature          | 7    | @id=reports\nFeature: Reports\n  Rule: R\n    Scenario: Rows\n      Given the rows:\n        \| a \| b \|\n        \| c \|                                                    |
        | annotation            | error    | specs/reports.feature          | 1    | @id=reports @uses:A,B\nFeature: Reports                                                                                                                                       |
        | description-comment   | warning  | specs/reports.feature          | 4    | @id=reports\nFeature: Reports\n  Why:\n  # not read\n  because.                                                                                                               |
        | scenario-empty        | warning  | specs/reports.feature          | 4    | @id=reports\nFeature: Reports\n  Rule: R\n    Scenario: Nothing yet                                                                                                           |
        | scenario-outside-rule | error    | specs/reports.feature          | 3    | @id=reports\nFeature: Reports\n  Scenario: S\n    Then it works                                                                                                               |
        | untested-rule         | error    | specs/reports.feature          | 3    | @id=reports\nFeature: Reports\n  Rule: R                                                                                                                                       |
        | replacement           | error    | specs/reports.feature          | 3    | @id=reports @maturity=idea\nFeature: Reports\n  @replaces:reports\n  Rule: R                                                                                                  |
        | question-example      | error    | specs/reports.feature          | 5    | @id=reports @maturity=idea\nFeature: Reports\n  @open\n  Rule: Mailed too?\n    Scenario: Mail\n      Then a mail is sent                                                     |
        | decision-shape        | warning  | specs/monthly-releases.feature | 4    | @id=monthly-releases @kind=decision\nFeature: Monthly releases\n  Not weekly, because a release takes a week to test.\n  Rule: Consequences                                   |
        | template-placeholder  | warning  | specs/monthly-releases.feature | 3    | @id=monthly-releases @kind=decision\nFeature: Monthly releases\n  Not <what a reasonable person would have chosen>, because <why>, at the cost of <what is accepted with it>. |
        | plan-reference        | warning  | specs/reports.feature          | 1    | @id=reports @iteration:reports\nFeature: Reports                                                                                                                              |
        | plan-date             | warning  | specs/IT-beta.feature          | 1    | @id=IT-beta @kind=iteration @start=2026-11-16 @end=2026-11-31\nFeature: Beta                                                                                                  |
        | plan-date             | warning  | specs/IT-beta.feature          | 1    | @id=IT-beta @kind=iteration @start=2026-11-16\nFeature: Beta                                                                                                                  |
        | milestone-met         | warning  | specs/MS-beta.feature          | 1    | @id=MS-beta @met=2026-02-30\nFeature: Beta                                                                                                                                    |
        | annotation-ignored    | warning  | src/cart.py                    | 1    | total = 0  # @sdp implements cart                                                                                                                                             |
        | annotation-unreadable | warning  | src/cart.ts                    | 2    | // @sdp implements cart\nexport const total = ( => 0                                                                                                                         |
        | return-type           | warning  | src/cart.ts                    | 2    | // @sdp is ARCH-cart\nexport const total = (lines: Array<number>) => lines.length                                                                                       |
        | step-unreadable       | warning  | specs/steps/cart.steps.ts      | 3    | import { defineSteps } from "sdp/steps"\nexport default defineSteps(() => ({}), ({ Given }) => {\n  Given(cart, () => {})\n})                                                 |
        | step-expression       | error    | specs/steps/cart.steps.ts      | 3    | import { defineSteps } from "sdp/steps"\nexport default defineSteps(() => ({}), ({ Given }) => {\n  Given("a cart of {items}", () => {})\n})                                  |
        | step-expression       | error    | specs/steps/cart.steps.ts      | 3    | import { defineSteps } from "sdp/steps"\nexport default defineSteps(() => ({}), ({ Given }) => {\n  Given(/a (cart of items/, () => {})\n})                                   |

    Scenario: Every rule sdp reports has an example here
      Then every rule sdp reports has an example in this spec

  Rule: A live rule has an example, so that what is built stays tested

    A live rule without one tests nothing, and keeps its feature from verified. A rule still to come
    may wait for its examples, and an open rule is a question still to come; what an example asserts
    is the author's.

    Scenario Outline: A live feature, and <case>
      Given a file "specs/export-to-csv.feature" containing:
        """
        @id=export-to-csv
        Feature: Export to CSV

          Analysts want data in Excel.

          Rule: Every row is exported

            Scenario: Export
              Then I get a file

          <second>
        """
      When the workspace is checked
      Then sdp reports "<reported>"

      Examples:
        | case                                  | second                                                          | reported      |
        | a rule without an example             | Rule: Archived rows too                                         | untested-rule |
        | a rule still to come without one      | @maturity=draft\nRule: Archived rows too                        | nothing       |
        | a question                            | @open\nRule: Archived rows too?                                 | nothing       |
        | a rule whose example states no Then   | Rule: Archived rows too\n  Scenario: Archive\n    When I archive | nothing       |

    Scenario: The rule without an example, at its line
      Given a file "specs/export-to-csv.feature" containing:
        """
        @id=export-to-csv
        Feature: Export to CSV

          Rule: Archived rows are exported too
        """
      When the workspace is checked
      Then sdp reports:
        | rule          | at                            | message                                                                      |
        | untested-rule | specs/export-to-csv.feature:4 | export-to-csv#archived-rows-are-exported-too is live, so it needs an example |

  @decided-by:declared-maturity-derived-stage
  Rule: A maturity is the team's judgement, and check reads neither its value nor the content behind it

    How far work still to come has come is for the team to say, and for a gate of its own to hold
    to a Definition of Ready: a placeholder paragraph with a token scenario would meet any criterion
    sdp could check. Any value, written once or twice, says that the work is still to come.

    Scenario Outline: A feature with a rule without an example and a question, at <maturity>
      Given a file "specs/export-to-csv.feature" containing:
        """
        @id=export-to-csv @maturity=<maturity>
        Feature: Export to CSV

          Rule: Every row is exported

          @open
          Rule: Which delimiter?
        """
      When the workspace is checked
      Then sdp reports nothing
      And node "export-to-csv" has attribute toCome = "true"

      Examples:
        | maturity             |
        | ready                |
        | someday              |
        | idea @maturity=ready |

  Rule: The retired rung is an error, and its hint is to delete it

    A live test declares no maturity. The rung that once said a spec was built would now say that it
    is still to come, and switch its examples off in silence; no other value is judged.

    Scenario Outline: The retired rung, on <on>
      Given a file "specs/cart.feature" containing:
        """
        @id=cart @maturity=<feature's>
        Feature: Cart

          Shoppers collect items before paying.

          @maturity=<rule's>
          Rule: A cart holds what was added

            Scenario: Add an item
              Then the cart holds 1 item
        """
      When the workspace is checked
      Then sdp reports:
        | rule             | severity | node | at                        | message                                                 | hint                                         |
        | retired-maturity | error    | <id> | specs/cart.feature:<line> | the retired rung: any maturity makes work still to come | delete it: what declares no maturity is live |

      Examples:
        | on        | feature's   | rule's      | line | id                               |
        | a feature | implemented | ready       | 1    | cart                             |
        | a rule    | draft       | implemented | 6    | cart#a-cart-holds-what-was-added |

  Rule: Nothing live stops being live without an error

    Built work cannot go back to work still to come, or a test is turned off in silence, so check
    compares the specs with a base revision. A maturity or `@open` on a Feature or a Rule whose
    examples were live there is an error, and so is a live example of the base that is gone, still
    to come or a gate, unless what replaces its rule or its feature is live and has a live example of
    its own: a gate enforces nothing, so it replaces no test. Examples are compared one for one, each
    row of an outline on its own and a Background's steps with those of each example: by their id,
    then by their steps, so a new name or a new place for one is no removal, and an example edited
    under its name is the same example, while one that is gone is not made up for by another that
    tests the same. The base is read with its own configuration, and the specs of today with today's,
    so a live test that a configuration leaves out is dropped like any other, and a file is read
    whatever its name.

    Background:
      Given a file "specs/cart.feature" containing:
        """
        @id=cart
        Feature: Cart

          Shoppers collect items before paying.

          Rule: A cart holds what was added

            Scenario: Add an item
              Then the cart holds 1 item

          @maturity=ready
          Rule: A cart holds each item once

            Scenario: Add a lamp twice
              Then the cart holds 1 lamp
        """
      And the files are committed on the branch "main"

    Scenario Outline: Live work changed: <change>
      Given a file "specs/cart.feature" containing:
        """
        <cart>
        """
      When I run "sdp check --json"
      Then the exit code is <exit code>
      And the JSON output has:
        | data.rule | <reported> |
        | data.line | <line>     |

      Examples:
        | change                                                | exit code | reported                       | line  | cart                                                                                                                                                                                                                            |
        | A maturity on the live feature                        | 1         | demotion                       | 1     | @id=cart @maturity=ready\nFeature: Cart\n  Rule: A cart holds what was added\n    Scenario: Add an item\n      Then the cart holds 1 item                                                                                                  |
        | A maturity on the live rule                           | 1         | demotion                       | 3     | @id=cart\nFeature: Cart\n  @maturity=draft\n  Rule: A cart holds what was added\n    Scenario: Add an item\n      Then the cart holds 1 item                                                                                    |
        | The live rule made a question                         | 1         | demotion                       | 4     | @id=cart\nFeature: Cart\n  @open\n  Rule: A cart holds what was added                                                                                                                                                          |
        | The live example deleted                              | 1         | example-dropped, untested-rule | 3, 8  | @id=cart\nFeature: Cart\n  Rule: A cart holds what was added                                                                                                                                                                   |
        | The live rule deleted with its example                | 1         | example-dropped                | 8     | @id=cart\nFeature: Cart\n  @maturity=ready\n  Rule: A cart holds each item once\n    Scenario: Add a lamp twice\n      Then the cart holds 1 lamp                                                                              |
        | The live example made a gate                          | 1         | example-dropped                | 5     | @id=cart\nFeature: Cart\n  Rule: A cart holds what was added\n    @gate\n    Scenario: Add an item\n      Then the cart holds 1 item                                                                         |
        | The live example moved under the rule still to come   | 1         | example-dropped, untested-rule | 3, 6  | @id=cart\nFeature: Cart\n  Rule: A cart holds what was added\n  @maturity=ready\n  Rule: A cart holds each item once\n    Scenario: Add an item\n      Then the cart holds 1 item                                               |
        | The live example and its rule renamed                 | 0         | nothing                        | nothing | @id=cart\nFeature: Cart\n  Rule: A cart keeps what was added\n    Scenario: Add a lamp\n      Then the cart holds 1 item                                                                                                     |
        | The live example's steps edited                       | 0         | nothing                        | nothing | @id=cart\nFeature: Cart\n  Rule: A cart holds what was added\n    Scenario: Add an item\n      Given an empty cart\n      Then the cart holds 1 item                                                                          |
        | The rule still to come built                          | 0         | nothing                        | nothing | @id=cart\nFeature: Cart\n  Rule: A cart holds what was added\n    Scenario: Add an item\n      Then the cart holds 1 item\n  Rule: A cart holds each item once\n    Scenario: Add a lamp twice\n      Then the cart holds 1 lamp |
        | The rule still to come deleted with its example       | 0         | nothing                        | nothing | @id=cart\nFeature: Cart\n  Rule: A cart holds what was added\n    Scenario: Add an item\n      Then the cart holds 1 item                                                                                                    |

    Scenario Outline: One example for one example: <change>
      Given a file "specs/cart.feature" containing:
        """
        @id=cart
        Feature: Cart

          Shoppers collect items before paying.

          Rule: A cart holds what was added

            Scenario Outline: Add items
              Then the cart holds <count> items

              Examples:
                | count |
                | 1     |
                | 2     |

            Scenario: Add a lamp
              Then the cart holds a lamp

            Scenario: Add a desk
              Then the cart holds a desk
        """
      And the files are committed on the branch "main"
      And a file "specs/cart.feature" containing:
        """
        <cart>
        """
      When I run "sdp check --json"
      Then the exit code is <exit code>
      And the JSON output has:
        | data.rule | <reported> |
        | data.node | <node>     |

      Examples:
        | change                                     | exit code | reported        | node            | cart                                                                                                                                                                                                                                                                                                                                     |
        | an outline's row deleted                   | 1         | example-dropped | cart#add-items  | @id=cart\nFeature: Cart\n  Rule: A cart holds what was added\n    Scenario Outline: Add items\n      Then the cart holds <count> items\n      Examples:\n        \| count \|\n        \| 1 \|\n    Scenario: Add a lamp\n      Then the cart holds a lamp\n    Scenario: Add a desk\n      Then the cart holds a desk\n                  |
        | an outline's row edited                    | 0         | nothing         | nothing         | @id=cart\nFeature: Cart\n  Rule: A cart holds what was added\n    Scenario Outline: Add items\n      Then the cart holds <count> items\n      Examples:\n        \| count \|\n        \| 1 \|\n        \| 3 \|\n    Scenario: Add a lamp\n      Then the cart holds a lamp\n    Scenario: Add a desk\n      Then the cart holds a desk\n |
        | an outline's rows in another order         | 0         | nothing         | nothing         | @id=cart\nFeature: Cart\n  Rule: A cart holds what was added\n    Scenario Outline: Add items\n      Then the cart holds <count> items\n      Examples:\n        \| count \|\n        \| 2 \|\n        \| 1 \|\n    Scenario: Add a lamp\n      Then the cart holds a lamp\n    Scenario: Add a desk\n      Then the cart holds a desk\n |
        | an example edited into one that is deleted | 1         | example-dropped | cart#add-a-desk | @id=cart\nFeature: Cart\n  Rule: A cart holds what was added\n    Scenario Outline: Add items\n      Then the cart holds <count> items\n      Examples:\n        \| count \|\n        \| 1 \|\n        \| 2 \|\n    Scenario: Add a lamp\n      Then the cart holds a desk\n                                                             |

    Scenario: An unchanged outline whose gated row, written first, tests what its ordinary row tests
      Given a file "specs/cart.feature" containing:
        """
        @id=cart
        Feature: Cart

          Shoppers collect items before paying.

          Rule: A cart holds what was added

            Scenario Outline: Add items
              Then the cart holds <count> items

              @gate
              Examples:
                | count |
                | 1     |

              Examples:
                | count |
                | 1     |
        """
      And the files are committed on the branch "main"
      When I run "sdp check --json"
      Then the exit code is 0

    Scenario Outline: A live rule replaced in the change that deletes it, by <replacement>
      Given a file "specs/cart.feature" containing:
        """
        <cart>
        """
      And a file "specs/basket.feature" containing:
        """
        <basket>
        """
      When I run "sdp check --json"
      Then the exit code is <exit code>
      And the JSON output has:
        | data.rule | <reported> |

      Examples:
        | replacement                                   | exit code | reported        | cart                                                                                                                                                                                                                                                                                                                                     | basket                                                                                                                                                               |
        | a live rule                                   | 0         | nothing         | @id=cart\nFeature: Cart\n  @replaces:cart#a-cart-holds-what-was-added\n  Rule: A cart holds what was added, once\n    Scenario: Add an item once\n      Then the cart holds 1 item once\n                                                                                                                                                | @id=basket @maturity=idea\nFeature: Basket                                                                                                                           |
        | a rule whose example is a gate                | 1         | example-dropped | @id=cart\nFeature: Cart\n  @replaces:cart#a-cart-holds-what-was-added\n  Rule: A cart holds what was added, once\n    @gate\n    Scenario: Add an item once\n      Then the cart holds 1 item once\n                                                                                                                                     | @id=basket @maturity=idea\nFeature: Basket                                                                                                                           |
        | a rule whose examples are gated rows          | 1         | example-dropped | @id=cart\nFeature: Cart\n  @replaces:cart#a-cart-holds-what-was-added\n  Rule: A cart holds what was added, once\n    Scenario Outline: Add <count> once\n      Then the cart holds <count> once\n      @gate\n      Examples:\n        \| count \|\n        \| 1 item \|\n                                                              | @id=basket @maturity=idea\nFeature: Basket                                                                                                                           |
        | a rule with an ordinary row and a gated one   | 0         | nothing         | @id=cart\nFeature: Cart\n  @replaces:cart#a-cart-holds-what-was-added\n  Rule: A cart holds what was added, once\n    Scenario Outline: Add <count> once\n      Then the cart holds <count> once\n      Examples:\n        \| count \|\n        \| 2 items \|\n      @gate\n      Examples:\n        \| count \|\n        \| 1 item \|\n | @id=basket @maturity=idea\nFeature: Basket                                                                                                                           |
        | a rule that names another                     | 1         | example-dropped | @id=cart\nFeature: Cart\n  @replaces:cart#a-cart-holds-all\n  Rule: A cart holds what was added, once\n    Scenario: Add an item once\n      Then the cart holds 1 item once\n                                                                                                                                                           | @id=basket @maturity=idea\nFeature: Basket                                                                                                                           |
        | a feature, the cart gone                      | 0         | nothing         | # Cart is now the basket.                                                                                                                                                                                                                                                                                                                | @id=basket @replaces:cart\nFeature: Basket\n  \n  Rule: A basket holds what was added\n    Scenario: Add an item to the basket\n      Then the basket holds 1 item\n |
        | a rule of another feature that names the cart | 0         | nothing         | # Cart is now the basket.                                                                                                                                                                                                                                                                                                                | @id=basket\nFeature: Basket\n  @replaces:cart\n  Rule: A basket holds what was added\n    Scenario: Add an item to the basket\n      Then the basket holds 1 item\n  |

    Scenario Outline: The configuration changed: <change>
      Given a file "sdp.config.yaml" containing:
        """
        <configuration>
        """
      When I run "sdp check --json"
      Then the exit code is 1
      And the JSON output has:
        | data.rule | example-dropped |
        | data.node | cart#add-an-item |

      Examples:
        | change                      | configuration                        |
        | the spec excluded           | exclude: ["specs/cart.feature"]      |
        | the features globs elsewhere | features: ["requirements/**/*.feature"] |

    Scenario: A spec whose file name holds a line break, deleted
      When I run the pipeline:
        """
        mv specs/cart.feature "specs/cart
        list.feature"
        """
      Then the exit code is 0
      Given the files are committed on the branch "main"
      When I run the pipeline:
        """
        rm specs/cart*list.feature
        """
      Then the exit code is 0
      When I run "sdp check --json"
      Then the exit code is 1
      And the JSON output has:
        | data.rule | example-dropped |
        | data.node | cart#add-an-item |

    Scenario: What a demotion and a dropped example say, and where
      Given a file "specs/cart.feature" containing:
        """
        @id=cart
        Feature: Cart

          Shoppers collect items before paying.

          @maturity=draft
          Rule: A cart holds what was added

            Scenario: Add an item
              Then the cart holds 1 item
        """
      When I run "sdp check"
      Then the exit code is 1
      And the output contains "[demotion] cart#a-cart-holds-what-was-added was live at the base "
      And the output contains ": @maturity=draft makes it still to come  specs/cart.feature:6"
      Given a file "specs/cart.feature" containing:
        """
        @id=cart
        Feature: Cart

          Shoppers collect items before paying.
        """
      When I run "sdp check"
      Then the exit code is 1
      And the output contains "[example-dropped] cart#add-an-item, a live example at the base "
      And the output contains ", is gone, and nothing that replaces cart#a-cart-holds-what-was-added is live with a live example  specs/cart.feature:8"

    Scenario Outline: A live rule replaced by a rule still to come, which <replacement>
      Given a file "specs/cart.feature" containing:
        """
        @id=cart
        Feature: Cart

          Rule: A cart holds what was added

            Scenario: Add an item
              Then the cart holds 1 item

          @maturity=ready @replaces:cart#a-cart-holds-what-was-added
          Rule: A cart holds each item once

            Scenario: Add a lamp twice
              Then the cart holds 1 lamp
        """
      And the files are committed on the branch "main"
      And a file "specs/cart.feature" containing:
        """
        @id=cart
        Feature: Cart

          <tags>
          Rule: A cart holds each item once

            Scenario: Add a lamp twice
              Then the cart holds 1 lamp
        """
      When I run "sdp check --json"
      Then the exit code is <exit code>
      And the JSON output has:
        | data.rule | <reported> |

      Examples:
        | replacement                                           | tags            | exit code | reported        |
        | is built in the change that deletes it                |                 | 0         | nothing         |
        | is still to come in the change that deletes it        | @maturity=ready | 1         | example-dropped |

  Rule: The base is where HEAD meets the default branch, or the revision --base or the configuration names; without one, check's answer is incomplete

    A change is judged against what it started from, not against whatever the default branch has
    become since. The default branch is origin's HEAD, else main, else master. Outside git, in a
    clone without the history, or without a default branch there is nothing to compare: a check that
    compared nothing may have missed a test turned off, so it exits with 2, as every answer that may
    miss something does, unless the comparison is waived with `--base none` or `base: none`. A base
    that is named and cannot be read stops the check.

    Background:
      Given a file "specs/cart.feature" containing:
        """
        @id=cart
        Feature: Cart

          Rule: A cart holds what was added

            Scenario: Add an item
              Then the cart holds 1 item
        """

    Scenario Outline: A demotion on a branch, the base named <named>
      Given the files are committed on the branch "main"
      And a file "specs/cart.feature" containing:
        """
        @id=cart @maturity=ready
        Feature: Cart

          Rule: A cart holds what was added

            Scenario: Add an item
              Then the cart holds 1 item
        """
      And a file "sdp.config.yaml" containing:
        """
        <configuration>
        """
      And the files are committed on the branch "change"
      When I run "<command>"
      Then the exit code is <exit code>
      And the output line with "note:" contains "<compared>"

      Examples:
        | named                                | configuration              | command               | exit code | compared                                                |
        | by nobody                            | # every key at its default | sdp check             | 1         | (git merge-base HEAD main)                              |
        | with --base                          | # every key at its default | sdp check --base HEAD | 0         | (git merge-base HEAD HEAD)                              |
        | in the configuration                 | base: HEAD                 | sdp check             | 0         | (git merge-base HEAD HEAD)                              |
        | in the configuration, and --base     | base: HEAD                 | sdp check --base main | 1         | (git merge-base HEAD main)                              |

    Scenario: The base of the repository the workspace is in, whatever repository git's variables name
      Given the files are committed on the branch "main"
      When I run "GIT_DIR=$PWD/elsewhere GIT_WORK_TREE=$PWD/elsewhere GIT_INDEX_FILE=$PWD/elsewhere/index sdp check"
      Then the exit code is 0
      And the output line with "note:" contains "(git merge-base HEAD main)"

    Scenario Outline: No base: <case>
      Given the files are <where>
      When I run "sdp check"
      Then the exit code is 2
      And the output contains "incomplete: this answer may miss something"
      And the output contains "note: not compared: no live test was compared with a base: <reason>"
      When I run "sdp check --base main"
      Then the exit code is 1
      And the output contains "cannot compare live tests with the base main: <named>"

      Examples:
        | case                     | where                               | reason                                                   | named                                    |
        | outside git              | in no git repository                | this workspace is in no git repository                   | this workspace is in no git repository   |
        | a branch of another name | committed on the branch "trunk"     | the repository has no origin/HEAD, main or master branch | git merge-base HEAD main found no commit |

    Scenario Outline: The comparison waived <how>
      Given a file "sdp.config.yaml" containing:
        """
        <configuration>
        """
      And the files are in no git repository
      When I run "<command> --json"
      Then the exit code is 0
      And the JSON output has:
        | complete | true                                                              |
        | notes    | no live test was compared with a base: the comparison is waived (<waiver>) |

      Examples:
        | how                  | configuration              | command               | waiver      |
        | on the command line  | # every key at its default | sdp check --base none | --base none |
        | in the configuration | base: none                 | sdp check             | base: none  |

  Rule: A decision is a title and one to three sentences

    It holds the one thing no scenario can say: what was chosen over what, and why. What it imposes
    is a rule of the spec it constrains, what is undecided an open question on the spec it blocks,
    and what changed is rewritten: git keeps the rest.

    Scenario Outline: A decision that grows a rule or a scenario is reported
      Given a file "specs/retire-legacy-billing.feature" containing:
        """
        @id=retire-legacy-billing @kind=decision
        Feature: Retire legacy billing

          Not a wrapper around it, because every new caller would keep it alive.

          <more>
        """
      When the workspace is checked
      Then sdp reports at least:
        | rule           | node                  | at                                    |
        | decision-shape | retire-legacy-billing | specs/retire-legacy-billing.feature:6 |

      Examples:
        | more                                                            |
        | Rule: Nothing calls legacy billing                              |
        | Scenario: Nothing calls legacy billing\n  Then nothing calls it |

  Rule: The rule a decision leads to is a rule of what it constrains, which links back to the decision

    There it is tested with the rest of what it constrains, and fails as soon as it is broken; the
    link lets a question find all that rests on a decision before it changes.

    Scenario: A rule of legacy billing rests on the decision to retire it, and fails while code still calls it
      Given these specs:
        | tags                                     | Feature               |
        | @id=retire-legacy-billing @kind=decision | Retire legacy billing |
      And a file "specs/ARCH-legacy-billing.feature" containing:
        """
        @id=ARCH-legacy-billing
        Feature: Legacy billing

          Billing as it was before invoices, kept until the last caller is gone.

          @decided-by:retire-legacy-billing
          Rule: Nothing new calls legacy billing

            Scenario: No code uses it
              Then the query "code -uses-> #ARCH-legacy-billing" returns no results
        """
      And a file "src/invoices.ts" containing:
        """
        // @sdp uses ARCH-legacy-billing
        export function invoice(): void {}
        """
      When the workspace is checked
      Then sdp reports nothing
      When I query "#retire-legacy-billing <-decided-by- rule"
      Then the result is "ARCH-legacy-billing#nothing-new-calls-legacy-billing"
      When the workspace is run
      Then node "ARCH-legacy-billing#no-code-uses-it" has attribute status = "failed"

  Rule: A tag that as written would link nothing or say nothing is reported, not read as something else

    Its author meant a link or a fact: read as written it would plan or say nothing, and read as
    something else it would be a guess.

    Scenario Outline: A planning link written as a value, an activity without its discipline, a tag without a value
      Given these specs:
        | tags                                                          | Feature |
        | @id=IT-beta @kind=iteration @start=2026-11-16 @end=2026-11-27 | Beta    |
        | @id=reports @maturity=idea <tags>                             | Reports |
      When the workspace is checked
      Then sdp reports:
        | rule   | at                      | message   | hint   |
        | <rule> | specs/reports.feature:1 | <message> | <hint> |

      Examples:
        | tags                   | rule           | message                                                            | hint                                                    |
        | @iteration=IT-beta     | link-syntax    | iteration is a link, so a value written with = links nothing       | write @iteration:IT-beta                                |
        | @activity.test=IT-beta | link-syntax    | activity.test is a link, so a value written with = links nothing   | write @activity.test:IT-beta                            |
        | @activity:IT-beta      | plan-reference | activity names no discipline, so its link to IT-beta plans nothing | name the discipline, `@activity.implementation:IT-beta` |
        | @owner=                | annotation     | owner has no value                                                 | write @owner=<value>, or @owner alone                   |

  @decided-by:specs-are-gherkin-files
  Rule: A Markdown file where specs live is reported with what to write instead, because sdp reads none of it

    Scenario: A spec written as Markdown beside the feature files, and a README elsewhere
      Given these specs:
        | tags                       | Feature |
        | @id=reports @maturity=idea | Reports |
      And a file "specs/checkout.md" containing:
        """
        # Checkout
        """
      And a file "README.md" containing:
        """
        # Shop
        """
      When the workspace is checked
      Then sdp reports:
        | rule       | severity | at                  | hint                                                                     |
        | not-a-spec | warning  | specs/checkout.md:1 | a spec is a feature file: write specs/checkout.feature, its tags (@id=…) |

    Scenario: Markdown under the directory the feature files are configured in, before any feature file
      Given a file "sdp.config.yaml" containing:
        """
        features: ["specs/**/*.feature"]
        """
      And a file "specs/billing/invoice.md" containing:
        """
        # Invoices
        """
      When the workspace is checked
      Then sdp reports:
        | rule       | at                         |
        | not-a-spec | specs/billing/invoice.md:1 |

  Rule: A quote of template text or a mention of an annotation is not flagged

    A guide or a comment that explains sdp quotes what sdp flags; only text where sdp would read it
    as a template's, or as an annotation, is flagged.

    Scenario Outline: Words that only mention what sdp flags
      Given a file "<file>" containing:
        """
        <text>
        """
      When the workspace is checked
      Then sdp does not report "<rule>"

      Examples: a quote of template text
        | file                  | rule                 | text                                                                                                                                                                |
        | specs/reports.feature | template-placeholder | @id=reports\nFeature: Reports\n  A decision starts as "Not <what a reasonable person would have chosen>, because <why>, at the cost of <what is accepted with it>." |

      Examples: a mention of an annotation, and an annotation on a line of its own, which is read
        | file        | rule               | text                                                             |
        | src/cart.ts | annotation-ignored | // after code, as in total() // @sdp implements cart is not read |
        | src/cart.ts | annotation-ignored | // @sdp implements cart\nexport const total = 0                  |

  @open @maturity=draft
  Rule: Does Markdown where specs live make every answer incomplete, or is check's warning enough?

    Only `sdp check` says so today: a query of the same workspace is complete and carries no note,
    so an agent that never runs check never hears of the file.
