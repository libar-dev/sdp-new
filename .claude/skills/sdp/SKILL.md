---
name: sdp
description: How to work in a repository that uses sdp (it has an `sdp.config.yaml`) — requirements, decisions, architecture and the delivery plan kept as one graph of Markdown specs with Gherkin scenarios. Use this whenever you are about to read, navigate or change such a repository - finding the code behind a requirement or an architecture element, changing behaviour, writing or editing a spec, a decision, a scenario or a step definition, checking what is verified, or planning work — even if the user only says "fix this" or "where is X handled". Reach for the graph before grep.
---

# Working with sdp

sdp is architecture-focused software delivery. Requirements, quality requirements, decisions, the
architecture and the delivery plan are plain Markdown files with YAML front matter (`id`, `kind`,
`links`) and Gherkin scenarios. Together they form one graph, and code is anchored to it with
`annotate()` calls or `@sdp` comments.

`sdp` below is the CLI. Where it is not installed, run it from its source:
`node <path-to-sdp>/src/cli/main.ts …` (inside the sdp repository itself, `node src/cli/main.ts …`).

## What holds everywhere

- **Files are the source of truth.** The graph is rebuilt from them on every command. Edit the
  files; never a derived artefact (`.sdp/results.json` is written by `sdp run`).
- **The architecture is what architects declared.** An element or pattern is in the graph because
  someone decided it matters, so everything `sdp arch` shows is significant. sdp does not harvest
  abstractions from code and neither should you: propose adding or removing an element, a pattern
  or an `is` annotation, and let the architect decide. Code links to the architecture, not to
  requirements: `annotate(Thing, { is: "ARCH-x" })` from `sdp/annotations`, or an `@sdp is ARCH-x`
  comment, says which code an element is, and a requirement names its element with `realized-by`.
- **Specs instead of prose.** A claim that can be structured or checked is a link or a scenario,
  not a paragraph. When you would write "X depends on Y" or "this must never happen", write the
  link or the scenario. A scenario's name is the rule it pins, so write it as the rule — and when
  a sentence becomes a scenario, delete the sentence: promote, do not copy.
- **A rule and its reason are written in the Gherkin.** What several examples illustrate is a
  `Rule:` — its name says what must hold, the lines under it why, and its examples follow in the
  same fence, where the rule ends. One scenario's reason goes under its `Scenario:` line. Outside
  the fences a spec keeps only its intent, in a few sentences.
- **A decision is rare and short.** Only a choice that is hard to reverse, surprising without
  context and a real trade-off is recorded: a title and one to three sentences on what was chosen
  over what. Any other choice is a sentence where it applies.
- **Evidence, not status.** Scenarios are the tests. `stage: verified` is derived from a run and
  goes stale when what it ran against changes; it is an error to write it by hand.
- **Free vocabulary.** Kinds and relation names are the team's words. `sdp vocabulary` prints the
  few words sdp itself interprets in this workspace.

## Go through the graph first

The graph already knows which requirement an element realises, which decision constrains it and
which file implements it, each with its `file:line`. Asking it gets you to the right three files
faster than grepping for a guess.

- **One node, everything around it:** `sdp context <id>` — its rules with their reasons, the
  names of its scenarios with their status and the steps still undefined, then the spec, its
  links, the architecture and decisions in reach, the code. Read this before changing anything
  the node covers.
- **From a requirement to its code:** `sdp q '#REQ-x -realized-by-> element <-is- code' --ids`.
  From an element: `sdp q '#ARCH-x <-is- code'`. A query answers with the last node of the
  pattern; `--paths` shows the route. Syntax and examples: `sdp q --help`.
- **The graph as data:** `sdp graph` prints one JSON record per line, so anything a query cannot
  say, jq, grep or a short script can:

  ```sh
  sdp graph | jq -r 'select(.type=="edge" and .rel=="realized-by" and .to=="ARCH-x") | .from'
  sdp graph | jq -r 'select(.type=="node") | .kind' | sort | uniq -c
  sdp graph | grep '"rel":"decided-by"'
  ```

  A node is `{type, id, kind, title, file, line, attrs}`; an edge is
  `{type, from, rel, to, attrs, declared: [{file, line}]}`. `sdp graph -q '<pattern>'` exports
  only what a query matches.
- **Orientation:** `sdp arch` (the architecture with its decisions and the code that is it),
  `sdp lifecycle` (the milestones, which one the project is at, the work planned into each
  iteration), `sdp status` (one screen).

Plain grep is still right for one thing: an id is literal text wherever it is declared or linked,
so `grep -rn <id> .` finds every mention.

**An answer says when it is incomplete.** If sdp could not read a file or cut a traversal short,
it prints `incomplete:` and `note:` lines on stderr and exits with code 2; with `--json` the
answer is `{ complete, notes, data }` and `complete` is `false`. Do not conclude that something is
absent from an incomplete answer — fix what the note names (`sdp check` lists it) and ask again. A
`note:` on a complete answer is worth reading too: it is how sdp tells you a kind or relation you
typed does not exist and which one is closest.

## Changing behaviour

1. Find the spec that owns it (`sdp q`, `sdp context`), or create one: `sdp new requirement "…"`
   writes the file and says what to write in it next. What a user sees belongs to a requirement;
   how one part does its job belongs to that element.
2. Write or adjust the scenario first. It is the acceptance test.
3. Before writing a step definition, look for one that already says it: `sdp steps '<text>'`.
   A step that matches two definitions fails. `sdp run <id> --snippets` prints definitions for
   steps that have none.
4. Implement.
5. Verify: `sdp check` (no errors) and `sdp run` (no failing scenario). Gates never fail
   `sdp run`; `sdp gate <milestone>` is what enforces one.

A scenario that asserts on delivery state (`stage`, `verification`, a scenario's `status`) must be
a gate: tag it `@gate` or put it in a milestone. Ordinary scenarios run without seeing results.

## Planning work

- Work is planned in its own front matter: `iteration: E1` says when a spec is written,
  `activity: { implementation: C1, test: [C1, T1] }` when it is built and tested.
- `sdp lifecycle` shows the plan and marks the current iteration with `*`. Plan work into the
  iteration in which it will be done, never into one that is over.
- A milestone's scenarios are its gate. `sdp gate <milestone>` says whether it passes, and
  `--record` writes `met: <date>` into the milestone when it does: the project is at the first
  milestone without one. Recording is the team's act, never a side effect.

## More

`sdp --help` and `sdp <command> --help` have every command and flag; `sdp vocabulary` has the
words sdp interprets and the attributes it derives. What is specific to one repository is in its
`AGENTS.md`.
