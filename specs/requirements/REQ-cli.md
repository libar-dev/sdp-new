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
always reflects the files as they are. This is the reference: each command with its purpose, main
flags and an example, verified by scenarios that run the real CLI as a process in a temporary
directory. Each command is one use case of the application layer, the same one the MCP server
calls ([[REQ-mcp-server]]), so the two cannot answer differently.

| Flag | Applies to | Meaning |
| --- | --- | --- |
| `-C`, `--root <dir>` | every command | workspace root; without it, the nearest directory — the current one or above — holding an `sdp.config.*` file, else the current directory |
| `--json` | `status`, `q`, `show`, `check`, `steps`, `arch`, `lifecycle`, `vocabulary`, `run`, `gate` | the answer as one JSON object on stdout: `{ complete, notes, data }` |
| `--help`, `--version` | every command | usage with examples; the version |

## The example workspace

The scenarios below run against this small workspace: one specified requirement, two
architecture elements, a decision, an architecture rule, a plan with the four phases and one
iteration, and a milestone whose gate is not met yet.

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
  And a file "docs/architecture.md" containing:
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
  And a file "docs/plan.md" containing:
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
  And a file "docs/MS-beta.md" containing:
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

A command that reads the graph prints its answer on stdout and everything about the answer on
stderr, so stdout can always be piped.

- **Text.** A command that lists things prints one per line, so its output pipes into grep, cut
  and jq: the nodes of `sdp q` and the definitions of `sdp steps` with their fields separated by
  tabs (on a terminal the same fields are aligned in columns), the records of `sdp graph` as JSON,
  the diagnostics of `sdp check` each on a line that starts with its severity and rule.
- **JSON.** `--json` prints one envelope, the same for every command:

  | Field | Holds |
  | --- | --- |
  | `complete` | `false` when the answer may miss something |
  | `notes` | what the reader should know before relying on it, one sentence each: what was not read (`not read: <file>:<line> [<rule>] …`), what was not followed (`cut short: …`), and observations such as a word the workspace does not know |
  | `data` | the answer itself, made of the records of [[REQ-graph-export]]: a node is `{ type, id, kind, title, file, line, attrs }`, an edge `{ type, from, rel, to, attrs, declared }`, a place is always a `file` and a `line` |

- **Complete or not.** An answer is incomplete when something that could change it was not read —
  a spec whose front matter or Gherkin does not parse, a file meant as a spec without an id, an id
  declared twice, a code annotation sdp cannot read statically and, for an answer about steps, a
  step registration it cannot read — or not followed: a query stopped by a limit
  ([[ARCH-query-engine]]). sdp still answers from what it has,
  says `incomplete:` and each note on stderr, and exits with 2 — in every output mode, because the
  reader of `--ids` or `--json` is the one most likely to conclude that something is absent.

| Exit code | Meaning |
| --- | --- |
| 0 | the command did what it was asked, and its answer is complete |
| 1 | it did not: `check` found an error diagnostic; `run` had a scenario that failed or is ambiguous (an unmet milestone gate does **not** count); `gate` found a gate unmet; the input was refused — an invalid query, an unknown id, an id that exists, a `--maturity` off the ladder, a `--tags` filter that is no tag expression, a `--concurrency` below 1, a kind, title, id or directory `sdp new` cannot make a file of; the workspace cannot be used — no such directory, a file where a directory is meant, an invalid configuration, a step module that does not load, specs that cannot be read (`run` and `gate` then run nothing), the results locked by another run for more than two seconds |
| 2 | it answered, but the answer is incomplete |

~~~gherkin
Scenario Outline: A spec that cannot be read makes every answer incomplete, in every output mode
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

Scenario: The envelope says the same in its fields, and stdout stays JSON
  Given a file "specs/REQ-broken.md" containing:
    """
    ---
    id: REQ-broken
    links: [REQ-search
    ---
    # A requirement sdp cannot read
    """
  When I run "sdp q requirement --json"
  Then the output is valid JSON
  And the output contains '"complete": false'
  And the output contains '"not read: specs/REQ-broken.md:3 [front-matter]'
  And the output field "data.nodes" holds "REQ-search"

