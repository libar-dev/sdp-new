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
        | declaration-conflict  | warning  | src/billing.py                 | 2    | # @sdp is ARCH-billing owner=payments\n# @sdp is ARCH-billing owner=finance\nclass Billing: pass                                                                              |
        | derived-attribute     | error    | specs/reports.feature          | 1    | @id=reports @stage=verified\nFeature: Reports                                                                                                                                 |
        | gherkin-syntax        | error    | specs/reports.feature          | 7    | @id=reports\nFeature: Reports\n  Rule: R\n    Scenario: Rows\n      Given the rows:\n        \| a \| b \|\n        \| c \|                                                    |
        | description-comment   | warning  | specs/reports.feature          | 3    | @id=reports\nFeature: Reports\n  # Why\n  Because.                                                                                                                            |
        | scenario-empty        | warning  | specs/reports.feature          | 4    | @id=reports\nFeature: Reports\n  Rule: R\n    Scenario: Nothing yet                                                                                                           |
        | background-empty      | warning  | specs/reports.feature          | 3    | @id=reports\nFeature: Reports\n  Background: the team asked for it.\n  Rule: R                                                                                                |
        | prose-step            | warning  | specs/reports.feature          | 6    | @id=reports\nFeature: Reports\n  Rule: R\n    Scenario: S\n      Then it is empty\n      Then the reason is the refund rule.                                                  |
        | scenario-outside-rule | error    | specs/reports.feature          | 3    | @id=reports\nFeature: Reports\n  Scenario: S\n    Then it works                                                                                                               |
        | untested-feature      | error    | specs/reports.feature          | 1    | @id=reports\nFeature: Reports                                                                                                                                                 |
        | untested-rule         | error    | specs/reports.feature          | 3    | @id=reports\nFeature: Reports\n  Rule: R                                                                                                                                      |
        | replacement           | error    | specs/reports.feature          | 3    | @id=reports @maturity=idea\nFeature: Reports\n  @replaces:reports\n  Rule: R                                                                                                  |
        | question-example      | error    | specs/reports.feature          | 5    | @id=reports @maturity=idea\nFeature: Reports\n  @open\n  Rule: Mailed too?\n    Scenario: Mail\n      Then a mail is sent                                                     |
        | decision-shape        | warning  | specs/monthly-releases.feature | 4    | @id=monthly-releases @kind=decision\nFeature: Monthly releases\n  Not weekly, because a release takes a week to test.\n  Rule: Consequences                                   |
        | template-placeholder  | warning  | specs/monthly-releases.feature | 3    | @id=monthly-releases @kind=decision\nFeature: Monthly releases\n  Not <what a reasonable person would have chosen>, because <why>, at the cost of <what is accepted with it>. |
        | plan-reference        | warning  | specs/reports.feature          | 1    | @id=reports @iteration:reports\nFeature: Reports                                                                                                                              |
        | maturity-on-no-work   | warning  | specs/reports.feature          | 1    | @id=reports @kind=risk @maturity=idea\nFeature: Reports                                                                                                                       |
        | link-kind             | warning  | specs/reports.feature          | 1    | @id=reports @maturity=idea @realized-by:reports\nFeature: Reports                                                                                                             |
        | fact-kind             | warning  | specs/reports.feature          | 1    | @id=reports @maturity=idea @start=2026-11-16\nFeature: Reports                                                                                                                |
        | not-a-kind            | error    | specs/reports.feature          | 1    | @id=reports @kind=idea\nFeature: Reports                                                                                                                                      |
        | plan-date             | warning  | specs/IT-beta.feature          | 1    | @id=IT-beta @kind=iteration @start=2026-11-16 @end=2026-11-31\nFeature: Beta                                                                                                  |
        | milestone-met         | warning  | specs/MS-beta.feature          | 1    | @id=MS-beta @met=2026-02-30\nFeature: Beta                                                                                                                                    |
        | annotation-ignored    | warning  | src/cart.py                    | 1    | total = 0  # @sdp implements cart                                                                                                                                             |
        | annotation-unreadable | warning  | src/cart.ts                    | 2    | // @sdp implements cart\nexport const total = ( => 0                                                                                                                          |
        | import-unresolved     | warning  | src/cart.ts                    | 1    | import { Effect } from "effect"\n/** @sdp is ARCH-cart */\nexport const total = (): number => 0                                                                               |
        | return-type           | warning  | src/cart.ts                    | 2    | // @sdp is ARCH-cart\nexport const total = (lines: Array<number>) => lines.length                                                                                             |
        | step-unreadable       | warning  | specs/steps/cart.steps.ts      | 3    | import { defineSteps } from "sdp/steps"\nexport default defineSteps(() => ({}), ({ Given }) => {\n  Given(cart, () => {})\n})                                                 |
        | step-expression       | error    | specs/steps/cart.steps.ts      | 3    | import { defineSteps } from "sdp/steps"\nexport default defineSteps(() => ({}), ({ Given }) => {\n  Given("a cart of {items}", () => {})\n})                                  |

    Scenario: The smallest workspace that breaks not-a-file: a path the globs match that is a link to nothing
      Given a file "src/cart.ts" containing:
        """
        export const lamps = 1
        """
      When I run "ln -s nowhere.ts src/gone.ts"
      Then the exit code is 0
      When I run "sdp check --severity error --json --base none"
      Then the exit code is 1
      And the JSON output has:
        | data.rule     | not-a-file  |
        | data.severity | error       |
        | data.file     | src/gone.ts |
        | data.line     | 1           |

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

    A live rule without one tests nothing; a rule still to come may wait for its examples, and an
    open rule is a question still to come.

    Scenario Outline: A live feature, and <case>
      Given a file "specs/export-to-csv.feature" containing:
        """
        @id=export-to-csv
        Feature: Export to CSV

          Rule: Every row is exported

            Scenario: Export
              Then I get a file

          <second>
        """
      When the workspace is checked
      Then sdp reports "<reported>"

      Examples:
        | case                             | second                                   | reported      |
        | a rule without an example        | Rule: Archived rows too                  | untested-rule |
        | a rule still to come without one | @maturity=draft\nRule: Archived rows too | nothing       |
        | a question                       | @open\nRule: Archived rows too?          | nothing       |

  Rule: Live work has a live rule, so that what it says is built is tested

    Work — a feature, or any kind a discipline names — that declares no maturity says it is built. A
    node of a kind that is no work, such as a glossary, says what there is.

    Scenario Outline: Work whose rules are <case>
      Given a file "specs/export-to-csv.feature" containing:
        """
        <tags>
        Feature: Export to CSV

          <rule>
        """
      When the workspace is checked
      Then sdp reports "<reported>"

      Examples:
        | case                            | tags                     | rule                                         | reported         |
        | none                            | @id=export-to-csv        |                                              | untested-feature |
        | still to come                   | @id=export-to-csv        | @maturity=draft\nRule: Every row is exported | untested-feature |
        | none, in a node of another kind | @id=terms @kind=glossary |                                              | nothing          |

  @decided-by:declared-maturity-derived-stage
  Rule: A maturity is the team's judgement, and check reads no criterion into its rung nor the content behind it

    A placeholder paragraph with a token scenario would meet any criterion sdp could check: a
    Definition of Ready is held by a gate of the team's own.

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
        | maturity |
        | idea     |
        | ready    |

  Rule: A maturity is a rung of the workspace's ladder, and any other word is an error

    Any maturity makes work still to come, so a word that is no rung would switch its examples off in
    silence.

    Scenario Outline: <case>, on <on>
      Given a file "specs/cart.feature" containing:
        """
        @id=cart @maturity=<feature's>
        Feature: Cart

          @maturity=<rule's>
          Rule: A cart holds what was added

            Scenario: Add an item
              Then the cart holds 1 item
        """
      When the workspace is checked
      Then sdp reports:
        | rule                | severity | node | at                        | hint   |
        | maturity-off-ladder | error    | <id> | specs/cart.feature:<line> | <hint> |

      Examples:
        | case                   | on        | feature's | rule's   | line | id                               | hint                                         |
        | a word for built work  | a feature | Done      | ready    | 1    | cart                             | if the work is built, delete it              |
        | a stage                | a rule    | ready     | verified | 4    | cart#a-cart-holds-what-was-added | sdp derives verified from the run; delete it |
        | a rung in another case | a rule    | idea      | Ready    | 4    | cart#a-cart-holds-what-was-added | write ready, as the ladder does              |

  @decided-by:free-vocabulary
  Rule: A kind named like a rung of the ladder or a stage, or the kind sdp retired, is an error where it is written, as sdp new refuses it

    A spec of such a kind is no work, and never the feature that was meant. Any other kind is the
    authors' word, and so is one of these that the workspace names as a kind of its own.

    Scenario Outline: @kind=<kind>, <case>
      Given a file "sdp.config.yaml" containing:
        """
        <config>
        """
      And a file "specs/gift-wrapping.feature" containing:
        """
        @id=gift-wrapping @kind=<kind>
        Feature: Gift wrapping
        """
      When the workspace is checked
      Then sdp reports "<reported>"

      Examples:
        | kind   | case                                    | config                                     | reported   |
        | idea   | the first rung                          | # every key at its default                 | not-a-kind |
        | change | the kind sdp retired                    | # every key at its default                 | not-a-kind |
        | change | in a workspace with a kind of that name | vocabulary: { words: { kinds: [change] } } | nothing    |

  Rule: Nothing live stops being live without an error

    Built work cannot go back to work still to come, or a test is turned off in silence: against a
    base revision, a maturity or `@open` on what was live, or a live example gone, a gate or still to
    come, is an error.

    Background:
      Given a file "specs/cart.feature" containing:
        """
        @id=cart
        Feature: Cart

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
        | change                         | exit code | reported        | line    | cart                                                                                                                                                                                                                             |
        | A maturity on the live feature | 1         | demotion        | 1       | @id=cart @maturity=ready\nFeature: Cart\n  Rule: A cart holds what was added\n    Scenario: Add an item\n      Then the cart holds 1 item                                                                                        |
        | The live example made a gate   | 1         | example-dropped | 5       | @id=cart\nFeature: Cart\n  Rule: A cart holds what was added\n    @gate\n    Scenario: Add an item\n      Then the cart holds 1 item                                                                                             |
        | The rule still to come built   | 0         | nothing         | nothing | @id=cart\nFeature: Cart\n  Rule: A cart holds what was added\n    Scenario: Add an item\n      Then the cart holds 1 item\n  Rule: A cart holds each item once\n    Scenario: Add a lamp twice\n      Then the cart holds 1 lamp |

  Rule: An example keeps its test under a new name or in a new place, or with new steps under its name, and another takes it over only by naming it

    A test is what a reader would call the same example, each row of an outline on its own, so one
    that is gone is not made up for by another that tests the same.

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
        | The live example renamed, its steps edited, it named  | 0         | nothing         | nothing | @id=cart\nFeature: Cart\n  Rule: A cart holds what was added\n    @replaces:cart#add-an-item\n    Scenario: Add a lamp\n      Then the cart holds 1 lamp |
        | The live example renamed, its steps edited, not named | 1         | example-dropped | 6       | @id=cart\nFeature: Cart\n  Rule: A cart holds what was added\n    Scenario: Add a lamp\n      Then the cart holds 1 lamp                                 |

  Rule: What replaces a live rule or feature takes over its examples only when it is live with a new live example of its own

    A gate enforces nothing and work still to come fails no run. A replacement the base does not
    need is reported, so that it is deleted once merged.

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

    Scenario Outline: A live rule replaced by <replacement>
      Given a file "specs/cart.feature" containing:
        """
        <cart>
        """
      When I run "sdp check --json"
      Then the exit code is <exit code>
      And the JSON output has:
        | data.rule | <reported> |

      Examples:
        | replacement                         | exit code | reported         | cart                                                                                                                                                                                                                                                                           |
        | a live rule                         | 0         | nothing          | @id=cart\nFeature: Cart\n  @replaces:cart#a-cart-holds-what-was-added\n  Rule: A cart holds what was added, once\n    Scenario: Add an item once\n      Then the cart holds 1 item once                                                                                        |
        | a rule whose example is a gate      | 1         | example-dropped  | @id=cart\nFeature: Cart\n  @replaces:cart#a-cart-holds-what-was-added\n  Rule: A cart holds what was added, once\n    @gate\n    Scenario: Add an item once\n      Then the cart holds 1 item once                                                                             |
        | a rule that names what is not there | 0         | replaces-nothing | @id=cart\nFeature: Cart\n  Rule: A cart holds what was added\n    Scenario: Add an item\n      Then the cart holds 1 item\n  @replaces:cart#a-cart-holds-all\n  Rule: A cart holds what was added, once\n    Scenario: Add an item once\n      Then the cart holds 1 item once |

  Rule: The specs of the base are those its own configuration finds in it, and what of them sdp cannot read makes the answer incomplete

    What of its specs sdp cannot read at the base may be a test turned off.

    Scenario Outline: The specs of the base are those its configuration finds there: <case>
      Given a file "specs/cart.feature" containing:
        """
        @id=cart
        Feature: Cart

          Rule: A cart holds what was added

            Scenario: Add an item
              Then the cart holds 1 item
        """
      And a file "<configuration file>" containing:
        """
        <configuration>
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
        | case                                  | configuration file  | configuration                                    | command                 | exit code | complete | dropped          |
        | a features glob out of the workspace  | app/sdp.config.yaml | features: ["../specs/**/*.feature"]              | sdp -C app check --json | 1         | true     | cart#add-an-item |
        | a features glob out of the repository | sdp.config.yaml     | features: ["specs/**/*.feature", "../*.feature"] | sdp check --json        | 1         | false    | cart#add-an-item |

  Rule: The base is where HEAD meets the default branch, or the revision --base or the configuration names; without one, check's answer is incomplete

    A change is judged against what it started from. A check that compared nothing may have missed
    a test turned off, so it exits with 2 unless the comparison is waived with `--base none`.

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
        | named                                             | configuration              | command                                     | exit code | compared                                            |
        | by nobody                                         | # every key at its default | sdp check                                   | 1         | (git merge-base HEAD refs/heads/main)               |
        | in the configuration, and --base                  | base: HEAD                 | sdp check --base main                       | 1         | (git merge-base HEAD main)                          |
        | by nobody, on a branch with nothing committed yet | # every key at its default | git checkout -q --orphan fresh && sdp check | 2         | not compared: no live test was compared with a base |

  Rule: A decision is a title and one to three sentences

    It holds the one thing no scenario can say: what was chosen over what, and why. What it imposes
    is a rule of the spec it constrains.

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

    There it is tested with the rest of what it constrains, and the link finds all that rests on a
    decision before it changes.

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
        /** @sdp is ARCH-legacy-billing */
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

    Its author meant a link or a fact: read as something else it would be a guess.

    Scenario Outline: A planning link written as a value, an activity without its discipline, a tag without a value
      Given these specs:
        | tags                                                          | Feature |
        | @id=IT-beta @kind=iteration @start=2026-11-16 @end=2026-11-27 | Beta    |
        | @id=reports @maturity=idea <tags>                             | Reports |
      When the workspace is checked
      Then sdp reports:
        | rule   | at                      |
        | <rule> | specs/reports.feature:1 |

      Examples:
        | tags               | rule           |
        | @iteration=IT-beta | link-syntax    |
        | @activity:IT-beta  | plan-reference |
        | @owner=            | tag-syntax     |

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
        | rule       | severity | at                  | hint                                                   |
        | not-a-spec | warning  | specs/checkout.md:1 | a spec is a feature file: write specs/checkout.feature |

  Rule: A quote of template text or a mention of an annotation is not flagged

    Only text where sdp would read it as a template's, or as an annotation, is flagged.

    Scenario Outline: Words that only mention what sdp flags
      Given a file "<file>" containing:
        """
        <text>
        """
      When the workspace is checked
      Then sdp does not report "<rule>"

      Examples:
        | file                  | rule                 | text                                                                                                                                                                |
        | specs/reports.feature | template-placeholder | @id=reports\nFeature: Reports\n  A decision starts as "Not <what a reasonable person would have chosen>, because <why>, at the cost of <what is accepted with it>." |
        | src/cart.ts           | annotation-ignored   | // after code, as in total() // @sdp implements cart is not read                                                                                                    |

  @maturity=idea
  Rule: The state sdp graph prints holds no diagnostic: a problem is what check says of what was written, not something anyone wrote
