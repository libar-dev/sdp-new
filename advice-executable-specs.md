# Advice: a spec is a Gherkin file

`review/redesign` at `6061a5c`. Nothing in the repository was changed. Everything below ran in
scratch copies. Beside this report, in `advice-executable-specs/`:

- `examples/specs/` — 24 feature files, one of every kind (the plan is 14 of them);
- `prototype.patch` — the reader those files need, as a diff against `6061a5c` (six files of `src/`,
  +246 −47 lines, plus one fixture step and the scenario lines it moves);
- `convert.mjs` — a 110-line throwaway converter from today's Markdown specs;
- `parse-all.mjs` — runs files through the unmodified official parser.

## Recommendation

A spec is one Gherkin file, read by the official parser as it is, with nothing around it and no
syntax of sdp's own.

- **Tags say what the node is and what it links to.** `@id=REQ-x @maturity=ready` describes;
  `@decided-by:DEC-0003` links. The separator is the whole grammar: `=` is a value, `:` is an edge,
  any other tag is a Cucumber tag.
- **The Feature is the node.** Its name is the title, its first paragraph the intent.
- **A `Rule:` is the unit of content, and a node from the day it is written.** Its name is the
  invariant, its description the reason, its scenarios the examples. A draft is a Feature whose
  rules have no examples yet, so value moves into examples without anything moving.
- **An open question is a Rule or a Scenario tagged `@open`.** Resolving it means rewording the
  name into the rule that was chosen and deleting the tag.
- **One node, one file.** No embedded nodes: a phase or an iteration is a Feature of two to six
  lines, and `grep '@kind=iteration'` prints the timeline.

No kind needs another container. The decision fits better than DEC-0001 feared (four lines); the
vision and the plan fit worst, and both are acceptable. What stays Markdown is `README.md`,
`AGENTS.md` and the skill, which sdp no longer reads.

What ran:

- All 24 example files parse with the unmodified official parser.
- With the prototype reader and those files in place of the eleven Markdown specs they replace,
  `sdp check` reports no error and 363 of 365 scenarios pass. The two that fail pin
  `milestone -phase->` and `risk[status]`, which D20 removes and the examples no longer write.
- The converter turns the 57 spec files that are not decisions into 85 feature files. On that
  copy `sdp check` is clean and 365 of 365 scenarios pass, with the gates as on the branch.
- The change is smaller than what it retires: the prototype adds 246 lines, and about 600 lines
  of Markdown and front-matter reading go once the last spec is converted.

## The format in one file

```gherkin
@id=REQ-guest-checkout @maturity=specified @checkout   # what it is: = describes; a bare tag is a tag
@refines:CAP-online-sales @realized-by:ARCH-orders     # what it links to: one tag, one edge
@iteration:C2 @activity.implementation:C3              # when it is written, when it is built
Feature: Guest checkout

  Shoppers without an account can buy: a third of all carts are abandoned at the sign-up form.

  Background:
    Given a cart with 2 items

  @decided-by:DEC-0004
  Rule: A guest pays without creating an account

    Scenario: By card
      When the guest pays with a valid card
      Then an order is created

  Rule: A guest gets a receipt by email

    The address is not verified first: a wrong one costs a receipt, a check costs the sale.

  @open
  Rule: Can a guest save the cart for later?
```

The prototype reads this as one requirement, three rules (one verified by a scenario, one with a
reason and no example yet, one open), and five authored edges, each at the line of its tag.

## Placement

| Content | Where in Gherkin | How sdp reads it |
| --- | --- | --- |
| identity, kind | `@id=REQ-x`, `@kind=plan` above `Feature:` | node id and kind; the kind comes from the id prefix when not written |
| title | the Feature's name | `title` |
| intent | first paragraph under `Feature:` | `summary`; `draft` asks for it |
| maturity, any value | `@maturity=ready`, `@quality=performance`, `@start=2026-11-02` | attribute; a key written twice is a list |
| relation | `@decided-by:DEC-0003`, one tag per target | edge at the tag's line; the target must exist |
| planning | `@iteration:E1`, `@activity.test:T1` | the same edges as today |
| a rule | `Rule:` — its name states the invariant | node of kind `rule`, id `SPEC#slug`, `-rule-of->` its spec |
| the reason for a rule | the description under `Rule:`, one to three sentences | `description` of the rule node |
| a reason that is a decision | `@decided-by:DEC-x` on the Rule or Scenario | edge from that rule; the decision's bundle lists it |
| examples | scenarios under the Rule; a scenario's name says the case | scenario nodes, `-verifies->` the rule and the spec |
| sub-cases of one outline | the name of each `Examples:` table | part of the example's name, as today |
| open question | `@open` on a Rule or a Scenario whose name is the question | `openQuestions`; `ready` refuses any |
| formal notation (a grammar) | doc string of a step that checks it | executed, so one copy is the source |
| shared fixture | `Background:`, for the Feature or for one Rule | steps, as today |
| selection, gates | bare tags: `@slow`, `@serial`, `@gate` | inherited, filterable, part of the hash |
| a date a gate was met | `@met=2026-11-13`, written by `sdp gate --record` | attribute (D20) |
| embedded node | none: a file of its own | — |
| note to a maintainer | `#` comment | not read |

A description says why, never what. A sentence in one that could be false is a scenario; that
convention is the only guard, as before, and Gherkin helps by making long prose uncomfortable.

## The annotation grammar

```text
@key=value    a fact about the node the tag sits on         key, rel := [A-Za-z][\w.-]*
@rel:ID       a link from that node to the node ID          value, ID := anything without a space
@word         a Cucumber tag
```

