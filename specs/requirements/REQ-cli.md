---
id: REQ-cli
kind: requirement
title: Command line
maturity: ready
iteration: C2
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
| `-C`, `--root <dir>` | every command | workspace root, the directory holding `sdp.config.yaml` (default `.`) |
| `--json` | `status`, `q`, `show`, `check`, `run`, `gate`, `lifecycle` | machine-readable output on stdout |
| `--help`, `--version` | every command | usage with examples; the version |

| Command | Exits with 1 when |
| --- | --- |
| `check` | there is at least one error diagnostic |
| `run` | an ordinary scenario failed or is ambiguous; an unmet milestone gate does **not** count |
| `gate` | the milestone's gate scenarios are not all met |
| `q`, `show`, `context`, `new` | the query is invalid, the id is unknown, or the id already exists |

## The example workspace

The scenarios below run against this small workspace: one specified requirement, two
architecture elements of which the architect marked one significant, a decision, an architecture
rule, a plan with one iteration, and a milestone whose gate is not met yet.

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
      - { id: ARCH-index, kind: element, title: Search index, significant: true, rationale: "search latency depends on it" }
      - { id: ARCH-cache, kind: element, title: Page cache }
      - { id: DEC-0001, kind: decision, title: Use an inverted index, status: accepted, links: { affects: ARCH-index } }
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
      - { id: construction, kind: phase, title: Construction, order: 1 }
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

Commands work on the current directory unless `-C` names another workspace root — the way an MCP
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

Scenario: A broken configuration is reported in one line that names the file
  Given a file "broken/sdp.config.yaml" containing:
    """
    specs: 42
    """
  When I run "sdp -C broken status"
  Then the exit code is 1
  And the output contains "sdp.config.yaml: invalid configuration"
  And the output does not contain "    at "
~~~

## Authoring

### `sdp init`

Creates `sdp.config.yaml` (every key optional, defaults shown), `.sdp/.gitignore` and an agent
guide, `AGENTS.sdp.md`, for your `AGENTS.md` or `CLAUDE.md` to point at. Like every document sdp
writes, the guide is a spec: a node of kind `guide`. Existing files are left alone.

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

Creates a node from a template and prints its id and file. `--maturity idea|draft|specified|ready`
(default `idea`) grows the template with the level; `--id` and `--dir` override the generated id
and the directory chosen by kind. Requirements, quality requirements (`nfr`), decisions,
elements, patterns and milestones have their own templates; any other kind gets the generic one.
Ids come from `ids:` in the config (`REQ-guest-checkout`); decisions and risks are numbered
(`DEC-0007`). An existing id or file is never overwritten.

```sh
sdp new requirement "Saved carts" --maturity draft
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

Scenario: Everything the templates produce passes the check
  Given specs created from the sdp new templates:
    | kind        | title            | maturity  |
    | requirement | Wishlist         | idea      |
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
  Then the check reports nothing
~~~

## Reading the graph

### `sdp status`

One screen: node and edge counts, kinds, relations, spec stages, decisions, scenario results, how
many elements are marked significant, and diagnostics by severity.

```sh
sdp status --json | jq .scenarios
```

~~~gherkin
Scenario: status summarises the delivery state
  When I run "sdp status --json"
  Then the output is valid JSON
  And the output contains '"requirement": 1'
~~~

### `sdp query <pattern>`, `sdp q`

Answers a path pattern with the matching nodes: a table by default, `--ids` for one id per line,
`--paths` for whole paths, `--json`. `sdp q --help` prints the syntax.

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
  And the output contains "<-affects- DEC-0001"
  And the output contains "<-realized-by- REQ-search"
~~~

### `sdp context <id>`

Everything needed to work on one node, as one Markdown document: the spec, its relationships,
scenario results with suggested step definitions for undefined steps, the significant
architecture and decisions within reach (`--depth`, default 2), and linked code. The usual first call before changing a spec.

```sh
sdp context REQ-search
```

~~~gherkin
Scenario: context bundles what is needed to work on a node
  When I run "sdp context REQ-search"
  Then the output contains "Shoppers find products by name."
  And the output contains "ARCH-index"
  And the output contains "DEC-0001"
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
checks it. `--candidates` lists suggestions worth a look; `-f mermaid|dot|json` for diagrams.

```sh
sdp arch
sdp arch --candidates
```

~~~gherkin
Scenario: arch shows what architects marked significant
  When I run "sdp arch"
  Then the output contains "Significant (marked by architects): 1"
  And the output contains "why: search latency depends on it"
  And the output contains "<-affects- DEC-0001"
  And the output contains "1 declared, not significant: ARCH-cache"
  And the output does not contain "%"
~~~

### `sdp lifecycle`

Phases with their milestone gates, iterations with their planned work by stage, and the
discipline activity chart computed from the plan.

```sh
sdp lifecycle
```

~~~gherkin
Scenario: lifecycle lays out phases, iterations and gates
  When I run "sdp lifecycle"
  Then the output contains "Construction"
  And the output contains "MS-beta"
  And the output contains "DISCIPLINE ACTIVITY"
~~~

## Checking and running

### `sdp check`

Validates front matter, links, Gherkin, maturity claims and decision records. Each diagnostic has
a rule id, a `file:line` and a hint; `--severity error|warning|info` sets the minimum shown.

```sh
sdp check --severity warning
```

~~~gherkin
Scenario: check exits 1 on errors
  Given a file "specs/REQ-filters.md" containing:
    """
    ---
    id: REQ-filters
    links:
      realized-by: ARCH-facets
    ---
    # Filters
    """
  When I run "sdp check"
  Then the exit code is 1
  And the output contains "[dangling-link]"

Scenario: A clean workspace passes the check
  When I run "sdp check --json"
  Then the exit code is 0
  And the output is valid JSON
~~~

### `sdp run [targets]`

Executes scenarios — all, or those of the given spec ids, scenario ids, files or directories —
and records the results in `.sdp/results.json`. `--tags` filters with a Cucumber tag expression,
`--snippets` prints step definition stubs for undefined steps, `--verbose` shows passed steps.
Milestone gates run last, against the fresh results; an unmet gate is reported but does not fail
the run, because a later milestone is expected to be unmet.

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
~~~

### `sdp gate <milestone>`

Runs one milestone's gate scenarios against the current graph and exits 1 unless all pass — the
command a release pipeline calls (see the scenario above).

```sh
sdp gate MS-beta
```

## Agents

### `sdp mcp`

Serves the graph over MCP on stdio: `sdp_query`, `sdp_show`, `sdp_context`, `sdp_check`,
`sdp_architecture` and `sdp_status`. Every call re-reads the workspace.

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
