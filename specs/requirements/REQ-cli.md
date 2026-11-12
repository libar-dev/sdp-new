---
id: REQ-cli
kind: requirement
title: Command line
maturity: ready
iteration: I1
activity: { implementation: I1, test: I1 }
tags: [cli, agents]
links:
  refines: CAP-agent-collaboration
  realized-by: ARCH-cli
---

# Command line

`sdp` is one command for people, scripts and agents. Every command re-reads the workspace, so it
answers from the files as they are, and each is one use case of the application layer — the one
the MCP server calls too ([[REQ-mcp-server]]) — so the two cannot answer differently. What a
command takes is in `sdp <command> --help`; what it promises is the scenarios here, which run the
real CLI as a process in a temporary directory.

## The example workspace

One requirement, two elements, a decision, an architecture rule, a plan and a milestone whose gate
is not met yet.

~~~gherkin
Background:
  Given a file "specs/REQ-search.md" containing:
    """
    ---
    id: REQ-search
    title: Search the catalogue
    maturity: specified
    iteration: C1
    links:
      realized-by: ARCH-index
    ---
    # Search the catalogue

    Shoppers find products by name.

    ## Open questions

    - [ ] Do misspelled names match?

    ```gherkin
    Scenario: Find a product by name
      Given a catalogue with a desk lamp
      When a shopper searches for "lamp"
      Then the desk lamp is found
    ```
    """
  And a file "specs/architecture.md" containing:
    """
    ---
    id: ARCHITECTURE
    kind: view
    nodes:
      - { id: ARCH-index, kind: element, title: Search index, links: { decided-by: DEC-0001 } }
      - { id: ARCH-cache, kind: element, title: Page cache, links: { decided-by: DEC-0001 } }
      - { id: DEC-0001, kind: decision, title: Use an inverted index }
    ---
    # Architecture

    ```gherkin
    Scenario: Every element is justified by a decision
      Then the query "element !-*- decision" returns no results
    ```
    """
  And a file "specs/plan.md" containing:
    """
    ---
    id: PLAN
    kind: plan
    nodes:
      - { id: PH-inception,    kind: phase, title: Inception }
      - { id: PH-elaboration,  kind: phase, title: Elaboration }
      - { id: PH-construction, kind: phase, title: Construction }
      - { id: PH-transition,   kind: phase, title: Transition }
      - { id: C1, kind: iteration, title: Search, phase: PH-construction }
    ---
    # Plan
    """
  And a file "specs/MS-beta.md" containing:
    """
    ---
    id: MS-beta
    title: Beta
    closes: PH-construction
    ---
    # Beta

    ```gherkin
    Scenario: Every requirement is ready
      Then the query "requirement[maturity<ready]" returns no results
    ```
    """
~~~

## Answers

An answer goes to stdout and everything about the answer to stderr, so stdout can always be piped.
An answer that may miss something exits with 2 in every output mode: the reader of `--ids` or
`--json` is the one most likely to conclude that something is absent.

~~~gherkin
Scenario Outline: The exit code is 0 when the command did what it was asked and 1 when it did not
  When I run "<command>"
  Then the exit code is <exit code>

  Examples: An answer, a run without a failing scenario — an unmet gate does not fail a run
    | command           | exit code |
    | sdp q requirement | 0         |
    | sdp check         | 0         |
    | sdp run           | 0         |

  Examples: A gate that is not met, input that is refused, a workspace that cannot be used
    | command                | exit code |
    | sdp gate MS-beta       | 1         |
    | sdp q 'requirement['   | 1         |
    | sdp show REQ-serach    | 1         |
    | sdp -C nowhere status  | 1         |

Scenario Outline: The exit code is 2 for an answer that may miss something, in every output mode; check and run fail instead
  Given a file "specs/REQ-broken.md" containing:
    """
    ---
    id: REQ-broken
    links: [REQ-search
    ---
    # A requirement sdp cannot read
    """
  When I run "<command>"
  Then the exit code is <exit code>
  And the output contains "<stderr>"
  And the output contains "specs/REQ-broken.md:3 [front-matter]"

  Examples:
    | command                  | exit code | stderr                                     |
    | sdp q requirement        | 2         | incomplete: this answer may miss something |
    | sdp q requirement --ids  | 2         | incomplete: this answer may miss something |
    | sdp q requirement --json | 2         | incomplete: this answer may miss something |
    | sdp graph -q requirement | 2         | incomplete: this answer may miss something |
    | sdp show REQ-search      | 2         | incomplete: this answer may miss something |
    | sdp context REQ-search   | 2         | incomplete: this answer may miss something |
    | sdp status               | 2         | incomplete: this answer may miss something |
    | sdp arch --json          | 2         | incomplete: this answer may miss something |
    | sdp lifecycle            | 2         | incomplete: this answer may miss something |
    | sdp check                | 1         | error [front-matter]                       |
    | sdp run                  | 1         | cannot run: 1 problem(s)                   |

