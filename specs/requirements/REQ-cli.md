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

`sdp` is one command for people, scripts and agents. Read commands print greppable text by
default and JSON with `--json`; every command re-reads the workspace, so it always reflects the
files as they are. This is the reference: each command with its purpose, main flags and an
example, verified by scenarios that run the real CLI as a process in a temporary directory.

| Flag | Applies to | Meaning |
| --- | --- | --- |
| `-C`, `--root <dir>` | every command | workspace root; without it, the nearest directory — the current one or above — holding an `sdp.config.*` file, else the current directory |
| `--json` | `status`, `q`, `show`, `check`, `run`, `gate`, `lifecycle` | machine-readable output on stdout |
| `--help`, `--version` | every command | usage with examples; the version |

| Command | Exits with 1 when |
| --- | --- |
| `check` | there is at least one error diagnostic |
| `run` | an ordinary scenario failed or is ambiguous; an unmet milestone gate does **not** count |
| `gate` | the milestone's gate scenarios are not all met |
| `run`, `gate` | a spec cannot be read — Gherkin or front matter that does not parse, an id declared twice; nothing runs then |
| `q`, `show`, `context`, `new` | the query is invalid, the id is unknown, the id already exists, or `--maturity` is not on the ladder |
| every command | the workspace cannot be read: no such directory, an invalid configuration, a step definition module that does not load |

## The example workspace

