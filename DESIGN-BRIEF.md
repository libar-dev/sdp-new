# sdp: target design after the three-way review

Three independent reviews of sdp at `3139ff3` are in this folder:

- `opus-concept-and-specs.md` — findings `C-01`…`C-25` (concept model, decisions, spec corpus)
- `astra-semantics-and-soundness.md` — findings `S-01`…`S-17` (evidence, gates, queries, runner)
- `sol-code-architecture.md` — findings `A-01`…`A-25` (code architecture)
- `opus-concept-probes/` — a 40-line mutation harness and the two mutant lists behind `C-04`

This brief is the design the implementation converges on. Where a finding's own recommendation
differs from this brief, the brief wins; where the brief is silent, use the finding's
recommendation and your judgement. The project is at inception: change formats, names and
structure freely, delete what is superseded, and leave no compatibility shims.

## What does not change (the owner's directions)

- Files are the source of truth and stay greppable. No database, no second spec format.
- Authors' kinds and relation names are free-form.
- Architectural significance is only ever marked by an architect; sdp never computes, limits or
  judges it.
- sdp is tested only by its own Gherkin scenarios. No unit tests, no test framework. Every
  behaviour change starts as a scenario in the spec that owns it.
- **Specs instead of prose.** A claim that can be structured or checked belongs in a spec — nodes,
  links, scenarios — not in a paragraph. Prose explains *why*; it does not restate facts the graph
  holds, and it does not carry rules nothing checks. This is the thing sdp showcases, so apply it to
  every spec you touch.
- **Developer experience, for AI agents and for humans, weighs in every choice**: one obvious way
  to do a thing, an error message that names the fix, no stack traces for user mistakes, output an
  agent can parse without guessing, and no silent "nothing found" when the truth is "could not
  look".
- Node 24 runs `.ts` directly (erasable syntax only, `.ts` import extensions). Effect 4 idiom per
  `node_modules/effect/AGENTS.md`: `Effect.fn`/`Effect.gen` for IO, `Schema` at external
  boundaries, services at the edge, a pure core.
- During inception a decision that changes is rewritten or deleted, never superseded.

## The decisions

### D1 — One vocabulary profile (C-01, A-13, A-21, A-22)
Authors' vocabulary is free; the words *sdp itself interprets* are few, named in one place and
configurable. One module, `src/model/Vocabulary.ts`, is the only place in `src/` that names an
interpreted kind, relation, attribute or status; everything else asks it. The config file gets one
`vocabulary:` section that replaces today's scattered `architecture.kinds/drivers`,
`lifecycle.planRelations/phaseRelations/disciplines` and `maturity` keys. Roles, with defaults:

- kinds: `decision`, `milestone`, `phase`, `iteration`, `pattern`, the architectural kinds, the
  driver kinds, the default kind for a node declared from code;
- relations: `supersedes`, the plan relations (`iteration`), the phase relations (`phase`), the
  prose-mention relation (`mentions`), the scenario relation (`verifies`), the anchor (`is`);
- attributes: `significant`, `rationale`, `activity`, `order`, `start`, `end`, the quality `type`;
- statuses: the decision statuses and which statuses make a record inactive;
- the maturity ladder and the disciplines.

Lookups keyed by authors' words use `Map` or own-property checks, never bare object indexing
(`constructor`, `toString` are legal names). `sdp vocabulary` prints the active profile (text and
`--json`). A scenario guards the rule: no file in `src/` other than the profile module compares
against one of these words as a literal. Validate the profile on load (non-empty, distinct
maturity levels; id prefixes are escaped and round-trip with kind inference).

### D2 — A link is a property of the key, never of the value (C-03, S-17, A-19)
Link keys are: everything under `links:`, plus the keys the profile names as links (the plan and
phase relations, each entry of `activity`, and any extra keys a workspace lists under
`vocabulary.links`). A link key **always** yields an edge, its target **must** resolve
(`dangling-link`, one diagnostic per unresolved reference, every one of them), and it is **also**
readable as an attribute — so `[iteration=I1]` and `-iteration-> #I1` agree whichever way the
author wrote it. Every other attribute is a value and never links. The value-sniffing "implicit
link" is gone.

