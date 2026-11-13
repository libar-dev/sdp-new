@id=check-specs
@realized-by:ARCH-checker @realized-by:ARCH-application
Feature: Check specs

  Authors and reviewers, people and agents, need every problem in the specs reported at the line to
  fix, with what to write instead, so that they can fix it without reading sdp's code. And what is
  built must stay tested: live work has a live rule, a live rule has an example, and nothing live
  stops being live without an error, so that a test is never turned off in silence.

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
        | tags                                         | Feature  |
        | @id=invoices @maturity=idea @depends-on:gone | Invoices |
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
        | declared-in-spec      | error    | specs/ARCH-reports.feature     | 1    | @id=ARCH-reports\nFeature: Reports                                                                                                                                            |
        | link-syntax           | error    | specs/reports.feature          | 1    | @id=reports @maturity:ready\nFeature: Reports                                                                                                                                 |
        | tag-syntax            | error    | specs/reports.feature          | 1    | @id=reports @uses:A,B\nFeature: Reports                                                                                                                                       |
        | tag-syntax            | error    | specs/reports.feature          | 1    | @id=reports @owner=a@b.c\nFeature: Reports                                                                                                                                    |
        | tag-syntax            | error    | specs/reports.feature          | 1    | @id=reports #later @uses:billing\nFeature: Reports                                                                                                                            |
        | declaration-conflict  | warning  | src/billing.py                 | 2    | # @sdp is ARCH-billing owner=payments\n# @sdp is ARCH-billing owner=finance\nclass Billing: pass                                                                              |
        | derived-attribute     | error    | specs/reports.feature          | 1    | @id=reports @stage=verified\nFeature: Reports                                                                                                                                 |
        | gherkin-syntax        | error    | specs/reports.feature          | 7    | @id=reports\nFeature: Reports\n  Rule: R\n    Scenario: Rows\n      Given the rows:\n        \| a \| b \|\n        \| c \|                                                    |
        | description-comment   | warning  | specs/reports.feature          | 4    | @id=reports\nFeature: Reports\n  Why:\n  # not read\n  because.                                                                                                               |
        | description-comment   | warning  | specs/reports.feature          | 3    | @id=reports\nFeature: Reports\n  # Why\n  Because.                                                                                                                         |
        | scenario-empty        | warning  | specs/reports.feature          | 4    | @id=reports\nFeature: Reports\n  Rule: R\n    Scenario: Nothing yet                                                                                                           |
        | background-empty      | warning  | specs/reports.feature          | 3    | @id=reports\nFeature: Reports\n  Background: the team asked for it.\n  Rule: R                                                                                             |
        | prose-step            | warning  | specs/reports.feature          | 6    | @id=reports\nFeature: Reports\n  Rule: R\n    Scenario: S\n      Then it is empty\n      Then the reason is the refund rule.                                                |
        | scenario-outside-rule | error    | specs/reports.feature          | 3    | @id=reports\nFeature: Reports\n  Scenario: S\n    Then it works                                                                                                               |
        | untested-feature      | error    | specs/reports.feature          | 1    | @id=reports\nFeature: Reports                                                                                                                                                 |
        | untested-rule         | error    | specs/reports.feature          | 3    | @id=reports\nFeature: Reports\n  Rule: R                                                                                                                                      |
        | replacement           | error    | specs/reports.feature          | 3    | @id=reports @maturity=idea\nFeature: Reports\n  @replaces:reports\n  Rule: R                                                                                                  |
        | question-example      | error    | specs/reports.feature          | 5    | @id=reports @maturity=idea\nFeature: Reports\n  @open\n  Rule: Mailed too?\n    Scenario: Mail\n      Then a mail is sent                                                     |
        | decision-shape        | warning  | specs/monthly-releases.feature | 4    | @id=monthly-releases @kind=decision\nFeature: Monthly releases\n  Not weekly, because a release takes a week to test.\n  Rule: Consequences                                   |
        | template-placeholder  | warning  | specs/monthly-releases.feature | 3    | @id=monthly-releases @kind=decision\nFeature: Monthly releases\n  Not <what a reasonable person would have chosen>, because <why>, at the cost of <what is accepted with it>. |
        | plan-reference        | warning  | specs/reports.feature          | 1    | @id=reports @iteration:reports\nFeature: Reports                                                                                                                              |
        | maturity-on-no-work   | warning  | specs/reports.feature          | 1    | @id=reports @kind=risk @maturity=idea\nFeature: Reports                                                                                                                       |
      | not-a-kind            | error    | specs/reports.feature          | 1    | @id=reports @kind=idea\nFeature: Reports                                                                                                                                      |
        | plan-date             | warning  | specs/IT-beta.feature          | 1    | @id=IT-beta @kind=iteration @start=2026-11-16 @end=2026-11-31\nFeature: Beta                                                                                                  |
        | plan-date             | warning  | specs/IT-beta.feature          | 1    | @id=IT-beta @kind=iteration @start=2026-11-16\nFeature: Beta                                                                                                                  |
        | milestone-met         | warning  | specs/MS-beta.feature          | 1    | @id=MS-beta @met=2026-02-30\nFeature: Beta                                                                                                                                    |
        | annotation-ignored    | warning  | src/cart.py                    | 1    | total = 0  # @sdp implements cart                                                                                                                                             |
        | annotation-unreadable | warning  | src/cart.ts                    | 2    | // @sdp implements cart\nexport const total = ( => 0                                                                                                                          |
        | return-type           | warning  | src/cart.ts                    | 2    | // @sdp is ARCH-cart\nexport const total = (lines: Array<number>) => lines.length                                                                                             |
        | step-unreadable       | warning  | specs/steps/cart.steps.ts      | 3    | import { defineSteps } from "sdp/steps"\nexport default defineSteps(() => ({}), ({ Given }) => {\n  Given(cart, () => {})\n})                                                 |
        | step-expression       | error    | specs/steps/cart.steps.ts      | 3    | import { defineSteps } from "sdp/steps"\nexport default defineSteps(() => ({}), ({ Given }) => {\n  Given("a cart of {items}", () => {})\n})                                  |
        | step-expression       | error    | specs/steps/cart.steps.ts      | 3    | import { defineSteps } from "sdp/steps"\nexport default defineSteps(() => ({}), ({ Given }) => {\n  Given(/a (cart of items/, () => {})\n})                                   |

    Scenario Outline: A path the globs match that is no file sdp can read: <what>
      Given a file "src/cart.ts" containing:
        """
        export const lamps = 1
        """
      When I run "<made by>"
      Then the exit code is 0
      When I run "sdp check --severity error --json --base none"
      Then the exit code is 1
      And the JSON output has:
        | data.rule     | not-a-file |
        | data.severity | error      |
        | data.file     | src/<file> |
        | data.line     | 1          |
      When I run "sdp q code --ids"
      Then the exit code is 2
      And the output contains "not read: src/<file>:1 [not-a-file]"

      Examples:
        | what              | made by                      | file    |
        | a link to nothing | ln -s nowhere.ts src/gone.ts | gone.ts |
        | a named pipe      | mkfifo src/pipe.ts           | pipe.ts |

    Scenario Outline: A path the globs match that sdp may not read: <what>
      Given a file "src/locked.ts" containing:
        """
        export const lamps = 1
        """
      And a file "src/closed/lamps.ts" containing:
        """
        export const lamps = 1
        """
      When I run the pipeline:
        """
        chmod 000 src/<path>
        sdp check --severity error --json --base none
        status=$?
        chmod 755 src/<path>
        exit $status
        """
      Then the exit code is 1
      And the JSON output has:
        | data.rule     | not-a-file |
        | data.severity | error      |
        | data.file     | src/<path> |
        | data.line     | 1          |
      And the output contains "src/<path> is <what>"

      Examples:
        | what                         | path      |
        | a file sdp may not read      | locked.ts |
        | a directory sdp may not list | closed    |

    Scenario: The smallest workspace that breaks import-unresolved: code that imports what no package.json declares
      Given a file "src/cart.ts" containing:
        """
        import { Effect } from "effect"

        /** @sdp is ARCH-cart */
        export const total = (): number => 0
        """
      When the workspace is checked
      Then sdp reports at least:
        | rule              | severity | at            |
        | import-unresolved | warning  | src/cart.ts:1 |

    Scenario: The smallest workspace that breaks import-config-outside: a tsconfig.json that extends one outside the repository
      Given a file "tsconfig.base.json" containing:
        """
        {}
        """
      And a file "shop/tsconfig.json" containing:
        """
        { "extends": "../tsconfig.base.json" }
        """
      And a file "shop/src/line.ts" containing:
        """
        export const line = 1
        """
      And a file "shop/src/cart.ts" containing:
        """
        import { line } from "./line.ts"

        /** @sdp is ARCH-cart */
        export const total = (): number => line
        """
      And the files are in no git repository
      When I run "sdp check --base none --json" in "shop"
      Then the exit code is 0
      And the JSON output has:
        | data.rule     | import-config-outside |
        | data.severity | info                  |
        | data.file     | tsconfig.json         |
        | data.line     | 1                     |

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

  Rule: Live work has a live rule, so that what it says is built is tested

    Work — a feature, any kind a discipline names, or what an activity tag plans — that
    declares no maturity says it is built, and stays so: work whose rules are all still to come is
    still to come itself. A node of a kind that is no work, such as a glossary, says what there is.

    Scenario Outline: Work whose rules are <case>
      Given a file "specs/export-to-csv.feature" containing:
        """
        <tags>
        Feature: Export to CSV

          Analysts want data in Excel.

          <rule>
        """
      When the workspace is checked
      Then sdp reports "<reported>"

      Examples:
        | case                              | tags                                          | rule                                                                   | reported         |
        | none                              | @id=export-to-csv                             |                                                                        | untested-feature |
        | still to come                     | @id=export-to-csv                             | @maturity=draft\nRule: Every row is exported                           | untested-feature |
        | a question                        | @id=export-to-csv                             | @open\nRule: Are archived rows exported too?                           | untested-feature |
        | live, with an example             | @id=export-to-csv                             | Rule: Every row is exported\n  Scenario: Export\n    Then I get a file | nothing          |
        | still to come, as the feature     | @id=export-to-csv @maturity=draft             | Rule: Every row is exported                                            | nothing          |
        | none, in a node of another kind   | @id=terms @kind=glossary                      |                                                                        | nothing          |
        | none, in an environment           | @id=staging @kind=environment                 |                                                                        | untested-feature |
        | none, in a vision                 | @id=purpose @kind=vision                      |                                                                        | untested-feature |
        | still to come, as the environment | @id=staging @kind=environment @maturity=draft |                                                                        | nothing          |

    Scenario: The feature without a live rule, at its Feature line
      Given a file "specs/export-to-csv.feature" containing:
        """
        @id=export-to-csv
        Feature: Export to CSV

          @maturity=draft
          Rule: Archived rows are exported too
        """
      When the workspace is checked
      Then sdp reports:
        | rule             | at                            | message                                        | hint                                                                                                                                  |
        | untested-feature | specs/export-to-csv.feature:1 | export-to-csv is live, so it needs a live rule | write a Rule with an example under it; while its rules are still to come, declare a maturity above `Feature:`, such as @maturity=idea |

  @decided-by:declared-maturity-derived-stage
  Rule: A maturity is the team's judgement, and check reads no criterion into its rung nor the content behind it

    How far work still to come has come is for the team to say, and for a gate of its own to hold
    to a Definition of Ready: a placeholder paragraph with a token scenario would meet any criterion
    sdp could check. Any rung, written once or twice, says that the work is still to come.

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
        | idea                 |
        | idea @maturity=ready |

  Rule: A maturity is a rung of the workspace's ladder, and any other word is an error

    A live test declares no maturity, and any maturity makes work still to come, so a word that is
    no rung would switch its examples off in silence. sdp reads no meaning into a rung, so it cannot
    tell a word for built work from a slip: it holds every maturity to the ladder, as written.

    Scenario Outline: <case>, on <on>
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
        | rule                | severity | node | at                        | message   | hint   |
        | maturity-off-ladder | error    | <id> | specs/cart.feature:<line> | <message> | <hint> |

      Examples:
        | case                       | on        | feature's | rule's   | line | id                               | message                                                                                    | hint                                                                                                                                         |
        | a word for built work      | a feature | Done      | ready    | 1    | cart                             | cart declares @maturity=Done, which is no rung of the ladder idea, draft, specified, ready | write a rung of the ladder, or add Done to it under vocabulary.maturity; if the work is built, delete it: what is built declares no maturity |
        | a word for built work      | a rule    | draft     | passing  | 6    | cart#a-cart-holds-what-was-added | @maturity=passing, which is no rung of the ladder                                          | add passing to it under vocabulary.maturity; if the work is built, delete it                                                                 |
        | a word of another language | a feature | fertig    | draft    | 1    | cart                             | @maturity=fertig, which is no rung of the ladder                                           | add fertig to it under vocabulary.maturity                                                                                                   |
        | a stage                    | a rule    | ready     | verified | 6    | cart#a-cart-holds-what-was-added | @maturity=verified, which is no rung of the ladder                                         | sdp derives verified from the run; delete it                                                                                                 |
        | a word off the ladder      | a feature | someday   | idea     | 1    | cart                             | @maturity=someday, which is no rung of the ladder                                          | add someday to it under vocabulary.maturity                                                                                                  |
        | a rung in another case     | a rule    | idea      | Ready    | 6    | cart#a-cart-holds-what-was-added | @maturity=Ready, which is no rung of the ladder                                            | write ready, as the ladder does                                                                                                              |

  @decided-by:free-vocabulary
  Rule: A kind named like a rung of the ladder or a stage, or the kind sdp retired, is an error where it is written, as sdp new refuses it

    How far work has come is its maturity, never its kind, and a change is rules of the feature it
    changes: a spec of such a kind is no work, and never the feature that was meant. Any other kind
    is the authors' word, and so is one of these that the workspace names as a kind of its own.

    Scenario Outline: @kind=<kind>, <case>
      Given a file "sdp.config.yaml" containing:
        """
        <config>
        """
      And a file "specs/gift-wrapping.feature" containing:
        """
        @id=gift-wrapping @kind=<kind>
        Feature: Gift wrapping

          Shoppers want gifts wrapped.
        """
      When the workspace is checked
      Then sdp reports:
        | rule       | severity | node          | at                            | message   | hint   |
        | not-a-kind | error    | gift-wrapping | specs/gift-wrapping.feature:1 | <message> | <hint> |

      Examples:
        | kind     | case                                 | config                                     | message                                                           | hint                                                                                                     |
        | idea     | the first rung                       | # every key at its default                 | gift-wrapping declares @kind=idea: idea is a maturity, not a kind | write @maturity=idea in its place: the spec is then a feature at idea                                    |
        | agreed   | a rung of a ladder of the team's own | vocabulary: { maturity: [sketch, agreed] } | agreed is a maturity, not a kind                                  | write @maturity=agreed in its place                                                                      |
        | verified | a stage                              | # every key at its default                 | verified is a stage sdp derives from the run, not a kind          | delete it: what is built is a live feature, whose stage sdp derives from its run                         |
        | change   | the kind sdp retired                 | # every key at its default                 | a change is rules of the feature it changes, not a kind           | write each as a `Rule:` in that feature's file, with @maturity=<rung> above it while it is still to come |

    Scenario Outline: @kind=<kind>, <case>, is the authors' word
      Given a file "sdp.config.yaml" containing:
        """
        <config>
        """
      And a file "specs/gift-wrapping.feature" containing:
        """
        @id=gift-wrapping @kind=<kind>
        Feature: Gift wrapping

          Shoppers want gifts wrapped.
        """
      When the workspace is checked
      Then sdp reports nothing

      Examples:
        | kind   | case                                          | config                                     |
        | done   | a word for built work                         | # every key at its default                 |
        | idea   | no rung of a ladder of the team's own         | vocabulary: { maturity: [sketch, agreed] } |
        | change | in a workspace with a kind of that name       | vocabulary: { words: { kinds: [change] } } |
        | change | in a workspace that gives its ids a prefix    | ids: { change: CHG }                       |

  Rule: Nothing live stops being live without an error

    Built work cannot go back to work still to come, or a test is turned off in silence, so check
    compares the specs with a base revision: a maturity or `@open` on a Feature or a Rule that was
    live there is an error, whatever its examples were, and so is a live example of the base that is
    gone, a gate or still to come, for neither fails a run.

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

          Rule: A cart is kept for a week

            @gate
            Scenario: Come back after a day
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
        | data.line | <line>     |

      Examples:
        | change                                                | exit code | reported                          | line    | cart                                                                                                                                                                                                                                                              |
        | A maturity on the live feature                        | 1         | demotion                          | 1       | @id=cart @maturity=ready\nFeature: Cart\n  Rule: A cart holds what was added\n    Scenario: Add an item\n      Then the cart holds 1 item                                                                                                                         |
        | A maturity on the live rule                           | 1         | demotion, untested-feature        | 3, 1    | @id=cart\nFeature: Cart\n  @maturity=draft\n  Rule: A cart holds what was added\n    Scenario: Add an item\n      Then the cart holds 1 item                                                                                                                      |
        | The live rule made a question                         | 1         | demotion, untested-feature        | 4, 1    | @id=cart\nFeature: Cart\n  @open\n  Rule: A cart holds what was added                                                                                                                                                                                             |
        | A maturity on the live rule whose example is a gate   | 1         | demotion                          | 6       | @id=cart\nFeature: Cart\n  Rule: A cart holds what was added\n    Scenario: Add an item\n      Then the cart holds 1 item\n  @maturity=draft\n  Rule: A cart is kept for a week\n    @gate\n    Scenario: Come back after a day\n      Then the cart holds 1 item |
        | The live example deleted                              | 1         | example-dropped, untested-rule    | 3, 8    | @id=cart\nFeature: Cart\n  Rule: A cart holds what was added                                                                                                                                                                                                      |
        | The live rule deleted with its example                | 1         | example-dropped, untested-feature | 8, 1    | @id=cart\nFeature: Cart\n  @maturity=ready\n  Rule: A cart holds each item once\n    Scenario: Add a lamp twice\n      Then the cart holds 1 lamp                                                                                                                 |
        | The live example made a gate                          | 1         | example-dropped                   | 5       | @id=cart\nFeature: Cart\n  Rule: A cart holds what was added\n    @gate\n    Scenario: Add an item\n      Then the cart holds 1 item                                                                                                                              |
        | The live example moved under the rule still to come   | 1         | example-dropped, untested-rule    | 3, 6    | @id=cart\nFeature: Cart\n  Rule: A cart holds what was added\n  @maturity=ready\n  Rule: A cart holds each item once\n    Scenario: Add an item\n      Then the cart holds 1 item                                                                                 |
        | The live rule whose example is a gate deleted with it | 0         | nothing                           | nothing | @id=cart\nFeature: Cart\n  Rule: A cart holds what was added\n    Scenario: Add an item\n      Then the cart holds 1 item\n  @maturity=ready\n  Rule: A cart holds each item once\n    Scenario: Add a lamp twice\n      Then the cart holds 1 lamp               |
        | The rule still to come built                          | 0         | nothing                           | nothing | @id=cart\nFeature: Cart\n  Rule: A cart holds what was added\n    Scenario: Add an item\n      Then the cart holds 1 item\n  Rule: A cart holds each item once\n    Scenario: Add a lamp twice\n      Then the cart holds 1 lamp                                  |
        | The rule still to come deleted with its example       | 0         | nothing                           | nothing | @id=cart\nFeature: Cart\n  Rule: A cart holds what was added\n    Scenario: Add an item\n      Then the cart holds 1 item                                                                                                                                         |

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
      And the output contains ", is gone, and nothing that replaces cart#a-cart-holds-what-was-added is live with a new live example  specs/cart.feature:8"
      And the output contains "write what replaces cart#a-cart-holds-what-was-added, `@replaces:cart#a-cart-holds-what-was-added`, with a new live example of its own"

  Rule: An example keeps its test under a new name or in a new place, or with new steps under its name, and another takes it over only by naming it

    A test is what a reader would call the same example, each row of an outline on its own, so one
    that is gone is not made up for by another that tests the same.

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

          Rule: A cart is kept for a week

            @gate
            Scenario: Come back after a day
              Then the cart holds 1 item
        """
      And the files are committed on the branch "main"

    Scenario Outline: A live example changed: <change>
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
        | change                                                | exit code | reported        | line    | cart                                                                                                                                                     |
        | The live example and its rule renamed                 | 0         | nothing         | nothing | @id=cart\nFeature: Cart\n  Rule: A cart keeps what was added\n    Scenario: Add a lamp\n      Then the cart holds 1 item                                 |
        | The live example's steps edited                       | 0         | nothing         | nothing | @id=cart\nFeature: Cart\n  Rule: A cart holds what was added\n    Scenario: Add an item\n      Given an empty cart\n      Then the cart holds 1 item     |
        | The live example renamed, its steps edited, it named  | 0         | nothing         | nothing | @id=cart\nFeature: Cart\n  Rule: A cart holds what was added\n    @replaces:cart#add-an-item\n    Scenario: Add a lamp\n      Then the cart holds 1 lamp |
        | The live example renamed, its steps edited, not named | 1         | example-dropped | 8       | @id=cart\nFeature: Cart\n  Rule: A cart holds what was added\n    Scenario: Add a lamp\n      Then the cart holds 1 lamp                                 |

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

    Scenario Outline: Two live examples merged into one that names <named>
      Given a file "specs/cart.feature" containing:
        """
        @id=cart
        Feature: Cart

          Rule: A cart holds what was added

            Scenario: Add a lamp
              Then the cart holds a lamp

            Scenario: Add a desk
              Then the cart holds a desk
        """
      And the files are committed on the branch "main"
      And a file "specs/cart.feature" containing:
        """
        @id=cart
        Feature: Cart

          Rule: A cart holds what was added

            <tags>
            Scenario: Add a lamp and a desk
              Then the cart holds a lamp and a desk
            <gate>
        """
      When I run "sdp check --json"
      Then the exit code is <exit code>
      And the JSON output has:
        | data.rule | <reported> |
        | data.node | <dropped>  |

      Examples:
        | named                                | tags                                                | gate                                                                                         | exit code | reported        | dropped         |
        | both of them                         | @replaces:cart#add-a-lamp @replaces:cart#add-a-desk |                                                                                              | 0         | nothing         | nothing         |
        | one of them                          | @replaces:cart#add-a-lamp                           |                                                                                              | 1         | example-dropped | cart#add-a-desk |
        | both of them, and a gate one of them | @replaces:cart#add-a-lamp @replaces:cart#add-a-desk | \n@gate @replaces:cart#add-a-desk\nScenario: A desk is delivered\n  Then a desk is delivered | 0         | nothing         | nothing         |

  Rule: What replaces a live rule or feature takes over its examples only when it is live with a new live example of its own

    A gate enforces nothing, work still to come fails no run, and a test the base already had — steps
    a live example had there, whatever it is named now — takes over no other.

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

          Rule: A cart is kept for a week

            @gate
            Scenario: Come back after a day
              Then the cart holds 1 item
        """
      And the files are committed on the branch "main"

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
        | replacement                                   | exit code | reported                          | cart                                                                                                                                                                                                                                                                                                                                     | basket                                                                                                                                                               |
        | a live rule                                   | 0         | nothing                           | @id=cart\nFeature: Cart\n  @replaces:cart#a-cart-holds-what-was-added\n  Rule: A cart holds what was added, once\n    Scenario: Add an item once\n      Then the cart holds 1 item once\n                                                                                                                                                | @id=basket @maturity=idea\nFeature: Basket                                                                                                                           |
        | a rule whose example is a gate                | 1         | example-dropped                   | @id=cart\nFeature: Cart\n  @replaces:cart#a-cart-holds-what-was-added\n  Rule: A cart holds what was added, once\n    @gate\n    Scenario: Add an item once\n      Then the cart holds 1 item once\n                                                                                                                                     | @id=basket @maturity=idea\nFeature: Basket                                                                                                                           |
        | a rule whose examples are gated rows          | 1         | example-dropped                   | @id=cart\nFeature: Cart\n  @replaces:cart#a-cart-holds-what-was-added\n  Rule: A cart holds what was added, once\n    Scenario Outline: Add <count> once\n      Then the cart holds <count> once\n      @gate\n      Examples:\n        \| count \|\n        \| 1 item \|\n                                                              | @id=basket @maturity=idea\nFeature: Basket                                                                                                                           |
        | a rule with an ordinary row and a gated one   | 0         | nothing                           | @id=cart\nFeature: Cart\n  @replaces:cart#a-cart-holds-what-was-added\n  Rule: A cart holds what was added, once\n    Scenario Outline: Add <count> once\n      Then the cart holds <count> once\n      Examples:\n        \| count \|\n        \| 2 items \|\n      @gate\n      Examples:\n        \| count \|\n        \| 1 item \|\n | @id=basket @maturity=idea\nFeature: Basket                                                                                                                           |
        | a rule that names another                     | 1         | example-dropped, replaces-nothing | @id=cart\nFeature: Cart\n  @replaces:cart#a-cart-holds-all\n  Rule: A cart holds what was added, once\n    Scenario: Add an item once\n      Then the cart holds 1 item once\n                                                                                                                                                           | @id=basket @maturity=idea\nFeature: Basket                                                                                                                           |
        | a feature, the cart gone                      | 0         | nothing                           | # Cart is now the basket.                                                                                                                                                                                                                                                                                                                | @id=basket @replaces:cart\nFeature: Basket\n  \n  Rule: A basket holds what was added\n    Scenario: Add an item to the basket\n      Then the basket holds 1 item\n |
        | a rule of another feature that names the cart | 0         | nothing                           | # Cart is now the basket.                                                                                                                                                                                                                                                                                                                | @id=basket\nFeature: Basket\n  @replaces:cart\n  Rule: A basket holds what was added\n    Scenario: Add an item to the basket\n      Then the basket holds 1 item\n  |

    Scenario Outline: A live rule deleted, and named as replaced by <replacement>
      Given a file "specs/cart.feature" containing:
        """
        @id=cart
        Feature: Cart

          Rule: A cart holds what was added

            Scenario: Add an item
              Then the cart holds 1 item

          Rule: A cart has a total

            Scenario: The total of one item
              Then the total is the item's price
        """
      And the files are committed on the branch "main"
      And a file "specs/cart.feature" containing:
        """
        @id=cart <feature>
        Feature: Cart

          <rule>
          Rule: A cart has a total

            Scenario: The total of one item
              Then the total is the item's price
            <example>
        """
      When I run "sdp check --json"
      Then the exit code is <exit code>
      And the JSON output has:
        | data.rule | <reported> |

      Examples:
        | replacement                                  | feature                                    | rule                                       | example                                                                                 | exit code | reported                     |
        | its own feature                              | @replaces:cart#a-cart-holds-what-was-added |                                            |                                                                                         | 1         | example-dropped, replacement |
        | a rule whose example the base had live       |                                            | @replaces:cart#a-cart-holds-what-was-added |                                                                                         | 1         | example-dropped              |
        | a rule with an example the base did not have |                                            | @replaces:cart#a-cart-holds-what-was-added | \n    Scenario: The total of two items\n      Then the total is the sum of their prices | 0         | nothing                      |

    Scenario Outline: A live rule of two examples replaced by a rule whose one example names <named>
      Given a file "specs/cart.feature" containing:
        """
        @id=cart
        Feature: Cart

          Rule: A cart holds what was added

            Scenario: Add an item
              Then the cart holds 1 item

            Scenario: Add a lamp
              Then the cart holds a lamp
        """
      And the files are committed on the branch "main"
      And a file "specs/cart.feature" containing:
        """
        @id=cart
        Feature: Cart

          @replaces:cart#a-cart-holds-what-was-added
          Rule: A cart holds what was put in it

            <tags>
            Scenario: Put an item in
              Then <then>
        """
      When I run "sdp check --json"
      Then the exit code is <exit code>
      And the JSON output has:
        | data.rule | <reported> |
        | data.node | <dropped>  |

      Examples:
        | named                               | tags                       | then                           | exit code | reported        | dropped         |
        | neither                             |                            | the cart holds the item put in | 0         | nothing         | nothing         |
        | the one it was                      | @replaces:cart#add-an-item | the cart holds the item put in | 0         | nothing         | nothing         |
        | the one it was, its steps unchanged | @replaces:cart#add-an-item | the cart holds 1 item          | 1         | example-dropped | cart#add-a-lamp |

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
        | replacement                                    | tags            | exit code | reported                          |
        | is built in the change that deletes it         |                 | 0         | nothing                           |
        | is still to come in the change that deletes it | @maturity=ready | 1         | example-dropped, untested-feature |

    Scenario: A rule named as replaced that the base has no more
      Given a file "specs/cart.feature" containing:
        """
        @id=cart
        Feature: Cart
          Rule: A cart holds what was added
            Scenario: Add an item
              Then the cart holds 1 item
          @replaces:cart#a-cart-holds-all
          Rule: A cart holds what was added, once
            Scenario: Add an item once
              Then the cart holds 1 item once
        """
      When I run "sdp check --json"
      Then the exit code is 0
      And the JSON output has:
        | data.rule | replaces-nothing |
        | data.line | 6                |
      And the output contains "if it means cart#a-cart-is-kept-for-a-week, built at the base, write `@replaces:cart#a-cart-is-kept-for-a-week`; if not, delete `@replaces:cart#a-cart-holds-all`"

    Scenario Outline: A link that replaces nothing, <case>
      Given a file "specs/cart.feature" containing:
        """
        @id=cart
        Feature: Cart
          Rule: A cart holds what was added
            Scenario: Add an item
              Then the cart holds 1 item
          @replaces:<replaced>
          Rule: A cart holds what was added, once
            Scenario: Add an item once
              Then the cart holds 1 item once
        """
      And the files are committed on the branch "<branch>"
      When I run "sdp check"
      Then the exit code is 0
      And the output contains "<hint>"

      Examples:
        | case                     | replaced                         | branch | hint                                                                                     |
        | named in another feature | basket#a-cart-is-kept-for-a-week | change | has it, or delete `@replaces:basket#a-cart-is-kept-for-a-week`                           |
        | that the base has too    | cart#a-cart-holds-all            | main   | has the link too, so the replacement is merged: delete `@replaces:cart#a-cart-holds-all` |

  Rule: The specs of the base are those its own configuration finds in it, and what of them sdp cannot read makes the answer incomplete

    The base is read as it was configured and today's specs as today's configuration says, so a live
    test that a configuration leaves out is dropped like any other. What of its specs sdp cannot read
    there may be a test turned off, and a link git cannot follow is one wherever the walk would take
    it for a file or a directory — a glob that matches it, an exclusion of directories alone; what its
    globs do not reach, such as a link `**` passes over, is none of them.

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

          Rule: A cart is kept for a week

            @gate
            Scenario: Come back after a day
              Then the cart holds 1 item
        """
      And the files are committed on the branch "main"

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

    Scenario Outline: The specs of the base are those its configuration finds there: <case>
      Given a file "<configuration file>" containing:
        """
        <configuration>
        """
      And a file "specs/archive/old-cart.feature" containing:
        """
        @id=old-cart
        Feature: Old cart

          Rule: An old cart holds what was added

            Scenario: Add an old item
              Then the cart holds 1 item
        """
      And the files are committed on the branch "main"
      When I run the pipeline:
        """
        rm specs/cart.feature && <command>
        """
      Then the exit code is <exit code>
      And the JSON output has:
        | complete  | <complete> |
        | data.node | <dropped>  |

      Examples:
        | case                                       | configuration file  | configuration                                    | command                 | exit code | complete | dropped          |
        | a features glob out of the workspace       | app/sdp.config.yaml | features: ["../specs/**/*.feature"]              | sdp -C app check --json | 1         | true     | cart#add-an-item |
        | an excluded directory                      | sdp.config.yaml     | exclude: ["specs/archive"]                       | sdp check --json        | 1         | true     | cart#add-an-item |
        | a features glob out of the repository      | sdp.config.yaml     | features: ["specs/**/*.feature", "../*.feature"] | sdp check --json        | 1         | false    | cart#add-an-item |
        | a features glob in another case than git's | sdp.config.yaml     | features: ["Specs/**/*.feature"]                 | sdp check --json        | 2         | false    | nothing          |

    Scenario Outline: The configuration of the base is <case>
      Given a file ".gitignore" containing:
        """
        untracked.yaml
        """
      And a file "untracked.yaml" containing:
        """
        # every key at its default
        """
      When I run the pipeline:
        """
        <configuration>
        """
      Then the exit code is 0
      Given the files are committed on the branch "main"
      When I run "sdp check --json"
      Then the exit code is <exit code>
      And the JSON output has:
        | complete | <complete> |
      And the output contains "<reason>"

      Examples:
        | case                               | configuration                                       | exit code | complete | reason                                                                                                       |
        | a link to a file git does not hold | ln -s untracked.yaml sdp.config.yaml                | 2         | false    | its sdp.config.yaml is a link to no file git holds                                                           |
        | a link out of the repository       | ln -s /nowhere/sdp.config.yaml sdp.config.yaml      | 2         | false    | its sdp.config.yaml is a link to no file git holds                                                           |
        | a file named in another case       | echo '# every key at its default' > SDP.config.yaml | 2         | false    | its sdp.config.yaml is SDP.config.yaml, which a file system that ignores case reads for it, and git does not |

    Scenario Outline: A link out of the repository or in a circle at the base, <case>
      When I run the pipeline:
        """
        <links>
        """
      Then the exit code is 0
      Given the files are committed on the branch "main"
      When I run "sdp check --json"
      Then the exit code is <exit code>
      And the JSON output has:
        | complete | <complete> |

      Examples:
        | case                                          | links                                                                                                      | exit code | complete |
        | where the specs are                           | mkdir tools && ln -s ../../shared-config tools/shared && ln -s self self                                   | 0         | true     |
        | a configuration file sdp reads only after one | echo '# every key at its default' > sdp.config.yaml && ln -s /nowhere/sdp.config.json sdp.config.json      | 0         | true     |
        | that a features glob names                    | echo 'features: ["specs/**/*.feature", "shared/*.feature"]' > sdp.config.yaml && ln -s ../elsewhere shared | 2         | false    |

    Scenario Outline: A submodule at the base, <case>
      Given a file "lib/specs/lib.feature" containing:
        """
        @id=lib
        Feature: Lib

          Rule: A lib works

            Scenario: It works
              Then it works
        """
      When I run the pipeline:
        """
        cd lib && git init -q && git add -A && git -c user.name=sdp -c user.email=sdp@example.com -c commit.gpgsign=false commit -qm lib
        """
      Then the exit code is 0
      Given the files are committed on the branch "main"
      When I run the pipeline:
        """
        <change> && sdp check --json
        """
      Then the exit code is <exit code>
      And the JSON output has:
        | complete  | <complete> |
        | data.node | <dropped>  |
      And the output contains "<note>"

      Examples:
        | case                                  | change                                                                                                                                                         | exit code | complete | dropped      | note                                                                                                                        |
        | checked out                           | true                                                                                                                                                           | 0         | true     | nothing      | note: live tests compared with the base                                                                                     |
        | checked out, its live example deleted | rm lib/specs/lib.feature                                                                                                                                       | 1         | true     | lib#it-works | note: live tests compared with the base                                                                                     |
        | not checked out                       | rm -rf lib && mkdir lib                                                                                                                                        | 2         | false    | nothing      | is a submodule that is not checked out here (check it out with git submodule update --init lib, and fetch the base's commit |
        | checked out without the base's commit | rm -rf lib/.git && cd lib && git init -q && git add -A && git -c user.name=sdp -c user.email=sdp@example.com -c commit.gpgsign=false commit -qm other && cd .. | 2         | false    | nothing      | is a submodule whose repository here lacks the base's commit                                                                |

    Scenario: A spec deleted, from a workspace whose directory's name starts with a space
      Given a file " app/sdp.config.yaml" containing:
        """
        features: ["../specs/**/*.feature"]
        """
      And the files are committed on the branch "main"
      When I run the pipeline:
        """
        rm specs/cart.feature && sdp -C " app" check --json
        """
      Then the exit code is 1
      And the JSON output has:
        | complete  | true             |
        | data.node | cart#add-an-item |

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

    Scenario: A spec that is a symbolic link to a file the globs miss, deleted
      When I run the pipeline:
        """
        mkdir shared && mv specs/cart.feature shared/cart.txt && ln -s ../shared/cart.txt specs/cart.feature
        """
      Then the exit code is 0
      Given the files are committed on the branch "main"
      When I run the pipeline:
        """
        rm specs/cart.feature shared/cart.txt && sdp check --json
        """
      Then the exit code is 1
      And the JSON output has:
        | data.rule | example-dropped |
        | data.node | cart#add-an-item |

    Scenario Outline: A spec that is a link out of the repository, deleted, <case>
      Given a file "sdp.config.yaml" containing:
        """
        exclude: ["<excluded>"]
        """
      When I run the pipeline:
        """
        ln -s /nowhere/basket.feature specs/basket.feature
        """
      Then the exit code is 0
      Given the files are committed on the branch "main"
      When I run the pipeline:
        """
        rm specs/basket.feature && sdp check --json
        """
      Then the exit code is <exit code>
      And the JSON output has:
        | complete | <complete> |

      Examples:
        | case                               | excluded             | exit code | complete |
        | beside an exclusion of directories | **/*.feature/        | 2         | false    |
        | excluded whatever it is            | specs/basket.feature | 0         | true     |

    Scenario: A spec that is a link that leads to no file, deleted
      When I run the pipeline:
        """
        ln -s nowhere.feature specs/basket.feature
        """
      Then the exit code is 0
      Given the files are committed on the branch "main"
      When I run the pipeline:
        """
        rm specs/basket.feature && sdp check
        """
      Then the exit code is 2
      And the output contains "not compared: specs/basket.feature at the base"
      And the output contains "is a link that leads to no file, so git holds none of what the configuration finds there"

    Scenario Outline: A file of the base that <case>, deleted
      Given a file "specs/basket.feature" containing:
        """
        <basket>
        """
      And the files are committed on the branch "main"
      When I run the pipeline:
        """
        rm specs/basket.feature && sdp check --json
        """
      Then the exit code is <exit code>
      And the JSON output has:
        | complete | <complete> |

      Examples:
        | case                 | basket                                                                                                                   | exit code | complete |
        | does not parse       | @id=basket\nFeature: Basket\n  Rule: R\n    Scenario: Rows\n      Given the rows:\n        \| a \| b \|\n        \| c \| | 2         | false    |
        | holds only a comment | # Basket is now the cart.                                                                                                | 0         | true     |

  Rule: The base is where HEAD meets the default branch, or the revision --base or the configuration names; without one, check's answer is incomplete

    A change is judged against what it started from, not against whatever the default branch has
    become since. The default branch is origin's HEAD, else main, else master. Outside git, before
    the first commit, in a clone without the history, or without a default branch there is nothing
    to compare: a check that compared nothing may have missed a test turned off, so it exits with 2,
    as every answer that may miss something does, unless the comparison is waived with `--base none`
    or `base: none`. A base that is named and cannot be read stops the check. The base a change
    names in its own configuration is believed: the comparison guards against a live test turned off
    as a side effect, while a change to `base:`, like one to the build script, is a decision in the
    diff its reviewer reads; CI that must hold every change names the base with `--base`, which wins
    over the configuration.

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
      When I run the pipeline:
        """
        <command>
        """
      Then the exit code is <exit code>
      And the output line with "note:" contains "<compared>"

      Examples:
        | named                                | configuration              | command                   | exit code | compared                               |
        | by nobody                            | # every key at its default | sdp check                 | 1         | (git merge-base HEAD refs/heads/main)  |
        | by nobody, beside a tag named main   | # every key at its default | git tag main && sdp check | 1         | (git merge-base HEAD refs/heads/main)  |
        | with --base                          | # every key at its default | sdp check --base HEAD     | 0         | (git merge-base HEAD HEAD)             |
        | in the configuration                 | base: HEAD                 | sdp check                 | 0         | (git merge-base HEAD HEAD)             |
        | in the configuration, and --base     | base: HEAD                 | sdp check --base main     | 1         | (git merge-base HEAD main)             |

    Scenario: The base of the repository the workspace is in, whatever repository git's variables name
      Given the files are committed on the branch "main"
      When I run "GIT_DIR=$PWD/elsewhere GIT_WORK_TREE=$PWD/elsewhere GIT_INDEX_FILE=$PWD/elsewhere/index sdp check"
      Then the exit code is 0
      And the output line with "note:" contains "(git merge-base HEAD refs/heads/main)"

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
        | case                     | where                                  | reason                                                                                                                   | named                                    |
        | outside git              | in no git repository                   | this workspace is in no git repository                                                                                   | this workspace is in no git repository   |
        | a branch of another name | committed on the branch "trunk"        | the repository has no origin/HEAD, main or master branch                                                                 | git merge-base HEAD main found no commit |
        | nothing committed yet    | not yet committed on the branch "main" | nothing is committed yet; commit, or waive the comparison with the base none (--base on the command line, base over MCP) | nothing is committed yet                 |

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
      And a file "specs/ARCHITECTURE.feature" containing:
        """
        @id=ARCHITECTURE @kind=architecture
        Feature: Architecture

          @decided-by:retire-legacy-billing
          Rule: Nothing new calls legacy billing

            Scenario: No code uses it
              Then the query "code -uses-> #ARCH-legacy-billing" returns no results
        """
      And a file "src/legacy-billing.ts" containing:
        """
        /**
         * Billing as it was before invoices, kept until the last caller is gone.
         *
         * @sdp is ARCH-legacy-billing
         */
        export function bill(): void {}
        """
      And a file "src/invoices.ts" containing:
        """
        // @sdp uses ARCH-legacy-billing
        export function invoice(): void {}
        """
      When the workspace is checked
      Then sdp reports nothing
      When I query "#retire-legacy-billing <-decided-by- rule"
      Then the result is "ARCHITECTURE#nothing-new-calls-legacy-billing"
      When the workspace is run
      Then node "ARCHITECTURE#no-code-uses-it" has attribute status = "failed"

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
        | @owner=                | tag-syntax     | owner has no value                                                 | write @owner=<value>, or @owner alone                   |

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

  @maturity=draft
  Rule: What check reports is computed from the graph, never kept in it

    A problem is what one view says of what was written, not something anyone wrote.