The scenarios below run against this small workspace: one specified requirement, two
architecture elements of which the architect marked one significant, a decision, an architecture
rule, a plan with the four phases and one iteration, and a milestone whose gate is not met yet.

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
      - { id: ARCH-index, kind: element, title: Search index, significant: true, rationale: "search latency depends on it", links: { decided-by: DEC-0001 } }
      - { id: ARCH-cache, kind: element, title: Page cache }
      - { id: DEC-0001, kind: decision, title: Use an inverted index, status: accepted, decision: one inverted index for all products }
    ---
    # Architecture

    ```gherkin
    Scenario: Significant elements are justified by a decision
      Then the query "element[significant] !-*- decision" returns no results
    ```
    """
  And a file "docs/plan.md" containing:
    """
    ---
    id: PLAN
    kind: plan
    nodes:
      - { id: inception,    kind: phase, title: Inception,    order: 1 }
      - { id: elaboration,  kind: phase, title: Elaboration,  order: 2 }
      - { id: construction, kind: phase, title: Construction, order: 3 }
      - { id: transition,   kind: phase, title: Transition,   order: 4 }
      - { id: C1, kind: iteration, title: Search, phase: construction }
    ---
    # Plan
    """
  And a file "docs/MS-beta.md" containing:
    """
    ---
    id: MS-beta
    kind: milestone
    title: Beta
    phase: construction
    ---
    # Beta

    ```gherkin
    Scenario: Every requirement is ready
      Then the query "requirement[maturity<ready]" returns no results
    ```
    """
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

Creates `sdp.config.yaml` (every key optional, defaults shown), `.sdp/.gitignore` and an agent
guide, `AGENTS.sdp.md`, for your `AGENTS.md` or `CLAUDE.md` to point at, in the current directory
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

Creates a node from a template and prints its id and file. `--maturity` (default: the lowest level,
`idea`) grows the template with the level and must be on the configured ladder; `--id` overrides
the generated id and `--dir` the directory chosen by kind — relative to the workspace root, or
absolute. Requirements, ideas, quality requirements (`nfr`), decisions, elements, patterns,
milestones and plans have their own templates (`sdp new --help` lists them); any other kind gets the
generic one. `sdp new idea` writes a requirement at maturity `idea` to `specs/ideas`. Ids come from
`ids:` in the config (`REQ-guest-checkout`); decisions and risks are numbered (`DEC-0007`). An id
that only a link names so far — a dangling link — is free: creating it resolves the link. An
existing id or file is never overwritten.

Templates suggest links as comments, in one vocabulary: a requirement is `realized-by` elements
and `refines` a capability; an element is `decided-by` decisions, an `instance-of` patterns and
`constrained-by` quality requirements. A decision lists no links of its own: what it shapes links
to it with `decided-by`. Removing the `#` of a suggestion leaves valid YAML. Template text written to
be replaced — `We will …`, `What is still unknown?`, `Given <context>` — is flagged by `sdp check`
until it is ([[REQ-check-rules]]). The `ready` template has no open questions — the structural
difference from a specified spec; whether it is truly ready to build is the team's own Definition of
Ready, a gate of its own ([[REQ-maturity-gates]]).

`sdp new plan` writes the delivery plan: the four phases (`inception`, `elaboration`,
`construction`, `transition`) and one two-week example iteration in each (`I1`, `E1`, `C1`, `T1`,
starting today), as inline nodes. Milestones from the template close `phase: elaboration`; work is
planned with `iteration: E1`, and other disciplines' work on it with `activity:`
([[REQ-lifecycle-view]]).

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
  Then the output contains "REQ-gift-wrapping\tspecs/ideas/REQ-gift-wrapping.md"
  And the file "specs/ideas/REQ-gift-wrapping.md" contains "kind: requirement"
  And the file "specs/ideas/REQ-gift-wrapping.md" contains "maturity: idea"

Scenario: --dir may be absolute
  When I run "sdp new requirement 'Gift cards' --dir $PWD/specs/payments"
  Then the output contains "REQ-gift-cards\tspecs/payments/REQ-gift-cards.md"
  And the file "specs/payments/REQ-gift-cards.md" contains "id: REQ-gift-cards"

Scenario: The help lists the templates and the maturity levels
  When I run "sdp new --help"
  Then the output contains "requirement, idea, nfr, decision, element, pattern, milestone, plan"
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
    | decision    | DEC-0002 -supersedes-> DEC-…        |
    | element     | ARCH-orders -decided-by-> DEC-…     |
    | element     | ARCH-orders -instance-of-> PAT-…    |
    | element     | ARCH-orders -constrained-by-> NFR-… |
    | pattern     | PAT-orders -decided-by-> DEC-…      |

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

One screen: node and edge counts, kinds, relations, spec stages, decisions, the results of
ordinary scenarios and, separately, of gate scenarios (which may be unmet without anything being
broken), stale results by what changed since they ran ([[REQ-executable-specs]]), how many
elements are marked significant, and diagnostics by severity.

```sh
sdp status --json | jq .scenarios
```

~~~gherkin
Scenario: status summarises the delivery state
  When I run "sdp status --json"
  Then the output is valid JSON
  And the output contains '"requirement": 1'

Scenario: status counts gate scenarios apart from the others
  When I run "sdp status"
  Then the output contains "scenarios     unrun 2"
  And the output contains "gates         unrun 1"
  And the output contains "check         no diagnostics"
~~~

### `sdp query <pattern>`, `sdp q`

Answers a path pattern with the matching nodes: a table by default, `--ids` for one id per line,
`--paths` for whole paths, `--json`. `sdp q --help` prints the syntax. When nothing matches because
the pattern names a kind or relation no node or edge has — usually a typo — a note on stderr says
so and lists those in use. When a limit cut the search short ([[REQ-graph-query]]), stderr says
which, even if nothing was found: the answer may be incomplete.

```sh
sdp q 'requirement[maturity<ready]'
sdp q 'requirement -realized-by-> element[significant]' --paths
```

~~~gherkin
Scenario: q answers a path pattern
  When I run "sdp q 'requirement -realized-by-> element[significant]' --json"
  Then the output is valid JSON
  And the output contains '"id": "ARCH-index"'

Scenario: An invalid query is an error
  When I run "sdp q 'requirement[maturity<'"
  Then the exit code is 1
  And the output contains "query error"

Scenario: An empty result names the kinds and relations in use when the pattern uses others
  When I run "sdp q 'requirement -implemented-by-> element'"
  Then the exit code is 0
  And the output contains "0 node(s)"
  And the output contains "no relation implemented-by; relations in use: decided-by, iteration, phase, realized-by, verifies"

Scenario: A result cut short by a limit says which, even when it is empty
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
  When I run "sdp q '#N0 -next+-> element[bad]'"
  Then the output contains "0 node(s)"
  And the output contains "result cut short: a + edge reaches further than 12 hops"
~~~

### `sdp show <id>`

One node with its attributes and its outgoing (`-rel->`) and incoming (`<-rel-`) edges.

```sh
sdp show ARCH-index
```

~~~gherkin
Scenario: show prints a node with its edges
  When I run "sdp show ARCH-index"
  Then the output contains "significant: true"
  And the output contains "-decided-by-> DEC-0001"
  And the output contains "<-realized-by- REQ-search"
~~~

### `sdp context <id>`

Everything needed to work on one node, as one Markdown document ([[REQ-agent-context]]): the spec,
why it is not ready yet, its relationships, scenario results with a suggested definition for each
step that has none (matched against the step definitions, so no run is needed), the step files,
the significant architecture, quality requirements and decisions within reach (`--depth`,
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
~~~

### `sdp graph`

Exports the graph: `-f jsonl|json|tsv|dot|mermaid` (default `jsonl`), `-q <pattern>` to export
only what a query matches, `--write` to write `.sdp/graph.jsonl` and `.sdp/graph.tsv` — one fact
per line, for grep, awk and jq.

```sh
sdp graph --write && grep -P '^edge\t[^\t]*\trealized-by\t' .sdp/graph.tsv
sdp graph -f mermaid -q 'element[significant]'
```

~~~gherkin
Scenario: graph --write leaves the graph on disk for grep and jq
  When I run "sdp graph --write"
  Then the output contains "wrote .sdp/graph.jsonl and .sdp/graph.tsv"
  And the file ".sdp/graph.jsonl" contains '"id":"REQ-search"'
  And the file ".sdp/graph.tsv" contains "edge\tREQ-search\trealized-by\tARCH-index"
~~~

### `sdp arch`

The curated architecture: only the elements and patterns an architect marked `significant`, each
with its rationale, the patterns it applies and the decisions and quality requirements linked to
it. What is significant is the architects' call; sdp shows it and never computes, limits or
checks it. `--candidates` lists suggestions worth a look; `-f`, `--format mermaid|dot|json` for
diagrams and scripts.

```sh
sdp arch
sdp arch --candidates
```

~~~gherkin
Scenario: arch shows what architects marked significant
  When I run "sdp arch"
  Then the output contains "Significant (marked by architects): 1"
  And the output contains "why: search latency depends on it"
  And the output contains "-decided-by-> DEC-0001"
  And the output contains "1 declared, not significant: ARCH-cache"

Scenario: arch -f json is for scripts
  When I run "sdp arch -f json"
  Then the output is valid JSON
  And the output contains '"significant": [\n    "ARCH-index"'
~~~

### `sdp lifecycle`

Phases with their milestone gates (`◀ now` marks the calendar, never achievement), the planned work
of each iteration, the planned discipline activity chart with a one-line legend for its shading, and
the evidence — stages and scenario results — shown apart from the plan ([[REQ-lifecycle-view]]). Without
phases it shows how to declare them, inline, and suggests `sdp new plan`.

```sh
sdp lifecycle
```

~~~gherkin
Scenario: lifecycle lays out phases, iterations and gates
  When I run "sdp lifecycle"
  Then the output contains "Construction"
  And the output contains "MS-beta"
  And the output contains "DISCIPLINE ACTIVITY"
  And the output contains "░ ▒ ▓ █  more work in an iteration, relative to the discipline's busiest; blank: none"

Scenario: lifecycle --json keeps the plan and the evidence apart
  When I run "sdp lifecycle --json"
  Then the output is valid JSON
  And the output contains '"disciplines"'
  And the output contains '"work"'
  And the output contains '"evidence"'

Scenario: A plan from the template puts a milestone from the template under its phase
  When I run "sdp -C fresh init"
  And I run "sdp -C fresh lifecycle"
  Then the output contains "sdp new plan"
  And the output contains "- { id: elaboration, kind: phase"
  When I run "sdp -C fresh new plan 'Delivery plan'"
  And I run "sdp -C fresh new milestone 'Architecture baseline'"
  And I run "sdp -C fresh lifecycle"
  Then the line after the output line with "Elaboration" contains "◆ MS-architecture-baseline"
  And the output line with "Inception" contains "I1*"
~~~

## Checking and running

### `sdp check`

Validates front matter, links, Gherkin, maturity claims, decision records, plan references, code
annotations and leftover template text ([[REQ-check-rules]]). Each diagnostic has a rule id, a
`file:line` and a hint; `--severity error|warning|info` sets the minimum shown. Only errors fail
the check.

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
    | { id: REQ-a, maturity: someday }                   | maturity-value | 0        |
    | { id: REQ-a, kind: decision, status: accepted }    | decision-content | 0      |

Scenario: check --json prints the diagnostics as JSON
  When I run "sdp check --json"
  Then the exit code is 0
  And the output is valid JSON
~~~

### `sdp run [targets]`

Executes scenarios — all, or those of the given spec ids, scenario ids, files or directories (paths
relative to the current directory) — and records the results in `.sdp/results.json`. `--tags`
selects examples with a Cucumber tag expression, `--verbose` shows passed steps, `--concurrency <n>`
runs up to `n` scenarios at once (`@serial` ones alone; [[REQ-executable-specs]]). A step that did
not pass is shown with the `file:line` of its definition. `--snippets` ends the output with one
step definition module for every undefined step, ready to save as a `.steps.ts` file. A step file
that exports no step module is reported as a warning. Milestone gates run last, against the fresh
results; an unmet gate is reported but does not fail the run, because a later milestone is expected
to be unmet. The run ends with how many earlier results it did not refresh are stale, and why.

Specs that cannot be read stop `run` and `gate` before anything executes or is recorded: Gherkin
or front matter that does not parse, or an id declared twice. Each such error is one line,
`file:line [rule] message`; `sdp check` explains them.

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
    significant: true
    rationale: page load time
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
    import { defineSteps } from "sdp"

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
  And the output contains "warning: specs/steps/search.steps.ts defines no steps"

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
~~~

### `sdp gate <milestone>`

Runs one milestone's gate scenarios against the current graph and exits 0 only when the milestone
has gate scenarios and every one of them passed — an undefined or pending step leaves the milestone
unmet. It is the command a release pipeline calls. An id without gate scenarios is an error.

```sh
sdp gate MS-beta
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
~~~

## Agents

### `sdp mcp`

Serves the graph over MCP on stdio: `sdp_query`, `sdp_show`, `sdp_context`, `sdp_snippets`,
`sdp_check`, `sdp_architecture`, `sdp_lifecycle` and `sdp_status` ([[REQ-mcp-server]]). Every call
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