An edge is a unique `(from, rel, to)` triple that keeps **every** declaration that states it
(`file:line` each) and the union of their attributes; two declarations that disagree on an
attribute are a diagnostic. A prose mention of a pair that already has an authored link adds no
`mentions` edge.

### D3 — Derived facts cannot be authored (C-02, S-05, S-10, A-20)
`stage`, `verification`, `scenarios`, `summary`, `file`, `openQuestions`, `declaredIn` and the
scenario attributes are computed. Writing one — in front matter, on an embedded node or in a code
annotation — is an error (`derived-attribute`) and the value is ignored. `maturity` must be a
level of the ladder (error, not warning) and never leaks into a derived field. The maturity
criteria run on **every** node that declares maturity, embedded and code-declared ones included.
Reserved containers are validated: `nodes:` that is not a list, an embedded node without a usable
id, a malformed `links:` are errors with their real location, never an empty result.

### D4 — Two axes and one honest summary (C-05)
`maturity` (declared, checked) and `verification` (derived from results) are the two axes.
`stage` stays as the one-word summary, with a new value: `failing` when any scenario fails (a
regression is not "in progress"); `in-progress` only while automation is partial; `verified` when
all pass. For comparisons `failing` ranks with `in-progress`. `stage` exists only on nodes that
declare maturity or have scenarios, and every report counts it the same way.

### D5 — A mention is not a link (C-06, C-23)
The relation wildcard `*` matches authored relations only; it never matches the mention relation.
To follow mentions, name them (`-mentions->`, `-*|mentions-`). The curated architecture view, the
context bundle, the candidates and the query engine share one predicate for this.

### D6 — Being in the graph is the mark of significance (owner's correction; replaces C-07, A-21)
The first session misread the owner. sdp is architecture-focused delivery: architecting is making
decisions about the architecturally significant parts of a system, and **what architects choose to
declare or annotate is, by that act, significant**. The graph is curated and opinionated; tools
that harvest every abstraction from code already exist and sdp is not one of them.

So there is no significance flag. Remove the `significant` attribute and everything built on it:
the "declared, not significant" category, the `rationale`-for-significance convention, the
`--candidates` suggestions, the special styling in exports, the `significant` and `rationale`
entries of the vocabulary. The architecture is every node of an architectural kind in the graph;
`sdp arch` shows all of them with their patterns, decisions, quality requirements and
relationships. Why an element matters is said by its own spec and by its links to decisions and
quality requirements, not by a marker. sdp still never computes, ranks, limits or suggests what
belongs in the architecture — adding or removing an element or an `is` annotation is the
architect's call, and agents propose rather than do it.

Rewrite DEC-0008, the vision principle, REQ-curated-architecture, the glossary terms, the README
and AGENTS.md lines and every gate or guard that queried `[significant]` accordingly. In this
repository all declared elements and patterns stay; the texts that were `rationale:` values move
into the element's description.

### D7 — Evidence says what it ran against, and layers do not read themselves (S-01–S-04, S-09, S-13, A-02, A-05, A-10–A-12)
- A scenario's hash covers everything a handler can observe: names, steps, doc strings, tables
  **and tags** (inherited ones too).
- A result records what it ran against: the scenario hash; the workspace sources (config, code,
  step files and **every workspace file imported up to the end of the run**, lazy imports included);
  the toolchain (sdp version, Node major version, the lockfile if there is one); and the inputs the
  workspace declares (`evidence.inputs` globs for fixtures and data files, `evidence.env` names,
  stored as digests, never values). Each has its own staleness reason. The glossary and the
  executable-specs requirement state exactly what `verified` promises: *every scenario passed
  against these fingerprinted inputs*, nothing wider.
- Evidence is stratified so nothing reads its own layer: sources → ordinary scenarios → gates. An
  ordinary scenario sees the graph **without** results (no status, no verification, no stage beyond
  maturity). A gate sees the ordinary results and never gate results. A scenario that asserts on
  delivery state is therefore a gate, and is tagged or placed as one; sdp says so when an ordinary
  scenario's query names a result-derived attribute.
- The results store is safe under concurrent runs: take a lock, re-read, merge **only what this
  run executed**, write a temporary file, rename. A second run waits or fails with a clear message;
  it never restores an old result over a newer one.