Scenario: A complete answer has no notes and exits with 0
  When I run "sdp q requirement --json"
  Then the exit code is 0
  And the output contains '"complete": true'
  And the output contains '"notes": []'
  And the output field "data.nodes" holds "REQ-search"
~~~

## Choosing the workspace

Like git, commands work on the nearest directory — the current one or above — that holds an
`sdp.config.yaml` (or `.yml`, `.json`), so they behave the same from any subdirectory of a workspace;
without one, on the current directory. `-C` names the workspace root instead — the way an MCP
client or a script points sdp at a repository. A workspace sdp cannot read — an invalid
`sdp.config.yaml`, a step definition module that does not load — is reported in one line naming the
file, with exit code 1.

~~~gherkin
Scenario: -C selects the workspace
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

Scenario: A workspace that does not exist is an error
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

Creates `sdp.config.yaml` (every key optional, defaults shown) and an agent guide,
`AGENTS.sdp.md`, for your `AGENTS.md` or `CLAUDE.md` to point at, in the current directory
(or `-C`) — never in a workspace further up. Like every document sdp writes, the guide is a spec: a
node of kind `guide`. Existing files are left alone.

```sh
sdp init
```

~~~gherkin
Scenario: init writes a configuration and an agent guide that is itself a spec
  When I run "sdp init"
  Then the output contains "created sdp.config.yaml"
  And the output contains "created AGENTS.sdp.md"
  When I run "sdp show AGENTS-sdp"
  Then the output contains "AGENTS-sdp  guide  Working with specs (sdp)"
~~~

### `sdp new <kind> <title>`

Creates a node from a template and prints its id and file. The kind is one word — letters, digits,
`-` and `_` — and the title is not empty. `--maturity` (default: the lowest level, `idea`) grows
the template with the level and must be on the configured ladder; `--id` overrides the generated
id — it names the file, so it has no slash — and `--dir` the directory chosen by kind, relative to
the workspace root or absolute. A kind that plays a role of the vocabulary gets that role's
template and words ([[REQ-configuration]]). Requirements, ideas, quality requirements (`nfr`), decisions, elements, patterns,
milestones, plans and risks have their own templates (`sdp new --help` lists them); any other kind gets the
generic one. `sdp new idea` writes a requirement at maturity `idea` to `specs/requirements`. Ids come from
`ids:` in the config (`REQ-guest-checkout`); decisions and risks are numbered (`DEC-0007`). An id
that only a link names so far — a dangling link — is free: creating it resolves the link. An
existing id or file is never overwritten. The front matter is written as YAML data, so a title
reads back as written whatever it looks like to YAML; and `sdp new` reads the spec before writing
it, refusing one that would not read back with its id, kind and title.

Templates suggest links as comments, in one vocabulary: a requirement is `realized-by` elements
and `refines` a capability; an element is `decided-by` decisions, an `instance-of` patterns and
`constrained-by` quality requirements. A decision lists no links of its own: what it shapes links
to it with `decided-by`. Removing the `#` of a suggestion leaves valid YAML. Template text written to
be replaced — `Not <…>, because <why>.`, `What is still unknown?`, `Given <context>` — is flagged by `sdp check`
until it is ([[REQ-check-rules]]). The `ready` template has no open questions — the structural
difference from a specified spec; whether it is truly ready to build is the team's own Definition of
Ready, which a team writes as a gate ([[REQ-maturity-criteria]]).

`sdp new plan` writes the delivery plan: the four phases (`PH-inception`, `PH-elaboration`,
`PH-construction`, `PH-transition`) and one two-week example iteration in each (`I1`, `E1`, `C1`, `T1`,
starting today), as inline nodes. A milestone from the template `closes: PH-elaboration`, and its
scenarios are its gate ([[REQ-lifecycle-view]]).

```sh
sdp new requirement "Saved carts" --maturity draft
sdp new idea "Gift wrapping"
sdp new plan "Delivery plan"
sdp new decision "Use Postgres for orders"
```

