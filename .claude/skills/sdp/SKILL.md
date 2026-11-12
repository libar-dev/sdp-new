---
name: sdp
description: How to work in a repository that uses sdp (it has an `sdp.config.yaml`) — requirements, decisions, architecture and the delivery plan kept as one graph of Gherkin specs whose tags say what each is and what it links to. Use this whenever you are about to read, navigate or change such a repository - finding the code behind a requirement or an architecture element, changing behaviour, writing or editing a spec, a decision, a rule, a scenario or a step definition, checking what is verified, or planning work — even if the user only says "fix this" or "where is X handled". Reach for the graph before grep.
---

# Working with sdp

sdp is architecture-focused software delivery. Requirements, quality requirements, decisions, the
architecture and the delivery plan are Gherkin files. Together they form one graph, and code is
anchored to it with `annotate()` calls or `@sdp` comments.

`sdp` below is the CLI. Where it is not installed, run it from its source:
`node <path-to-sdp>/src/cli/main.ts …` (inside the sdp repository itself, `node src/cli/main.ts …`).

## A spec is a `.feature` file

Read by the official Gherkin parser as it is; sdp adds no syntax of its own. Markdown is for
`README.md`, `AGENTS.md` and this skill, which sdp does not read: a rule written there counts for
nothing.

```gherkin
@id=REQ-guest-checkout @maturity=specified @checkout   # what it is: = is a value; a bare tag is a tag
@refines:CAP-online-sales @realized-by:ARCH-orders    # what it links to: one tag, one link
@iteration:C2 @activity.implementation:C3              # when it is written, when it is built
Feature: Guest checkout

  Shoppers without an account can buy: a third of all carts are abandoned at the sign-up form.

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

- **`@key=value` describes, `@rel:ID` links**, and the first `=` or `:` decides. Above `Feature:`
  they are about the spec, above `Rule:` about the rule, above `Scenario:` about the scenario. Only
  a Feature has `@id=` and `@kind=`; the kind comes from the id's prefix when it is not written.
  A key written twice is a list, `@owner.team=core` nests, and a value that reads back as a number
  is one. Annotations are not tags: they are not inherited, not matched by `--tags` and not part
  of a scenario's hash, so re-planning a spec leaves its results valid.
- **The Feature is the node**: its name is the title, its first paragraph the intent.
- **A `Rule:` is the unit of content.** Its name states what must hold, the one to three lines
  under it say why, and its scenarios are the examples; a scenario's name says the case. Every
  scenario belongs to a rule. A rule without an example yet is a to-do that `ready` refuses.
- **An open question is a Rule or a Scenario tagged `@open`**, its name the question. Answering
  it means renaming it into the rule that was chosen and deleting the tag.
- **One node, one file**, named by its id: a phase, an iteration and a decision too.

The sharp edges of the format, each what the official parser does:

| In a description, a line that starts with | Is read as | So |
| --- | --- | --- |
| `#` | a comment, dropped | no headings; `description-comment` warns |
| `@` | a tag line | a parse error |
| `Scenario:`, `Scenario Outline:`, `Example:`, `Rule:`, `Background:` | a new block, silently | start no sentence with one |
| `Given`, `When`, `Then`, `And`, `But`, `*` under a Scenario or Background | a step, silently | write a reason under `Rule:`, lists with `-` |
| `Feature:` | text of the description above | an error: one file is one spec |
| `Examples:` under a Feature or a Rule | text | — |

- A tag holds no whitespace, so a value with a space has no tag form (`@title=Two words` is a
  parse error): it is a sentence, and belongs in a description.
- A tag value cannot hold `@`: `@owner=a@b.c` is `@owner=a` and a bare tag `@b.c`.
- Whitespace and then `#` ends a tag line, so the rest of it is a comment; a `#` inside a tag is
  kept, so `@verifies:REQ-a#slug` links to a rule.
- A Background cannot be tagged. Scenarios outside a Rule come before the first Rule; after it,
  every scenario belongs to the rule above it, whatever its indentation.

## What holds everywhere

- **Files are the source of truth.** The graph is rebuilt from them on every command. Edit the
  files; never a derived artefact (`.sdp/results.json` is written by `sdp run`).
