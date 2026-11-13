---
name: sdp
description: How to work in a repository that uses sdp (it has an `sdp.config.yaml`) — requirements, decisions, architecture and the delivery plan kept as one graph of Gherkin specs whose tags say what each is and what it links to. Use this whenever you are about to read, navigate or change such a repository - finding the code behind a feature or an architecture element, changing behaviour, writing or editing a spec, a decision, a rule, a scenario or a step definition, checking what is verified, or planning work — even if the user only says "fix this" or "where is X handled". Reach for the graph before grep.
---

# Working with sdp

sdp is architecture-focused software delivery. Features — each with its requirements, quality ones
included, as rules with examples — decisions and the delivery plan are Gherkin files. Together they
form one graph, and code is anchored to it with `@sdp` tags in its doc comments, which is where
the elements and patterns of the architecture are declared.

`sdp` below is the CLI. Where it is not installed, run it from its source:
`node <path-to-sdp>/src/cli/main.ts …` (inside the sdp repository itself, `node src/cli/main.ts …`).

## A spec is a `.feature` file

Read by the official Gherkin parser as it is; sdp adds no syntax of its own. Markdown is for
`README.md`, `AGENTS.md` and this skill, which sdp does not read: a rule written there counts for
nothing.

```gherkin
@id=guest-checkout @maturity=specified @checkout       # what it is: = is a fact; a bare tag is a Cucumber tag
@depends-on:cart-totals @realized-by:ARCH-orders       # what it links to: one tag, one link
@iteration:IT-payments                                 # the iteration it is planned into
Feature: Guest checkout

  Shoppers without an account can buy: a third of all carts are abandoned at the sign-up form.

  @decided-by:accounts-are-optional
  Rule: A guest pays without creating an account

    Scenario: By card
      When the guest pays with a valid card
      Then an order is created

  Rule: A guest gets a receipt by email

    The address is not verified first: a wrong one costs a receipt, a check costs the sale.

  @open
  Rule: Can a guest save the cart for later?
```

- **Everything written with `@` is a tag: `@key=value` is a fact, `@rel:ID` a link**, the first `=`
  or `:` decides, and a tag with neither is a Cucumber tag; one whose key is not a word (`@1st=x`)
  is an error. Above `Feature:` they are about the spec, above `Rule:` about the rule, above
  `Scenario:` about the scenario. Only a Feature has `@id=` and `@kind=`; the kind comes from the
  id's prefix when it is not written, and an id with no prefix sdp knows is a feature's. A key
  written twice is a list, `@owner.team=core` nests, and a value that reads back as a number is one.
  Facts and links are not Cucumber tags: they are not inherited, not matched by `--tags` and not
  part of a scenario's hash, so re-planning a spec leaves the results of its scenarios valid —
  except those of scenarios that read the graph, which any change to a spec makes stale.
- **The Feature is the node**: its name is the title, its first paragraph the summary.
- **A `Rule:` is the unit of content.** Its name states what must hold, the one to three lines
  under it say why, and its scenarios are the examples; a scenario's name says the case. Every
  scenario of a spec belongs to a rule; a feature file without `@id=` is someone else's suite,
  named by its path and run as it is.
- **What is still to come declares a `@maturity=`; what is built declares none, and is live.** The
  maturity of a Feature or a Rule — a rung of the ladder, by default idea, draft, specified, ready —
  is how far it has come in the team's judgement, and sdp reads no meaning into the rung: whatever
  it says, the work is still to come, and its examples run and fail no run, so they are written
  before the code; a rule still to come without an example is a to-do. A maturity is a rung as the
  ladder writes it, and any other word — `done`, a stage, a slip — is an error `sdp run` refuses. A
  live Feature or Rule is a test: its examples must pass, a live rule without an example is an
  error, and so is live work — a feature, or any kind a discipline names — without a live rule. A
  Rule without a maturity of its own has its Feature's, so a change to a built feature is rules of
  it, each with a maturity of its own; nothing moves when it is built.
