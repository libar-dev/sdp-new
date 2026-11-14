@id=check-specs
@realized-by:ARCH-checker @realized-by:ARCH-application
Feature: Check specs

  Authors and reviewers, people and agents, need every problem in the specs reported at the line to
  fix, and what is built kept tested, so that they fix specs without reading sdp's code and no test
  is turned off in silence.

  Not a linter of style or wording: sdp checks what it reads, and fixes nothing itself.

  Rule: check fails only on an error

    Scenario: A warning passes the check, an error fails it
      Given these specs:
        | tags                                 | Feature |
        | @id=outage @kind=risk @maturity=idea | Outage  |
      When I run "sdp check --base none"
      Then the exit code is 0
      And the output contains "0 error(s), 1 warning(s), 0 info"
      Given these specs:
        | tags                                         | Feature  |
        | @id=invoices @maturity=idea @depends-on:gone | Invoices |
      When I run "sdp check --base none"
      Then the exit code is 1

  Rule: --severity leaves out what is less severe

    Scenario: Only the errors of a warning and an error
      Given these specs:
        | tags                                         | Feature  |
        | @id=outage @kind=risk @maturity=idea         | Outage   |
        | @id=invoices @maturity=idea @depends-on:gone | Invoices |
      When I run "sdp check --severity error --json --base none"
      Then the exit code is 1
      And the JSON output has:
        | data.rule | dangling-link |

  Rule: Every problem is reported by the rule it breaks, with its severity and the line to fix

    Scenario Outline: The smallest workspace with <case>
      Given a file "<file>" containing:
        """
        <content>
        """
      When the workspace is checked
      Then sdp reports at least:
        | rule   | severity   | at            |
        | <rule> | <severity> | <file>:<line> |

      Examples:
        | case                                         | rule                 | severity | file                           | line | content                                                                                                                                 |
        | a key written as a value and as a map        | tag-syntax           | error    | specs/reports.feature          | 1    | @id=reports @owner=core @owner.team=billing\nFeature: Reports                                                                           |
        | one tag naming two targets                   | tag-syntax           | error    | specs/reports.feature          | 1    | @id=reports @uses:A,B\nFeature: Reports                                                                                                 |
        | a maturity on a Scenario                     | tag-syntax           | error    | specs/reports.feature          | 4    | @id=reports\nFeature: Reports\n  Rule: R\n    @maturity=idea\n    Scenario: S\n      Then it works                                      |
        | an id on a Scenario                          | tag-syntax           | error    | specs/reports.feature          | 4    | @id=reports\nFeature: Reports\n  Rule: R\n    @id=total\n    Scenario: S\n      Then it works                                           |
        | a kind sdp makes                             | derived-attribute    | error    | specs/reports.feature          | 1    | @id=reports @kind=scenario\nFeature: Reports                                                                                            |
        | a feature realized by a feature              | link-kind            | warning  | specs/reports.feature          | 1    | @id=reports @maturity=idea @realized-by:reports\nFeature: Reports                                                                       |
        | a rule that replaces its own feature         | replacement          | error    | specs/reports.feature          | 3    | @id=reports @maturity=idea\nFeature: Reports\n  @replaces:reports\n  Rule: R                                                            |
        | an example in a decision                     | decision-shape       | warning  | specs/monthly-releases.feature | 4    | @id=monthly-releases @kind=decision\nFeature: Monthly releases\n  Rule: A release ships monthly\n    Scenario: May\n      Then it ships |
        | an iteration named where none is declared    | plan-reference       | warning  | specs/reports.feature          | 1    | @id=reports @iteration:reports\nFeature: Reports                                                                                        |
        | an iteration's day that is no date           | plan-date            | warning  | specs/IT-beta.feature          | 1    | @id=IT-beta @kind=iteration @start=2026-11-16 @end=2026-11-31\nFeature: Beta                                                            |
        | a milestone met on a day that is no date     | milestone-met        | warning  | specs/MS-beta.feature          | 1    | @id=MS-beta @met=2026-02-30\nFeature: Beta                                                                                              |
        | two annotations of one element that disagree | declaration-conflict | warning  | src/billing.py                 | 2    | # @sdp is ARCH-billing owner=payments\n# @sdp is ARCH-billing owner=finance\nclass Billing: pass                                        |
        | an annotation after code on its line         | annotation-ignored   | warning  | src/cart.py                    | 1    | total = 0  # @sdp is ARCH-cart                                                                                                          |
        | a step whose expression is computed          | step-unreadable      | warning  | specs/steps/cart.steps.ts      | 3    | import { defineSteps } from "sdp/steps"\nexport default defineSteps(() => ({}), ({ Given }) => {\n  Given(cart, () => {})\n})           |

    Scenario: Markdown beside a spec, which sdp does not read, and a README elsewhere
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
        | rule       | severity | at                  |
        | not-a-spec | warning  | specs/checkout.md:1 |

    Scenario: A tsconfig.json that extends one outside the repository, which outside git is the workspace
      Given a file "base.json" containing:
        """
        { "compilerOptions": { "strict": true } }
        """
      And a file "app/tsconfig.json" containing:
        """
        { "extends": "../base.json" }
        """
      And a file "app/src/cart.ts" containing:
        """
        export const total = (): number => 0
        """
      And a file "app/src/orders.ts" containing:
        """
        import { total } from "./cart.ts"
        /** @sdp is ARCH-orders */
        export const order = (): number => total()
        """
      When I run "sdp check --base none --json" in "app"
      Then the exit code is 0
      And the JSON output has:
        | complete      | true                  |
        | data.rule     | import-config-outside |
        | data.severity | info                  |
        | data.file     | tsconfig.json         |

  Rule: What the official Gherkin parser reads otherwise than it is written is reported at its line

    The parser reads it without a word, so an author would not learn that what they wrote counts for
    nothing.

    Scenario Outline: What the parser reads otherwise: <case>
      Given a file "specs/reports.feature" containing:
        """
        <content>
        """
      When the workspace is checked
      Then sdp reports at least:
        | rule   | severity   | at                           |
        | <rule> | <severity> | specs/reports.feature:<line> |

      Examples:
        | case                              | rule                | severity | line | content                                                                                                                      |
        | a heading in a description        | description-comment | warning  | 3    | @id=reports\nFeature: Reports\n  # Why\n  Because.                                                                           |
        | a scenario without a step         | scenario-empty      | warning  | 4    | @id=reports\nFeature: Reports\n  Rule: R\n    Scenario: Nothing yet                                                          |
        | a Background without a step       | background-empty    | warning  | 3    | @id=reports\nFeature: Reports\n  Background: the team asked for it.\n  Rule: R                                               |
        | a sentence after a Then           | prose-step          | warning  | 6    | @id=reports\nFeature: Reports\n  Rule: R\n    Scenario: S\n      Then it is empty\n      Then the reason is the refund rule. |
        | a tag after a comment on its line | tag-syntax          | error    | 1    | @id=reports # owned by @owner=core\nFeature: Reports                                                                         |
        | a value with an @ in it           | tag-syntax          | error    | 1    | @id=reports @owner=a@b.c\nFeature: Reports                                                                                   |
        | a value with a space              | gherkin-syntax      | error    | 1    | @id=reports @title=Two words\nFeature: Reports                                                                               |
        | a Feature in a description        | gherkin-syntax      | error    | 3    | @id=reports\nFeature: Reports\n  Feature: Invoices                                                                           |

    Scenario: A spec saved with CRLF line endings is reported at the lines it has
      Given a file "specs/reports.feature" containing:
        """
        @id=reports @maturity=idea # owned by @owner=core
        Feature: Reports

          # Why
          Shoppers want reports.

          Rule: A report lists the orders of a month

            Scenario: A month without orders
              Then the report is empty
              Then the reason is that nothing was sold.
        """
      And the file "specs/reports.feature" is saved with CRLF line endings
      When the workspace is checked
      Then sdp reports:
        | rule                | at                       |
        | tag-syntax          | specs/reports.feature:1  |
        | description-comment | specs/reports.feature:4  |
        | prose-step          | specs/reports.feature:11 |

  @decided-by:declared-maturity-derived-stage
  Rule: A live feature without a live rule, or a live rule without an example, is an error

    What is built would otherwise pass while testing nothing. Work still to come is the team's
    judgement at any rung, so check asks nothing of it.

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

  @decided-by:declared-maturity-derived-stage
  Rule: A maturity is a rung of the ladder

    Any other word would switch the examples under it off in silence.

    Scenario: A maturity off the ladder
      Given these specs:
        | tags                             | Feature       |
        | @id=gift-wrapping @maturity=done | Gift wrapping |
      When the workspace is checked
      Then sdp reports "maturity-off-ladder"

  @decided-by:free-vocabulary
  Rule: A rung, a stage or change is no kind, unless the workspace names it one

    How far work has come is its maturity, and a change is rules of a feature: a spec of such a kind
    would be no work, never the feature that was meant.

    Scenario Outline: A kind named <word>, <case>
      Given a file "sdp.config.yaml" containing:
        """
        <config>
        """
      And these specs:
        | tags                           | Feature       |
        | @id=gift-wrapping @kind=<word> | Gift wrapping |
      When the workspace is checked
      Then sdp reports "<reported>"

      Examples:
        | word     | case                              | config                                   | reported   |
        | idea     | a rung                            | # every key at its default               | not-a-kind |
        | verified | a stage                           | # every key at its default               | not-a-kind |
        | change   | the kind sdp retired              | # every key at its default               | not-a-kind |
        | idea     | a rung the workspace names a kind | vocabulary: { words: { kinds: [idea] } } | nothing    |

  @decided-by:still-to-come-is-marked-where-it-is-written
  Rule: Nothing live at the base stops being live without an error

    A test turned off fails no run, so only the comparison with the base can tell that it is gone.

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
        @id=cart <feature tags>
        Feature: Cart

          <rule tags>
          Rule: A cart holds what was added

            <example tags>
            Scenario: Add an item
              Then the cart holds 1 item
        """
      When I run "sdp check --json"
      Then the exit code is 1
      And the JSON output has:
        | data.rule | <reported> |

      Examples:
        | change                         | feature tags    | rule tags       | example tags | reported                                     |
        | A maturity on the live feature | @maturity=ready |                 |              | demotion                                     |
        | A maturity on the live rule    |                 | @maturity=draft |              | demotion, untested-feature                   |
        | The live rule made a question  |                 | @open           |              | demotion, question-example, untested-feature |
        | The live example made a gate   |                 |                 | @gate        | example-dropped                              |

    Scenario Outline: A live example gone is reported where it was: <where>
      Given a file "specs/cart.feature" containing:
        """
        <spec>
        Feature: <title>

          <rule>
        """
      When I run "sdp check --json"
      Then the exit code is 1
      And the JSON output reports at least:
        | rule            | node             | at   | message   |
        | example-dropped | cart#add-an-item | <at> | <message> |

      Examples:
        | where                               | spec                      | title  | rule                              | at                   | message              |
        | under its rule, which is still here | @id=cart                  | Cart   | Rule: A cart holds what was added | specs/cart.feature:4 | cart#add-an-item     |
        | in its feature, its rule gone too   | @id=cart                  | Cart   |                                   | specs/cart.feature:1 | cart#add-an-item     |
        | as the base had it, its spec gone   | @id=basket @maturity=idea | Basket |                                   |                      | specs/cart.feature:6 |

  @decided-by:still-to-come-is-marked-where-it-is-written
  Rule: An example stays itself while it keeps its steps or its name in its spec, or a @replaces names it

    A name is no evidence in another spec: an example deleted and an unrelated one of its name added
    elsewhere would hide each other.

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

    Scenario Outline: The live example <change>
      Given a file "specs/cart.feature" containing:
        """
        @id=cart
        Feature: Cart

          Rule: <rule>

            <tags>
            Scenario: Add a lamp
              Then <then>
        """
      When I run "sdp check --json"
      Then the exit code is <exit code>
      And the JSON output has:
        | data.rule | <reported> |

      Examples:
        | change                                                         | rule                        | tags                       | then                  | exit code | reported        |
        | and its rule renamed                                           | A cart keeps what was added |                            | the cart holds 1 item | 0         | nothing         |
        | renamed and its steps edited                                   | A cart holds what was added |                            | the cart holds 1 lamp | 1         | example-dropped |
        | renamed and its steps edited, named by @replaces where it went | A cart holds what was added | @replaces:cart#add-an-item | the cart holds 1 lamp | 0         | nothing         |

    Scenario Outline: The live example moved to another spec under its name, its steps edited, <named>
      Given a file "specs/basket.feature" containing:
        """
        @id=basket
        Feature: Basket

          Rule: A basket holds what was added

            <tags>
            Scenario: Add an item
              Then the basket holds 1 item
        """
      When I run the pipeline:
        """
        rm specs/cart.feature && sdp check --json
        """
      Then the exit code is <exit code>
      And the JSON output has:
        | data.rule | <reported> |

      Examples:
        | named                                | tags                       | exit code | reported        |
        | and nothing names it                 |                            | 1         | example-dropped |
        | and named by @replaces where it went | @replaces:cart#add-an-item | 0         | nothing         |

  @decided-by:still-to-come-is-marked-where-it-is-written
  Rule: A live rule or feature is deleted only where a live replacement with a new live example names it

    A replacement keeps the coverage it takes over: a test the base already had takes over no other.

    Background:
      Given a file "specs/cart.feature" containing:
        """
        @id=cart
        Feature: Cart

          Rule: A cart accepts coupons

            Scenario: Apply a coupon
              Then the total is reduced

          Rule: A cart holds what was added

            Scenario: Add an item
              Then the cart holds 1 item
        """
      And the files are committed on the branch "main"

    Scenario Outline: The rule that holds what was added, replaced <how>
      Given a file "specs/cart.feature" containing:
        """
        <spec>
        Feature: Cart

          Rule: A cart accepts coupons

            Scenario: Apply a coupon
              Then the total is reduced

          <rule tags>
          Rule: A cart holds each item once

            Scenario: Add an item twice
              Then <then>
        """
      When I run "sdp check --json"
      Then the exit code is <exit code>
      And the JSON output has:
        | data.rule | <reported> |

      Examples:
        | how                                                    | spec                                                | rule tags                                                  | then                       | exit code | reported                       |
        | by a live rule with a new live example                 | @id=cart                                            | @replaces:cart#a-cart-holds-what-was-added                 | the cart holds 1 item once | 0         | nothing                        |
        | by a live rule whose example the base had              | @id=cart                                            | @replaces:cart#a-cart-holds-what-was-added                 | the total is reduced       | 1         | example-dropped                |
        | by a rule still to come                                | @id=cart                                            | @maturity=ready @replaces:cart#a-cart-holds-what-was-added | the cart holds 1 item once | 1         | dangling-link, example-dropped |
        | with its feature, by a live feature with a new example | @id=shopping-cart @replaces:cart                    |                                                            | the cart holds 1 item once | 0         | nothing                        |
        | named on its own feature, not on the rule that does    | @id=cart @replaces:cart#a-cart-holds-what-was-added |                                                            | the cart holds 1 item once | 1         | example-dropped, replacement   |

  Rule: A @replaces that replaces nothing is a warning that says which to name instead, or to delete it

    On a branch it is a name mistyped; once the replacement is merged, it is done.

    Background:
      Given a file "specs/cart.feature" containing:
        """
        @id=cart
        Feature: Cart

          Rule: A cart accepts coupons

            Scenario: Apply a coupon
              Then the total is reduced

          Rule: A cart holds what was added

            Scenario: Add an item
              Then the cart holds 1 item
        """
      And the files are committed on the branch "main"

    Scenario Outline: A @replaces of a rule the base never had, <where>
      Given a file "specs/cart.feature" containing:
        """
        @id=cart
        Feature: Cart

          @replaces:cart#a-cart-holds-all
          Rule: A cart holds each item once

            Scenario: Add an item twice
              Then the cart holds 1 item once
        """
      And the files are committed on the branch "<branch>"
      When I run "sdp check --json"
      Then the exit code is <exit code>
      And the JSON output reports at least:
        | rule             | severity | node                             | at                   | hint   |
        | replaces-nothing | warning  | cart#a-cart-holds-each-item-once | specs/cart.feature:4 | <hint> |

      Examples:
        | where                                       | branch | exit code | hint                                                                                                                                                                  |
        | on a branch, meant as the rule most like it | change | 1         | if it means cart#a-cart-holds-what-was-added, built at the base, write `@replaces:cart#a-cart-holds-what-was-added`; if not, delete `@replaces:cart#a-cart-holds-all` |
        | once merged into the default branch         | main   | 0         | has the link too, so the replacement is merged: delete `@replaces:cart#a-cart-holds-all`                                                                              |

  Rule: The base is where HEAD meets the default branch, or what --base or the configuration names instead

    A change is judged against what it started from.

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
      When I run "<command>"
      Then the exit code is <exit code>
      And the output contains "<compared>"

      Examples:
        | named                      | configuration              | command               | exit code | compared                              |
        | by nobody                  | # every key at its default | sdp check             | 1         | (git merge-base HEAD refs/heads/main) |
        | with --base                | base: none                 | sdp check --base main | 1         | (git merge-base HEAD main)            |
        | none, in the configuration | base: none                 | sdp check             | 0         | the comparison is waived (base: none) |

  Rule: The base is read with the configuration it had

    A change that moves the specs, and the globs that find them, would otherwise compare nothing.

    Scenario: The specs moved to another folder, and a live feature made still to come
      Given a file "sdp.config.yaml" containing:
        """
        features: ["features/**/*.feature"]
        """
      And a file "features/cart.feature" containing:
        """
        @id=cart
        Feature: Cart

          Rule: A cart holds what was added

            Scenario: Add an item
              Then the cart holds 1 item
        """
      And the files are committed on the branch "main"
      And a file "sdp.config.yaml" containing:
        """
        features: ["specs/**/*.feature"]
        """
      And a file "specs/cart.feature" containing:
        """
        @id=cart @maturity=ready
        Feature: Cart
        """
      When I run the pipeline:
        """
        rm features/cart.feature && sdp check --json
        """
      Then the exit code is 1
      And the JSON output has:
        | data.rule | demotion, example-dropped |

  Rule: A check that compared nothing, or not all of the base, is incomplete

    A comparison that read less of the base may have missed a test turned off.

    Scenario: On a branch with no commit yet
      Given the files are committed on the branch "main"
      When I run the pipeline:
        """
        git checkout -q --orphan fresh && sdp check
        """
      Then the exit code is 2
      And the output contains "not compared: no live test was compared with a base"

    Scenario: A spec of the base that does not parse, deleted
      Given a file "specs/basket.feature" containing:
        """
        @id=basket
        Feature: Basket

          Rule: A basket holds what was added

            Scenario: Fill the basket
              Given the items:
                | name | count |
                | lamp |
        """
      And the files are committed on the branch "main"
      When I run the pipeline:
        """
        rm specs/basket.feature && sdp check --json
        """
      Then the exit code is 2
      And the JSON output has:
        | complete  | false   |
        | data.rule | nothing |
      And the output contains "not compared: specs/basket.feature at the base"