Scenario Outline: An answer is incomplete whenever something that could change it was not read
  Given a file "<file>" containing:
    """
    <content>
    """
  When I run "sdp q requirement --ids"
  Then the exit code is 2
  And the output contains "note: not read: <file>:<line> [<rule>]"
  And the output lines are "REQ-search"

  Examples:
    | file            | line | rule                  | content                                                                                                                        |
    | specs/b.feature | 6    | gherkin-syntax        | Feature: B\n  Scenario: Half written\n    Given a note:\n      ```\n      never closed                                             |
    | specs/notes.md  | 1    | missing-id            | ---\nkind: requirement\n---\n# Notes                                                                                           |
    | specs/copy.md   | 1    | duplicate-id          | ---\nid: REQ-search\n---\n# Search again                                                                                       |
    | src/search.ts   | 4    | annotation-unreadable | import { annotate } from "sdp/annotations"\nexport const search = 0\nconst id = "REQ-search"\nannotate(search, { implements: id }) |

Scenario: With --json the answer is one envelope — complete, notes, data — and stdout stays JSON
  Given a file "specs/REQ-broken.md" containing:
    """
    ---
    id: REQ-broken
    links: [REQ-search
    ---
    # A requirement sdp cannot read
    """
  When I run "sdp q requirement --json"
  Then the exit code is 2
  And the JSON output has:
    | complete   | false      |
    | data.nodes | REQ-search |
  And the output contains '"not read: specs/REQ-broken.md:3 [front-matter]'

Scenario: A complete answer has no notes
  When I run "sdp q requirement --json"
  Then the JSON output has:
    | complete   | true       |
    | notes      | nothing    |
    | data.nodes | REQ-search |
~~~

## Choosing the workspace

Like git, a command works on the nearest directory, the current one or above, that holds an
`sdp.config.*` file; `-C` names the workspace instead.

~~~gherkin
Scenario: -C names the workspace root
  Given a file "elsewhere/specs/REQ-export.md" containing:
    """
    ---
    id: REQ-export
    ---
    # Export
    """
  When I run "sdp -C elsewhere q requirement --ids"
  Then the output contains "REQ-export"
  And the output does not contain "REQ-search"

Scenario: A workspace that does not exist is refused
  When I run "sdp -C nowhere status"
  Then the exit code is 1
  And the output contains "no such directory"

Scenario Outline: Input sdp cannot use is refused in one line that says what it takes
  When I run "sdp <command>"
  Then the exit code is 1
  And the output contains "<refusal>"
  And the output does not contain "FileSystem"
  And the file "<not written>" does not exist

  Examples:
    | command                               | refusal                                               | not written                  |
    | -C specs/REQ-search.md status         | a workspace is a directory, and this is a file        | .sdp/results.json            |
    | -C specs/REQ-search.md init           | a workspace is a directory, and this is a file        | sdp.config.yaml              |
    | run --concurrency 0                   | the number of scenarios to run at once is 1 or more   | .sdp/results.json            |
    | new requirement ''                    | a requirement needs a title                           | specs/requirements/REQ-0001.md |
    | new a/b Carts                         | is not a kind: a kind is one word                     | specs/a/b/AB-carts.md        |
    | new ../x Carts                        | is not a kind: a kind is one word                     | x/X-carts.md                 |
    | new requirement Carts --id a/b        | cannot name a file: write it without a slash          | specs/requirements/a/b.md    |
    | new requirement Carts --dir ''        | --dir needs a directory                               | REQ-carts.md                 |
    | new requirement Carts --maturity done | unknown maturity done: use one of idea, draft, specified, ready | specs/requirements/REQ-carts.md |

Scenario: From a subdirectory, commands work on the workspace above it
  Given a file "sdp.config.yaml" containing:
    """
    # every key at its default
    """
  When I run "sdp run" in "specs"
  Then the output contains "2 scenario(s): 1 passed, 1 undefined"
  And the output contains "1 gate scenario(s): 1 failed"
  And the file "specs/.sdp/results.json" does not exist

Scenario: A broken configuration is reported in one line that names the file
  Given a file "broken/sdp.config.yaml" containing:
    """
    specs: 42
    """
  When I run "sdp -C broken status"
  Then the exit code is 1
  And the output contains "sdp.config.yaml: invalid configuration"
  And the output does not contain "    at "

Scenario: A step definition module that does not load is reported in one line that names the file
  Given a file "specs/steps/search.steps.ts" containing:
    """
    throw new Error("search index not reachable")
    """
  When I run "sdp run"
  Then the exit code is 1
  And the output contains "specs/steps/search.steps.ts: could not load step definitions: search index not reachable"
  And the output does not contain "    at "
~~~

## Authoring

### `sdp init`

Starts a workspace: the configuration with every default shown, and the skill that teaches an agent
to work with sdp — the one generic guide, the same text sdp is developed with.

~~~gherkin
Scenario: init writes a configuration and the skill, and leaves alone what is there
  When I run "sdp init"
  Then the output contains "created sdp.config.yaml"
  And the output contains "created .claude/skills/sdp/SKILL.md"
  And the file "sdp.config.yaml" contains "# specs: "
  And the file ".claude/skills/sdp/SKILL.md" contains "name: sdp"
  When I run "sdp init"
  Then the output contains "exists  sdp.config.yaml"
  And the output contains "exists  .claude/skills/sdp/SKILL.md"
  When I run "sdp check"
  Then the exit code is 0

Scenario: init starts a workspace where it is run, never in one further up
  Given a file "sdp.config.yaml" containing:
    """
    # every key at its default
    """
  When I run "sdp init" in "shop"
  Then the file "shop/sdp.config.yaml" contains "# specs: "
~~~

### `sdp new <kind> <title>`

Any kind works; `sdp new --help` lists those with a template of their own. Kinds that play a role
of the vocabulary get that role's template, in the workspace's words ([[REQ-configuration]]).

~~~gherkin
Scenario: new writes only what stays in the file, and says in its answer what to write next
  When I run "sdp new requirement 'Saved carts'"
  Then the output lines are "REQ-saved-carts\tspecs/requirements/REQ-saved-carts.md"
  And the file "specs/requirements/REQ-saved-carts.md" is:
    """
    ---
    id: REQ-saved-carts
    kind: requirement
    title: Saved carts
    maturity: idea
    ---

    # Saved carts
    """
  And the output contains "next: write the idea in a sentence under the title"
  And the output contains "next: link it: links: { refines: CAP-…, realized-by: ARCH-… }"
  And the output contains "next: plan it: `iteration: E1`"

Scenario: From specified on, the file has a scenario to fill in
  When I run "sdp new nfr 'Checkout latency' --maturity specified"
  Then the file "specs/quality/NFR-checkout-latency.md" contains "Then <response measure, e.g. confirmation is shown within 300 ms at p95>"
  And the output contains "next: fill in the scenario: Given the source and environment, When the stimulus, Then the response and its measure"

Scenario: An element or a pattern is its title, and the answer says how to anchor and link it
  When I run "sdp new element Orders"
  Then the file "specs/architecture/ARCH-orders.md" is:
    """
    ---
    id: ARCH-orders
    kind: element
    title: Orders
    ---

    # Orders
    """
  And the output contains 'next: anchor it next to the declaration that is it: annotate(Thing, { is: "ARCH-orders" })'
  When I run "sdp new pattern Outbox"
  Then the output contains "next: elements that apply it link `instance-of: PAT-outbox`"

Scenario: What the templates write at the first maturity level passes the check
  Given specs created from the sdp new templates:
    | kind        | title         | maturity |
    | requirement | Wishlist      | idea     |
    | idea        | Gift wrapping |          |
    | element     | Orders        |          |
    | pattern     | Outbox        |          |
  When the workspace is checked
  Then sdp reports nothing

Scenario: Above the first level a new spec claims what its author has yet to write, and the check says so
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

Scenario: A decision starts as the sentence it must become, and the check flags it until it is written
  When I run "sdp new decision 'Use Postgres'"
  Then the file "specs/decisions/DEC-0002-use-postgres.md" is:
    """
    ---
    id: DEC-0002
    ---

    # Use Postgres

    Not <what a reasonable person would have chosen>, because <why>.
    """
  And the output contains "next: record a decision only for a choice that is hard to reverse, surprising without context and a real trade-off"
  When I run "sdp check --json"
  Then the JSON output has:
    | data.rule | template-placeholder                      |
    | data.node | DEC-0002                                  |
    | data.file | specs/decisions/DEC-0002-use-postgres.md  |
    | data.line | 7                                         |

Scenario: A risk is its title, and the answer says what to write and how a risk is linked and retired
  When I run "sdp new risk Outage"
  Then the file "specs/risks/RISK-0001-outage.md" is:
    """
    ---
    id: RISK-0001
    ---

    # Outage
    """
  And the output contains "next: link it: links: { affects: REQ-…, mitigated-by: REQ-…, due: MS-… }"
  And the output contains "next: it is retired when the work that mitigates it is verified; `status: tolerated` says we live with it instead"

Scenario: What the decision, milestone and risk templates write passes the check but for the decision's sentence
  Given specs created from the sdp new templates:
    | kind        | title            | maturity  |
    | decision    | Use Postgres     |           |
    | milestone   | Launch           |           |
    | risk        | Outage           |           |
  When the workspace is checked
  Then sdp reports:
    | rule                 | node     |
    | template-placeholder | DEC-0002 |

Scenario: new never overwrites: an id or a file that exists is refused
  When I run "sdp new requirement Search --id REQ-search"
  Then the exit code is 1
  And the output contains "id REQ-search already exists at specs/REQ-search.md:1"
  Given a file "specs/requirements/REQ-carts.md" containing:
    """
    Notes on carts, not a spec.
    """
  When I run "sdp new requirement Carts"
  Then the exit code is 1
  And the output contains "specs/requirements/REQ-carts.md already exists"

Scenario Outline: A title reads back as written, whatever it looks like to YAML
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
    | null                 | REQ-null                |
    | 2026-11-12           | REQ-2026-11-12          |
    | [draft] Wishlist     | REQ-draft-wishlist      |
    | - Returns            | REQ-returns             |
    | @team: Invoices      | REQ-team-invoices       |

Scenario: new refuses to write a spec that would not read back with its id, kind and title
  When I run "sdp new requirement Carts --id ' '"
  Then the exit code is 1
  And the output contains "would not read back"

Scenario: An id that only a dangling link names is free: creating it resolves the link
  Given a file "specs/REQ-filters.md" containing:
    """
    ---
    id: REQ-filters
    links:
      realized-by: ARCH-facets
    ---
    # Filters
    """
  When I run "sdp new element Facets"
  Then the output contains "ARCH-facets\tspecs/architecture/ARCH-facets.md"
  When I run "sdp check"
  Then the exit code is 0

Scenario: An idea is a requirement at maturity idea
  When I run "sdp new idea 'Gift wrapping'"
  Then the output contains "REQ-gift-wrapping\tspecs/requirements/REQ-gift-wrapping.md"
  And the file "specs/requirements/REQ-gift-wrapping.md" contains "kind: requirement"
  And the file "specs/requirements/REQ-gift-wrapping.md" contains "maturity: idea"

Scenario: --id names the node and --dir its directory, relative to the workspace root or absolute
  When I run "sdp new requirement 'Gift cards' --id REQ-vouchers --dir specs/payments"
  Then the output contains "REQ-vouchers\tspecs/payments/REQ-vouchers.md"
  When I run "sdp new requirement 'Gift cards' --dir $PWD/specs/payments"
  Then the output contains "REQ-gift-cards\tspecs/payments/REQ-gift-cards.md"
  And the file "specs/payments/REQ-gift-cards.md" contains "id: REQ-gift-cards"

Scenario: A file written outside the workspace is not part of its graph, and the answer says so
  Given a file "shop/sdp.config.yaml" containing:
    """
    # every key at its default
    """
  When I run "sdp -C shop new requirement 'Gift cards' --dir $PWD/elsewhere"
  Then the output contains "/elsewhere/REQ-gift-cards.md is outside the workspace"

Scenario: new --help lists the kinds with a template of their own and the maturity levels
  When I run "sdp new --help"
  Then the output contains "requirement, idea, nfr, decision, element, pattern, milestone, plan, risk"
  And the output contains "idea (default), draft, specified or ready"

Scenario Outline: An id is the kind's prefix and a slug of the title in ASCII; decisions, risks and titles without ASCII letters are numbered
  When I run "sdp new <kind> '<title>'"
  Then the output contains "<id>\t<file>"

  Examples:
    | kind        | title           | id                  | file                                    |
    | requirement | Kasse für Gäste | REQ-kasse-fur-gaste | specs/requirements/REQ-kasse-fur-gaste.md |
    | requirement | Корзина         | REQ-0001            | specs/requirements/REQ-0001.md          |
    | decision    | Ödeme yöntemi   | DEC-0002            | specs/decisions/DEC-0002-odeme-yontemi.md |
    | decision    | Оплата          | DEC-0002            | specs/decisions/DEC-0002.md             |
    | risk        | Vendor lock-in  | RISK-0001           | specs/risks/RISK-0001-vendor-lock-in.md   |
~~~

### `sdp types`

Writes the id declarations that make the compiler check the ids `annotate()` is given
([[ARCH-code-annotations]]).

~~~gherkin
Scenario: types writes every id with its kind for annotate() to accept, and check says when the file is stale
  When I run "sdp types"
  Then the exit code is 0
  And the file ".sdp/ids.d.ts" contains '"REQ-search": "requirement"'
  When I run "sdp check"
  Then the output does not contain "types-stale"
  Given a file "specs/REQ-export.md" containing:
    """
    ---
    id: REQ-export
    ---
    # Export
    """
  When I run "sdp check"
  Then the output contains "types-stale"
~~~

## Reading the graph

### `sdp status`

~~~gherkin
Scenario: status counts kinds, relations, stages and results on one screen, and as data with --json
  When I run "sdp status --json"
  Then the JSON output has:
    | data.kinds.requirement         | 1 |
    | data.relations.realized-by     | 1 |
    | data.stages.specified          | 1 |
    | data.scenarios.unrun           | 2 |

Scenario: status counts gate scenarios apart from the others, since a gate may be unmet with nothing broken
  When I run "sdp status"
  Then the output contains "scenarios     unrun 2"
  And the output contains "gates         unrun 1"
  And the output contains "milestones    open 1"
  And the output contains "check         no diagnostics"
~~~

### `sdp query <pattern>`, `sdp q`

The patterns are [[REQ-graph-query]]'s. A query explores, so a word the workspace does not know is
noted, never refused; an assertion on the same query fails ([[REQ-builtin-steps]]).

~~~gherkin
Scenario: q answers with one node per line — id, kind, status or stage, title, file:line — and counts them on stderr
  When I run "sdp q 'requirement -realized-by-> element[declaredIn=ARCHITECTURE]'"
  Then the output contains "ARCH-index\telement\t\tSearch index\tspecs/architecture.md:5"
  And the output contains "1 node(s)"

Scenario: q --json answers with the node records, and with the paths when asked
  When I run "sdp q 'requirement -realized-by-> element' --paths --json"
  Then the JSON output has:
    | data.nodes            | ARCH-index             |
    | data.paths.nodes      | REQ-search, ARCH-index |
    | data.paths.edges.from | REQ-search             |
    | data.paths.edges.rel  | realized-by            |

Scenario: q --paths prints each path on one line, every edge as it points
  When I run "sdp q '#ARCH-index <-realized-by- requirement' --paths"
  Then the output lines are "ARCH-index <-realized-by- REQ-search"

Scenario: q lists a node by the status it declares, else by its stage
  Given a file "specs/RISK-0001.md" containing:
    """
    ---
    id: RISK-0001
    status: tolerated
    maturity: idea
    ---
    # The index outgrows memory
    """
  When I run "sdp q risk"
  Then the output contains "RISK-0001\trisk\ttolerated"
  When I run "sdp q requirement"
  Then the output contains "REQ-search\trequirement\tspecified"

Scenario: q --ids prints only the ids, one per line
  When I run "sdp q 'element' --ids"
  Then the output lines are "ARCH-index, ARCH-cache"

Scenario: A malformed query is refused
  When I run "sdp q 'requirement[maturity<'"
  Then the exit code is 1
  And the output contains "query error"

Scenario: A word the workspace does not know is noted, with the closest one it does
  When I run "sdp q 'requirement -realised-by-> element[titel]'"
  Then the exit code is 0
  And the output contains "0 node(s)"
  And the output contains "note: no relation realised-by; closest: realized-by"
  And the output contains "note: element has no attribute titel; closest: title"

Scenario Outline: A result cut short by a limit is incomplete and says which, even when it is empty
  Given a file "specs/chain.md" containing:
    """
    ---
    id: CHAIN
    kind: plan
    nodes:
      - { id: N0, kind: step, links: { next: N1 } }
      - { id: N1, kind: step, links: { next: N2 } }
      - { id: N2, kind: step, links: { next: N3 } }
      - { id: N3, kind: step, links: { next: N4 } }
      - { id: N4, kind: step, links: { next: N5 } }
      - { id: N5, kind: step, links: { next: N6 } }
      - { id: N6, kind: step, links: { next: N7 } }
      - { id: N7, kind: step, links: { next: N8 } }
      - { id: N8, kind: step, links: { next: N9 } }
      - { id: N9, kind: step, links: { next: N10 } }
      - { id: N10, kind: step, links: { next: N11 } }
      - { id: N11, kind: step, links: { next: N12 } }
      - { id: N12, kind: step, links: { next: N13 } }
      - { id: N13, kind: element, bad: true }
    ---
    # A long chain
    """
  When I run "<command>"
  Then the exit code is 2
  And the output contains "cut short: a + edge reaches further than 12 hops"

  Examples:
    | command                                      |
    | sdp q '#N0 -next+-> element[bad]'            |
    | sdp q '#N0 -next+-> element[bad]' --ids      |
    | sdp q '#N0 -next+-> element[bad]' --json     |
    | sdp graph -q '#N0 -next+-> element[bad]'     |
~~~

### `sdp show <id>`

~~~gherkin
Scenario: show prints a node with its attributes and its edges, each with the title at the other end
  When I run "sdp show ARCH-index"
  Then the output contains 'declaredIn: "ARCHITECTURE"'
  And the output contains "-decided-by-> DEC-0001  Use an inverted index"
  And the output contains "<-realized-by- REQ-search  Search the catalogue"

Scenario: show --json is the node, its edges and its neighbours as records
  When I run "sdp show ARCH-index --json"
  Then the JSON output has:
    | data.node.id          | ARCH-index           |
    | data.neighbours       | DEC-0001, REQ-search |
    | data.out.to           | DEC-0001             |
    | data.in.from          | REQ-search           |
    | data.in.declared.file | specs/REQ-search.md  |

Scenario: An id no node has is an error that names the closest one
  When I run "sdp show ARCH-indx"
  Then the exit code is 1
  And the output contains "no node ARCH-indx; closest: ARCH-index"
~~~

### `sdp context <id>`

The bundle is [[REQ-agent-context]]'s: the usual first call before changing a spec.

~~~gherkin
Scenario: context prints the bundle of one node
  When I run "sdp context REQ-search"
  Then the output contains "Shoppers find products by name."
  And the output contains "ARCH-index"
  And the output contains "DEC-0001"
  And the output contains "1 open question(s)"
  And the output contains 'suggested: `When("a shopper searches for {string}", ({ world, args: [string] }) => pending())`'

Scenario Outline: The reach of a context bundle is 1 to 6 hops
  When I run "sdp context REQ-search --depth <depth>"
  Then the exit code is 1
  And the output contains "depth must be a whole number from 1 to 6"

  Examples:
    | depth |
    | 0     |
    | -1    |
    | 7     |
~~~

### `sdp graph`

The records are [[REQ-graph-export]]'s.

~~~gherkin
Scenario: graph prints one JSON record per line, for grep and jq
  When I run the pipeline:
    """
    sdp graph | grep '"rel":"realized-by"' | jq -r '"\(.from) \(.to) \(.declared[0].file):\(.declared[0].line)"'
    """
  Then the output lines are "REQ-search ARCH-index specs/REQ-search.md:7"
~~~

### `sdp arch`

The view is [[REQ-curated-architecture]]'s.

~~~gherkin
Scenario: arch shows every declared element with its links
  When I run "sdp arch"
  Then the output contains "Architecture: 2 node(s)"
  And the output contains "ARCH-index -decided-by-> DEC-0001"
  And the output contains "ARCH-cache — Page cache (element)"

Scenario: arch --json tells the architecture from what shaped it and from the code anchored to it
  When I run "sdp arch --json"
  Then the JSON output has:
    | data.architecture | ARCH-cache, ARCH-index |
    | data.drivers      | DEC-0001               |
    | data.anchors      | nothing                |

Scenario: arch --mermaid draws it
  When I run "sdp arch --mermaid"
  Then the output contains "flowchart LR"
  And the output contains "-->|decided-by|"
~~~

### `sdp vocabulary`

The words sdp interprets, as the workspace configures them ([[REQ-configuration]]), and the words it
makes itself, which nothing configures.

~~~gherkin
Scenario: vocabulary prints the words sdp interprets, and the kinds and attributes it makes itself
  When I run "sdp vocabulary --json"
  Then the JSON output has:
    | data.vocabulary.maturity     | idea, draft, specified, ready                                                                                    |
    | data.made.attributes         | stage, verification, scenarios, summary, file, openQuestions, declaredIn                                         |
    | data.made.scenarioAttributes | spec, keyword, tags, description, rule, ruleDescription, steps, examples, status, staleBecause, lastRun, hash    |
    | data.made.codeAttributes     | file, symbol, doc                                                                                                |
  When I run "sdp vocabulary"
  Then the output line with "stages" under "made by sdp, not configurable" contains "failing, in-progress, verified"
~~~

### `sdp lifecycle`

The milestones in the order of the timeline — each with the iterations it ends, the date of what it
closes and how it stands, the first that is not met being where the project is — then the planned
work of each iteration, the discipline activity chart, and the evidence apart from the plan
([[REQ-lifecycle-view]]).

```sh
sdp lifecycle
sdp lifecycle --json | jq '.data.position, .data.milestones[].gate'
```

~~~gherkin
Scenario: lifecycle lays out the milestones, the planned work and the chart
  When I run "sdp lifecycle"
  Then the output line with "MS-beta" contains "▶"
  And the output line with "MS-beta" contains "Construction"
  And the output line with "MS-beta" contains "C1"
  And the output contains "DISCIPLINE ACTIVITY"
  And the output contains "░ ▒ ▓ █  more work in an iteration, relative to the discipline's busiest; blank: none"

Scenario: lifecycle --json says where the project is, and keeps the plan and the evidence apart
  When I run "sdp lifecycle --json"
  Then the JSON output has:
    | data.position.milestone      | MS-beta                                                |
    | data.position.phase          | PH-construction                                        |
    | data.milestones              | MS-beta                                                |
    | data.milestones.gate.passed  | 0                                                      |
    | data.phases                  | PH-inception, PH-elaboration, PH-construction, PH-transition |
    | data.iterations              | C1                                                     |
    | data.disciplines.requirements | 1                                                     |
    | data.work.evidence.stages.specified | 1                                               |

Scenario: Before there is a plan lifecycle says how to write one, and a milestone from the template ends its phase
  When I run "sdp -C fresh init"
  Then the output contains "created sdp.config.yaml"
  When I run "sdp -C fresh lifecycle"
  Then the output contains "sdp new plan"
  And the output contains "- { id: E1, kind: iteration"
  When I run "sdp -C fresh new plan 'Delivery plan'"
  Then the output contains "PLAN-delivery-plan\tspecs/delivery/PLAN-delivery-plan.md"
  And the output contains 'next: end each phase with a milestone: sdp new milestone "<title>" writes one that `closes: PH-elaboration`'
  When I run "sdp -C fresh new milestone 'Architecture baseline'"
  Then the output contains "MS-architecture-baseline\tspecs/delivery/MS-architecture-baseline.md"
  And the output contains "next: set `closes` to the phase or the iteration this milestone ends: sdp lifecycle shows them"
  When I run "sdp -C fresh lifecycle"
  Then the output line with "MS-architecture-baseline" contains "Elaboration"
  And the output line with "MS-architecture-baseline" contains "I1* E1"
  And the output line with "no milestone" contains "C1"
~~~

## Checking and running

### `sdp check`

The rules are [[REQ-check-rules]]'s.

~~~gherkin
Scenario Outline: Only errors fail the check
  Given a file "specs/REQ-a.md" containing:
    """
    ---
    <front matter>
    ---
    # Example
    """
  When I run "sdp check"
  Then the exit code is <exit code>
  And the output contains "[<rule>]"

  Examples:
    | front matter                                       | rule          | exit code |
    | { id: REQ-a, links: { depends-on: REQ-gone } }     | dangling-link | 1         |
    | { id: REQ-a, maturity: draft }                     | maturity-criteria  | 1        |
    | { id: REQ-a, links: [REQ-b] }                      | link-syntax    | 1        |
    | { id: REQ-a, iteration: REQ-a }                    | plan-reference | 0        |

Scenario: --severity sets the least severe diagnostic shown
  Given a file "specs/REQ-a.md" containing:
    """
    ---
    id: REQ-a
    ---
    # Example

    ```gherkin
    Scenario: Nothing yet
    ```
    """
  When I run "sdp check"
  Then the output contains "[scenario-empty]"
  And the output contains "0 error(s), 1 warning(s), 0 info"
  When I run "sdp check --severity error"
  Then the output does not contain "[scenario-empty]"

Scenario: check --json prints the diagnostics as data
  Given a file "specs/REQ-a.md" containing:
    """
    ---
    id: REQ-a
    links: { depends-on: REQ-gone }
    ---
    # Example
    """
  When I run "sdp check --json"
  Then the exit code is 1
  And the JSON output has:
    | data.rule     | dangling-link  |
    | data.severity | error          |
    | data.node     | REQ-a          |
    | data.file     | specs/REQ-a.md |
    | data.line     | 3              |
~~~

### `sdp steps [text]`

Answers "is there a step for this already?" before a near-duplicate is written. The step files are
read, never run ([[REQ-executable-specs]]).

~~~gherkin
Scenario: steps lists every definition a run would know, built-in ones included, one per line: file:line, keyword, expression
  Given a file "specs/steps/search.steps.ts" containing:
    """
    import { defineSteps } from "sdp/steps"

    export default defineSteps(() => ({}), ({ Given, When }) => {
      Given("a catalogue with a desk lamp", () => {})
      When(/^a shopper searches for "(.*)"$/, () => {})
    })
    """
  When I run "sdp steps"
  Then the output contains "specs/steps/search.steps.ts:4\tGiven\ta catalogue with a desk lamp"
  And the output contains 'specs/steps/search.steps.ts:5\tWhen\t/^a shopper searches for "(.*)"$/'
  And the output contains "\tThen\tthe query {string} returns no results"
  And the output contains "11 step definition(s)"

Scenario Outline: steps <text> finds the definitions that mention the text or match it as a step
  Given a file "specs/steps/search.steps.ts" containing:
    """
    import { defineSteps } from "sdp/steps"

    export default defineSteps(() => ({}), ({ Given, When }) => {
      Given("a catalogue with a desk lamp", () => {})
      When(/^a shopper searches for "(.*)"$/, () => {})
    })
    """
  When I run "sdp steps '<text>'"
  Then the output contains "<found>"
  And the output contains "1 step definition(s)"

  Examples:
    | text                             | found                          |
    | desk lamp                        | specs/steps/search.steps.ts:4  |
    | a shopper searches for \"lamp\"  | specs/steps/search.steps.ts:5  |
    | there are no warning diagnostics | there are no {word} diagnostics |

Scenario: steps --json is the same list as data
  Given a file "specs/steps/search.steps.ts" containing:
    """
    import { defineSteps } from "sdp/steps"

    export default defineSteps(() => ({}), ({ Given, When }) => {
      Given("a catalogue with a desk lamp", () => {})
      When(/^a shopper searches for "(.*)"$/, () => {})
    })
    """
  When I run "sdp steps catalogue --json"
  Then the JSON output has:
    | data.file       | specs/steps/search.steps.ts |
    | data.line       | 4                           |
    | data.keyword    | Given                       |
    | data.expression | a catalogue with a desk lamp |
~~~

### `sdp run [targets]`

What a run executes, records and leaves stale is [[REQ-executable-specs]]'s.

~~~gherkin
Scenario: An unmet gate does not fail the run, sdp gate enforces it
  When I run "sdp run"
  Then the exit code is 0
  And the output contains "2 scenario(s): 1 passed, 1 undefined"
  And the output contains "1 gate scenario(s): 1 failed"
  When I run "sdp gate MS-beta"
  Then the exit code is 1

Scenario: A failing scenario fails the run
  Given a file "specs/ARCH-cdn.md" containing:
    """
    ---
    id: ARCH-cdn
    kind: element
    ---
    # Content delivery network
    """
  When I run "sdp run"
  Then the exit code is 1
  And the output contains "ARCH-cdn"

Scenario: A target is a spec id, a scenario id, or a file or directory relative to the current directory
  When I run "sdp run REQ-search.md --json" in "specs"
  Then the JSON output has:
    | data.scenarios      | REQ-search#find-a-product-by-name |
    | data.passed         | true                              |
    | data.summary.undefined | 1                              |

Scenario: A target that matches nothing is an error, not an empty run
  When I run "sdp run REQ-serach"
  Then the exit code is 1
  And the output contains "nothing matches REQ-serach"

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

Scenario: A step file that defines nothing is reported
  Given a file "specs/steps/search.steps.ts" containing:
    """
    export const phrases = ["a catalogue with a desk lamp"]
    """
  When I run "sdp run"
  Then the exit code is 0
  And the output contains "note: specs/steps/search.steps.ts defines no steps"

Scenario: --tags runs only the examples it selects and names those it left out
  Given a file "specs/REQ-sort.md" containing:
    """
    ---
    id: REQ-sort
    ---
    # Sort

    ```gherkin
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
    ```
    """
  When I run "sdp run REQ-sort --tags @fast"
  Then the exit code is 0
  And the output line with "example Sort by popularity" contains "not selected"
  And the output contains "1 example(s) not selected are skipped"

Scenario Outline: Specs that cannot be read stop run and gate before anything runs
  Given a file "<file>" containing:
    """
    <content>
    """
  When I run "<command>"
  Then the exit code is 1
  And the output contains "<file>:<line> [<rule>]"
  And the file ".sdp/results.json" does not exist

  Examples:
    | command          | file                 | content                                                                                     | line | rule           |
    | sdp run          | specs/broken.feature | Feature: Broken\n  Scenario: Half written\n    Given a note:\n      ```\n      never closed | 6    | gherkin-syntax |
    | sdp gate MS-beta | specs/REQ-c.md       | ---\nid: [REQ-c\n---\n# C                                                                   | 2    | front-matter   |
    | sdp run          | specs/search-copy.md | ---\nid: REQ-search\n---\n# Search again                                                    | 1    | duplicate-id   |
    | sdp run          | specs/REQ-sort.md    | ---\nkind: requirement\n---\n# Sort\n\n```gherkin\nScenario: By name\n  Then a comes first\n``` | 1    | missing-id     |
    | sdp gate MS-beta | specs/sorting.md     | # Sorting\n\n```gherkin\nScenario: By name\n  Then a comes first\n```                        | 1    | missing-id     |

Scenario: A --tags filter that is not a tag expression is an error that says so
  When I run "sdp run --tags '(@fast'"
  Then the exit code is 1
  And the output contains 'invalid --tags "(@fast"'
  And the output does not contain "    at "
~~~

### `sdp gate <milestone>`

Runs one milestone's gate scenarios against the current graph and exits 0 only when every one of
them passed. `--record` then writes `met: <today>` into the milestone: it is closed, its gate does
not run again, and the next milestone is where the project is ([[REQ-lifecycle-view]]). Ending a
phase is somebody's act, so nothing is recorded unasked — and no command enforces a gate by the
calendar: the same commit would pass today and fail tomorrow.

```sh
sdp gate MS-beta
sdp gate MS-beta --record
```

~~~gherkin
Scenario: A gate whose steps are not all automated is not met
  Given a file "specs/MS-release.md" containing:
    """
    ---
    id: MS-release
    kind: milestone
    ---
    # Release

    ```gherkin
    Scenario: The package is published
      Given the release candidate is tagged
    ```
    """
  When I run "sdp gate MS-release"
  Then the exit code is 1
  And the output contains "1 undefined"

Scenario: Only milestones and @gate scenarios can be gates
  When I run "sdp gate REQ-search"
  Then the exit code is 1
  And the output contains "REQ-search has no gate scenarios"

Scenario: gate --json prints nothing but JSON
  When I run "sdp gate MS-beta --json"
  Then the exit code is 1
  And the JSON output has:
    | complete    | true  |
    | data.passed | false |

Scenario: gate --record records nothing while the gate does not pass
  When I run "sdp gate MS-beta --record"
  Then the exit code is 1
  And the output contains "MS-beta is not recorded as met"
  And the file "specs/MS-beta.md" does not contain "met:"

Scenario: gate --record writes met into a milestone whose gate passes, and the next one is where the project is
  Given a file "specs/MS-alpha.md" containing:
    """
    ---
    id: MS-alpha
    closes: C1
    ---
    # Alpha

    ```gherkin
    Scenario: There is a plan
      Then the query "plan" returns 1 result
    ```
    """
  When I run "sdp gate MS-alpha --record"
  Then the exit code is 0
  And the file "specs/MS-alpha.md" contains "met: 20"
  When I run "sdp q milestone[met] --ids"
  Then the output lines are "MS-alpha"
  When I run "sdp lifecycle --json"
  Then the JSON output has:
    | data.position.milestone | MS-beta |

Scenario: A milestone that is met is closed: its gate does not run again
  Given a file "specs/MS-alpha.md" containing:
    """
    ---
    id: MS-alpha
    closes: C1
    met: 2026-11-13
    ---
    # Alpha

    ```gherkin
    Scenario: There is no plan
      Then the query "plan" returns no results
    ```
    """
  When I run "sdp gate MS-alpha"
  Then the exit code is 0
  And the output contains "MS-alpha was met on 2026-11-13"
  When I run "sdp run"
  Then the output does not contain "MS-alpha#there-is-no-plan"
  When I run "sdp status"
  Then the output contains "milestones    met 1 · open 1"

Scenario: The build of sdp itself enforces no gate
  When I run "grep verify package.json" in the repository
  Then the output does not contain "gate"
~~~

## Agents

### `sdp mcp`

Serves the tools of [[REQ-mcp-server]] on stdio.

~~~gherkin
Scenario: mcp serves the graph to an MCP client on stdio
  When an MCP client of "sdp mcp" calls "sdp_query" with:
    """json
    { "expression": "requirement" }
    """
  Then the output contains "REQ-search"
~~~