- **Nothing live goes back.** `sdp check` fails when an example live at the git base — where HEAD
  meets the default branch — is gone or has become a gate or work still to come, and when what was
  live there declares a maturity or `@open`. So, in a change:
  - keep either a live example's name or its steps: it is then the same example, and so is one that
    keeps its name in another spec when the spec it was in is gone, split or renamed, and no other
    spec has an example of that name;
  - if you change both, or merge it into another, tag the Scenario it went to
    `@replaces:<feature>#<example>`;
  - to remove a live rule or feature, write what replaces it, tagged `@replaces:<feature>#<rule>`
    or `@replaces:<feature>`, and make it live with a new live example of its own;
  - once that is merged, delete a `@replaces:` when check warns that it replaces nothing: on the
    default branch it does after every replacement.
- **An open question is a Rule tagged `@open`**, its name the question. Answering it means renaming
  it into the rule that was chosen and deleting the tag. A question is still to come, and has no
  examples; a Scenario is an example, tagged `@open` or not. In a live feature, a question that
  declares no maturity is about what is built, and one about work still to come declares that
  work's. What is undecided or waits on someone is written this way, on the spec it concerns, never
  kept in a chat or an agent's memory: `sdp q 'rule[tags=@open]'` lists it.
- **One spec, one file**, named by its id: a phase, an iteration and a decision too. An id names
  what it is — `guest-checkout`, `use-postgres`, `IT-payments`, not `ADR-0007` or `E2` — so that
  whoever reads a message citing it needs no lookup. Elements, patterns, milestones, phases and
  iterations keep a prefix (`ARCH-`, `PAT-`, `MS-`, `PH-`, `IT-`); no other kind has one unless
  the workspace gives it one with `ids:`, so a decision or a kind of the team's own says what it is
  with `@kind=`.

- **Where a spec goes is navigation, never identity.** The top folder says what a spec is for —
  `features/`, `decisions/`, `plan/` — as `sdp new` writes them. Features go one folder deeper, in
  the folder of their area: a bounded context, or the activity of its users the feature serves, which
  readers browse and CODEOWNERS can route (`sdp new feature "…" --dir specs/features/billing`).
  Decisions and the plan are not filed by area: a decision spans features, and the plan spans areas.
  No folder says an iteration, a story, a ticket or a test layer — those are tags — and one says a
  maturity: a feature whose Feature line declares one may sit in its area's `backlog/`, which repeats
  the tag, so a scenario keeps the two in step (`feature[maturity][file!~/backlog/]` and
  `feature[!maturity][file~/backlog/]` find nothing); it leaves once, when it is built. A folder is
  no namespace: ids are unique across the workspace, so a file moves without changing what it is.
- **An epic is plan, not a grouping that stays.** Where a team groups work toward one outcome, an
  epic is a spec (`@kind=epic`, outside every discipline) whose tag lines link each feature or rule it
  groups, `@includes:<id>`. An epic of one area sits in a folder named for it in that area's backlog,
  beside the features still to come it groups; one that spans areas sits in the plan. It says no
  status — what its work says is derived — a feature leaves its folder when it is built, and the epic
  is deleted once all of its work is live.

The sharp edges of the format, each what the official parser does, and what `sdp check` reports:

| In a description, a line that starts with | Is read as | `sdp check` |
| --- | --- | --- |
| `#` | a comment, dropped | `description-comment` warns, a heading above the text too |
| `@` | a tag line | a parse error |
| `Scenario:`, `Scenario Outline:`, `Example:` | a new scenario, silently | `scenario-empty` warns, as it has no steps |
| `Background:` | a new Background, silently | `background-empty` warns, as it has no steps |
| `Rule:` | a new rule, silently | nothing until it is live: start no sentence with it |
| `Given`, `When`, `Then`, `And`, `But`, `*` under a Scenario or Background | a step, silently | `prose-step` warns at a sentence after a Then; write a reason under `Rule:` |
| `Feature:` | text of the description above | an error: one file is one spec |
| `Examples:` under a Feature or a Rule | text | — |

- A tag holds no whitespace, so a value with a space has no tag form (`@title=Two words` is a
  parse error): it is a sentence, and belongs in a description.
