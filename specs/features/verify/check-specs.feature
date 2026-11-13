@id=check-specs
@realized-by:ARCH-checker @realized-by:ARCH-application
Feature: Check specs

  Authors and reviewers, people and agents, need every problem in the specs reported at the line to
  fix, and what is built kept tested, so that they fix specs without reading sdp's code and no test
  is turned off in silence.

  Not a linter of style or wording: sdp checks what it reads, and fixes nothing itself.

  Rule: check fails only on an error, and --severity leaves out what is less severe

    Scenario: A warning passes the check, an error fails it
      Given a file "specs/reports.feature" containing:
        """
        @id=reports @maturity=idea
        Feature: Reports

          Rule: Something holds

            Scenario: Nothing yet
        """
      When I run "sdp check --base none"
      Then the exit code is 0
      And the output contains "0 error(s), 1 warning(s), 0 info"
      Given these specs:
        | tags                                         | Feature  |
        | @id=invoices @maturity=idea @depends-on:gone | Invoices |
      When I run "sdp check --severity error --json --base none"
      Then the exit code is 1
      And the JSON output has:
        | data.rule     | dangling-link          |
        | data.severity | error                  |
        | data.file     | specs/invoices.feature |
        | data.line     | 1                      |

  Rule: Every problem is reported by the rule it breaks, with its severity and the line to fix

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
        | declared-in-spec      | error    | specs/ARCH-reports.feature     | 1    | @id=ARCH-reports\nFeature: Reports                                                                                                                                            |
        | link-syntax           | error    | specs/reports.feature          | 1    | @id=reports @maturity:ready\nFeature: Reports                                                                                                                                 |
        | tag-syntax            | error    | specs/reports.feature          | 1    | @id=reports @uses:A,B\nFeature: Reports                                                                                                                                       |
        | declaration-conflict  | warning  | src/billing.py                 | 2    | # @sdp is ARCH-billing owner=payments\n# @sdp is ARCH-billing owner=finance\nclass Billing: pass                                                                              |
        | derived-attribute     | error    | specs/reports.feature          | 1    | @id=reports @stage=verified\nFeature: Reports                                                                                                                                 |
        | gherkin-syntax        | error    | specs/reports.feature          | 7    | @id=reports\nFeature: Reports\n  Rule: R\n    Scenario: Rows\n      Given the rows:\n        \| a \| b \|\n        \| c \|                                                    |
        | description-comment   | warning  | specs/reports.feature          | 3    | @id=reports\nFeature: Reports\n  # Why\n  Because.                                                                                                                            |
        | scenario-empty        | warning  | specs/reports.feature          | 4    | @id=reports\nFeature: Reports\n  Rule: R\n    Scenario: Nothing yet                                                                                                           |
        | background-empty      | warning  | specs/reports.feature          | 3    | @id=reports\nFeature: Reports\n  Background: the team asked for it.\n  Rule: R                                                                                                |
        | prose-step            | warning  | specs/reports.feature          | 6    | @id=reports\nFeature: Reports\n  Rule: R\n    Scenario: S\n      Then it is empty\n      Then the reason is the refund rule.                                                  |
        | scenario-outside-rule | error    | specs/reports.feature          | 3    | @id=reports\nFeature: Reports\n  Scenario: S\n    Then it works                                                                                                               |
        | replacement           | error    | specs/reports.feature          | 3    | @id=reports @maturity=idea\nFeature: Reports\n  @replaces:reports\n  Rule: R                                                                                                  |
        | question-example      | error    | specs/reports.feature          | 5    | @id=reports @maturity=idea\nFeature: Reports\n  @open\n  Rule: Mailed too?\n    Scenario: Mail\n      Then a mail is sent                                                     |
        | decision-shape        | warning  | specs/monthly-releases.feature | 4    | @id=monthly-releases @kind=decision\nFeature: Monthly releases\n  Not weekly, because a release takes a week to test.\n  Rule: Consequences                                   |
        | template-placeholder  | warning  | specs/monthly-releases.feature | 3    | @id=monthly-releases @kind=decision\nFeature: Monthly releases\n  Not <what a reasonable person would have chosen>, because <why>, at the cost of <what is accepted with it>. |
        | plan-reference        | warning  | specs/reports.feature          | 1    | @id=reports @iteration:reports\nFeature: Reports                                                                                                                              |
        | maturity-on-no-work   | warning  | specs/reports.feature          | 1    | @id=reports @kind=risk @maturity=idea\nFeature: Reports                                                                                                                       |
        | link-kind             | warning  | specs/reports.feature          | 1    | @id=reports @maturity=idea @realized-by:reports\nFeature: Reports                                                                                                             |
        | fact-kind             | warning  | specs/reports.feature          | 1    | @id=reports @maturity=idea @start=2026-11-16\nFeature: Reports                                                                                                                |
        | plan-date             | warning  | specs/IT-beta.feature          | 1    | @id=IT-beta @kind=iteration @start=2026-11-16 @end=2026-11-31\nFeature: Beta                                                                                                  |
        | milestone-met         | warning  | specs/MS-beta.feature          | 1    | @id=MS-beta @met=2026-02-30\nFeature: Beta                                                                                                                                    |
        | annotation-ignored    | warning  | src/cart.py                    | 1    | total = 0  # @sdp implements cart                                                                                                                                             |
        | annotation-unreadable | warning  | src/cart.ts                    | 2    | // @sdp implements cart\nexport const total = ( => 0                                                                                                                          |
        | import-unresolved     | warning  | src/cart.ts                    | 1    | import { Effect } from "effect"\n/** @sdp is ARCH-cart */\nexport const total = (): number => 0                                                                               |
        | return-type           | warning  | src/cart.ts                    | 2    | // @sdp is ARCH-cart\nexport const total = (lines: Array<number>) => lines.length                                                                                             |
        | step-unreadable       | warning  | specs/steps/cart.steps.ts      | 3    | import { defineSteps } from "sdp/steps"\nexport default defineSteps(() => ({}), ({ Given }) => {\n  Given(cart, () => {})\n})                                                 |
        | step-expression       | error    | specs/steps/cart.steps.ts      | 3    | import { defineSteps } from "sdp/steps"\nexport default defineSteps(() => ({}), ({ Given }) => {\n  Given("a cart of {items}", () => {})\n})                                  |

  @decided-by:declared-maturity-derived-stage
  Rule: What is built stays tested: live work has a live rule and a live rule an example, while work still to come is the team's judgement at any rung

    Scenario Outline: What is built, and what is still to come: <case>
      Given a file "specs/export-to-csv.feature" containing:
        """
        @id=export-to-csv <maturity>
        Feature: Export to CSV

          <rules>
        """
      When the workspace is checked
      Then sdp reports "<reported>"

      Examples:
        | case                                                             | maturity        | rules                                                      | reported         |
        | A live feature without a rule                                    |                 |                                                            | untested-feature |
        | A live rule without an example                                   |                 | Rule: Every row is exported                                | untested-rule    |
        | Work still to come with a rule without an example and a question | @maturity=ready | Rule: Every row is exported\n@open\nRule: Which delimiter? | nothing          |

  @decided-by:free-vocabulary
  Rule: A maturity is a rung of the ladder, and a kind is no rung, stage or change unless the workspace names it a kind

    Scenario Outline: A word sdp interprets: <case>
      Given a file "sdp.config.yaml" containing:
        """
        <config>
        """
      And a file "specs/gift-wrapping.feature" containing:
        """
        @id=gift-wrapping <tags>
        Feature: Gift wrapping
        """
      When the workspace is checked
      Then sdp reports "<reported>"

      Examples:
        | case                              | config                                   | tags           | reported            |
        | A maturity off the ladder         | # every key at its default               | @maturity=done | maturity-off-ladder |
        | A kind named like a rung          | # every key at its default               | @kind=idea     | not-a-kind          |
        | A rung the workspace names a kind | vocabulary: { words: { kinds: [idea] } } | @kind=idea     | nothing             |

  Rule: Nothing live at the base stops being live without an error, and an example stays itself under its name, its steps, or the @replaces that names it

    Background:
      Given a file "specs/cart.feature" containing:
        """
        @id=cart
        Feature: Cart

          Rule: A cart holds what was added

            Scenario: Add an item
              Then the cart holds 1 item
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

      Examples:
        | change                                        | exit code | reported        | cart                                                                                                                                                     |
        | A maturity on the live feature                | 1         | demotion        | @id=cart @maturity=ready\nFeature: Cart\n  Rule: A cart holds what was added\n    Scenario: Add an item\n      Then the cart holds 1 item                |
        | The live example made a gate                  | 1         | example-dropped | @id=cart\nFeature: Cart\n  Rule: A cart holds what was added\n    @gate\n    Scenario: Add an item\n      Then the cart holds 1 item                     |
        | The live example and its rule renamed         | 0         | nothing         | @id=cart\nFeature: Cart\n  Rule: A cart keeps what was added\n    Scenario: Add a lamp\n      Then the cart holds 1 item                                 |
        | The live example renamed and its steps edited | 1         | example-dropped | @id=cart\nFeature: Cart\n  Rule: A cart holds what was added\n    Scenario: Add a lamp\n      Then the cart holds 1 lamp                                 |
        | The same, where it went named by @replaces    | 0         | nothing         | @id=cart\nFeature: Cart\n  Rule: A cart holds what was added\n    @replaces:cart#add-an-item\n    Scenario: Add a lamp\n      Then the cart holds 1 lamp |

  Rule: The base is where HEAD meets the default branch, or what --base or the configuration names; base: none waives the comparison, and a check that compared nothing is incomplete

    Scenario Outline: A demotion on a branch, the base named <named>
      Given a file "specs/cart.feature" containing:
        """
        @id=cart
        Feature: Cart

          Rule: A cart holds what was added

            Scenario: Add an item
              Then the cart holds 1 item
        """
      And the files are committed on the branch "main"
      And a file "specs/cart.feature" containing:
        """
        @id=cart @maturity=ready
        Feature: Cart
        """
      And a file "sdp.config.yaml" containing:
        """
        <configuration>
        """
      And the files are committed on the branch "change"
      When I run the pipeline:
        """
        <command>
        """
      Then the exit code is <exit code>
      And the output contains "<compared>"

      Examples:
        | named                                     | configuration              | command                                     | exit code | compared                                            |
        | by nobody                                 | # every key at its default | sdp check                                   | 1         | (git merge-base HEAD refs/heads/main)               |
        | with --base                               | base: none                 | sdp check --base main                       | 1         | (git merge-base HEAD main)                          |
        | none, in the configuration                | base: none                 | sdp check                                   | 0         | the comparison is waived (base: none)               |
        | by nobody, on a branch with no commit yet | # every key at its default | git checkout -q --orphan fresh && sdp check | 2         | not compared: no live test was compared with a base |

  @maturity=idea
  Rule: The state sdp graph prints holds no diagnostic: a problem is what check says of what was written, not something anyone wrote