~~~gherkin
Scenario: new writes a spec from a template and refuses an existing id
  When I run "sdp new requirement 'Saved carts' --maturity draft"
  Then the output contains "REQ-saved-carts\tspecs/requirements/REQ-saved-carts.md"
  And the file "specs/requirements/REQ-saved-carts.md" contains "maturity: draft"
  When I run "sdp new requirement 'Saved carts'"
  Then the exit code is 1
  And the output contains "id REQ-saved-carts already exists"

Scenario Outline: A title reads back as written, whatever it looks like to YAML
  Given specs created from the sdp new templates:
    | kind        | title   |
    | requirement | <title> |
  When the workspace is checked
  Then the check reports nothing but "template-placeholder"
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

Scenario: new refuses to write a spec that would not read back
  When I run "sdp new requirement Carts --id ' '"
  Then the exit code is 1
  And the output contains "would not read back"

Scenario: An id that only a dangling link names is free
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
  Then the output contains "ARCH-facets\tdocs/architecture/ARCH-facets.md"
  When I run "sdp check"
  Then the exit code is 0

Scenario: The maturity must be on the ladder
  When I run "sdp new requirement 'Saved carts' --maturity done"
  Then the exit code is 1
  And the output contains "unknown maturity done: use one of idea, draft, specified, ready"

Scenario: An idea is a requirement at maturity idea
  When I run "sdp new idea 'Gift wrapping'"
  Then the output contains "REQ-gift-wrapping\tspecs/requirements/REQ-gift-wrapping.md"
  And the file "specs/requirements/REQ-gift-wrapping.md" contains "kind: requirement"
  And the file "specs/requirements/REQ-gift-wrapping.md" contains "maturity: idea"

Scenario: --dir may be absolute
  When I run "sdp new requirement 'Gift cards' --dir $PWD/specs/payments"
  Then the output contains "REQ-gift-cards\tspecs/payments/REQ-gift-cards.md"
  And the file "specs/payments/REQ-gift-cards.md" contains "id: REQ-gift-cards"

Scenario: The help lists the templates and the maturity levels
  When I run "sdp new --help"
  Then the output contains "requirement, idea, nfr, decision, element, pattern, milestone, plan, risk"
  And the output contains "idea (default), draft, specified or ready"

Scenario Outline: Ids are readable ASCII, whatever the title's language
  When I run "sdp new <kind> '<title>'"
  Then the output contains "<id>\t<file>"

  Examples:
    | kind        | title           | id                  | file                                    |
    | requirement | Kasse für Gäste | REQ-kasse-fur-gaste | specs/requirements/REQ-kasse-fur-gaste.md |
    | requirement | Корзина         | REQ-0001            | specs/requirements/REQ-0001.md          |
    | decision    | Ödeme yöntemi   | DEC-0002            | docs/decisions/DEC-0002-odeme-yontemi.md |
    | decision    | Оплата          | DEC-0002            | docs/decisions/DEC-0002.md              |

Scenario: Everything the templates produce passes the check, flagged until its text is replaced
  Given specs created from the sdp new templates:
    | kind        | title            | maturity  |
    | requirement | Wishlist         | idea      |
    | idea        | Gift wrapping    |           |
    | requirement | Gift cards       | draft     |
    | requirement | Returns          | specified |
    | requirement | Invoices         | ready     |
    | nfr         | Checkout latency | specified |
    | nfr         | Availability     | ready     |
    | decision    | Use Postgres     |           |
    | element     | Orders           |           |
    | pattern     | Outbox           |           |
    | milestone   | Launch           |           |
    | risk        | Outage           |           |
  When the workspace is checked
  Then the check reports nothing but "template-placeholder"
  And the check reports "template-placeholder" for "REQ-invoices"
  And the check reports "template-placeholder" for "DEC-0002"

Scenario Outline: A suggested link, uncommented, is valid YAML in the shared vocabulary
  Given specs created from the sdp new templates:
    | kind   | title  |
    | <kind> | Orders |
  When the suggested links are uncommented
  And the workspace is checked
  Then the check does not report "front-matter"
  And the check reports "dangling-link" for "<link>"

  Examples:
    | kind        | link                                |
    | requirement | REQ-orders -realized-by-> ARCH-…    |
    | requirement | REQ-orders -refines-> CAP-…         |
    | nfr         | NFR-orders -refines-> CAP-…         |
    | element     | ARCH-orders -decided-by-> DEC-…     |
    | element     | ARCH-orders -instance-of-> PAT-…    |
    | element     | ARCH-orders -constrained-by-> NFR-… |
    | pattern     | PAT-orders -decided-by-> DEC-…      |
    | risk        | RISK-0001 -affects-> REQ-…          |
    | risk        | RISK-0001 -mitigated-by-> REQ-…     |
    | risk        | RISK-0001 -due-> MS-…               |