- **The first `=` or `:` decides.** `@due=2026-12-01T10:00` is a value; `@due:MS-IOC` is a link.
  This is DEC-0010 at its strongest: a link is a property of how it is written, never of the
  value, and nothing has to be declared. `vocabulary.links` goes.
- **A tag reads like the query that finds it**: `@maturity=ready` and `requirement[maturity=ready]`;
  `@decided-by:DEC-0003` and `-decided-by-> #DEC-0003`.
- **One tag, one fact.** A key or relation written again adds a value or an edge. No comma lists:
  `@uses:A,B` is an error that says so.
- **Values are tokens.** A value that reads back as the number it is written as is a number
  (`8`, not `1.0`), `true` and `false` are booleans, the rest is text. A dotted key nests:
  `@owner.team=core` answers `[owner.team=core]`. A value that needs a space is a sentence and
  belongs in the description; the one titled value is the Feature's name.
- **Where a tag sits is what it is about.**

  | On | An annotation is a fact about | A bare tag |
  | --- | --- | --- |
  | `Feature:` | the spec | is inherited by every scenario |
  | `Rule:` | the rule node | is inherited by its scenarios; `@open` |
  | `Scenario:` | the scenario node | selects, gates, serialises; `@open` |
  | `Examples:` | nothing: an error | is inherited by that table's rows |

- **Annotations are not tags.** They are not inherited, not matched by `--tags`, not shown to a
  step handler and not in a scenario's hash, so planning a spec into another iteration or raising
  its maturity leaves its results valid. Select by them with a query:
  `sdp run $(sdp q 'requirement[maturity=ready]' --ids)`.
- **Only `@id=` and `@kind=` are fixed words**, and only above `Feature:`. Every other key and
  relation is the author's. The profile keeps its roles (`iteration`, `phase`, `activity`, `start`,
  `end`, `order`, the ladder); sdp reads three bare tags: `@gate`, `@serial`, `@open`.
- **Grep**: `grep -rn '@id=DEC-0003'` is the declaration; `grep -rn ':DEC-0003\b'` is every link to
  it with its relation; `grep -rn -A1 '@open'` is every open question;
  `grep -rh '@kind=iteration' specs/delivery` is the timeline. Front matter cannot offer the
  second: a link there is written in five shapes, and a list may run over several lines.