- A tag value cannot hold `@`: `@owner=a@b.c` would be `@owner=a` and `@b.c`, so it is an error.
- Whitespace and then `#` ends a tag line: a tag after it is dropped, which is an error; a `#`
  inside a tag is kept, so `@verifies:guest-checkout#slug` links to a rule.
- A Background cannot be tagged. After the first Rule every scenario belongs to the rule above
  it, whatever its indentation; one before it belongs to none, which `sdp check` reports and
  `sdp run` refuses to run.

## What holds everywhere

- **A spec has a purpose.** It says what is still to be built — a feature, or rules of one — or,
  once that is built, it is its test. What does neither — a status, the plan of work that is done, a
  note nobody acts on — is not written, and is deleted where it is found.
- **Files are the source of truth.** The graph is rebuilt from them on every command. Edit the
  files; never a derived artefact (`.sdp/results.json` is written by `sdp run`).
- **The architecture is what architects declared, and none of it is prose.** It is a decision when
  it is significant and universal, a rule in the spec it constrains otherwise, or a view sdp
  generates from the code (`sdp arch`): the tag `@sdp is ARCH-x` in the doc comment of a
  module-level declaration, or in the comment that opens a file, declares an element where its code
  is, the rest of that comment says what it is for, and sdp derives which element `imports` which
  from the TypeScript and JavaScript anchored to them, so nobody writes it. `@sdp is PAT-y` declares
  a pattern in the code its instances share, and code that applies it says so with
  `@sdp applies PAT-y`; the element that code is then applies it too. An element is in the graph
  because someone decided it matters, so everything `sdp arch` shows is significant. sdp does not harvest
  abstractions from code and neither should you: propose adding or removing an element, a pattern
  or an `is` annotation, and let the architect decide. Code links to the architecture, not to
  features, and a feature names its element with `@realized-by:`.
