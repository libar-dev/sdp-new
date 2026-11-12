---
id: AGENTS
kind: guide
title: Agent guide
links:
  introduces: CAP-agent-collaboration
---

# Agent guide

This repository is **sdp**, and it is specified *with* sdp. Changing the tool (TypeScript in
`src/`) and changing its specifications (Markdown in `specs/` and `docs/`) go through the same
loop. This guide is a spec too: the scenarios at the end check that its instructions work. `sdp`
below is `node src/cli/main.ts`.

## Find things

- A spec by its id: `grep -rn REQ-graph-query specs docs src`. An id is literal wherever it is
  declared or linked, and its prefix says its kind and its folder: `REQ-` specs/requirements,
  `NFR-` specs/quality, `CAP-` specs/capabilities, `DEC-` docs/decisions, `RISK-` docs/risks,
  `ARCH-` and `PAT-` docs/architecture, `MS-`, `PH-` and the `PLAN` docs/delivery.
- Two ids are made by sdp, not written: a scenario is `<spec id>#<slug of its name>` and annotated
  code is `code:<path>#<symbol>`. Find those by the spec id, the name or the path.
- Graph questions: `sdp q '<pattern>'` (syntax: `sdp q --help`), or `sdp graph | jq …` — one
  record per line.
- Everything about one node before you change it: `sdp context <id>`.
- The architecture: `sdp arch`. The code anchored to it: `grep -rn "annotate(" src`.
- A step definition that already says what you need: `sdp steps '<text>'`.
- The words sdp interprets: `sdp vocabulary`. The words this repository uses: [[GLOSSARY]].
- Every command, flag and exit code: [REQ-cli](specs/requirements/REQ-cli.md).

## Change behaviour

1. Find the spec that owns the change. What a user of sdp sees — a command, an output, a rule —
   belongs to a requirement (`REQ-*`). How one element does its part — a parser's edge cases, a
   limit, a contract between modules — belongs to that element (`ARCH-*`);
   `sdp q '#REQ-graph-query -realized-by-> element'` leads from one to the other. Something new
   starts with `sdp new requirement "…"`. Write or adjust the scenarios first: they are the
   acceptance tests, and there are no other tests.
2. `sdp context <spec-id>` lists the steps without a definition; `sdp run <spec-id> --snippets`
   prints one paste-ready module with a suggested definition for each. Step definitions live in
   `specs/steps/*.steps.ts` and share one world (`specs/steps/world.ts`). They drive the real
   pipeline against an in-memory workspace, or the real CLI in a temporary directory
   (`cli.steps.ts`). Extend a definition that `sdp steps` finds before adding one: a step that
   matches two definitions is ambiguous and fails.
3. Implement in `src/`.
4. `npm run verify` must pass: typecheck, `sdp check` without errors, `sdp run` without a failing
   scenario, and the gates that are due (`sdp gate --due`). After adding or renaming a spec, run
   `npm run types` so the compiler knows its id.

Gates — milestones and `@gate` scenarios — never fail `sdp run`, and the later milestones it
reports unmet are expected. A gate of the current phase or a past one is not: `sdp lifecycle`
shows it as failing without *not due*, and `sdp gate <id>` exits 1 on it. If your change broke
it, your change is not done.

## Plan work

- A requirement that has left the idea stage is planned in its own front matter: `iteration:`
  says when it is written, `activity: { implementation: C1, test: [C1, T1] }` when it is built
  and tested ([[REQ-lifecycle-view]]).
- `sdp lifecycle` marks the current iteration with `*`. Work goes into the iteration in which it
  will be done, never into one that is over.
- A risk names what it threatens, the work that retires it and the milestone it is due at
  ([[PLAN]]).

## Conventions

- A claim that can be checked is a link or a scenario; prose says why, and is short. Every
  document is a spec, guides like this one included.
- One word for one thing ([[GLOSSARY]]).
- Node.js 24 runs `.ts` directly: use erasable syntax only (no enums, namespaces, parameter
  properties), import with `.ts` extensions ([[NFR-no-build-step]]).
- Effect 4: `Effect.fn`/`Effect.gen` for IO workflows, `Schema` for external data, services at the
  edge (`FileSystem`, `Path`); keep parsing, graph, query and check pure ([[DEC-0004]]). Effect's
  documentation ships in `node_modules/effect/AGENTS.md` — use it, not memory of Effect 2 or 3.
