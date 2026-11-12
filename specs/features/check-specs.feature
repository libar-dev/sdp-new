@id=check-specs @maturity=implemented
@realized-by:ARCH-checker @realized-by:ARCH-reports
Feature: Check specs

  Authors and reviewers, people and agents, need every problem in the specs reported at the line to
  fix, with what to write instead, so that they can fix it without reading sdp's code. And the
  maturity a spec declares must hold up against what the spec says, so that no status lies: how well
  something is understood is declared and checked, whether it works is derived from a run.

  Not a linter of style or wording: sdp checks what it reads and what a spec claims, and fixes
  nothing itself.

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
      When I run "sdp check"
      Then the exit code is 0
      And the output contains "[scenario-empty] reports#nothing-yet has no steps  specs/reports.feature:6"
      And the output contains "0 error(s), 1 warning(s), 0 info"
      Given these specs:
        | tags                          | Feature  |
        | @id=invoices @depends-on:gone | Invoices |
      When I run "sdp check --severity error --json"
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
        | link-conflict         | warning  | src/billing.py                 | 2    | # @sdp uses ARCH-ledger via=events\n# @sdp uses ARCH-ledger via=http\nclass Billing: pass                                                                                     |
        | derived-attribute     | error    | specs/reports.feature          | 1    | @id=reports @verification=passing\nFeature: Reports                                                                                                                           |
        | gherkin-syntax        | error    | specs/reports.feature          | 7    | @id=reports\nFeature: Reports\n  Rule: R\n    Scenario: Rows\n      Given the rows:\n        \| a \| b \|\n        \| c \|                                                    |
        | annotation            | error    | specs/reports.feature          | 1    | @id=reports @uses:A,B\nFeature: Reports                                                                                                                                       |
        | description-comment   | warning  | specs/reports.feature          | 4    | @id=reports\nFeature: Reports\n  Why:\n  # not read\n  because.                                                                                                               |
        | scenario-empty        | warning  | specs/reports.feature          | 4    | @id=reports\nFeature: Reports\n  Rule: R\n    Scenario: Nothing yet                                                                                                           |
        | scenario-outside-rule | error    | specs/reports.feature          | 3    | @id=reports\nFeature: Reports\n  Scenario: S\n    Then it works                                                                                                               |
        | maturity-value        | error    | specs/reports.feature          | 1    | @id=reports @maturity=someday\nFeature: Reports                                                                                                                               |
        | maturity-criteria     | error    | specs/reports.feature          | 1    | @id=reports @maturity=specified\nFeature: Reports\n  Analysts export reports.                                                                                                 |
        | maturity-promotable   | info     | specs/reports.feature          | 1    | @id=reports @maturity=draft\nFeature: Reports\n  Analysts export reports.\n  Rule: R\n    Scenario: Export\n      Then a file is saved                                        |
        | maturity-missing      | warning  | specs/reports.feature          | 1    | @id=reports\nFeature: Reports\n  Rule: R\n    Scenario: Export\n      Then a file is saved                                                                                    |
        | replacement           | error    | specs/reports.feature          | 3    | @id=reports @maturity=idea\nFeature: Reports\n  @replaces:reports\n  Rule: R                                                                                                  |
        | question-example      | error    | specs/reports.feature          | 5    | @id=reports @maturity=idea\nFeature: Reports\n  @open\n  Rule: Mailed too?\n    Scenario: Mail\n      Then a mail is sent                                                     |
        | decision-shape        | warning  | specs/monthly-releases.feature | 4    | @id=monthly-releases @kind=decision\nFeature: Monthly releases\n  Not weekly, because a release takes a week to test.\n  Rule: Consequences                                   |
        | template-placeholder  | warning  | specs/monthly-releases.feature | 3    | @id=monthly-releases @kind=decision\nFeature: Monthly releases\n  Not <what a reasonable person would have chosen>, because <why>, at the cost of <what is accepted with it>. |
        | plan-reference        | warning  | specs/reports.feature          | 1    | @id=reports @iteration:reports\nFeature: Reports                                                                                                                              |
        | plan-date             | warning  | specs/IT-beta.feature          | 1    | @id=IT-beta @kind=iteration @start=2026-11-16 @end=2026-11-31\nFeature: Beta                                                                                                  |
        | milestone-met         | warning  | specs/MS-beta.feature          | 1    | @id=MS-beta @met=2026-02-30\nFeature: Beta                                                                                                                                    |
        | annotation-ignored    | warning  | src/cart.py                    | 1    | total = 0  # @sdp implements cart                                                                                                                                             |
        | annotation-unreadable | warning  | src/cart.ts                    | 5    | import { annotate } from "sdp/annotations"\n\nexport const total = 0\nconst feature = "cart"\nannotate(total, { implements: feature })                                        |
        | step-unreadable       | warning  | specs/steps/cart.steps.ts      | 3    | import { defineSteps } from "sdp/steps"\nexport default defineSteps(() => ({}), ({ Given }) => {\n  Given(cart, () => {})\n})                                                 |
        | step-expression       | error    | specs/steps/cart.steps.ts      | 3    | import { defineSteps } from "sdp/steps"\nexport default defineSteps(() => ({}), ({ Given }) => {\n  Given("a cart of {items}", () => {})\n})                                  |
        | step-expression       | error    | specs/steps/cart.steps.ts      | 3    | import { defineSteps } from "sdp/steps"\nexport default defineSteps(() => ({}), ({ Given }) => {\n  Given(/a (cart of items/, () => {})\n})                                   |
        | types-stale           | warning  | .sdp/ids.d.ts                  | 1    | declare module "sdp/annotations" {\n  interface Ids {\n    "gone": "feature"\n  }\n}\nexport {}                                                                               |

    Scenario: Every rule sdp reports has an example here
      Then every rule sdp reports has an example in this spec

  @decided-by:declared-maturity-derived-stage
  Rule: Each level asks for more of the content, and a claim the content does not support is an error

    idea asks for a name; draft, for a first paragraph that says who wants what, and why; specified,
    for a scenario that states an outcome.

    Scenario Outline: A name, then a paragraph, then an outcome
      Given a file "specs/export-to-csv.feature" containing:
        """
        @id=export-to-csv @maturity=<claimed>
        Feature: Export to CSV

        <content>
        """
      When the workspace is checked
      Then sdp reports "<reported>"

      Examples:
        | claimed   | content                                                                                         | reported          |
        | idea      |                                                                                                 | nothing           |
        | draft     |                                                                                                 | maturity-criteria |
        | draft     | Analysts want data in Excel.                                                                    | nothing           |
        | specified | Analysts want data in Excel.                                                                    | maturity-criteria |
        | specified | Analysts want data in Excel.\n\nRule: Every row is exported\nScenario: Export\nWhen I export it | maturity-criteria |

    Scenario: A feature declared in code can claim no more than a name
      Given a file "src/pay.py" containing:
        """
        # @sdp is pay kind=feature maturity=ready
        def pay(): pass
        """
      When the workspace is checked
      Then sdp reports at least:
        | rule              | node |
        | maturity-criteria | pay  |

  Rule: Ready asks for an example of every rule, an outcome in every scenario and no open question

    So a draft's rules are a checked list of what is still to specify.

    Scenario Outline: What a spec may leave until it claims ready
      Given a file "specs/export-to-csv.feature" containing:
        """
        @id=export-to-csv @maturity=<claimed>
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
        | claimed   | second                                                                   | reported          |
        | specified | Rule: Archived rows too                                                  | nothing           |
        | ready     | Rule: Archived rows too                                                  | maturity-criteria |
        | ready     | Rule: Archived rows too\n  Scenario: Archive\n    Then they are exported | nothing           |
        | ready     | Scenario: Import\n  When I import a file                                 | maturity-criteria |
        | ready     | @open\nRule: Archived rows too?                                          | maturity-criteria |
        | ready     | Rule: Archived rows too\n  @open\n  Scenario: Deleted ones as well?      | maturity-criteria |

    Scenario: What keeps a spec from ready names the first open question and the first rule without an example
      Given a file "specs/export-to-csv.feature" containing:
        """
        @id=export-to-csv @maturity=ready
        Feature: Export to CSV

          Analysts want data in Excel.

          Rule: Archived rows are exported too

          @open
          Rule: Which delimiter?
        """
      When the workspace is checked
      Then sdp reports:
        | rule              | line | message                                                                                                             |
        | maturity-criteria | 1    | 1 open question(s), e.g. "Which delimiter?" (line 9); rule "Archived rows are exported too" has no example (line 6) |

  Rule: Implemented work is held to what ready asks, each Rule on its own

    Being built does not excuse a rule from what makes it testable. A Rule that declares a maturity
    is judged on its own examples; an open one is a question still to come.

    Scenario Outline: A feature at <claimed>, and <case>
      Given a file "specs/export-to-csv.feature" containing:
        """
        @id=export-to-csv @maturity=<claimed>
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
        | case                                               | claimed     | second                                                                                                                      | reported          |
        | a rule without an example                          | implemented | Rule: Archived rows too                                                                                                     | maturity-criteria |
        | a rule still to come                               | implemented | @maturity=draft\nRule: Archived rows too\n\n  Analysts audit them.                                                          | nothing           |
        | a rule specified without an example                | implemented | @maturity=specified\nRule: Archived rows too                                                                                | maturity-criteria |
        | an open question about what is built               | implemented | Rule: Archived rows too\n  @open\n  Scenario: Deleted ones as well?                                                         | maturity-criteria |
        | a question still to come                           | implemented | @open\nRule: Archived rows too?                                                                                             | nothing           |
        | a rule built ahead of its feature                  | ready       | @maturity=implemented\nRule: Archived rows too\n\n  Analysts audit them.\n\n  Scenario: Archive\n    Then they are exported | nothing           |
        | a rule built ahead, its example without an outcome | ready       | @maturity=implemented\nRule: Archived rows too\n\n  Analysts audit them.\n\n  Scenario: Archive\n    When I archive         | maturity-criteria |

  Rule: A spec without a maturity is implemented, and check asks for one

    Failing safe: an example nobody marked is enforced, as under Cucumber, and a suite without an id
    runs as it does there.

    Scenario Outline: A spec <declaring> and an example without a step definition
      Given a file "specs/export-to-csv.feature" containing:
        """
        <tags>
        Feature: Export to CSV

          Analysts want data in Excel.

          Rule: Every row is exported

            Scenario: Export
              Then I get a file
        """
      When the workspace is checked
      Then sdp reports "<reported>"
      When I run "sdp run"
      Then the exit code is <exit code>

      Examples:
        | declaring             | tags                              | reported         | exit code |
        | that declares nothing | @id=export-to-csv                 | maturity-missing | 1         |
        | that is still to come | @id=export-to-csv @maturity=ready | nothing          | 0         |
        | named by its path     |                                   | nothing          | 1         |

  Rule: Content ahead of its label is no error, only an info that the spec can be promoted

    Maturity is the team's judgement of how well a thing is understood: a claim below what the
    content supports is not false, and raising it is the team's call.

    Scenario: A draft whose scenario states an outcome
      Given a file "specs/export-to-csv.feature" containing:
        """
        @id=export-to-csv @maturity=draft
        Feature: Export to CSV

          Analysts want data in Excel.

          Rule: Every row is exported

            Scenario: Export current rows
              When I export the report
              Then I get a CSV file with one line per row
        """
      When the workspace is checked
      Then sdp reports:
        | rule                | severity | node          |
        | maturity-promotable | info     | export-to-csv |

  Rule: A level a team adds has no criteria of its own, and takes its place in the order

    sdp reads meaning into its own few words only: what a team's level asks for is the team's to
    check, with a gate of its own as its Definition of Ready is. sdp reads only the level's place in
    the order, so that a question compares it with the others.

    Scenario: approved, between draft and specified
      Given a file "sdp.config.yaml" containing:
        """
        vocabulary: { maturity: [idea, draft, approved, specified, ready, implemented] }
        """
      And these specs:
        | tags                                 | Feature       |
        | @id=export-to-csv @maturity=approved | Export to CSV |
      When the workspace is checked
      Then sdp reports nothing
      When I query "feature[maturity>draft, maturity<specified]"
      Then the result is "export-to-csv"

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
        @id=ARCH-legacy-billing @maturity=implemented
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
        export function invoice() {}
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
        | tags                        | Feature |
        | @id=IT-beta @kind=iteration | Beta    |
        | @id=reports <tags>          | Reports |
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
        | tags        | Feature |
        | @id=reports | Reports |
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