- A step that finishes after its deadline fails, even when it never yielded. The timeout is
  documented as cooperative; hard isolation stays an idea.
- A file that is plainly meant as a spec (front matter with `kind`, or a Gherkin block) but has no
  id is an error and stops `sdp run`; scenarios are never dropped silently.
- Move the evidence concepts (`isGate`, `isActive`, staleness, fingerprints) out of the graph
  builder into the runner's side, so the builder no longer imports the runner and back.
- Progress events are published in order by one consumer. Step loading tracks imports per load
  generation, not in an append-only global.

### D8 — An answer says whether it is complete (S-06, S-07, A-06, A-24)
Every machine-readable answer is one envelope: the data, `complete: true|false`, and `notes`
saying what was cut short or could not be read. `sdp q --json`, `sdp graph -q`, `show`, `context`
and the MCP tools share it, with structured `{ file, line }` sources. An incomplete answer —
traversal cut short, or specs that could not be parsed — also prints the note on stderr and exits
with a distinct non-zero code, in every output mode. Absence is never reported from a graph that
could not be fully read.

### D9 — Assertions cannot pass vacuously by typo (S-08, C-08)
In the built-in steps, a query that names an id no node has, a kind or relation the workspace
neither uses nor declares in its vocabulary, or an attribute no node of the selected kinds
carries, **fails** with a message naming the closest known word. A workspace declares words it
wants to assert the absence of in its vocabulary; no hard-coded "conventional" list. Exploratory
`sdp q` stays permissive and prints the same observations as notes.

### D10 — Query semantics two readers agree on (S-12, S-14, S-16)
`+` is one or more hops and reaches the start node when a cycle leads back to it. `--paths`
prints real edges in their real direction, as a route that exists. Attribute lookups see only the
node's own data.

### D11 — Reading never runs workspace code (A-01, A-08, A-15)
Step definitions are discovered **statically**: sdp parses the step files (as it already parses
`annotate()` calls) and reads the registered expressions and their `file:line`. `sdp context`,
snippets, the new `sdp steps` listing and every MCP tool use that and execute nothing. Only
`sdp run` and `sdp gate` import step modules. A step registration sdp cannot read statically is a
diagnostic. A malformed expression or tag filter is a user error with a location, not a stack
trace. RegExp captures are typed as what they are.

### D12 — Markdown and YAML are parsed, not scanned (A-04, A-09, A-18, S-15)
The spec format is CommonMark with front matter, fenced Gherkin and `[[wiki-links]]` in prose.
Fences, code spans, indented code and HTML comments follow CommonMark, so what a renderer shows
as code is never read as a scenario or a link. Use a CommonMark parser with positions (micromark /
mdast) rather than line prefixes; parse front matter with the YAML library's document API so
every key, embedded node and link target has its true line; reject aliases that form cycles. One
parse per file feeds the spec, the checker and the context bundle.

### D13 — Annotations name what they annotate (S-11, A-16, A-17)
In TypeScript and JavaScript, comment annotations are read from the parser's comment tokens; a
string that looks like a comment is not one. Other languages keep the line scanner, documented as
best-effort. `annotate()` targets a module-level declaration; any other target is a diagnostic
that says so.

### D14 — The graph is immutable in fact (A-03)
`Graph` owns its data: nodes, edges and attribute trees are copied and frozen at construction,
the maps are private, and reads go through methods.

### D15 — One application layer, two thin transports (A-23, C-11)
Use cases (query, show, context, status, check, run, gate, lifecycle, arch, steps, vocabulary,
new) live in `src/app/` and return typed data and typed errors. `src/cli/` and `src/mcp/` only
parse input and render. Nothing imports from a transport. The element cycles the review found are
broken, and a scenario keeps it that way: the `uses` links declared between architecture elements
must equal the imports between the modules annotated `is` those elements.

### D16 — A small authoring surface (A-14, DEC-0004)
`sdp/steps` is the lean entry step modules import (it loads no parser, no workspace IO);
`sdp/annotations` stays as it is; `sdp` is the programmatic API. The no-build decision is scoped
honestly: source runs directly in development; a release emits JavaScript and declarations.

