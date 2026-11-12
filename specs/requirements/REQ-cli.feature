@id=REQ-cli @maturity=ready @cli @agents
@refines:CAP-agent-collaboration @realized-by:ARCH-cli
@iteration:I1 @activity.implementation:I1 @activity.test:I1
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

    Scenario Outline: A result cut short by a limit is incomplete and says which, even when it is empty
      Given a chain of 14 nodes linked by "next"
      When I run "<command>"
      Then the exit code is 2
      And the output contains "cut short: a + edge reaches further than 12 hops"

      Examples:
        | command                            |
        | sdp q '#N1 -next+-> node14'        |
        | sdp q '#N1 -next+-> node14' --ids  |
        | sdp q '#N1 -next+-> node14' --json |
        | sdp graph -q '#N1 -next+-> node14' |

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

  Rule: A name the workspace does not know comes back with the closest one it does: a query notes it, a lookup by id refuses it

    Scenario: A misspelt relation and attribute in a query
      When I run "sdp q 'requirement -realised-by-> element[titel]'"
      Then the exit code is 0
      And the output contains "0 node(s)"
      And the output contains "note: no relation realised-by; closest: realized-by"
      And the output contains "note: element has no attribute titel; closest: title"

    Scenario: A misspelt id
      When I run "sdp show ARCH-indx"
      Then the exit code is 1
      And the output contains "no node ARCH-indx; closest: ARCH-index"

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
      And the output contains "next: link it: @refines:CAP-… @realized-by:ARCH-…"
      And the output contains "next: plan it: `@iteration:E1`"

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
      Then the file "specs/risks/RISK-0001.feature" is:
        """
        @id=RISK-0001
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
      Then the file "specs/decisions/DEC-0002.feature" is:
        """
        @id=DEC-0002
        Feature: Use Postgres

          Not <what a reasonable person would have chosen>, because <why>.
        """
      And the output contains "next: record a decision only for a choice that is hard to reverse, surprising without context and a real trade-off"
      When I run "sdp check --json"
      Then the JSON output has:
        | data.rule | template-placeholder             |
        | data.node | DEC-0002                         |
        | data.file | specs/decisions/DEC-0002.feature |
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
        | decision    | Ödeme yöntemi   | DEC-0002            | specs/decisions/DEC-0002.feature               |
        | risk        | Vendor lock-in  | RISK-0001           | specs/risks/RISK-0001.feature                  |

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

  Rule: A new iteration follows the one that ends last, in its phase

    Scenario: After an iteration of the same phase
      Given a file "specs/delivery/E1.feature" containing:
        """
        @id=E1 @kind=iteration @phase:PH-elaboration @start=2026-11-16 @end=2026-11-27
        Feature: Architecture baseline
        """
      When I run "sdp new iteration Packaging --id E2"
      Then the file "specs/delivery/E2.feature" is:
        """
        @id=E2 @kind=iteration @phase:PH-elaboration @start=2026-11-28 @end=2026-12-11
        Feature: Packaging
        """
      And the output contains "next: check its dates and its `@phase:`"

    Scenario: Not after an iteration whose end is no date
      Given a file "specs/delivery/E1.feature" containing:
        """
        @id=E1 @kind=iteration @phase:PH-elaboration @start=2026-11-16 @end=2026-11-31
        Feature: Architecture baseline
        """
      When I run "sdp new iteration Packaging --id E2"
      Then the exit code is 1
      And the output contains 'E1 ends on "2026-11-31", which is not a date'
      And the file "specs/delivery/E2.feature" does not exist

  Rule: types declares every id with its kind for annotate() to accept, and check says when the declarations no longer match

    Scenario: After a spec is added
      When I run "sdp types"
      Then the exit code is 0
      And the file ".sdp/ids.d.ts" contains '"REQ-search": "requirement"'
      When I run "sdp check --json"
      Then the JSON output has:
        | data | nothing |
      Given these specs:
        | tags           | Feature |
        | @id=REQ-export | Export  |
      When I run "sdp check --json"
      Then the JSON output has:
        | data.rule | types-stale   |
        | data.file | .sdp/ids.d.ts |

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

  Rule: q answers one node per line, or only the ids or the paths, and counts them on stderr

    Scenario: A node per line: id, kind, status or stage, title, file:line
      When I run "sdp q 'requirement -realized-by-> element'"
      Then the output lines are "ARCH-index\telement\t\tSearch index\tspecs/ARCH-index.feature:1"
      And the output contains "1 node(s)"

    Scenario: q lists a node by the status it declares, else by its stage
      Given these specs:
        | tags                                           | Feature                   |
        | @id=RISK-0001 @status=tolerated @maturity=idea | The index outgrows memory |
      When I run "sdp q risk"
      Then the output contains "RISK-0001\trisk\ttolerated"
      When I run "sdp q requirement"
      Then the output contains "REQ-search\trequirement\tspecified"

    Scenario: q --ids prints only the ids, one per line
      When I run "sdp q 'element' --ids"
      Then the output lines are "ARCH-index, ARCH-cache"

    Scenario: q --paths prints each path on one line, every edge as it points
      When I run "sdp q '#ARCH-index <-realized-by- requirement' --paths"
      Then the output lines are "ARCH-index <-realized-by- REQ-search"

    Scenario: q --json answers with the node records, and with the paths when asked
      When I run "sdp q 'requirement -realized-by-> element' --paths --json"
      Then the JSON output has:
        | data.nodes            | ARCH-index             |
        | data.paths.nodes      | REQ-search, ARCH-index |
        | data.paths.edges.from | REQ-search             |
        | data.paths.edges.rel  | realized-by            |

  Rule: show prints a node with its attributes and every edge, with the title at its other end

    Scenario: A requirement as text
      When I run "sdp show REQ-search"
      Then the output contains 'maturity: "specified"'
      And the output contains "-realized-by-> ARCH-index  Search index"
      And the output contains "<-rule-of- REQ-search#a-product-is-found-by-its-name  A product is found by its name"

    Scenario: As data: the node, its edges and its neighbours
      When I run "sdp show ARCH-index --json"
      Then the JSON output has:
        | data.node.id          | ARCH-index               |
        | data.neighbours       | DEC-0001, REQ-search     |
        | data.out.to           | DEC-0001                 |
        | data.in.from          | REQ-search               |
        | data.in.declared.file | specs/REQ-search.feature |

  Rule: context prints the bundle of one node: its spec, what is in reach, and the steps still to write

    Scenario: A requirement with an open question and steps without a definition
      When I run "sdp context REQ-search"
      Then the output contains "Shoppers find products by name."
      And the output contains "ARCH-index"
      And the output contains "DEC-0001"
      And the output contains "1 open question(s)"
      And the output contains 'suggested: `When("a shopper searches for {string}", ({ world, args: [string] }) => pending())`'

  Rule: arch prints the declared architecture and its links, as text, as data or as a flowchart

    Scenario: The architecture as text
      When I run "sdp arch"
      Then the output contains "Architecture: 2 node(s)"
      And the output contains "ARCH-index -decided-by-> DEC-0001"
      And the output contains "ARCH-cache — Page cache (element)"

    Scenario: As data, apart from what shaped it and the code anchored to it
      When I run "sdp arch --json"
      Then the JSON output has:
        | data.architecture | ARCH-cache, ARCH-index |
        | data.drivers      | DEC-0001               |
        | data.anchors      | nothing                |

    Scenario: As a Mermaid flowchart
      When I run "sdp arch --mermaid"
      Then the output contains "flowchart LR"
      And the output contains "-->|decided-by|"

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

  Rule: lifecycle shows where the project is, the first milestone not met, then the planned work, with the evidence apart from the plan

    Scenario: The milestones and the chart as text
      When I run "sdp lifecycle"
      Then the output line with "MS-beta" contains "▶"
      And the output line with "MS-beta" contains "Construction"
      And the output line with "MS-beta" contains "C1"
      And the output contains "DISCIPLINE ACTIVITY"
      And the output contains "░ ▒ ▓ █  more work in an iteration, relative to the discipline's busiest; blank: none"

    Scenario: Where the project is, as data
      When I run "sdp lifecycle --json"
      Then the JSON output has:
        | data.position.milestone             | MS-beta         |
        | data.position.phase                 | PH-construction |
        | data.milestones                     | MS-beta         |
        | data.milestones.gate.passed         | 0               |
        | data.phases                         | PH-construction |
        | data.iterations                     | C1              |
        | data.disciplines.requirements       | 1               |
        | data.work.evidence.stages.specified | 1               |

  Rule: Before there is a plan, lifecycle says how to write one, and the templates write a plan it shows

    Scenario: In a fresh workspace
      When I run "sdp -C fresh init"
      Then the output contains "created sdp.config.yaml"
      When I run "sdp -C fresh lifecycle"
      Then the output contains 'sdp new phase "Elaboration"'
      And the output contains 'sdp new iteration "<title>"'
      When I run "sdp -C fresh new plan 'Delivery plan'"
      Then the output contains "PLAN-delivery-plan\tspecs/delivery/PLAN-delivery-plan.feature"
      And the output contains 'next: end each phase with a milestone: sdp new milestone "<title>" writes one that `@closes:PH-elaboration`'
      When I run the pipeline:
        """
        sdp -C fresh new phase Elaboration
        sdp -C fresh new iteration 'Architecture baseline' --id E1
        sdp -C fresh new milestone 'Architecture baseline'
        """
      Then the exit code is 0
      And the file "fresh/specs/delivery/E1.feature" contains "@id=E1 @kind=iteration @phase:PH-elaboration"
      And the file "fresh/specs/delivery/MS-architecture-baseline.feature" contains "@id=MS-architecture-baseline @closes:PH-elaboration"
      When I run "sdp -C fresh lifecycle"
      Then the output line with "MS-architecture-baseline" contains "Elaboration"
      And the output line with "MS-architecture-baseline" contains "E1"

    Scenario: In the workspace's own words
      Given a file "fresh/sdp.config.yaml" containing:
        """
        vocabulary:
          kinds: { phase: [stage], iteration: [sprint] }
          relations: { phase: [in-stage], plan: [in-sprint] }
        """
      When I run "sdp -C fresh lifecycle"
      Then the output contains 'sdp new stage "Elaboration"'
      And the output contains 'sdp new sprint "<title>"'

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

  Rule: steps lists the step definitions a run would know, built-in ones included, as file:line, keyword and expression

    It answers "is there a step for this already?" before a near-duplicate is written.

    Background:
      Given a file "specs/steps/search.steps.ts" containing:
        """
        import { defineSteps } from "sdp/steps"

        export default defineSteps(() => ({}), ({ Given, When }) => {
          Given("a catalogue with a desk lamp", () => {})
          When(/^a shopper searches for "(.*)"$/, () => {})
        })
        """

    Scenario: Every definition, one per line
      When I run "sdp steps"
      Then the output contains "specs/steps/search.steps.ts:4\tGiven\ta catalogue with a desk lamp"
      And the output contains 'specs/steps/search.steps.ts:5\tWhen\t/^a shopper searches for "(.*)"$/'
      And the output contains "\tThen\tthe query {string} returns no results"
      And the output contains "11 step definition(s)"

    Scenario Outline: steps <text> finds the definitions that mention the text or match it as a step
      When I run "sdp steps '<text>'"
      Then the output contains "<found>"
      And the output contains "1 step definition(s)"

      Examples:
        | text                             | found                           |
        | desk lamp                        | specs/steps/search.steps.ts:4   |
        | a shopper searches for \"lamp\"  | specs/steps/search.steps.ts:5   |
        | there are no warning diagnostics | there are no {word} diagnostics |

    Scenario: steps --json is the same list as data
      When I run "sdp steps catalogue --json"
      Then the JSON output has:
        | data.file       | specs/steps/search.steps.ts  |
        | data.line       | 4                            |
        | data.keyword    | Given                        |
        | data.expression | a catalogue with a desk lamp |

  Rule: run executes what its targets name: a spec id, a scenario id, or a file or directory relative to the current directory

    Scenario: A file, from a subdirectory
      When I run "sdp run REQ-search.feature --json" in "specs"
      Then the JSON output has:
        | data.scenarios         | REQ-search#find-a-product-by-name |
        | data.passed            | true                              |
        | data.summary.undefined | 1                                 |

  Rule: A run's report says where to look: the definition of a failing step, the examples --tags left out, a step file that defines nothing

    Scenario: A step that fails shows where it is defined; passed steps show with --verbose
      Given a file "specs/steps/search.steps.ts" containing:
        """
        import { defineSteps } from "sdp/steps"

        export default defineSteps(() => ({}), ({ Given, When, Then }) => {
          Given("a catalogue with a desk lamp", () => {})
          When("a shopper searches for {string}", () => {})
          Then("the desk lamp is found", () => {
            throw new Error("no results")
          })
        })
        """
      When I run "sdp run REQ-search"
      Then the exit code is 1
      And the output line with "Then the desk lamp is found" contains "defined at specs/steps/search.steps.ts:6"
      And the output contains "no results"
      And the output does not contain "Given a catalogue with a desk lamp"
      When I run "sdp run REQ-search --verbose"
      Then the exit code is 1
      And the output contains "Given a catalogue with a desk lamp"

    Scenario: Examples that --tags left out
      Given a file "specs/REQ-sort.feature" containing:
        """
        @id=REQ-sort
        Feature: Sort

          Rule: A shopper sorts by any order

            Scenario Outline: Sort by <order>
              When a shopper sorts by <order>

              @fast
              Examples:
                | order |
                | name  |

              @slow
              Examples:
                | order      |
                | popularity |
        """
      When I run "sdp run REQ-sort --tags @fast"
      Then the exit code is 0
      And the output line with "example Sort by popularity" contains "not selected"
      And the output contains "1 example(s) not selected are skipped"

    Scenario: A step file that defines nothing
      Given a file "specs/steps/search.steps.ts" containing:
        """
        export const phrases = ["a catalogue with a desk lamp"]
        """
      When I run "sdp run"
      Then the exit code is 0
      And the output contains "note: specs/steps/search.steps.ts defines no steps"

  Rule: run and gate start only on a workspace they can read whole, with every scenario under a rule

    A scenario left unread, a fact or a link dropped, or an id two specs claim would make the run
    incomplete and its record untrue; a scenario outside a rule is in a spec sdp check rejects.

    Scenario Outline: A file sdp cannot read, a tag it drops, an id two specs claim, a scenario outside a rule
      Given a file "<file>" containing:
        """
        <content>
        """
      When I run "<command>"
      Then the exit code is 1
      And the output contains "<file>:<line> [<rule>]"
      And the file ".sdp/results.json" does not exist

      Examples:
        | command          | file                      | content                                                                                     | line | rule           |
        | sdp run          | specs/broken.feature      | Feature: Broken\n  Scenario: Half written\n    Given a note:\n      ```\n      never closed | 6    | gherkin-syntax |
        | sdp gate MS-beta | specs/search-copy.feature | @id=REQ-search\nFeature: Search again                                                       | 1    | duplicate-id   |
        | sdp run          | specs/REQ-b.feature       | @id=REQ-b @iteration=C1\nFeature: B                                                         | 1    | link-syntax    |
        | sdp run          | specs/REQ-b.feature       | @id=REQ-b\nFeature: B\n  Scenario: Outside\n    Then there are no error diagnostics            | 3    | scenario-outside-rule |

  Rule: A gate is met only when every one of its scenarios passed, run against the current graph

    Scenario: A step not automated yet
      Given a file "specs/MS-release.feature" containing:
        """
        @id=MS-release
        Feature: Release

          Rule: The package is published

            Scenario: Published
              Given the release candidate is tagged
        """
      When I run "sdp gate MS-release"
      Then the exit code is 1
      And the output contains "1 undefined"

  @decided-by:DEC-0007
  Rule: Nothing enforces a gate unasked: a run reports it, and only sdp gate fails on it

    Scenario: A run with a gate that is not met
      When I run "sdp run --json"
      Then the exit code is 0
      And the JSON output has:
        | data.summary.undefined | 1 |
        | data.gates.failed      | 1 |
      When I run "sdp gate MS-beta"
      Then the exit code is 1

    Scenario: The build of sdp itself enforces no gate
      When I run "grep verify package.json" in the repository
      Then the output does not contain "gate"

  @decided-by:DEC-0007
  Rule: gate --record writes @met on a milestone whose gate passes as the workspace is when it is written, and on no other, and a milestone that is met is closed

    Ending a phase is somebody's act, so nothing is recorded unasked; and a criterion edited while
    the gate ran has not run, so it is not closed.

    Scenario: gate --record records nothing while the gate does not pass
      When I run "sdp gate MS-beta --record"
      Then the exit code is 1
      And the output contains "MS-beta is not recorded as met"
      And the file "specs/MS-beta.feature" does not contain "@met="

    Scenario: gate --record writes met on the tag line of a milestone whose gate passes, and the next one is where the project is
      Given a file "specs/MS-alpha.feature" containing:
        """
        @id=MS-alpha @closes:C1   # the first iteration
        Feature: Alpha

          Rule: The search is planned

            Scenario: There is an iteration
              Then the query "iteration" returns 1 result
        """
      When I run "sdp gate MS-alpha --record"
      Then the exit code is 0
      And the file "specs/MS-alpha.feature" contains "@id=MS-alpha @closes:C1 @met=20"
      And the file "specs/MS-alpha.feature" contains "   # the first iteration"
      When I run "sdp q milestone[met=$TODAY] --ids"
      Then the output lines are "MS-alpha"
      When I run "sdp lifecycle --json"
      Then the JSON output has:
        | data.position.milestone | MS-beta  |
        | data.milestones.0.id    | MS-alpha |
        | data.milestones.0.gate  | null     |

    Scenario: gate --record writes nothing when the milestone changed while its gate ran
      Given a file "specs/MS-alpha.feature" containing:
        """
        @id=MS-alpha @closes:C1
        Feature: Alpha

          Rule: The search is planned

            Scenario: There is an iteration
              Given the gate is edited while it runs
        """
      And a file "specs/steps/edit.steps.ts" containing:
        """
        import { readFileSync, writeFileSync } from "node:fs"
        import { defineSteps } from "sdp/steps"

        export default defineSteps(() => ({}), ({ Step }) => {
          Step("the gate is edited while it runs", () => {
            const file = "specs/MS-alpha.feature"
            writeFileSync(file, readFileSync(file, "utf8").replace("the gate is edited while it runs", "a step nobody wrote"))
          })
        })
        """
      When I run "sdp gate MS-alpha --record"
      Then the exit code is 1
      And the output contains "MS-alpha is not recorded as met: its gate changed while it ran, and MS-alpha#there-is-an-iteration (stale) does not pass"
      And the file "specs/MS-alpha.feature" does not contain "@met="

    Scenario: A milestone that is met is closed: its gate does not run again, nor is it needed once its criteria moved
      Given a file "specs/MS-alpha.feature" containing:
        """
        @id=MS-alpha @closes:C1 @met=2026-11-13
        Feature: Alpha

          Rule: Nothing is planned yet

            Scenario: There is no iteration
              Then the query "iteration" returns no results
        """
      When I run "sdp gate MS-alpha"
      Then the exit code is 0
      And the output contains "MS-alpha was met on 2026-11-13"
      Given a file "specs/MS-alpha.feature" containing:
        """
        @id=MS-alpha @closes:C1 @met=2026-11-13
        Feature: Alpha
        """
      When I run "sdp gate MS-alpha"
      Then the exit code is 0
      And the output contains "MS-alpha was met on 2026-11-13"
      When I run "sdp status"
      Then the output contains "milestones    met 1 · open 1"
