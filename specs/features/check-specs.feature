@id=check-specs @maturity=ready
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
      Given a file "specs/REQ-a.feature" containing:
        """
        @id=REQ-a
        Feature: Example

          Rule: Something holds

            Scenario: Nothing yet
        """
      When I run "sdp check"
      Then the exit code is 0
      And the output contains "[scenario-empty] REQ-a#nothing-yet has no steps  specs/REQ-a.feature:6"
      And the output contains "0 error(s), 1 warning(s), 0 info"
      Given these specs:
        | tags                           | Feature |
        | @id=REQ-b @depends-on:REQ-gone | Example |
      When I run "sdp check --severity error --json"
      Then the exit code is 1
      And the JSON output has:
        | data.rule     | dangling-link       |
        | data.severity | error               |
        | data.node     | REQ-b               |
        | data.file     | specs/REQ-b.feature |
        | data.line     | 1                   |

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
        | rule                  | severity | file                               | line | content                                                                                                                                         |
        | duplicate-id          | error    | specs/REQ-a.feature                | 4    | @id=REQ-a\nFeature: A\n  Rule: R\n  Rule: R                                                                                                     |
        | dangling-link         | error    | specs/REQ-a.feature                | 1    | @id=REQ-a @depends-on:REQ-gone\nFeature: A                                                                                                      |
        | link-syntax           | error    | specs/REQ-a.feature                | 1    | @id=REQ-a @maturity:ready\nFeature: A                                                                                                           |
        | link-conflict         | warning  | src/billing.py                     | 2    | # @sdp uses ARCH-ledger via=events\n# @sdp uses ARCH-ledger via=http\nclass Billing: pass                                                       |
        | derived-attribute     | error    | specs/REQ-a.feature                | 1    | @id=REQ-a @verification=passing\nFeature: A                                                                                                     |
        | gherkin-syntax        | error    | specs/REQ-a.feature                | 7    | @id=REQ-a\nFeature: A\n  Rule: R\n    Scenario: Rows\n      Given the rows:\n        \| a \| b \|\n        \| c \|                              |
        | annotation            | error    | specs/REQ-a.feature                | 1    | @id=REQ-a @uses:A,B\nFeature: A                                                                                                                 |
        | description-comment   | warning  | specs/REQ-a.feature                | 4    | @id=REQ-a\nFeature: A\n  Why:\n  # not read\n  because.                                                                                         |
        | scenario-empty        | warning  | specs/REQ-a.feature                | 4    | @id=REQ-a\nFeature: A\n  Rule: R\n    Scenario: Nothing yet                                                                                     |
        | scenario-outside-rule | error    | specs/REQ-a.feature                | 3    | @id=REQ-a\nFeature: A\n  Scenario: S\n    Then it works                                                                                         |
        | maturity-value        | error    | specs/REQ-a.feature                | 1    | @id=REQ-a @maturity=someday\nFeature: A                                                                                                         |
        | maturity-criteria     | error    | specs/REQ-a.feature                | 1    | @id=REQ-a @maturity=specified\nFeature: A\n  Analysts export reports.                                                                           |
        | maturity-promotable   | info     | specs/REQ-a.feature                | 1    | @id=REQ-a @maturity=draft\nFeature: A\n  Analysts export reports.\n  Rule: R\n    Scenario: Export\n      Then a file is saved                  |
        | decision-shape        | warning  | specs/DEC-monthly-releases.feature | 4    | @id=DEC-monthly-releases\nFeature: Monthly releases\n  Not weekly, because a release takes a week to test.\n  Rule: Consequences                |
        | template-placeholder  | warning  | specs/DEC-monthly-releases.feature | 3    | @id=DEC-monthly-releases\nFeature: Monthly releases\n  Not <what a reasonable person would have chosen>, because <why>.                         |
        | plan-reference        | warning  | specs/REQ-a.feature                | 1    | @id=REQ-a @iteration:REQ-a\nFeature: A                                                                                                          |
        | plan-date             | warning  | specs/IT-beta.feature              | 1    | @id=IT-beta @kind=iteration @start=2026-11-16 @end=2026-11-31\nFeature: Beta                                                                    |
        | milestone-met         | warning  | specs/MS-beta.feature              | 1    | @id=MS-beta @met=2026-02-30\nFeature: Beta                                                                                                      |
        | annotation-ignored    | warning  | src/cart.py                        | 1    | total = 0  # @sdp implements REQ-a                                                                                                              |
        | annotation-unreadable | warning  | src/cart.ts                        | 5    | import { annotate } from "sdp/annotations"\n\nexport const total = 0\nconst requirement = "REQ-a"\nannotate(total, { implements: requirement }) |
        | step-unreadable       | warning  | specs/steps/cart.steps.ts          | 3    | import { defineSteps } from "sdp/steps"\nexport default defineSteps(() => ({}), ({ Given }) => {\n  Given(cart, () => {})\n})                   |
        | step-expression       | error    | specs/steps/cart.steps.ts          | 3    | import { defineSteps } from "sdp/steps"\nexport default defineSteps(() => ({}), ({ Given }) => {\n  Given("a cart of {items}", () => {})\n})    |
        | step-expression       | error    | specs/steps/cart.steps.ts          | 3    | import { defineSteps } from "sdp/steps"\nexport default defineSteps(() => ({}), ({ Given }) => {\n  Given(/a (cart of items/, () => {})\n})     |
        | types-stale           | warning  | .sdp/ids.d.ts                      | 1    | declare module "sdp/annotations" {\n  interface Ids {\n    "REQ-gone": "requirement"\n  }\n}\nexport {}                                         |

    Scenario: Every rule sdp reports has an example here
      Then every rule sdp reports has an example in this spec

  @decided-by:declared-maturity-derived-stage
  Rule: Each level asks for more of the content, and a claim the content does not support is an error

    idea asks for a name; draft, for a first paragraph that says who wants what, and why; specified,
    for a scenario that states an outcome.

    Scenario Outline: A name, then a paragraph, then an outcome
      Given a file "specs/REQ-csv.feature" containing:
        """
        @id=REQ-csv @maturity=<claimed>
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

    Scenario: A requirement declared in code can claim no more than a name
      Given a file "src/pay.py" containing:
        """
        # @sdp is REQ-pay kind=requirement maturity=ready
        def pay(): pass
        """
      When the workspace is checked
      Then sdp reports at least:
        | rule              | node    |
        | maturity-criteria | REQ-pay |

  Rule: Ready asks for an example of every rule, an outcome in every scenario and no open question

    So a draft's rules are a checked list of what is still to specify.

    Scenario Outline: What a spec may leave until it claims ready
      Given a file "specs/REQ-csv.feature" containing:
        """
        @id=REQ-csv @maturity=<claimed>
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
      Given a file "specs/REQ-csv.feature" containing:
        """
        @id=REQ-csv @maturity=ready
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

  Rule: Content ahead of its label is no error, only an info that the spec can be promoted

    Maturity is the team's judgement of how well a thing is understood: a claim below what the
    content supports is not false, and raising it is the team's call.

    Scenario: A draft whose scenario states an outcome
      Given a file "specs/REQ-csv.feature" containing:
        """
        @id=REQ-csv @maturity=draft
        Feature: Export to CSV

          Analysts want data in Excel.

          Rule: Every row is exported

            Scenario: Export current rows
              When I export the report
              Then I get a CSV file with one line per row
        """
      When the workspace is checked
      Then sdp reports:
        | rule                | severity | node    |
        | maturity-promotable | info     | REQ-csv |

  Rule: A level a team adds has no criteria of its own, and takes its place in the order

    sdp reads meaning into its own few words only: what a team's level asks for is the team's to
    check, with a gate of its own as its Definition of Ready is. sdp reads only the level's place in
    the order, so that a question compares it with the others.

    Scenario: approved, between draft and specified
      Given a file "sdp.config.yaml" containing:
        """
        vocabulary: { maturity: [idea, draft, approved, specified, ready] }
        """
      And these specs:
        | tags                           | Feature       |
        | @id=REQ-csv @maturity=approved | Export to CSV |
      When the workspace is checked
      Then sdp reports nothing
      When I query "requirement[maturity>draft, maturity<specified]"
      Then the result is "REQ-csv"

  Rule: A decision is a title and one to three sentences

    It holds the one thing no scenario can say: what was chosen over what, and why. What it imposes
    is a rule of the spec it constrains, what is undecided an open question on the spec it blocks,
    and what changed is rewritten: git keeps the rest.

    Scenario Outline: A decision that grows a rule or a scenario is reported
      Given a file "specs/DEC-retire-legacy-billing.feature" containing:
        """
        @id=DEC-retire-legacy-billing
        Feature: Retire legacy billing

          Not a wrapper around it, because every new caller would keep it alive.

          <more>
        """
      When the workspace is checked
      Then sdp reports at least:
        | rule           | node                      | at                                        |
        | decision-shape | DEC-retire-legacy-billing | specs/DEC-retire-legacy-billing.feature:6 |

      Examples:
        | more                                                            |
        | Rule: Nothing calls legacy billing                              |
        | Scenario: Nothing calls legacy billing\n  Then nothing calls it |

  Rule: The rule a decision leads to is a rule of what it constrains, which links back to the decision

    There it is tested with the rest of what it constrains, and fails as soon as it is broken; the
    link lets a question find all that rests on a decision before it changes.

    Scenario: A rule of legacy billing rests on the decision to retire it, and fails while code still calls it
      Given these specs:
        | tags                          | Feature               |
        | @id=DEC-retire-legacy-billing | Retire legacy billing |
      And a file "specs/ARCH-legacy-billing.feature" containing:
        """
        @id=ARCH-legacy-billing
        Feature: Legacy billing

          @decided-by:DEC-retire-legacy-billing
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
      When I query "#DEC-retire-legacy-billing <-decided-by- rule"
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
        | @id=REQ-a <tags>            | A       |
      When the workspace is checked
      Then sdp reports:
        | rule   | at                    | message   | hint   |
        | <rule> | specs/REQ-a.feature:1 | <message> | <hint> |

      Examples:
        | tags                   | rule           | message                                                               | hint                                                    |
        | @iteration=IT-beta     | link-syntax    | iteration is a link, so a value written with = links nothing          | write @iteration:IT-beta                                |
        | @activity.test=IT-beta | link-syntax    | activity.test is a link, so a value written with = links nothing      | write @activity.test:IT-beta                            |
        | @activity:IT-beta      | plan-reference | activity names no discipline, so its link to IT-beta plans nothing    | name the discipline, `@activity.implementation:IT-beta` |
        | @owner=                | annotation     | owner has no value                                                    | write @owner=<value>, or @owner alone                   |

  @decided-by:specs-are-gherkin-files
  Rule: A Markdown file where specs live is reported with what to write instead, because sdp reads none of it

    Scenario: A requirement written as Markdown beside the feature files, and a README elsewhere
      Given these specs:
        | tags      | Feature |
        | @id=REQ-a | A       |
      And a file "specs/REQ-b.md" containing:
        """
        # Checkout
        """
      And a file "README.md" containing:
        """
        # Shop
        """
      When the workspace is checked
      Then sdp reports:
        | rule       | severity | at               | hint                                                                  |
        | not-a-spec | warning  | specs/REQ-b.md:1 | a spec is a feature file: write specs/REQ-b.feature, its tags (@id=…) |

    Scenario: Markdown under the directory the feature files are configured in, before any feature file
      Given a file "sdp.config.yaml" containing:
        """
        features: ["specs/**/*.feature"]
        """
      And a file "specs/billing/REQ-invoice.md" containing:
        """
        # Invoices
        """
      When the workspace is checked
      Then sdp reports:
        | rule       | at                             |
        | not-a-spec | specs/billing/REQ-invoice.md:1 |

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
        | file                | rule                 | text                                                                                                             |
        | specs/REQ-a.feature | template-placeholder | @id=REQ-a\nFeature: A\n  A decision starts as "Not <what a reasonable person would have chosen>, because <why>." |

      Examples: a mention of an annotation, and an annotation on a line of its own, which is read
        | file        | rule               | text                                                              |
        | src/cart.ts | annotation-ignored | // after code, as in total() // @sdp implements REQ-a is not read |
        | src/cart.ts | annotation-ignored | // @sdp implements REQ-a\nexport const total = 0                  |