### D17 — New commands that pay for themselves
`sdp steps [text]` lists step definitions with `file:line` (so "extend an existing step" is one
command, not a grep across files); `sdp vocabulary`; `sdp gate --due` evaluates the gates of the
current and past phases and is part of `npm run verify`, so breaking the milestone that is due
fails the build.

### D18 — The graph is handed over as plain data (owner's direction)
Agents navigate a codebase through the graph faster than through grep alone, and they are good at
manipulating data structures — so the interface to the graph state is data that ordinary tools can
take apart, not only a query language. `sdp graph` emits one self-describing record per line
(nodes and edges, every attribute, `file` and `line`), with stable field names that
REQ-graph-export specifies field by field; every command that lists things has a line-oriented
form that pipes into grep, jq or a ten-line script; the programmatic API returns the same shapes.
Anything `sdp q` can answer must also be answerable with jq over the export, and the README shows
that with executable scenarios. SDPQ stays as a convenience, never as the only door. Line-oriented
output reports incompleteness on stderr and through the exit code (D8), so the lines stay clean.

## The north star, and three decisions that follow from it (owner, after three advisory reports)

The owner's words: "One of the key things, a north star for this project, is the elimination of
plain Markdown documents versus specs. Everything required for implementation should be part of
the spec and after implementation the executable spec should carry all the value (we use same
format for all maturity levels, so value transfer to executable specs should be painless) and
eliminate the need for extensive documentation." And: "If we design and implement this correctly,
there should virtually be no need for docs." The owner is against unnecessary prose and verbosity
everywhere.

Three Fable advisors turned that into designs; their reports are in this folder and are the
detailed specification for D19–D21. Where a report leaves a call to the owner, the ruling is below.
These decisions supersede anything earlier in this brief that contradicts them (D17's
`sdp gate --due` in particular).

### D19 — A decision is a title and one to three sentences (`advice-decisions.md`)
A decision holds the one thing no executable spec can: what was chosen over, and why. Everything
else an ADR carries already has a place — context is links to what drove it, "proposed" is an open
question on the spec it blocks, behaviour is scenarios on what it constrains (which links back
with `decided-by`), cost is a risk, history is git. So: no sections, no scenarios, no `status`,
`category`, `date` or `deciders` on a decision; it is in force because the file exists. It stays a
node. The status machinery, the decision check rules and the supersede relation go; one rule,
`decision-shape`, reports a decision that has a section or a scenario. A decision is recorded only
when it is hard to reverse, surprising without context and the result of a real trade-off (the
tests of `ADR-FORMAT-reference.md`); most choices are a sentence on the one spec they concern.

Owner's rulings: no status at all (agreed). The vision's principle nodes go; the vision links to
the decisions instead. MS-LCA's "every element rests on a decision or quality requirement" becomes
"every element has a description". The advisor's verdict table stands (ten keep, two merge, six
demote, DEC-0010 demoted), with one tightening from the owner: "I would still question decisions
like TypeScript for implementation because that's obvious." Apply the three tests to each
*clause*, not only each record: the obvious part of a kept decision is deleted, and a record with
nothing surprising left is not kept. Fewer than ten is a fine outcome.

### D20 — The milestone is the one delivery concept, and `met` is the one recorded fact (`advice-lifecycle-state.md`)
Position comes from the files, not the clock: the project is at the first milestone without
`met: <date>`, which `sdp gate <id> --record` writes into the milestone's front matter when its
gate passes. The calendar only marks today and lateness in `sdp lifecycle`; it enforces nothing,
so `sdp gate --due`, `dueMilestones` and the "due"/"overdue" marks go, and `npm run verify` no
longer runs a gate. (This is urgent: with `--due`, verify turns red on 2026-11-16 when the
calendar opens Elaboration.) A met milestone is closed: its scenarios are not selected again; a
criterion that must keep holding is moved by hand, in the closing commit, to the spec that owns
the rule. A milestone says what it `closes` (a phase or an iteration). A release is not a concept:
it is a milestone the team gives a `version`. A risk is retired when every mitigation is verified —
a query, never written; the only declared risk judgement is `tolerated`. The plan and the
milestones carry no prose that restates their data or their scenario names; status reports,
reviews and release notes are output, never files. sdp does not read git.