Scenario: The ready template leaves no open question and points at the team's Definition of Ready
  When I run "sdp new requirement Invoices --maturity ready"
  Then the file "specs/requirements/REQ-invoices.md" contains "a ready spec has no open questions left"
  And the file "specs/requirements/REQ-invoices.md" contains "Definition of Ready"
  And the file "specs/requirements/REQ-invoices.md" does not contain "What is still unknown?"
~~~

### `sdp types`

Writes the id declarations that type `annotate` from `sdp/annotations` — every node id mapped to
its kind — to the `types` path (`.sdp/ids.d.ts` by default; include it in your `tsconfig.json`).
Run it after adding or renaming specs; `sdp check` warns while the file is stale
([[ARCH-code-annotations]]).

```sh
sdp types
```

~~~gherkin
Scenario: types writes the ids annotate() accepts, and check knows when they are stale
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

One screen: node and edge counts, kinds, relations, stages, the results of ordinary
scenarios and, separately, of gate scenarios (which may be unmet without anything being broken),
how many milestones are met and how many open, stale results by what changed since they ran ([[REQ-executable-specs]]), how many nodes are of an
architectural kind, and diagnostics by severity.

```sh
sdp status --json | jq .data.scenarios
```

~~~gherkin
Scenario: status summarises the delivery state
  When I run "sdp status --json"
  Then the output is valid JSON
  And the output contains '"requirement": 1'
  And the output contains '"stages": {'

Scenario: status counts gate scenarios apart from the others
  When I run "sdp status"
  Then the output contains "scenarios     unrun 2"
  And the output contains "gates         unrun 1"
  And the output contains "milestones    open 1"
  And the output contains "check         no diagnostics"
~~~

### `sdp query <pattern>`, `sdp q`

Answers a path pattern ([[REQ-graph-query]]; `sdp q --help` prints the syntax) with the nodes it
leads to, one per line: id, kind, the status the node declares — or was given by a run — else its
stage, title and `file:line`. `--ids` prints only the ids, `--paths` the paths that led to the
nodes instead, and `--json` the envelope, whose `data` holds the `nodes` and, with `--paths`, the
`paths`. The number of nodes goes to stderr.

A query explores, so it is never refused for naming a word the workspace does not know — an id,
a kind, a relation, an attribute; usually a typo. A note says so and names the closest word it
does know ([[REQ-builtin-steps]] lists what counts as known, and fails an assertion for the same).
When a limit cut the search short, the answer is incomplete and a note names the limit, even if
nothing was found.

```sh
sdp q 'requirement[maturity<ready]'
sdp q 'requirement -realized-by-> element -decided-by-> decision' --paths
sdp q 'element !-*- decision' --json | jq -r '.data.nodes[].id'
```

~~~gherkin
Scenario: q answers a path pattern with one node per line
  When I run "sdp q 'requirement -realized-by-> element[declaredIn=ARCHITECTURE]'"
  Then the output contains "ARCH-index\telement\t\tSearch index\tdocs/architecture.md:5"
  And the output contains "1 node(s)"

Scenario: q --json answers with the node records, and with the paths when asked
  When I run "sdp q 'requirement -realized-by-> element' --paths --json"
  Then the output is valid JSON
  And the output field "data.nodes" holds "ARCH-index"
  And the output contains '"paths": ['
  And the output contains '"from": "REQ-search"'

Scenario: q --paths prints each path on one line, every edge as it points
  When I run "sdp q '#ARCH-index <-realized-by- requirement' --paths"
  Then the output lines are "ARCH-index <-realized-by- REQ-search"

Scenario: q lists a node by the status it declares, else by its stage
  Given a file "docs/RISK-0001.md" containing:
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

Scenario: An invalid query is an error
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
  Given a file "docs/chain.md" containing:
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