- **Specs instead of prose.** A claim that can be structured or checked is a link or a rule with
  examples, not a paragraph. When you would write "X depends on Y" or "this must never happen",
  write the link or the rule (between elements, the code's imports already say it). A description
  says what the examples cannot — never a "verified by" list, a status, or a restatement of the
  rules below it. When a sentence becomes a rule, delete the sentence: move it, do not copy it.
- **A decision is rare and short.** Only a choice that is hard to reverse, surprising without
  context and a real trade-off, and that spans features, is recorded: a Feature whose name is the
  choice and one to three sentences on what was chosen over what, why, and the cost accepted with
  it. The rules it imposes stay on the spec they constrain, tagged `@decided-by:<its id>`. A reason
  that concerns one feature is written under the rule it explains, and any other choice is a
  sentence where it applies.
- **One feature, one file.** A feature's spec is its requirements document and its test suite at
  once: who needs what and why, what it is not, a rule per requirement with its reason, and the
  scenarios that prove each one. A quality requirement is a rule of the feature it constrains,
  tagged `@quality` so that `sdp arch` shows it beside the elements that realize that feature,
  and its example is measured: the environment, the stimulus, the response and its measure. A
  feature is not split into requirement, quality requirement and element files; it names a
  technology only where its users see one.
- **Evidence, not status.** Scenarios are the tests. A scenario's status is what it did when it last
  ran — passed, failed, undefined and the like — and from its examples' statuses sdp derives a
  rule's or a spec's stage: the maturity of work still to come, and unrun, failing, in-progress or
  verified for live work. A result goes stale when what it ran against changes, and none of these is
  written by hand: `@stage=` is an error.
- **Free vocabulary.** Kinds and relation names are the team's words, but for a rung of the ladder
  or a stage, which is a maturity, and `change`, which is rules of a feature: `sdp check` reports such
  a kind. `sdp vocabulary` prints the few words sdp itself interprets in this workspace.

## Go through the graph first

The graph already knows which feature an element realizes, which decision constrains it and
which code it is, each with its `file:line`. Asking it gets you to the right three files faster
than grepping for a guess.

- **One node, everything around it:** `sdp context <id>` — its rules with their state and reason,
  the names of its scenarios with their status and the steps still undefined, then the spec, its
  links, what rests on it, the architecture and decisions in reach, the code. Read this before
  changing anything the node covers.
- **From a feature to its code:** `sdp q '#guest-checkout -realized-by-> element <-is- code' --ids`.
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
  `{type, from, rel, to, declared: [{file, line}]}`, for a link has no attributes. A rule is a
  node of kind `rule` that is `rule-of` its spec, a scenario `verifies` its rule and its spec, and
  an element `imports` each element whose code its code imports and links to each pattern its code
  links to, by the relation the code wrote. `sdp graph -q '<pattern>'` exports only what a query
  matches.
- **Orientation:** `sdp arch` (the architecture with its decisions, the code that is it with the
  shape of what it exports, what each element imports, the code that applies each pattern, and the
  live work on each and the work still to come),
  `sdp lifecycle` (the milestones, which one the project is at, the work planned into each
  iteration), `sdp status` (one screen).

Plain grep is still right for what tags make literal: `grep -rn '@id=use-postgres'` is the
declaration, `grep -rn ':use-postgres\b'` every link to it, `grep -rn -A1 '@open'` every open question.

**An answer says when it is incomplete.** If sdp could not read a file, read none of a spec that
declares an element or a pattern, dropped a tag it could not read as written, could not follow an
import that may name the workspace's code, cut a traversal short or, in `sdp check`, compared
nothing with a base, it prints `incomplete:` and `note:` lines on stderr and exits with code 2;
with `--json` the answer is `{ complete, notes, data }` and `complete` is `false`. Do not conclude
that something is absent from an incomplete answer — fix what the note names (`sdp check` lists
it) and ask again. A `note:` on a complete answer is worth reading too: it is how sdp tells you a
kind or relation you typed does not exist and which one is closest.

## Changing behaviour

1. Find the spec that owns it (`sdp q`, `sdp context`), or create one: `sdp new feature "…"` writes
   it where it stays, and says what to write in it next. A change to a built feature is rules of it,
   each with a maturity of its own until it is built. What a user sees belongs to a feature; a rule
   only the code observes, to a spec of kind architecture (`@kind=architecture`;
   `sdp new architecture "…"` starts one), whose rules still to come declare a maturity as a
   feature's do.
2. Write or adjust the rule and its scenario first. The scenario is the acceptance test.
3. Before writing a step definition, look for one that already says it: `sdp steps '<text>'`.
   A step that matches two definitions fails. `sdp run <id> --snippets` prints definitions for
   steps that have none.
4. Implement.
5. Verify: `sdp check` (no errors, nothing live at the git base dropped) and `sdp run`, which fails
   on a live example that does not pass. Once every example of work still to come passes, the run
   says so: delete its maturity, and it is live. Gates never fail `sdp run`; `sdp gate <milestone>`
   enforces one.

A scenario that asserts on delivery state (`stage`, a scenario's `status`) must be a gate: tag it
`@gate` or put it in a milestone. Ordinary scenarios run without seeing results.

## Planning work

- Work is planned on the work itself: `@iteration:IT-payments` says when a spec is written; where
  a team plans disciplines apart, `@activity.implementation:IT-payments @activity.test:IT-beta`
  says when it is built and tested. A rule still to come is planned the same way. Only work still
  to come is planned: once it is built, its scenarios are the record, and the plan tags can go.
- A phase and an iteration are files of their own (`sdp new phase`, `sdp new iteration`), and
  `sdp lifecycle` shows the plan and marks the current iteration with `*`. Plan work into the
  iteration in which it will be done, never into one that is over.
- A milestone's scenarios are its gate, and `@closes:` names the phase or iteration it ends, whose
  last day dates it. `sdp gate <milestone>` says whether it passes, and `--record` writes
  `@met=<date>` on its tag line when it does: the project is at the first milestone without one.
  Recording is the team's act, never a side effect.

## More

`sdp --help` and `sdp <command> --help` have every command and flag; `sdp vocabulary` has the
words sdp interprets and the attributes it derives. What is specific to one repository is in its
`AGENTS.md`.