Rulings on the advisor's open calls: `met` is written on request (`--record`), never
automatically; a hand-written `met` is left to review; `closes` is adopted; only `tolerated`
remains as a risk status; lasting criteria are moved by hand. Do not record any milestone of this
repository as met: ending a phase is the owner's act.

### D21 — Prose is either source or a hand-kept view; the views go, and so does `docs/` (`advice-prose-and-specs.md`)
Hand-written source is only: rules (a scenario's name and its examples), relations (links),
reasons (decisions), intent (one paragraph per spec) and fears (risks, open questions). A
paragraph or table that restates scenario names, links, code comments or `--help` is a view
someone must keep in step by hand, and it is deleted. A spec sheds its design narrative once,
between draft and specified: **promote, do not copy** — the sentence becomes the scenario's name
and leaves the prose in the same commit; a reason that does not fit a name goes to the decision the
spec links. There is one tree, `specs/`, and `sdp new` writes there; `docs/` disappears. The
glossary is deleted (`sdp vocabulary` and each spec's first paragraph replace it). AGENTS.md
shrinks to what is specific to this repository; the skill is the one generic guide and `sdp init`
writes its text. The six product defaults of the report are adopted; there is no prose diagnostic
and no `prose` attribute. Guards that restate a check, doc-tests that re-pin another spec's
behaviour and nodes nobody links to are removed, not added.

Rulings on the advisor's open calls: delete the glossary; no principle nodes (D19); keep the
grammar block in REQ-graph-query only if a scenario makes one of the two copies the source; for
the reader without a terminal, group scenarios under Markdown headings with at most one sentence
of intent per group; no hand-drawn diagram unless it shows something `sdp arch --mermaid` cannot.

### D22 — A spec is a Gherkin file (owner's direction; `advice-executable-specs.md` is the design)
The owner: "Markdown files are very dangerous now when I look at this because they will lead
agents in every single session away from our north star. I would rather extend the implementation
of Gherkin than have these non-obvious wrappers." And on rules: "Rules are probably one of the most
important parts of specs", "I would rather enforce rules than not have it."

A spec is one `.feature` file read by the official Gherkin parser, with nothing around it and no
syntax of sdp's own. `advice-executable-specs.md` in this folder is the design (the placement
table, the annotation grammar, an example file per kind and maturity under
`advice-executable-specs/examples/`, "What sdp must change, smallest first", the maturity
criteria, "What stays Markdown", the migration order), with `prototype.patch` (a sketch of the
reader, not the change) and `convert.mjs` (a throwaway converter that turned 57 specs into 85
feature files with `sdp check` clean and every scenario passing).

Rulings on the report's nine open calls:
1. Tags: `=` for a value, `:` for a link (`@maturity=ready`, `@decided-by:DEC-0003`).
2. The plan is files: one node, one file; a phase or an iteration is a Feature of a few lines.
3. **Rules are enforced, not optional**: every scenario of every spec belongs to a `Rule:` —
   requirements, quality requirements, elements, patterns and milestones alike — and a scenario
   outside a rule is an error from `sdp check`. A rule's name states what must hold, its
   description says why in one to three sentences, its scenarios are the examples.
4. A scenario verifies both its rule and its spec, so existing queries keep working.
5. Prose mentions go entirely: a relation is a tag at the level it concerns, or it does not exist.
6. Link attributes go.
7. `@open` is a fixed word, like `@gate` and `@serial`.
8. The vision stays a feature file.
9. Nothing for foreign suites' tags until one needs it.

D19 stands: a decision is a title and one to three sentences, as a Feature with a description and
no rules; the rules it imposes stay on the spec they constrain, tagged `@decided-by:DEC-x` on the
Rule. D20 stands, with `@met=<date>` as the tag `sdp gate --record` writes. D21's rule for prose
applies inside Gherkin too: a description says what the examples cannot — never a "verified by"
list, a status table, or a restatement of the scenarios below it.

Only `README.md`, `AGENTS.md` with `CLAUDE.md`, and `.claude/skills/sdp/SKILL.md` stay Markdown,
and sdp does not read them.

## Where the work stands

Wave 1 is merged on the branch `review/redesign` (three packages, all by Claude models):
D1–D7, D11–D14, D16 and the `sdp steps` / `sdp vocabulary` half of D17 are implemented.
`npm run verify` passes there with 285 scenarios; five later-milestone gate scenarios are unmet,
which is expected (four wait for future work, and MS-LCA's "the architecture baseline is curated"
waits for the owner to decide about five elements without a link to a decision).

Things wave 1 settled that later work builds on:
- `src/model/Vocabulary.ts` is the only place interpreted words live; a guard scenario in DEC-0002
  fails the run otherwise. `src/model/Results.ts` holds the results schema.
- Results are layered: an ordinary scenario sees no results, so a scenario that asserts on
  delivery state (`stage`, `verification`, a scenario's `status`) must be a gate (`@gate`, or in a
  milestone).
- Step definitions are read statically (`src/parse/StepDefinitions.ts`); step modules import from
  `sdp/steps`; `sdp steps [text]` lists them.
- Decisions now run DEC-0001…DEC-0011 (0010: a link is a property of the key; 0011: evidence says
  what it ran against).

Waves 2 and 3 are merged too: the application layer in `src/app/` (CLI and MCP are thin over it),
the answer envelope `{ complete, notes, data }` with exit code 2 for an incomplete answer,
`sdp graph` as one record per line, typo guards in the built-in steps with `vocabulary.words`,
a first corpus pass (decisions DEC-0001…DEC-0018, phase ids `PH-…`, the rule `maturity-criteria`,
the verification value `partial`), the fixes for two reviews of wave 1 (results format v4, one
load of step code per process, links that cannot be named like an attribute), and a minimal skill
at `.claude/skills/sdp/SKILL.md`. `npm run verify` passes with 349 scenarios.

Wave 4 (D19, D20, D21) is merged as well, at `d7ba6b3`: ten compact decisions, the milestone
model with `met` and `closes`, no `docs/` folder, a `Rule:` that ends with its fence and whose
description is read, a step vocabulary of 137 definitions in modules named by subject, and
assertions on data. `npm run verify` passes with 369 scenarios and 19 gate scenarios (11 unmet,
all for later milestones). The specs are still Markdown with fenced Gherkin.

Wave 5 applies D22 in three stages: the reader and a mechanical conversion of the corpus; a hand
pass that puts every scenario under a rule and converts the fixtures; removal of the Markdown path.

## Taste

This is an inception-stage codebase of about 6,000 lines, and it should still read like one when
you are done. Solve each finding with the smallest design that makes the wrong thing impossible:

- No option, flag, config key, type parameter or abstraction that no scenario needs today. If the
  brief names a mechanism (a lock, a profile, an envelope), build the plain version of it.
- Prefer deleting code to adding it. A fix that adds a second way to do something is not done
  until the first way is gone.
- Write code that reads like the code around it: one declaration per line, named helpers over
  dense expressions, no casts through `unknown`, no thrown plain objects, comments only where the
  reason is not obvious from the code.
- A public surface (CLI flags, JSON shapes, the step API, config keys) is designed for the reader
  who meets it cold: few names, each obvious, nothing that needs a paragraph to explain.
- Specs follow the same rule: a scenario per behaviour that matters, not a scenario per branch.

## How to work

- Follow `AGENTS.md`: scenario first, in the spec that owns the behaviour; then the code;
  `npm run verify` must pass before you commit. Add a scenario for every finding you fix — the
  reviewers' reproductions are the raw material — and prefer assertions on data (ids, rule ids,
  `file:line`, JSON fields) over assertions on wording.
- When you change behaviour, change every spec that describes it in the same commit: requirement,
  element contract, glossary term, decision. A spec that says the old thing is a defect.
- Extend existing step definitions before adding new ones; a step text that matches two
  definitions fails the run.
- Commit to your worktree branch in small, coherent commits with plain messages. Do not merge,
  push or touch other worktrees. End commit messages with
  `Co-Authored-By: Claude <noreply@anthropic.com>` only if you are Claude.
- Other agents are changing other files at the same time. Stay inside the files your task names
  as yours; where you must touch a file owned by someone else, keep the edit minimal and list it in
  your report so the merge is deliberate.
