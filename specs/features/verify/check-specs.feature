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

    Scenario Outline: What the official parser reads otherwise than it is written: <case>
      Given a file "specs/reports.feature" containing:
        """
        @id=reports <feature tags>
        Feature: Reports

          <description>

          Rule: A report lists the orders of a month

            <example tags>
            Scenario: A month without orders
              Then the report is empty
        """
      When the workspace is checked
      Then sdp reports at least:
        | rule   | severity | at                           | message   |
        | <rule> | error    | specs/reports.feature:<line> | <message> |

      Examples:
        | case                                  | feature tags                    | description       | example tags   | rule              | line | message                                      |
        | A key that is no word                 | @1st=x                          |                   |                | tag-syntax        | 1    | this key names nothing                       |
        | A value with an @ in it               | @owner=a@b.c                    |                   |                | tag-syntax        | 1    | a tag holds no @                             |
        | A tag after a comment on its line     | # owned by @owner=core          |                   |                | tag-syntax        | 1    | so the tags in it are dropped: @owner=core   |
        | A key written as a value and as a map | @owner=core @owner.team=billing |                   |                | tag-syntax        | 1    | owner is written as a value and as a map     |
        | A value with a space                  | @title=Two words                |                   |                | gherkin-syntax    | 1    |                                              |
        | A kind sdp makes                      | @kind=scenario                  |                   |                | derived-attribute | 1    | sdp makes the nodes of kind scenario itself  |
        | A Feature in a description            |                                 | Feature: Invoices |                | gherkin-syntax    | 4    | is read as text of the description above it  |
        | A maturity on a Scenario              |                                 |                   | @maturity=idea | tag-syntax        | 8    | only a Feature or a Rule declares a maturity |
        | An id on a Scenario                   |                                 |                   | @id=total      | tag-syntax        | 8    | only a Feature says what it is with @id=     |

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

    Scenario: A path the globs match that is no file
      When I run the pipeline:
        """
        mkdir specs && ln -s nowhere.feature specs/basket.feature && sdp check --base none --json
        """
      Then the exit code is 1
      And the JSON output has:
        | complete      | false                |
        | data.rule     | not-a-file           |
        | data.severity | error                |
        | data.file     | specs/basket.feature |

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
        @id=gift-wrapping @<key>=<word>
        Feature: Gift wrapping
        """
      When the workspace is checked
      Then sdp reports "<reported>"

      Examples:
        | case                              | config                                   | key      | word     | reported            |
        | A maturity off the ladder         | # every key at its default               | maturity | done     | maturity-off-ladder |
        | A kind named like a rung          | # every key at its default               | kind     | idea     | not-a-kind          |
        | A kind named like a stage         | # every key at its default               | kind     | verified | not-a-kind          |
        | The kind sdp retired              | # every key at its default               | kind     | change   | not-a-kind          |
        | A rung the workspace names a kind | vocabulary: { words: { kinds: [idea] } } | kind     | idea     | nothing             |

  @decided-by:still-to-come-is-marked-where-it-is-written
  Rule: Nothing live at the base stops being live without an error, and an example stays itself under its name, its steps, or the @replaces that names it

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
        <spec>
        Feature: Cart

          <rule tags>
          Rule: <rule>

            <example tags>
            Scenario: <example>
              Then <then>
        """
      When I run "sdp check --json"
      Then the exit code is <exit code>
      And the JSON output has:
        | data.rule | <reported> |

      Examples: What was live goes back, or is gone
        | change                                        | spec                     | rule tags       | rule                        | example tags               | example     | then                  | exit code | reported                                     |
        | A maturity on the live feature                | @id=cart @maturity=ready |                 | A cart holds what was added |                            | Add an item | the cart holds 1 item | 1         | demotion                                     |
        | A maturity on the live rule                   | @id=cart                 | @maturity=draft | A cart holds what was added |                            | Add an item | the cart holds 1 item | 1         | demotion, untested-feature                   |
        | The live rule made a question                 | @id=cart                 | @open           | A cart holds what was added |                            | Add an item | the cart holds 1 item | 1         | demotion, question-example, untested-feature |
        | The live example made a gate                  | @id=cart                 |                 | A cart holds what was added | @gate                      | Add an item | the cart holds 1 item | 1         | example-dropped                              |
        | The live example and its rule renamed         | @id=cart                 |                 | A cart keeps what was added |                            | Add a lamp  | the cart holds 1 item | 0         | nothing                                      |
        | The live example renamed and its steps edited | @id=cart                 |                 | A cart holds what was added |                            | Add a lamp  | the cart holds 1 lamp | 1         | example-dropped                              |
        | The same, where it went named by @replaces    | @id=cart                 |                 | A cart holds what was added | @replaces:cart#add-an-item | Add a lamp  | the cart holds 1 lamp | 0         | nothing                                      |

      Examples: What was live replaced in the change that deletes it
        | change                                                 | spec                                                | rule tags                                                  | rule                        | example tags | example           | then                               | exit code | reported                                         |
        | The rule, by a live rule with a new live example       | @id=cart                                            | @replaces:cart#a-cart-holds-what-was-added                 | A cart holds each item once |              | Add an item twice | the cart holds 1 item once         | 0         | nothing                                          |
        | The rule, by a rule still to come                      | @id=cart                                            | @maturity=ready @replaces:cart#a-cart-holds-what-was-added | A cart holds each item once |              | Add an item twice | the cart holds 1 item once         | 1         | dangling-link, example-dropped, untested-feature |
        | The feature, by a live feature with a new live example | @id=shopping-cart @replaces:cart                    |                                                            | A cart holds what was added |              | Fill the cart     | the cart holds 1 item at its price | 0         | nothing                                          |
        | The rule, named on its own feature                     | @id=cart @replaces:cart#a-cart-holds-what-was-added |                                                            | A cart holds each item once |              | Add an item twice | the cart holds 1 item once         | 1         | example-dropped, replacement                     |

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

    Scenario Outline: The live example in another spec under its name, its steps edited: <case>
      Given a file "specs/cart.feature" containing:
        """
        @id=cart
        Feature: Cart

          Rule: A cart has a total

            Scenario: The total of one item
              Then the total is the price of the item
        """
      And a file "specs/basket.feature" containing:
        """
        @id=basket
        Feature: Basket

          Rule: A basket holds what was added

            Scenario: Add an item
              Then the basket holds 1 item
        """
      And a file "specs/wishlist.feature" containing:
        """
        @id=wishlist
        Feature: Wishlist

          Rule: A wishlist holds what was added

            Scenario: <wishlist example>
              Then the wishlist holds 1 item
        """
      When I run the pipeline:
        """
        <command>
        """
      Then the exit code is <exit code>
      And the JSON output has:
        | data.rule | <reported> |

      Examples:
        | case                                                         | command                                   | wishlist example | exit code | reported        |
        | the spec it was in gone                                      | rm specs/cart.feature && sdp check --json | Keep an item     | 0         | nothing         |
        | the spec it was in split, its rule moved with it             | sdp check --json                          | Keep an item     | 0         | nothing         |
        | the spec it was in gone, another with an example of its name | rm specs/cart.feature && sdp check --json | Add an item      | 1         | example-dropped |

    Scenario Outline: What @replaces names once live rules are gone: <case>
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
      And a file "specs/cart.feature" containing:
        """
        @id=cart
        Feature: Cart

          @replaces:<replaces>
          Rule: <rule>

            Scenario: <example>
              Then <then>
        """
      And the files are committed on the branch "<branch>"
      When I run "sdp check --json"
      Then the exit code is <exit code>
      And the JSON output reports at least:
        | rule       | severity   | node   | at                        | hint   |
        | <reported> | <severity> | <node> | specs/cart.feature:<line> | <hint> |

      Examples:
        | case                                                           | replaces                         | rule                        | example           | then                       | branch | exit code | reported         | severity | node                             | line | hint                                                                                                                                                                  |
        | the rule left, whose example the base had live                 | cart#a-cart-holds-what-was-added | A cart accepts coupons      | Apply a coupon    | the total is reduced       | change | 1         | example-dropped  | error    | cart#add-an-item                 | 1    | with a new live example of its own                                                                                                                                    |
        | a rule neither has, on a branch, meant as the one most like it | cart#a-cart-holds-all            | A cart holds each item once | Add an item twice | the cart holds 1 item once | change | 1         | replaces-nothing | warning  | cart#a-cart-holds-each-item-once | 4    | if it means cart#a-cart-holds-what-was-added, built at the base, write `@replaces:cart#a-cart-holds-what-was-added`; if not, delete `@replaces:cart#a-cart-holds-all` |
        | the same, once merged into the default branch                  | cart#a-cart-holds-all            | A cart holds each item once | Add an item twice | the cart holds 1 item once | main   | 0         | replaces-nothing | warning  | cart#a-cart-holds-each-item-once | 4    | has the link too, so the replacement is merged: delete `@replaces:cart#a-cart-holds-all`                                                                              |

  Rule: The base is where HEAD meets the default branch, or what --base or the configuration names; base: none waives the comparison, and a check that compared nothing, or not all of the base, is incomplete

    A change is judged against what it started from, and a comparison that read less of it may have
    missed a test turned off.

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
