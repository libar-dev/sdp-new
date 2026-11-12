@id=REQ-check-rules @maturity=ready @quality-gates
@refines:CAP-living-specs @realized-by:ARCH-checker
@iteration:I1 @activity.implementation:I1 @activity.test:I1
Feature: Check rules

  `sdp check` says what is wrong with the specifications so that a person or an agent can fix it
  without reading sdp's code, following a hint phrased as an instruction.

  Rule: Every diagnostic names its rule, its severity and the line to fix

    An error means the graph is wrong or a claim is false; a warning, that something was ignored or
    is probably a slip; an info is a suggestion.

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
        | rule                  | severity | file                   | line | content                                                                                                                        |
        | duplicate-id          | error    | specs/REQ-a.feature    | 4    | @id=REQ-a\nFeature: A\n  Rule: R\n  Rule: R                                                                                    |
        | dangling-link         | error    | specs/REQ-a.feature    | 1    | @id=REQ-a @depends-on:REQ-gone\nFeature: A                                                                                     |
        | link-syntax           | error    | specs/REQ-a.feature    | 1    | @id=REQ-a @maturity:ready\nFeature: A                                                                                          |
        | link-conflict         | warning  | src/billing.py         | 2    | # @sdp uses ARCH-ledger via=events\n# @sdp uses ARCH-ledger via=http\nclass Billing: pass                                      |
        | derived-attribute     | error    | specs/REQ-a.feature    | 1    | @id=REQ-a @verification=passing\nFeature: A                                                                                    |
        | gherkin-syntax        | error    | specs/REQ-a.feature    | 7    | @id=REQ-a\nFeature: A\n  Rule: R\n    Scenario: Rows\n      Given the rows:\n        \| a \| b \|\n        \| c \|             |
        | annotation            | error    | specs/REQ-a.feature    | 1    | @id=REQ-a @uses:A,B\nFeature: A                                                                                                |
        | description-comment   | warning  | specs/REQ-a.feature    | 4    | @id=REQ-a\nFeature: A\n  Why:\n  # not read\n  because.                                                                        |
        | scenario-empty        | warning  | specs/REQ-a.feature    | 4    | @id=REQ-a\nFeature: A\n  Rule: R\n    Scenario: Nothing yet                                                                    |
        | scenario-outside-rule | error    | specs/REQ-a.feature    | 3    | @id=REQ-a\nFeature: A\n  Scenario: S\n    Then it works                                                                        |
        | maturity-value        | error    | specs/REQ-a.feature    | 1    | @id=REQ-a @maturity=someday\nFeature: A                                                                                        |
        | maturity-criteria     | error    | specs/REQ-a.feature    | 1    | @id=REQ-a @maturity=specified\nFeature: A\n  Analysts export reports.                                                          |
        | maturity-promotable   | info     | specs/REQ-a.feature    | 1    | @id=REQ-a @maturity=draft\nFeature: A\n  Analysts export reports.\n  Rule: R\n    Scenario: Export\n      Then a file is saved |
        | decision-shape        | warning  | specs/DEC-0001.feature | 4    | @id=DEC-0001\nFeature: Monthly releases\n  Not monthly, because feedback is late.\n  Rule: Consequences                        |
        | template-placeholder  | warning  | specs/DEC-0001.feature | 3    | @id=DEC-0001\nFeature: Monthly releases\n  Not <what a reasonable person would have chosen>, because <why>.                    |
        | plan-reference        | warning  | specs/REQ-a.feature    | 1    | @id=REQ-a @iteration:REQ-a\nFeature: A                                                                                         |
        | plan-date             | warning  | specs/E1.feature       | 1    | @id=E1 @kind=iteration @start=2026-11-16 @end=2026-11-31\nFeature: E1                                                        |
        | milestone-met         | warning  | specs/MS-beta.feature  | 1    | @id=MS-beta @met=2026-02-30\nFeature: Beta                                                                                     |
        | annotation-ignored    | warning  | src/cart.py            | 1    | total = 0  # @sdp implements REQ-a                                                                                             |

    Scenario: A typed annotation whose target is computed
      Given a file "src/cart.ts" containing:
        """
        import { annotate } from "sdp/annotations"

        export const total = 0
        const requirement = "REQ-a"
        annotate(total, { implements: requirement })
        """
      When the workspace is checked
      Then sdp reports at least:
        | rule                  | severity | at            |
        | annotation-unreadable | warning  | src/cart.ts:5 |

    Scenario Outline: A step definition sdp cannot read is a warning; one that can match nothing is an error
      Given a file "specs/steps/cart.steps.ts" containing:
        """
        import { defineSteps } from "sdp/steps"

        const cart = "an empty cart"
        export default defineSteps(() => ({}), ({ Given }) => {
          Given(<expression>, () => {})
        })
        """
      When the workspace is checked
      Then sdp reports at least:
        | rule   | severity   | at                          |
        | <rule> | <severity> | specs/steps/cart.steps.ts:5 |

      Examples:
        | expression          | rule            | severity |
        | cart                | step-unreadable | warning  |
        | "a cart of {items}" | step-expression | error    |
        | /a (cart of items/  | step-expression | error    |

    Scenario: Id declarations that no longer match the graph are reported, so annotate() accepts no removed id
      Given these specs:
        | tags      | Feature |
        | @id=REQ-a | A       |
      And a file ".sdp/ids.d.ts" containing:
        """
        declare module "sdp/annotations" {
          interface Ids {
            "REQ-gone": "requirement"
          }
        }
        export {}
        """
      When the workspace is checked
      Then sdp reports at least:
        | rule        | at              |
        | types-stale | .sdp/ids.d.ts:1 |

    Scenario: Every rule sdp reports has an example here
      Then every rule sdp reports has an example in this spec

  Rule: A tag that as written would link nothing or say nothing is reported, not read as something else

    Scenario Outline: A planning link written as a value, an activity without its discipline, a tag without a value
      Given these specs:
        | tags                   | Feature |
        | @id=E1 @kind=iteration | E1      |
        | @id=REQ-a <tags>       | A       |
      When the workspace is checked
      Then sdp reports:
        | rule   | at                    | message   | hint   |
        | <rule> | specs/REQ-a.feature:1 | <message> | <hint> |

      Examples:
        | tags              | rule           | message                                                          | hint                                               |
        | @iteration=E1     | link-syntax    | iteration is a link, so a value written with = links nothing     | write @iteration:E1                                |
        | @activity.test=E1 | link-syntax    | activity.test is a link, so a value written with = links nothing | write @activity.test:E1                            |
        | @activity:E1      | plan-reference | activity names no discipline, so its link to E1 plans nothing    | name the discipline, `@activity.implementation:E1` |
        | @owner=           | annotation     | owner has no value                                               | write @owner=<value>, or @owner alone              |

  @decided-by:DEC-0001
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

    Scenario: A directory of Markdown under the directory the feature files are configured in, with no feature file yet
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

  Rule: A plan names declared iterations, phases and disciplines, and plans only work that belongs to a discipline

    Background:
      Given these specs:
        | tags                                         | Feature     |
        | @id=PH-elaboration                           | Elaboration |
        | @id=E1 @kind=iteration @phase:PH-elaboration | E1          |
        | @id=E2 @kind=iteration @phase:PH-elaboration | E2          |

    Scenario Outline: What is wrong with each reference
      Given these specs:
        | tags             | Feature |
        | @id=REQ-a <tags> | Example |
      When the workspace is checked
      Then sdp reports:
        | rule           | severity | node  | at                    | message   |
        | plan-reference | warning  | REQ-a | specs/REQ-a.feature:1 | <problem> |

      Examples:
        | tags                                                                | problem                              |
        | @iteration:PH-elaboration                                           | "PH-elaboration" names no iteration  |
        | @phase:E1                                                           | "E1" names no phase                  |
        | @closes:REQ-a                                                       | "REQ-a" names no phase or iteration  |
        | @activity.implementation:REQ-a                                      | "REQ-a" names no iteration           |
        | @activity.implementation:E1 @activity.implementation:PH-elaboration | "PH-elaboration" names no iteration  |
        | @activity.testing:E1                                                | "testing", which is not a discipline |
        | @kind=risk @iteration:E1                                            | belongs to no discipline             |

    Scenario: A requirement planned into what the plan declares
      Given these specs:
        | tags                                                                                                         | Feature |
        | @id=REQ-a @iteration:E1 @activity.analysis-design:E1 @activity.implementation:E1 @activity.implementation:E2 | Example |
      When the workspace is checked
      Then sdp reports nothing

  Rule: Text a template wrote is flagged until it is filled in, once per spec, at the first

    Scenario Outline: A rule, a scenario and a step as the template wrote them
      Given a file "specs/REQ-a.feature" containing:
        """
        @id=REQ-a
        Feature: Example

          Analysts export reports.

          Rule: <rule>

            Scenario: <scenario>
              Then <outcome>
        """
      When the workspace is checked
      Then sdp reports:
        | rule                 | node  | at                         | message   |
        | template-placeholder | REQ-a | specs/REQ-a.feature:<line> | <message> |

      Examples:
        | rule                        | scenario                | outcome              | line | message                                          |
        | <the rule, in one sentence> | <the main success case> | <observable outcome> | 6    | "Rule: <the rule, in one sentence>" (and 2 more) |
        | Reports are exported        | Export                  | <observable outcome> | 9    | "Then <observable outcome>"                      |

  Rule: A quote of template text or a mention of an annotation is not flagged

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

  @decided-by:DEC-0008
  Rule: What belongs in the architecture is never checked

    Scenario: An element nothing links to, with no code and no decision
      Given these specs:
        | tags           | Feature |
        | @id=ARCH-cache | Cache   |
      When the workspace is checked
      Then sdp reports nothing