A mistake names its fix: `@maturity:ready` already fails with `link-syntax` ("no link can be named
maturity"); the hint should add "write `@maturity=ready`".

## Where plain Gherkin has no place for something

| Thing | Choice | Why, and what was rejected |
| --- | --- | --- |
| embedded node (`nodes:`) | a file of its own | Deletes a concept (`nodes:`, `declaredIn`, `inline-node`). A phase gains a place for why it takes what it takes, an element for what it is. Rejected: a Rule with an `@id` (an element is not a rule). |
| timeline | tags on one file per iteration | Nothing new to read; grep prints it; `sdp lifecycle` draws it. Cost: 13 files where one had 13 lines. Rejected: a table in the plan's description (free text only sdp reads as data — the non-obvious wrapper again — and no way to say which column links); a step with a table (it would pretend to execute). |
| open question | `@open` on a Rule or Scenario | The 27 open questions here are choices still to make: which rule holds, which design. A choice, once made, is a rule or goes, so there is no resolved state to keep. Rejected: a description convention (a fourth syntax); a trailing `?` (existing suites name scenarios as questions). |
| value with spaces, nested data, link attributes | none | One value in this corpus has a space (`quality: "usability for agents"`); the four link attributes are all `role:` on `instance-of` and nothing reads them. |
| a mention in prose (`[[ID]]`) | none: an id in a description is text | A relation is a tag, typed and checked, at the level it concerns. grep still finds the id. |
| a small graph as a test fixture | a step with one row per spec | `Given these specs:` takes the tag line and the Feature name, which are the whole file. A step of this repository, not format. |

Nothing above goes beyond what the official parser accepts. sdp only *reads more* of what it
returns: tags as annotations, descriptions, Rules without scenarios.

### What the parser does with free text

Checked against `@cucumber/gherkin` 42. These are the format's sharp edges; the skill should list them.

| In a description, a line that starts with | Is read as | Consequence |
| --- | --- | --- |
| `#` | a comment | silently not part of the description: no Markdown headings |
| `@` | a tag line | parse error |
| `Example:`, `Scenario:`, `Rule:`, `Background:`, `Examples:` | a new block | "Example: a shopper…" becomes an empty scenario (`scenario-empty` reports it) |
| `Given`, `When`, `Then`, `And`, `But`, `*` — under a Scenario or Background only | a step | write lists with `-`; start no sentence with When |
| `Feature:` a second time | text of the first Feature | one node, one file |
| a table row, a code fence, `"""` | text | sdp reads none of it |

A Background cannot be tagged. Scenarios outside a Rule must come before the first Rule; after it,
every scenario belongs to a Rule. So a spec either uses Rules throughout or not at all.

## Examples

All are in `advice-executable-specs/examples/specs/`, and all ran.

### One requirement at every maturity

```gherkin
@id=REQ-graph-query @maturity=idea
Feature: Path-pattern queries
```

```gherkin
@id=REQ-graph-query @maturity=draft
@refines:CAP-agent-collaboration
Feature: Path-pattern queries

  People and agents ask the graph a question in one line: on the command line, over MCP and inside
  scenarios. The syntax is a public contract, because specs in every workspace embed it.

  Rule: A selector names kinds, ids or every node

  Rule: An edge follows a relation out, in or both ways

  @open
  Rule: Does a query count and group, or is that left to jq?
```

`specified`: the first rule gains an outline; the question is answered, so its Rule is renamed
"A query returns nodes or paths and nothing more" and gets its reason. `ready`: every rule has an
example and nothing is open. With the prototype, claiming `ready` on the draft above is refused
with "no scenarios; 1 open question(s), e.g. …; rule "A selector names…" has no example (line 8)".

### Idea — `requirements/REQ-step-isolation.feature`

An idea may already carry its questions. The smallest one is the two lines above.

```gherkin
@id=REQ-step-isolation @maturity=idea
@refines:CAP-living-specs
Feature: Steps that hang are stopped

  A step's timeout is cooperative: code that never yields, an endless loop or a blocking call,
  cannot be interrupted, so it fails only once it returns, and never if it does not.

  @open
  Rule: A worker thread or a child process: per run, per scenario, or only for a scenario that overran?

  @open
  Rule: How do worlds, the project a step reads and the results cross that boundary?

  @open
  Rule: Is isolation the default, or an option for suites that need it?
```

### Draft — `requirements/REQ-web-explorer.feature`

The resolved question ("Editing in the browser? No") is now a rule that names its decision.

```gherkin
@id=REQ-web-explorer @maturity=draft
@refines:CAP-curated-architecture
@iteration:C1 @activity.analysis-design:C2 @activity.implementation:C3 @activity.test:C3 @activity.test:T1
Feature: Interactive graph explorer

  Stakeholders who do not live in a terminal have nowhere to read the graph: the curated
  architecture, the way from a requirement to its decisions and code, the lifecycle chart.

  Rule: A reader browses the architecture as sdp arch shows it

  Rule: A reader follows a requirement to its decisions and its code

  Rule: A reader sees the lifecycle chart

  @decided-by:DEC-0003
  Rule: The explorer only reads: an edit is made in the files

  @open
  Rule: A static HTML export, or a local server that watches the files?

  @open
  Rule: Is the code behind an element shown always, or only on demand?
```

### Verified requirement — `requirements/REQ-graph-query.feature` (275 lines, 21 scenarios pass)

The head, one rule and the skeleton; the outlines not shown are today's, unchanged.

```gherkin
@id=REQ-graph-query @maturity=ready @graph @agents
@refines:CAP-agent-collaboration @realized-by:ARCH-query-engine
@decided-by:DEC-0006 @constrained-by:NFR-query-performance
@iteration:I1 @activity.implementation:I1 @activity.test:I1
Feature: Path-pattern queries

  People and agents ask the graph a question in one line: on the command line, over MCP and inside
  scenarios, which is how gates, guards and architecture rules are written. The syntax is a public
  contract, because specs in every workspace embed it.

  Background:
    Given these specs:
      | tags                                                                                     | Feature           |
      | @id=REQ-checkout @maturity=ready @checkout @web @due=2026-12-01 @realized-by:ARCH-orders | Checkout          |
      | @id=REQ-refunds @maturity=idea @estimate=8 @due=2027-03-01 @realized-by:ARCH-billing     | Refunds           |
      | @id=ARCH-orders @public=true @depends-on:ARCH-billing                                    | Order service, v2 |
      | @id=ARCH-billing @public=false @depends-on:ARCH-ledger                                   | Billing           |
      | @id=ARCH-ledger @owner.team=core @depends-on:ARCH-orders                                 | Ledger [legacy]   |

  Rule: A query is node selectors joined by edges, and returns nodes or paths and nothing more

    Counting and grouping are jq's, over `sdp graph`.

    Scenario: The grammar is what sdp q --help prints
      When I run "sdp q --help"
      Then the output contains:
        """
        query  := node (edge node)* [edge]
        node   := (kind(|kind)* | * | #ID(|ID)*) ([cond(, cond)*])*
        cond   := key | !key | key=v(|v)* | key!=v(|v)* | key~regex | key!~regex | key<v | key<=v | key>v | key>=v
        edge   := [! | ?] (-rel-> | <-rel- | -rel-)        rel := (* | name(|name)* | nothing) [+]
        """

    Scenario Outline: A malformed query is rejected with a reason

  Rule: A selector names kinds, ids or every node

    Scenario Outline: Kinds, ids and the star
    Scenario Outline: A word the workspace does not know is no error: it matches nothing

  Rule: A condition reads what the node itself holds, and every condition must hold

    Scenario Outline: In one group or in several
    Scenario Outline: A bare key asks whether it is set; a comparison reads the value
    Scenario Outline: Case is ignored, and a list matches when any of its elements does
    Scenario Outline: A bar separates alternatives, except in a regex or in quotes
    Scenario Outline: Less and greater order values that are set
    Scenario Outline: id, kind, title and source are keys, and a dot reaches into a nested attribute
    Scenario Outline: A key reads only what the node itself holds

    @decided-by:DEC-0010
    Scenario Outline: A key also holds the targets of the node's links, so a condition and a filter agree

  Rule: An edge follows a relation out, in or both ways

    Scenario Outline: At the end of a query an edge leads to any node
    Scenario Outline: A star or no name is any relation
    Scenario Outline: A plus is one or more hops, and reaches its start when a cycle leads back
    Scenario Outline: ? keeps the nodes with such a neighbour, ! those without, and neither moves

  Rule: The result is the distinct end nodes; a path is a route that exists, each edge drawn as it points

    Background:
      Given these specs:
        | tags                       | Feature |
        | @id=A @kind=stop @r:B      | A       |
        | @id=B @kind=stop @r:A @s:C | B       |
        | @id=C @kind=stop           | C       |

    Scenario: Several routes to a node are one result and as many paths
    (four more)
```

What changed besides the container: five rules where there were sixteen top-level names and one
Rule; the fixture is five rows, not a Markdown file with front matter and `nodes:` in a doc string;
the rows about `MODEL`, mentions, `null`, `""` and `[]` are gone, because a spec can no longer
hold any of them.

### Quality requirement — `quality/NFR-query-performance.feature` (3 pass)

```gherkin
@id=NFR-query-performance @maturity=ready @quality=performance
@refines:CAP-agent-collaboration
@iteration:I1 @activity.implementation:I1 @activity.test:I1
Feature: Interactive queries on large graphs

  Agents issue many small queries while they work, and every command rebuilds the graph from the
  files. Both halves must stay interactive on workspaces far larger than a typical repository's.

  @slow @serial
  Rule: A query over 20,000 nodes answers within 250 ms

    Scenario: Two hops
      Given a generated graph of 20000 nodes and 60000 edges
      When the query "requirement[maturity=ready] -realized-by-> element -decided-by-> decision" runs on it
      Then the median run completes within 250 ms

    Scenario: A negative filter
      Given a generated graph of 20000 nodes and 60000 edges
      When the query "element !-*- decision" runs on it
      Then the median run completes within 250 ms

  @slow @serial
  Rule: The graph of 5,000 specs builds within a second

    Scenario: A generated workspace
      Given a generated workspace of 5000 specs
      When the graph is built from it
      Then the median run completes within 1000 ms
```

### Element with a contract — `architecture/ARCH-query-engine.feature` (67 lines, 6 pass)

Two of its six scenarios are shown; the other four are today's, unchanged.

```gherkin
@id=ARCH-query-engine
@decided-by:DEC-0006 @constrained-by:NFR-query-performance @uses:ARCH-vocabulary
@iteration:I1
Feature: Query engine (SDPQ)

  Parses path patterns and evaluates them over the graph: a pure function of a graph, a query and
  the workspace's ordering ladders. It is architecture because gates, guards and agents' scripts in
  every workspace embed its syntax, and because it must stay interactive on large graphs.

  Rule: A plus walks breadth-first, at most 12 hops, and adds one path per node it reaches

    Scenario: A closure stops after twelve hops and says so
      Given a chain of 15 nodes linked by "next"
      When I query "#N1 -next+-> *"
      Then the result has 12 nodes
      And the result is truncated because "a + edge reaches further than 12 hops"

    Scenario: The path to a node a closure reaches is a shortest one
      Given these specs:
        | tags                             | Feature |
        | @id=A @kind=stop @next:B @next:C | A       |
        | @id=B @kind=stop @next:D         | B       |
        | @id=C @kind=stop @next:D         | C       |
        | @id=D @kind=stop @next:A         | D       |
      When I query "#A -next+-> *"
      Then the paths are:
        | A -next-> B                     |
        | A -next-> C                     |
        | A -next-> B -next-> D           |
        | A -next-> B -next-> D -next-> A |

  Rule: A step keeps at most 10 000 paths

    (two scenarios, as today)

  Rule: A result cut short says so and names the limit, unless the limit could not have changed it

    The bound is part of the contract: a caller that concludes from a result refuses a truncated one.

    (two scenarios, as today)
```

### Pattern — `architecture/PAT-derived-index.feature` (1 passes)

Its rule is the guard that DEC-0003 carries today. The fixtures show what nesting costs now: two
lines each, where the Markdown ones took five.

```gherkin
@id=PAT-derived-index
@decided-by:DEC-0003
@iteration:I1
Feature: Derived index over source files

  Any structure needed to answer a question fast is derived from the human-edited files on demand,
  and can be thrown away. It is why grep, git and pull requests work on all delivery knowledge and
  why there is no database to migrate; abandoning it would change every workflow.

  Rule: The next command sees an edit

    Scenario: A spec renamed between two commands
      Given a file "specs/REQ-a.feature" containing:
        """
        @id=REQ-a
        Feature: Alpha
        """
      When I run "sdp q requirement --ids"
      Then the output contains "REQ-a"
      Given a file "specs/REQ-a.feature" containing:
        """
        @id=REQ-b
        Feature: Beta
        """
      When I run "sdp q requirement --ids"
      Then the output contains "REQ-b"
      And the output does not contain "REQ-a"
```

### Decision — `decisions/DEC-0001.feature`

The whole file, and what DEC-0001 becomes.

```gherkin
@id=DEC-0001
Feature: A spec is a Gherkin file; its tags say what it is and what it links to

  Not Markdown with Gherkin in fences: the prose around the fences is the path of least resistance,
  and an agent takes it in every session. Not front matter above a Feature: that is two syntaxes for
  one fact, and a wrapper no Gherkin tool reads.
```

### Risk — `risks/RISK-0005.feature`

Rewritten for the new format, whose price it is. No status: retired is a query (D20).

```gherkin
@id=RISK-0005 @exposure=medium
@affects:REQ-progressive-specs @mitigated-by:REQ-web-explorer @due:MS-IOC @price-of:DEC-0001
Feature: Gherkin feels heavy for non-developers

  Product owners, analysts and stakeholders may find tags and Given/When/Then alien, and a
  repository page shows a spec as code. They leave the specs to developers; the specs then describe
  the implementation rather than the need, and the people who own the need stop reading them.

  Watch for: scenarios written only by developers, and ideas that never reach draft.
```

### Milestone — `delivery/MS-LCO.feature` (gate: 3 of 3 pass after a full run)

No prose: the scenario names are the criteria. A gate has no reason beyond its name, so a
milestone uses no Rules. `sdp gate MS-LCO --record` would make line 1 `@id=MS-LCO @met=2026-11-13`;
I did not record it.

```gherkin
@id=MS-LCO
@closes:PH-inception
Feature: Lifecycle Objectives

  Scenario: What the prototype built is verified
    Then the query "requirement|nfr ?-activity.implementation-> iteration[phase=PH-inception]" returns at least 1 result
    And the query "requirement|nfr[stage!=verified] ?-activity.implementation-> iteration[phase=PH-inception]" returns no results

  Scenario: The work that retires each risk is planned
    Then the query "risk" returns at least 1 result
    And the query "risk -mitigated-by-> * !-iteration-> iteration" returns no results

  Scenario: Nothing written in Inception is still undecided
    Then the query "*[openQuestions>0] ?-iteration-> iteration[phase=PH-inception]" returns no results
```

### The plan — `delivery/PLAN.feature`, four phases, nine iterations

```gherkin
@id=PLAN @kind=plan
@decided-by:DEC-0007 @decided-by:DEC-0013
Feature: Delivery plan for sdp 1.0

  Rule: Whatever has left the idea stage is planned

    Scenario: No requirement beyond an idea is without an iteration
      Then the query "requirement|nfr[maturity>=draft] !-iteration-> iteration" returns no results

  @gate
  Rule: An iteration recorded after the fact holds no work that is still to be done

    Scenario: Everything in I1 is verified
      Then the query "requirement|nfr ?-iteration-> iteration[planned=after-the-fact]" returns at least 1 result
      And the query "requirement|nfr[stage!=verified] ?-iteration|activity.implementation-> iteration[planned=after-the-fact]" returns no results
```

```gherkin
@id=PH-elaboration @order=2
Feature: Elaboration

  Takes the work that could still change the architecture: how a large workspace is read, the step
  definition API, how the tool is packaged. Construction then builds on a baseline that has run.
```

The nine iterations are two lines each. `grep -rh '@kind=iteration' specs/delivery` prints them:

```text
@id=I1 @kind=iteration @phase:PH-inception @start=2026-11-02 @end=2026-11-13 @planned=after-the-fact
@id=E1 @kind=iteration @phase:PH-elaboration @start=2026-11-16 @end=2026-11-27
@id=E2 @kind=iteration @phase:PH-elaboration @start=2026-11-30 @end=2026-12-11
…
```

The second line of each is its name, `Feature: Scale and compatibility`. `sdp lifecycle` renders
this plan as it renders today's — on today's tool too, once the tags are in its dialect (run A′).

### Vision — `VISION.feature` (1 passes)

The spec where prose is the content. No headings are possible, so paragraphs open with a label.
The principle nodes are gone (D19).

```gherkin
@id=VISION @kind=vision
@iteration:I1
Feature: Vision

  sdp manages software delivery end to end. Requirements at every maturity, quality requirements,
  decisions, the curated architecture and the delivery lifecycle form one graph: written as plain
  files next to the code, checked by rules, and executable wherever behaviour can be verified.

  The problem. Delivery knowledge is scattered. Ideas sit in a tracker, requirements in a wiki,
  acceptance tests in the code, decisions in meeting notes or nowhere, and the architecture in
  diagrams that stopped being true. Each place has its own status field that someone must remember
  to update, and none of them knows whether the system does what was asked. People struggle to see
  the whole; AI agents, which now do much of the work, cannot see it at all.

  Who it is for. Product owners and analysts capture an idea in one line and grow it into a
  specification without changing tools. Architects name the few elements that shape the system and
  record why. Developers and testers get acceptance tests that are the specification, not a copy of
  it. Delivery leads see milestones met or missed by evidence. AI agents read, query and change all
  of it with grep, a CLI or MCP.

  Positioning. Unlike a requirements tool, sdp keeps specifications in the repository and runs
  them. Unlike a BDD runner, it also holds ideas, quality requirements, decisions, architecture and
  the plan. Unlike an architecture repository, it holds only what architects declared, connected to
  the decisions and evidence behind it.

  Rule: The vision is broken down into capabilities, and every requirement refines one

    Scenario: No capability and no requirement stands alone
      Then the query "vision" returns 1 result
      And the query "capability" returns at least 1 result
      And the query "capability !-refines-> vision" returns no results
      And the query "capability !<-refines- requirement|nfr" returns no results
      And the query "requirement|nfr !-refines-> capability" returns no results
```

## What today's tool reads of them

Three runs, each in its own copy of `6061a5c`.

| Run | Tool | Result |
| --- | --- | --- |
| A | unmodified, files as written | All 24 parse. No annotation is read: each file is a node `feature:<path>` of kind `feature`, so 154 links from the rest of the corpus dangle. Summaries and scenario counts are read. |
| A′ | unmodified; `=` rewritten to `:` by one `sed`; relation names listed under `vocabulary.links`; `closes` added to the phase relations | `sdp check`: no error. `sdp lifecycle` draws the 13-file plan. 28 of 33 scenarios of the examples pass. |
| B | with `prototype.patch`, files as written | `sdp check`: no error. 363 of 365 pass; the gate of MS-LCO passes 3 of 3. |

Runs A′ and B add `closes` to the phase relations in `sdp.config.yaml`, and keep the plan's two
release nodes as two-line files (D20 turns a release into a milestone's `@version=`).

In B the one warning is `decision-status` on DEC-0001, a rule D19 removes and this checkout still
has. The two failures are `DEC-0007#every-phase-has-iterations-and-ends-in-a-milestone`
(`phase !<-phase- milestone`: the example writes `@closes:`) and
`DEC-0015#every-risk-says-what-it-threatens-and-where-it-stands` (`risk[status…]`).

What the unmodified tool cannot read, by example:

| Example | Not read today |
| --- | --- |
| every one | `@key=value` (it lands in `tags`); `@id=`; a relation that is not a vocabulary link key becomes a text attribute, not an edge |
| idea, draft | a Rule without scenarios leaves no trace; `@open` does not count as an open question; `@decided-by:` on a Rule; `@activity.test:` (the tag pattern has no dot); two `@activity.test:` tags (the last one wins) |
| verified requirement | rules as nodes; the reason under a Rule; `@decided-by:DEC-0010` on a scenario (it is a tag, and in the hash). Four fixture-driven scenarios fail in A′: values are text, so `@public=false` counts as set; `@owner.team=` is not a key; a repeated key keeps one value |
| element | the description under its third Rule; the repeated `@next:` of the fixture (one scenario fails in A′) |
| quality requirement, pattern, vision | nothing beyond the first row |
| decision | nothing beyond the first row; it still expects a `status` |
| risk | `@price-of:` as an edge |
| milestone | `@closes:` unless configured as a phase relation; `@met=` and `--record` (D20) |
| plan | nothing beyond the first row; the plan gate needs the `activity.implementation` edges |

What the prototype still lacks: the errors for an annotation on `Examples:`, an `@id=` below the
Feature and a comma in a link; adding a node's kind as a tag to its scenarios (today only Markdown
specs get it, and `--tags @nfr` relies on it); `derived-attribute` for annotations on a Rule or
Scenario; `sdp new`; rule counts in `sdp status`; the messages that still say "front matter" and
"```gherkin block"; everything D19 and D20 change.

## The owner's two examples, by this project's rules

| Convention | Verdict | Why |
| --- | --- | --- |
| Gherkin as the container; tags for identity and relations | keep | the design above |
| the problem, in the Feature description | keep, without the label | it is the intent paragraph |
| "Solution" listing the three states; the state-machine sketch | drop | it restates the six Rule names below it |
| "Invariant" under a Rule | it is the Rule's name | the paragraph restates what the scenarios pin, sentence by sentence |
| "Rationale" under a Rule | keep: one to three sentences | the one thing a scenario cannot say |
| "Verified by" lists | drop | a hand-kept view. In the first example the list no longer matches the scenarios under it in 5 of 6 rules, and 10 of 22 names match no scenario; in the ADR, 1 of 3 |
| Background "Deliverables" with a Status column | drop | status is derived; where code lives is the `is` annotation in the code |
| comment banners repeating each Rule | drop | a copy; "RULE 2" already differs from its Rule's name |
| `@…-status`, `@…-phase`, `@…-release` | derived stage; `@iteration:`; a milestone | evidence, not status |
| `@…-effort`, `@…-priority` | allowed, never interpreted | free attributes |
| `@…-business-value:graceful-degradation-ensuring-…` | drop | a sentence in a tag; it is the intent paragraph |
| `@…-depends-on:A,B,C` | `@depends-on:A @depends-on:B` | one tag, one edge |
| the `@architect-` prefix | not needed | the separator marks an annotation |
| ADR: status and supersedes tags, Context, Consequences, comparison table | drop (D19) | context is links, a cost is a risk, history is git; what was chosen over is one to three sentences |
| ADR: "Decision:" before each Rule's name | drop | where a rule comes from is `@decided-by:` |
| ADR: the rules a decision imposes, with examples | keep, on what they constrain | below |

## Where the rules a decision imposes live

On the spec they constrain, tagged where they stand: `@decided-by:DEC-0003` above the Rule (or the
Scenario). The decision stays a title and one to three sentences, and `decision-shape` reports a
Rule or a Scenario in one.

A reader of either sees them:

- the constrained spec's bundle prints `decided-by DEC-0003` on the rule's line;
- the decision's bundle lists "Rules that rest on this", each with its state. The prototype prints,
  for DEC-0003: `- [none] The explorer only reads: an edit is made in the files (decided-by) — REQ-web-explorer specs/requirements/REQ-web-explorer.feature:16`;
- `sdp q '#DEC-0003 <-decided-by- rule|scenario'`, and `grep -rn -A1 '@decided-by:DEC-0003' specs`.

Why not in the decision: a rule's examples exercise one subject, with that subject's steps and
fixtures, and their result is that subject's `stage`; a decision constrains several subjects and is
rewritten or deleted when it changes, while the rule may stay true. A Feature-level
`@decided-by:` says the spec as a whole rests on the decision; a Rule-level one says this rule is
its consequence.

## Why the fence pulled toward prose

Briefly, since the direction is set. The container made prose the default and Gherkin the
exception: a Markdown file opens with a heading and a paragraph, and the fence is something an
author decides to open. `draft` rewarded a paragraph first. The reader dropped the text under
`Rule:` and `Scenario:`, so a reason had nowhere to go inside the fence. And free text inside the
fence was never looked at: `specs/requirements/REQ-graph-query.md:28` opens the fence a second
time, the stray line is read as the Feature's description, and every check passes. Where authors
only needed a spec that runs, they already wrote `.feature` fixtures: 23 of 153.

## What sdp must change, smallest first

`prototype.patch` does 1 to 7 well enough to run the examples; it is a sketch, not the change.

1. **The tag grammar** in `parseFeatureSpec` and `Gherkin.ts`: `=`, `:`, repeated keys, dotted
   keys, values typed as above, each fact at the line of its tag.
2. **Annotations are not tags**: left out of the tags of an example, and so of its hash, of
   `--tags` and of what a handler sees. The node's kind stays a tag.
3. **Descriptions are kept**: the Feature's first paragraph is `summary` (today); the text under
   a Rule or a Scenario is its `description`.
4. **Rules are nodes**: kind `rule`, id `SPEC#slug` in the namespace of scenario ids, attributes
   `spec`, `description`, `scenarios`, `verification` (rolled up over its examples, as for a spec).
   Edges: `rule -rule-of-> spec`, `scenario -verifies-> rule`; `scenario -verifies-> spec` stays, so
   no existing query changes. An annotation on a Rule or Scenario is a fact or an edge of that node.
5. **`@open`** on a Rule or Scenario counts in `openQuestions`; a step-less scenario that is open
   is not `scenario-empty`.
6. **Maturity criteria** (below).
7. **`sdp context` leads with the contract**: each rule with its state (`passing`,
   `no example yet`, `open question`), what it rests on and its reason, then its examples; a
   decision's bundle lists the rules that rest on it. `sdp status` counts rules, those without an
   example and those open.
8. **Diagnostics.** New: `annotation` (an `@id=` or `@kind=` below the Feature, an annotation on
   `Examples:`, a comma in a link); `not-a-spec`, a warning for a `.md` file where specs live;
   `description-comment`, a warning for a `#` line inside a description. Hints stop saying
   "front matter". No prose check.
9. **`sdp new` writes features.** An idea is two lines; from `specified` on, one
   `Rule: <the rule, in one sentence>` with a scenario to fill in; a decision is its title and
   `Not <what a reasonable person would have chosen>, because <why>.` `sdp new iteration` and
   `sdp new phase` replace the plan template's `nodes:`. `sdp gate --record` adds `@met=` to the
   first tag line, which is simpler than editing YAML.
10. **The lifecycle reads the plan from edges.** Today it also needs the `activity` map as an
    attribute; the prototype rebuilds one.
11. **The skill and `sdp init`**: the format in one file (the legend above), the table of sharp
    edges, and "a spec is a `.feature` file; Markdown is for README.md, AGENTS.md and this skill".
12. **Delete the Markdown path**, last.

### What goes, and what replaces it

| Goes | Lines here | Replaced by |
| --- | --- | --- |
| `src/parse/Markdown.ts`: front matter as located YAML, the CommonMark body, sections, prose | 310, the whole file | the Gherkin AST |
| `parseMarkdownSpec`, the five link shapes, `links:`, link attributes, `attributeLines` | about 220 of the 378 in `src/parse/Spec.ts` | tags |
| `parseGherkinFences` and its line map | about 40 in `src/parse/Gherkin.ts` | a file is a Feature; lines are lines |
| embedded `nodes:`, `inline-node`, `declaredIn`, `ownWords` | about 60 across `Spec.ts`, `Build.ts`, `Context.ts` | one node, one file |
| `[[wiki-links]]`, `rel:: [[ID]]`, the `mentions` relation, `isMention` in four modules, the wildcard's exception | — | a tag at the level it concerns |
| "Open questions" headings, checkboxes, struck items | in `Markdown.ts` | `@open` |
| `vocabulary.links`, `relations.mention`, the `specs` glob, `link-conflict`, `front-matter`, `missing-id` for Markdown, the prose lines of `template-placeholder`, the YAML writer in `Templates.ts` | — | nothing |
| the dependency `mdast-util-from-markdown` (`yaml` stays for the configuration) | — | — |
| scenarios that pin all this: 16 of the 23 in ARCH-spec-parser (front matter, the body), and their kin in ARCH-graph-builder, REQ-flexible-graph, REQ-check-rules | — | scenarios for the tag grammar, descriptions and rules |

### Maturity criteria when a spec is a Feature

| Level | Asks for |
| --- | --- |
| idea | a Feature with a name |
| draft | a first paragraph: who wants what, and why |
| specified | at least one scenario that states an outcome |
| ready | nothing tagged `@open`; every Rule has an example; every scenario states an outcome |
| verified (derived) | every scenario passes |

Only `ready` changes: "every Rule has an example" is new, and it is what makes a draft's rules a
checked to-do list. They still run on every node that declares maturity.

## What stays Markdown

`README.md` (the repository page and the package page), `AGENTS.md` with `CLAUDE.md` (agent
harnesses load them), `.claude/skills/sdp/SKILL.md` (the skill format). Nothing else.

How they stay thin:

- **sdp does not read them.** A rule, link or scenario written there is in no graph, no run and no
  check, so it counts for nothing. That is the structural guard.
- **Their scenarios move.** The five of `README.md` and the one of `AGENTS.md` become
  `specs/GUIDE.feature`. The README keeps two sentences, three commands and four pointers. It no
  longer runs; that is a loss, and the reason to keep it short enough to have nothing to rot.
- **`not-a-spec`** tells the agent that wrote `specs/REQ-x.md` out of habit what to do instead.
  Without it the mistake is silent.
- **One guard scenario in this repository**, in the shape of the grep guard AGENTS.md has today:
  `git ls-files '*.md'` prints exactly the files named above (plus `examples/shop/README.md`).

## The migration

`npm run verify` stays green at every step because ids do not change and the reader takes both
formats until the end. Two mixed states ran: eleven specs converted (run B), and 57 converted with
18 Markdown decisions left (the converter run).

0. **The reader**, with scenarios written as `.feature` fixtures. The 17 fixture lines that use
   the old `@id:` dialect change in the same commit. Markdown untouched.
1. **`sdp new`, the skill, DEC-0001.** From here every new spec is a feature.
2. **Kinds without fixtures**: decisions, by hand, straight into the D19 form; then risks,
   patterns, the plan with its phases and iterations, milestones (D20), the vision, capabilities,
   quality requirements.
3. **Elements, then requirements**, smallest first; REQ-cli and REQ-executable-specs last.
4. **`README.md` and `AGENTS.md`**: scenarios to `specs/GUIDE.feature`; both files shrink.
5. **The fixtures.** 130 Markdown files inside doc strings become feature fixtures or rows of
   `Given these specs:`, spec by spec. The scenarios that pin Markdown itself are deleted here.
6. **Delete the Markdown path**; turn on `not-a-spec`; convert `examples/shop`.

**A converter is worth writing once, as a script, not as a command.** `convert.mjs` does what is
mechanical: front matter to tag lines, the title, the opening paragraphs to the description,
fences to an indented body, open questions to `@open` Rules at the end of the file, each embedded
node to a file. It changes no scenario name, step or order, so every id survives. On this corpus:
57 files in, 85 out, 27 open questions, check clean, 365 of 365 passing. (In that copy
`README.md` and `AGENTS.md` were left as three-line files, and `docs/**/*.feature` was added to the
`features` globs.)

What it cannot do, and leaves as `# TODO(convert)` comments or reports:

- 226 lines of headings and prose between fences: which become a Rule's reason, which a Rule's
  name, which go (61 in REQ-cli, 39 in the vision, 35 in the README, 29 in REQ-lifecycle-view);
- grouping scenarios under Rules and naming the rules: a heading such as "Front matter" is a
  topic, not a rule;
- 109 mentions, now ids in prose: which are relations, and of which rule;
- 3 resolved questions, 4 link attributes, 1 value with a space;
- the decisions, which D19 rewrites anyway;
- the fixtures: every expected `file:line` is re-derived by running.

## What is lost

- **The reader on GitHub.** A spec is shown as highlighted code, not a rendered page: no headings,
  no clickable links between specs, no tables or diagrams. RISK-0005 grows. Mitigation: the
  explorer (REQ-web-explorer, planned for C3) becomes the page for that reader, and is worth
  pulling forward; until then, `sdp context <id>` is the rendered view.
- **Checked links in prose.** 83 `mentions` edges go; an id in a description can rot unseen.
  Mitigation: put the relation in a tag. If that proves too little, a warning for a word that
  carries one of the workspace's id prefixes and names no node.
- **Long reasons.** A description has no headings and several line starts are forbidden. For a
  rule's reason that is intended. For the vision it is a cost.
- **One file for the timeline.** Thirteen files; a date shift touches several.
- **Structured values**: lists of maps, nested data, link attributes, values with spaces, YAML
  comments beside a key (a comment after a tag line still works).
- **Kind-specific words.** Every node says `Feature:`, a decision and an iteration included. The
  parser offers `Business Need:` and `Ability:` and nothing better; a dialect of our own would cost
  the editors.
- **A README that runs.**
- **Suites that already use `@key:value` tags** (Allure's `@allure.label.owner:x`) get a dangling
  link per tag. Today those tags become attributes silently.

Gained beyond the north star: editors' Gherkin support (highlighting, folding, table formatting)
covers the whole file instead of stopping at a fence; fixtures nest one level, not three; one tag
grammar replaces five link shapes. Step completion and go-to-definition from the Cucumber language
server may work with `defineSteps`; I did not try.

## Unsure — the owner's calls

1. **`=` and `:`, or all colons.** You wrote `@decided-by:DEC-0003`, and your other project
   writes values with a colon too. With one separator sdp must be told which keys link or which
   describe, in the configuration, and a reader of the file cannot tell. I would keep the split.
2. **Thirteen plan files, or one table.** I chose files because they need nothing new. If the
   timeline must be one screen in the repository, the least bad table is a description table in
   `PLAN.feature`, with `@phase:` written inside the cells.
3. **Rules throughout, or scenario names as rules.** The grammar forbids mixing after the first
   Rule. My examples use Rules for requirements, quality requirements, elements and patterns, and
   none for milestones. The converter keeps today's top-level scenarios, which is valid; grouping
   them is the hand pass.
4. **The rule's place in the graph.** I added `rule-of` and let a scenario verify both its rule
   and its spec, so no existing query changes. A strict tree (scenario → rule → spec) is cleaner
   and changes what `#REQ-x <-verifies- scenario` returns.
5. **Mentions**: gone entirely, or the stale-id warning.
6. **Link attributes**: gone (four uses, none read), or `@instance-of:PAT-x` plus a second
   relation name for the role.
7. **`@open` as a fixed word**, beside `@gate` and `@serial`, or a role of the profile.
8. **The vision's three paragraphs**: in `VISION.feature`, as above, or in `README.md`, where the
   reader without a terminal lands and where sdp will not read them.
9. **Tags of foreign suites.** An opt-out list of keys read as plain tags, or nothing until a
   suite asks.
