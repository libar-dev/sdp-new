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
  or an `is` annotation, and let the architect decide.
- **Specs instead of prose.** A claim that can be structured or checked is a link or a scenario,
  not a paragraph. Prose says why, briefly. When you would write a sentence like "X depends on Y"
  or "this must never happen", write the link or the scenario.
- **Evidence, not status.** Scenarios are the tests. `stage: verified` is derived from a run and
  goes stale when what it ran against changes; it is an error to write it by hand.
- **Free vocabulary.** Kinds and relation names are the team's words. `sdp vocabulary` prints the
  few words sdp itself interprets in this workspace.

## Go through the graph first

The graph already knows which requirement an element realises, which decision constrains it and
which file implements it, each with its `file:line`. Asking it gets you to the right three files
faster than grepping for a guess.

- **One node, everything around it:** `sdp context <id>` — the spec, its links, scenarios and the
  steps still undefined, the architecture and decisions in reach, the code. Read this before
  changing anything the node covers.
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
- **Orientation:** `sdp arch` (the architecture with its decisions), `sdp lifecycle` (phases,
  iterations, which gates are due), `sdp status` (one screen).

Plain grep is still right for one thing: an id is literal text wherever it is declared or linked,
so `grep -rn <id> .` finds every mention.

**An answer says when it is incomplete.** If sdp could not read a file or cut a traversal short,
it prints `incomplete:` and `note:` lines on stderr and exits with code 2; with `--json` the
answer is `{ complete, notes, data }` and `complete` is `false`. Do not conclude that something is
absent from an incomplete answer — fix what the note names (`sdp check` lists it) and ask again. A
`note:` on a complete answer is worth reading too: it is how sdp tells you a kind or relation you
typed does not exist and which one is closest.

## Changing behaviour

1. Find the spec that owns it (`sdp q`, `sdp context`), or create one: `sdp new requirement "…"`.
   What a user sees belongs to a requirement; how one part does its job belongs to that element.
2. Write or adjust the scenario first. It is the acceptance test.
3. Before writing a step definition, look for one that already says it: `sdp steps '<text>'`.
   A step that matches two definitions fails. `sdp run <id> --snippets` prints definitions for
   steps that have none.
4. Implement.
5. Verify: `sdp check` (no errors), `sdp run` (no failing scenario), `sdp gate --due` (the
   milestone that is due still holds). Gates never fail `sdp run`; `sdp gate` is what enforces them.

A scenario that asserts on delivery state (`stage`, `verification`, a scenario's `status`) must be
a gate: tag it `@gate` or put it in a milestone. Ordinary scenarios run without seeing results.

## More

The repository's own agent guide (`AGENTS.md`, or `AGENTS.sdp.md` written by `sdp init`) has its
conventions; `sdp --help` and `sdp <command> --help` have every flag.