One node with its attributes and its outgoing (`-rel->`) and incoming (`<-rel-`) edges, each with
the title of the node at its other end. `--json` gives the `node`, its edges as `out` and `in`,
each with every place that declares it, and the `neighbours` they lead to, as records. An id no
node has is an error that names the closest one.

```sh
sdp show ARCH-index
```

~~~gherkin
Scenario: show prints a node with its edges
  When I run "sdp show ARCH-index"
  Then the output contains 'declaredIn: "ARCHITECTURE"'
  And the output contains "-decided-by-> DEC-0001  Use an inverted index"
  And the output contains "<-realized-by- REQ-search  Search the catalogue"

Scenario: show --json is the node, its edges and its neighbours as records
  When I run "sdp show ARCH-index --json"
  Then the output is valid JSON
  And the output field "data.neighbours" holds "DEC-0001, REQ-search"
  And the output contains '"declared": ['
  And the output contains '"file": "specs/REQ-search.md"'

Scenario: An id no node has is an error that names the closest one
  When I run "sdp show ARCH-indx"
  Then the exit code is 1
  And the output contains "no node ARCH-indx; closest: ARCH-index"
~~~

### `sdp context <id>`

Everything needed to work on one node, as one Markdown document ([[REQ-agent-context]]): the spec,
why it is not ready yet, its relationships, scenario results with a suggested definition for each
step that has none (matched against the step definitions, so no run is needed), the step files,
the architecture, quality requirements and decisions within reach (`--depth`, 1 to 6 hops,
default 2), and linked code. The usual first call before changing a spec.

```sh
sdp context REQ-search
```

~~~gherkin
Scenario: context bundles what is needed to work on a node
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

The graph as plain data ([[REQ-graph-export]]): one JSON record per line, every node and then
every edge, for grep, jq and scripts. `-q <pattern>` prints only the nodes along the paths a
query matches and the edges among them; `--mermaid` prints a Mermaid flowchart instead.

```sh
sdp graph | grep '"rel":"realized-by"'
sdp graph | jq -r 'select(.type == "node" and .attrs.maturity == "ready") | .id'
sdp graph --mermaid -q 'element -decided-by-> decision'
```

~~~gherkin
Scenario: graph prints one record per line for grep and jq
  When I run the pipeline:
    """
    sdp graph | grep '"rel":"realized-by"' | jq -r '"\(.from) \(.to) \(.declared[0].file):\(.declared[0].line)"'
    """
  Then the output lines are "REQ-search ARCH-index specs/REQ-search.md:7"
~~~

### `sdp arch`

The architecture: every element and pattern architects declared, each with what its spec says it is
for and its links, among them the decisions and quality requirements that shaped it
([[REQ-curated-architecture]]). sdp never computes, ranks or suggests what belongs in it.
`--json` gives the `kinds` that are the architecture here, the `architecture` nodes, the `drivers`
linked to them and the `edges` among all of these; `--mermaid` draws them.

```sh
sdp arch
sdp arch --mermaid
```

~~~gherkin
Scenario: arch shows every declared element with its decisions
  When I run "sdp arch"
  Then the output contains "Architecture: 2 node(s)"
  And the output contains "ARCH-index -decided-by-> DEC-0001"
  And the output contains "ARCH-cache — Page cache (element)"

Scenario: arch --json tells the architecture from what shaped it
  When I run "sdp arch --json"
  Then the output is valid JSON
  And the output field "data.architecture" holds "ARCH-cache, ARCH-index"
  And the output field "data.drivers" holds "DEC-0001"

Scenario: arch --mermaid draws it
  When I run "sdp arch --mermaid"
  Then the output contains "flowchart LR"
  And the output contains "-->|decided-by|"
~~~

### `sdp vocabulary`

The words sdp interprets — kinds, relations, attributes, statuses, the maturity ladder and the
disciplines — as the workspace configures them, one role per line, and then the words sdp makes
itself, which no workspace configures: the kinds of its own nodes, the attributes it derives, the
stages beyond the ladder and the names no link can have. With `--json`, `data.vocabulary` is the
profile in the shape of the `vocabulary:` section of the configuration ([[REQ-configuration]]) and
`data.made` the fixed words.