- Kinds, relations and attributes are free-form. The few words sdp interprets are roles of the
  vocabulary profile (`src/model/Vocabulary.ts`): ask it, never compare with one of its words as
  a literal — a guard in [[ARCH-vocabulary]] fails the run if you do.
- Code is linked to the architecture, not to requirements: an `is` annotation says which code an
  element is, and a requirement names its element with `realized-by` ([[DEC-0009]]).
- What belongs in the architecture is the architects' call ([[DEC-0008]]): do not add or remove an
  element, a pattern or an `is` annotation on your own initiative; propose it instead.
- A decision that changes is rewritten or deleted, and the decision numbers stay without gaps
  ([[REQ-decision-records]]).
- `.sdp/results.json` is written by `sdp run`; do not edit it by hand.

## Scenarios

~~~gherkin
Scenario: An id leads to its spec with grep
  When I run "grep -rln REQ-graph-query specs src" in the repository
  Then the output contains "specs/requirements/REQ-graph-query.md"

Scenario: The ids sdp makes are built from a spec id or a path
  When I run "sdp q 'scenario[spec=AGENTS]' --ids" in the repository
  Then the output contains "AGENTS#an-id-leads-to-its-spec-with-grep"
  When I run "sdp q '#ARCH-graph <-is- code' --ids" in the repository
  Then the output contains "code:src/model/Graph.ts#Graph"

Scenario: A requirement leads to the element that owns the how
  When I run "sdp q '#REQ-graph-query -realized-by-> element' --ids" in the repository
  Then the output contains "ARCH-query-engine"

Scenario: The code anchored to the architecture is one grep away
  When I run "grep -rn annotate( src" in the repository
  Then the output contains 'annotate(Graph, { is: "ARCH-graph"'

Scenario: The query syntax is one --help away
  When I run "sdp q --help"
  Then the output contains "-rel->"

Scenario: context prints the spec and what surrounds it
  When I run "sdp context REQ-graph-query" in the repository
  Then the output contains "# REQ-graph-query"
  And the output contains "ARCH-query-engine"

Scenario: An existing step definition is one command away
  When I run "sdp steps 'the output contains'" in the repository
  Then the output contains "specs/steps/sdp.steps.ts:"
  And the output contains "the output contains {string}"

Scenario: Snippets show how to automate a new scenario
  Given a file "specs/REQ-export.md" containing:
    """
    ---
    id: REQ-export
    maturity: specified
    ---
    # Export

    ```gherkin
    Scenario: Export as CSV
      When the catalogue is exported as CSV
      Then every product is one row
    ```
    """
  When I run "sdp run REQ-export --snippets"
  Then the exit code is 0
  And the output contains 'When("the catalogue is exported as CSV", ({ world }) => pending())'

Scenario: The architecture is one command away
  When I run "sdp arch" in the repository
  Then the output contains "ARCH-graph"

Scenario: The words sdp interprets are one command away
  When I run "sdp vocabulary" in the repository
  Then the output contains "anchor             is"

Scenario: A milestone that is not met shows in sdp lifecycle, and sdp gate fails on it
  Given a file "docs/DEC-0001.md" containing:
    """
    ---
    id: DEC-0001
    status: proposed
    ---
    # Pay without an account
    """
  And a file "docs/MS-objectives.md" containing:
    """
    ---
    id: MS-objectives
    closes: PH-inception
    ---
    # Objectives

    ```gherkin
    Scenario: Nothing is left undecided
      Then the query "decision[status=proposed]" returns no results
    ```
    """
  When I run "sdp new plan 'Plan'"
  Then the exit code is 0
  When I run "sdp run"
  Then the exit code is 0
  When I run "sdp lifecycle"
  Then the output line with "MS-objectives" contains "▶"
  And the output line with "MS-objectives" contains "0/1"
  When I run "sdp gate MS-objectives"
  Then the exit code is 1

Scenario Outline: An id with a prefix is of that prefix's kind, and the other way round
  Then every node matching "*[id~^<prefix>-[^#]*$]" also matches "<kind>"
  And every node matching "<kind>" also matches "*[id~^<prefix>-]"

  Examples:
    | prefix | kind        |
    | REQ    | requirement |
    | NFR    | nfr         |
    | DEC    | decision    |
    | ARCH   | element     |
    | PAT    | pattern     |
    | MS     | milestone   |
    | CAP    | capability  |
    | RISK   | risk        |
    | PH     | phase       |
~~~