- **The architecture is what architects declared.** An element or pattern is in the graph because
  someone decided it matters, so everything `sdp arch` shows is significant. sdp does not harvest
  abstractions from code and neither should you: propose adding or removing an element, a pattern
  or an `is` annotation, and let the architect decide. Code links to the architecture, not to
  requirements: `annotate(Thing, { is: "ARCH-x" })` from `sdp/annotations`, or an `@sdp is ARCH-x`
  comment, says which code an element is, and a requirement names its element with `@realized-by:`.
- **Specs instead of prose.** A claim that can be structured or checked is a link or a rule with
  examples, not a paragraph. When you would write "X depends on Y" or "this must never happen",
  write the link or the rule. A description says what the examples cannot — never a "verified by"
  list, a status, or a restatement of the rules below it. When a sentence becomes a rule, delete
  the sentence: promote, do not copy.
- **A decision is rare and short.** Only a choice that is hard to reverse, surprising without
  context and a real trade-off is recorded: a Feature whose name is the choice and one to three
  sentences on what was chosen over what. The rules it imposes stay on the spec they constrain,
  tagged `@decided-by:DEC-x`. Any other choice is a sentence where it applies.
- **Evidence, not status.** Scenarios are the tests. `stage: verified` is derived from a run and
  goes stale when what it ran against changes; it is an error to write it by hand.
- **Free vocabulary.** Kinds and relation names are the team's words. `sdp vocabulary` prints the
  few words sdp itself interprets in this workspace.

## Go through the graph first

The graph already knows which requirement an element realises, which decision constrains it and
which file implements it, each with its `file:line`. Asking it gets you to the right three files
faster than grepping for a guess.

- **One node, everything around it:** `sdp context <id>` — its rules with their state and reason,
  the names of its scenarios with their status and the steps still undefined, then the spec, its
  links, what rests on it, the architecture and decisions in reach, the code. Read this before
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
  `{type, from, rel, to, attrs, declared: [{file, line}]}`. A rule is a node of kind `rule` that
  is `rule-of` its spec, and a scenario `verifies` its rule and its spec. `sdp graph -q '<pattern>'`
  exports only what a query matches.
- **Orientation:** `sdp arch` (the architecture with its decisions and the code that is it),
  `sdp lifecycle` (the milestones, which one the project is at, the work planned into each
  iteration), `sdp status` (one screen).

Plain grep is still right for what tags make literal: `grep -rn '@id=DEC-0003'` is the
declaration, `grep -rn ':DEC-0003\b'` every link to it, `grep -rn -A1 '@open'` every open question.

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
2. Write or adjust the rule and its scenario first. The scenario is the acceptance test.
3. Before writing a step definition, look for one that already says it: `sdp steps '<text>'`.
   A step that matches two definitions fails. `sdp run <id> --snippets` prints definitions for
   steps that have none.
4. Implement.
5. Verify: `sdp check` (no errors) and `sdp run` (no failing scenario). Gates never fail
   `sdp run`; `sdp gate <milestone>` is what enforces one.

A scenario that asserts on delivery state (`stage`, `verification`, a scenario's `status`) must be
a gate: tag it `@gate` or put it in a milestone. Ordinary scenarios run without seeing results.

## Planning work

- Work is planned on the work itself: `@iteration:E1` says when a spec is written,
  `@activity.implementation:C1 @activity.test:T1` when it is built and tested.
- A phase and an iteration are files of their own (`sdp new phase`, `sdp new iteration`), and
  `sdp lifecycle` shows the plan and marks the current iteration with `*`. Plan work into the
  iteration in which it will be done, never into one that is over.
- A milestone's scenarios are its gate. `sdp gate <milestone>` says whether it passes, and
  `--record` writes `@met=<date>` on its tag line when it does: the project is at the first
  milestone without one. Recording is the team's act, never a side effect.

## More

`sdp --help` and `sdp <command> --help` have every command and flag; `sdp vocabulary` has the
words sdp interprets and the attributes it derives. What is specific to one repository is in its
`AGENTS.md`.