~~~gherkin
Scenario: vocabulary prints the words sdp interprets and the words it makes
  When I run "sdp vocabulary --json"
  Then the output is valid JSON
  And the output field "data.vocabulary.maturity" holds "idea, draft, specified, ready"
  And the output field "data.made.attributes" holds "stage, verification, scenarios, summary, file, openQuestions, declaredIn"
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
  Then the output is valid JSON
  And the output contains '"position": {'
  And the output contains '"milestone": "MS-beta"'
  And the output field "data.milestones" holds "MS-beta"
  And the output field "data.phases" holds "PH-inception, PH-elaboration, PH-construction, PH-transition"
  And the output contains '"unmet": ['
  And the output contains '"disciplines"'
  And the output contains '"evidence"'

Scenario: Before there is a plan lifecycle says how to write one, and a milestone from the template ends its phase
  When I run "sdp -C fresh init"
  Then the output contains "created sdp.config.yaml"
  When I run "sdp -C fresh lifecycle"
  Then the output contains "sdp new plan"
  And the output contains "- { id: E1, kind: iteration"
  When I run "sdp -C fresh new plan 'Delivery plan'"
  Then the output contains "PLAN-delivery-plan\tdocs/delivery/PLAN-delivery-plan.md"
  When I run "sdp -C fresh new milestone 'Architecture baseline'"
  Then the output contains "MS-architecture-baseline\tdocs/delivery/milestones/MS-architecture-baseline.md"
  When I run "sdp -C fresh lifecycle"
  Then the output line with "MS-architecture-baseline" contains "Elaboration"
  And the output line with "MS-architecture-baseline" contains "I1* E1"
  And the output line with "no milestone" contains "C1"
~~~

## Checking and running

### `sdp check`

Validates front matter, links, Gherkin, maturity claims, the shape of decisions, plan references, code
annotations and leftover template text ([[REQ-check-rules]]). Each diagnostic is one line — its
severity, rule id, message and `file:line` — with a hint beneath; `--severity error|warning|info`
sets the minimum shown, and the last line counts them. Only errors fail the check. With `--json`,
`data` is the list of diagnostics, each `{ rule, severity, message, node, file, line, hint }`.

```sh
sdp check --severity warning
```

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
  And the output is valid JSON
  And the output contains '"rule": "dangling-link"'
  And the output contains '"file": "specs/REQ-a.md"'
  And the output contains '"line": 3'
~~~

### `sdp steps [text]`

Lists every step definition a run would know — sdp's built-in steps first, then those of the step
files — one per line: `file:line`, keyword and expression, separated by tabs. With `text`, only
the definitions whose expression contains it or that match it as a step, which answers "is there
a step for this already?" before a near-duplicate is written. The step files are read, not run
([[REQ-executable-specs]]); a registration that cannot be read that way — its expression is
computed, or it is not a statement of its own — is noted and leaves the listing incomplete,
since a step may be defined there. With `--json`, `data` is the same list as objects with `file`, `line`, `keyword` and `expression`.

```sh
sdp steps catalogue
sdp steps --json | jq -r '.data[] | select(.keyword == "Then") | .expression'
```

~~~gherkin
Rule: sdp steps

  Background:
    Given a file "specs/steps/search.steps.ts" containing:
      """
      import { defineSteps } from "sdp/steps"

      export default defineSteps(() => ({}), ({ Given, When }) => {
        Given("a catalogue with a desk lamp", () => {})
        When(/^a shopper searches for "(.*)"$/, () => {})
      })
      """

  Scenario: steps lists every definition with where it is, built-in ones included
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
      | text                             | found                          |
      | desk lamp                        | specs/steps/search.steps.ts:4  |
      | a shopper searches for \"lamp\"  | specs/steps/search.steps.ts:5  |
      | there are no warning diagnostics | there are no {word} diagnostics |

  Scenario: steps --json is plain data
    When I run "sdp steps catalogue --json"
    Then the output is valid JSON
    And the output contains '"file": "specs/steps/search.steps.ts"'
    And the output contains '"line": 4'
    And the output contains '"keyword": "Given"'
    And the output contains '"expression": "a catalogue with a desk lamp"'
