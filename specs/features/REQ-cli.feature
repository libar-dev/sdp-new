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

  Rule: init starts a workspace where it is run, with a configuration that shows every default and the skill, and overwrites nothing

    The skill is the one generic guide to working with sdp, the same text sdp is developed with.

    Scenario: Run twice
      When I run "sdp init"
      Then the output contains "created sdp.config.yaml"
      And the output contains "created .claude/skills/sdp/SKILL.md"
      And the file "sdp.config.yaml" contains "# features: "
      And the file ".claude/skills/sdp/SKILL.md" contains "name: sdp"
      When I run "sdp init"
      Then the output contains "exists  sdp.config.yaml"
      And the output contains "exists  .claude/skills/sdp/SKILL.md"
      When I run "sdp check"
      Then the exit code is 0

    Scenario: Below another workspace
      Given a file "sdp.config.yaml" containing:
        """
        # every key at its default
        """
      When I run "sdp init" in "shop"
      Then the file "shop/sdp.config.yaml" contains "# features: "

  Rule: Any one-word kind can be created, and new --help names those with a template of their own

    Scenario: A kind without a template
      When I run "sdp new --help"
      Then the output contains "requirement, idea, nfr, decision, element, pattern, milestone, plan, phase, iteration, risk"
      And the output contains "idea (default), draft, specified or ready"
      When I run "sdp new gizmo Sprocket"
      Then the output lines are "GIZM-sprocket\tspecs/gizmo/GIZM-sprocket.feature"
      And the file "specs/gizmo/GIZM-sprocket.feature" contains "@id=GIZM-sprocket @kind=gizmo"

  Rule: A new spec holds only what stays in it, and the answer says what to write next

    Advice written into the file would outlive its use as prose nobody wrote.

    Scenario: A requirement
      When I run "sdp new requirement 'Saved carts'"
      Then the output lines are "REQ-saved-carts\tspecs/requirements/REQ-saved-carts.feature"
      And the file "specs/requirements/REQ-saved-carts.feature" is:
        """
        @id=REQ-saved-carts @maturity=idea
        Feature: Saved carts
        """
      And the output contains "next: write the idea in a sentence under the title"
      And the output contains "next: link it: @refines:EPIC-… @realized-by:ARCH-…"
      And the output contains "next: plan it: `@iteration:IT-…`"

    Scenario: An element and a pattern
      When I run "sdp new element Orders"
      Then the file "specs/architecture/ARCH-orders.feature" is:
        """
        @id=ARCH-orders
        Feature: Orders
        """
      And the output contains 'next: anchor it next to the declaration that is it: annotate(Thing, { is: "ARCH-orders" })'
      When I run "sdp new pattern Outbox"
      Then the output contains "next: elements that apply it link `@instance-of:PAT-outbox`"

    Scenario: A risk
      When I run "sdp new risk Outage"
      Then the file "specs/risks/RISK-outage.feature" is:
        """
        @id=RISK-outage
        Feature: Outage
        """
      And the output contains "next: link it: @affects:REQ-… @mitigated-by:REQ-… @due:MS-…"
      And the output contains "next: it is retired when the work that mitigates it is verified; `@status=tolerated` says we live with it instead"

    Scenario: A phase
      When I run "sdp new phase Hardening"
      Then the file "specs/delivery/PH-hardening.feature" is:
        """
        @id=PH-hardening
        Feature: Hardening
        """
      And the output contains "next: say under the title what this phase takes on, and why in this order"

  Rule: A new spec fails the check only for what its author has yet to write

    Scenario: Every template at its first maturity level
      Given specs created from the sdp new templates:
        | kind        | title         | maturity |
        | requirement | Wishlist      | idea     |
        | idea        | Gift wrapping |          |
        | element     | Orders        |          |
        | pattern     | Outbox        |          |
        | phase       | Elaboration   |          |
        | milestone   | Launch        |          |
        | risk        | Outage        |          |
      When the workspace is checked
      Then sdp reports nothing

    Scenario: Above the first maturity level, what the maturity claims
      Given specs created from the sdp new templates:
        | kind        | title        | maturity  |
        | requirement | Gift cards   | draft     |
        | requirement | Returns      | specified |
        | nfr         | Availability | ready     |
      When the workspace is checked
      Then sdp reports:
        | rule                 | node             |
        | maturity-criteria    | NFR-availability |
        | maturity-criteria    | REQ-gift-cards   |
        | maturity-criteria    | REQ-returns      |
        | template-placeholder | REQ-returns      |
        | template-placeholder | NFR-availability |

    Scenario: From specified on, the file has a rule with a scenario to fill in
      When I run "sdp new nfr 'Checkout latency' --maturity specified"
      Then the file "specs/quality/NFR-checkout-latency.feature" is:
        """
        @id=NFR-checkout-latency @maturity=specified
        Feature: Checkout latency

          Rule: <the rule, in one sentence>

            Scenario: <quality attribute scenario>
              Given <environment, e.g. normal load of 500 concurrent users>
              When <stimulus, e.g. a user submits an order>
              Then <response measure, e.g. confirmation is shown within 300 ms at p95>
        """
      And the output contains "next: fill in the rule and its scenario: Given the source and environment, When the stimulus, Then the response and its measure"

    Scenario: A decision starts as the sentence it must become
      When I run "sdp new decision 'Use Postgres'"
      Then the file "specs/decisions/DEC-use-postgres.feature" is:
        """
        @id=DEC-use-postgres
        Feature: Use Postgres

          Not <what a reasonable person would have chosen>, because <why>.
        """
      And the output contains "next: record a decision only for a choice that is hard to reverse, surprising without context and a real trade-off"
      When I run "sdp check --json"
      Then the JSON output has:
        | data.rule | template-placeholder             |
        | data.node | DEC-use-postgres                         |
        | data.file | specs/decisions/DEC-use-postgres.feature |
        | data.line | 4                                |

  Rule: A new spec's id is the kind's prefix and an ASCII slug of its title, or a number, and its file is named by it

    Scenario Outline: By kind and title
      When I run "sdp new <kind> '<title>'"
      Then the output contains "<id>\t<file>"

      Examples:
        | kind        | title           | id                  | file                                           |
        | requirement | Kasse für Gäste | REQ-kasse-fur-gaste | specs/requirements/REQ-kasse-fur-gaste.feature |
        | requirement | Корзина         | REQ-0001            | specs/requirements/REQ-0001.feature            |
        | idea        | Gift wrapping   | REQ-gift-wrapping   | specs/requirements/REQ-gift-wrapping.feature   |
        | decision    | Ödeme yöntemi   | DEC-odeme-yontemi   | specs/decisions/DEC-odeme-yontemi.feature      |
        | risk        | Vendor lock-in  | RISK-vendor-lock-in | specs/risks/RISK-vendor-lock-in.feature        |

    Scenario: --id names the node and --dir its directory, relative to the workspace root or absolute
      When I run "sdp new requirement 'Gift cards' --id REQ-vouchers --dir specs/payments"
      Then the output contains "REQ-vouchers\tspecs/payments/REQ-vouchers.feature"
      When I run "sdp new requirement 'Gift cards' --dir $PWD/specs/payments"
      Then the output contains "REQ-gift-cards\tspecs/payments/REQ-gift-cards.feature"
      And the file "specs/payments/REQ-gift-cards.feature" contains "@id=REQ-gift-cards"

    Scenario: A file written outside the workspace is not part of its graph, and the answer says so
      Given a file "shop/sdp.config.yaml" containing:
        """
        # every key at its default
        """
      When I run "sdp -C shop new requirement 'Gift cards' --dir $PWD/elsewhere"
      Then the output contains "/elsewhere/REQ-gift-cards.feature is outside the workspace"

    Scenario: A file the configured features do not match is not part of the graph, and the answer says so
      Given a file "shop/sdp.config.yaml" containing:
        """
        features: ["requirements/**/*.feature"]
        """
      When I run "sdp -C shop new requirement 'Gift cards'"
      Then the output contains "specs/requirements/REQ-gift-cards.feature is matched by no features glob (requirements/**/*.feature)"
      When I run "sdp -C shop new requirement 'Gift cards' --dir requirements"
      Then the output does not contain "note:"

  Rule: new never overwrites, and never writes a spec that would not read back as written

    Scenario: An id or a file that exists
      When I run "sdp new requirement Search --id REQ-search"
      Then the exit code is 1
      And the output contains "id REQ-search already exists at specs/REQ-search.feature:1"
      Given a file "specs/requirements/REQ-carts.feature" containing:
        """
        Notes on carts, not a spec.
        """
      When I run "sdp new requirement Carts"
      Then the exit code is 1
      And the output contains "specs/requirements/REQ-carts.feature already exists"

    Scenario: An id that only a dangling link names is free: creating it resolves the link
      Given these specs:
        | tags                                     | Feature |
        | @id=REQ-filters @realized-by:ARCH-facets | Filters |
      When I run "sdp new element Facets"
      Then the output contains "ARCH-facets\tspecs/architecture/ARCH-facets.feature"
      When I run "sdp check"
      Then the exit code is 0

    Scenario Outline: A title reads back as written, however it looks
      Given specs created from the sdp new templates:
        | kind        | title   |
        | requirement | <title> |
      When the workspace is checked
      Then sdp reports nothing
      And node "<id>" has attribute title = "<title>"

      Examples:
        | title                | id                      |
        | Checkout: guest flow | REQ-checkout-guest-flow |
        | Cart #2              | REQ-cart-2              |
        | 'Quoted' carts       | REQ-quoted-carts        |
        | true                 | REQ-true                |
        | 2026-11-12           | REQ-2026-11-12          |
        | [draft] Wishlist     | REQ-draft-wishlist      |
        | - Returns            | REQ-returns             |
        | @team: Invoices      | REQ-team-invoices       |

    Scenario: An id that would not read back
      When I run "sdp new requirement Carts --id ' '"
      Then the exit code is 1
      And the output contains "would not read back"

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

  Rule: check reports each diagnostic at the line to fix, down to the severity asked for, and fails only on an error

    Scenario Outline: Errors and a warning
      Given these specs:
        | tags   | Feature |
        | <tags> | Example |
      When I run "sdp check"
      Then the exit code is <exit code>
      And the output contains "[<rule>]"

      Examples:
        | tags                           | rule              | exit code |
        | @id=REQ-a @depends-on:REQ-gone | dangling-link     | 1         |
        | @id=REQ-a @maturity=draft      | maturity-criteria | 1         |
        | @id=REQ-a @maturity:draft      | link-syntax       | 1         |
        | @id=REQ-a @iteration:REQ-a     | plan-reference    | 0         |

    Scenario: --severity sets the least severe diagnostic shown
      Given a file "specs/REQ-a.feature" containing:
        """
        @id=REQ-a
        Feature: Example

          Rule: Something holds

            Scenario: Nothing yet
        """
      When I run "sdp check"
      Then the output contains "[scenario-empty]"
      And the output contains "0 error(s), 1 warning(s), 0 info"
      When I run "sdp check --severity error"
      Then the output does not contain "[scenario-empty]"

    Scenario: The diagnostics as data
      Given these specs:
        | tags                           | Feature |
        | @id=REQ-a @depends-on:REQ-gone | Example |
      When I run "sdp check --json"
      Then the exit code is 1
      And the JSON output has:
        | data.rule     | dangling-link       |
        | data.severity | error               |
        | data.node     | REQ-a               |
        | data.file     | specs/REQ-a.feature |
        | data.line     | 1                   |