~~~

### `sdp run [targets]`

Executes scenarios — all, or those of the given spec ids, scenario ids, files or directories (paths
relative to the current directory) — and records the results in `.sdp/results.json`. `--tags`
selects examples with a Cucumber tag expression, `--verbose` shows passed steps, `--concurrency <n>`
runs up to `n` scenarios at once (`@serial` ones alone; [[REQ-executable-specs]]). A step that did
not pass is shown with the `file:line` of its definition. `--snippets` ends the output with one
step definition module for every undefined step, ready to save as a `.steps.ts` file. A step file
that exports no step module is noted. Milestone gates run last, against the fresh
results; an unmet gate is reported but does not fail the run, because a later milestone is expected
to be unmet. The run ends with how many earlier results it did not refresh are stale, and why.
With `--json`, `data` holds `passed` — what the exit code says — the counts of ordinary scenarios
(`summary`) and of `gates` by status, the `stale` counts, every scenario's result and, when asked
for, the `snippets` module.

Specs that cannot be read stop `run` and `gate` before anything executes or is recorded: Gherkin
or front matter that does not parse, a file meant as a spec that has no id, or an id declared
twice. Each such error is one line, `file:line [rule] message`; `sdp check` explains them. So do a
step definition whose expression is malformed and a `--tags` filter that is not a tag expression:
one line that names the definition or the filter, never a stack trace.

```sh
sdp run REQ-search --snippets
```

~~~gherkin
Scenario: An unmet gate does not fail the run, sdp gate enforces it
  When I run "sdp run"
  Then the exit code is 0
  And the output contains "2 scenario(s): 1 passed, 1 undefined"
  And the output contains "1 gate scenario(s): 1 failed"
  When I run "sdp gate MS-beta"
  Then the exit code is 1

Scenario: A failing scenario fails the run
  Given a file "docs/ARCH-cdn.md" containing:
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

Scenario: A target that matches nothing is an error, not an empty run
  When I run "sdp run REQ-serach"
  Then the exit code is 1
  And the output contains "nothing matches REQ-serach"

Scenario: A step that fails shows where it is defined
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
    | sdp gate MS-beta | docs/sorting.md      | # Sorting\n\n```gherkin\nScenario: By name\n  Then a comes first\n```                        | 1    | missing-id     |

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
  Given a file "docs/MS-release.md" containing:
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
  Then the output is valid JSON
  And the output contains '"passed": false'

Scenario: gate --record records nothing while the gate does not pass
  When I run "sdp gate MS-beta --record"
  Then the exit code is 1
  And the output contains "MS-beta is not recorded as met"
  And the file "docs/MS-beta.md" does not contain "met:"

Scenario: gate --record writes met into a milestone whose gate passes, in the order of the timeline
  Given a file "docs/MS-alpha.md" containing:
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
  When I run "sdp gate MS-beta --record"
  Then the exit code is 1
  And the output contains "MS-beta cannot be met before MS-alpha"
  When I run "sdp gate MS-alpha --record"
  Then the exit code is 0
  And the file "docs/MS-alpha.md" contains "met: 20"
  When I run "sdp q milestone[met] --ids"
  Then the output lines are "MS-alpha"
  When I run "sdp lifecycle --json"
  Then the output contains '"milestone": "MS-beta"'

Scenario: A milestone that is met is closed: its gate does not run again
  Given a file "docs/MS-alpha.md" containing:
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

Serves the graph over MCP on stdio: `sdp_status`, `sdp_query`, `sdp_show`, `sdp_context`,
`sdp_steps`, `sdp_snippets`, `sdp_check`, `sdp_architecture` and `sdp_lifecycle`
([[REQ-mcp-server]]). Each is the use case of the command of the same name, and every call
re-reads the workspace and the step definitions.

```json
{ "mcpServers": { "sdp": { "command": "sdp", "args": ["-C", "/path/to/workspace", "mcp"] } } }
```

~~~gherkin
Scenario: mcp serves the graph to agents
  When an MCP client of "sdp mcp" calls "sdp_query" with:
    """json
    { "expression": "requirement" }
    """
  Then the output contains "REQ-search"
~~~
