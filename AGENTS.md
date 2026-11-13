# Agent guide

This repository is **sdp**, and it is specified *with* sdp. How to work in such a repository is
the skill, `.claude/skills/sdp/SKILL.md`: read it first. Here is only what is specific to this one;
what of it can be checked is a scenario of `specs/GUIDE.feature`.

- `sdp` is `node src/cli/main.ts`.
- There are no tests but the scenarios. Their step definitions live in `specs/steps/*.steps.ts`
  and share one world (`specs/steps/world.ts`); they drive the real pipeline against an in-memory
  workspace, or the real CLI in a temporary directory (`cli.steps.ts`).
- `sdp steps` is the vocabulary scenarios are written in, one family per subject and a module per
  family: assert on data — a table of nodes, of what sdp reports, of JSON fields — before wording,
  and add a column before a step. After a command, an exit code other than 0 is stated before
  its output is read; the steps fail otherwise. `Given these specs:` writes one feature file per
  row, its tag line and the name of its Feature. A fixture written whole is a spec like any other:
  its scenarios sit under a `Rule:` named in the fixture's own words, as its Feature is
  (`Rule: R` beside `Feature: A`).
- `npm run verify` must pass before a change is done.
- Node.js 24 runs `.ts` directly: erasable syntax only (no enums, namespaces, parameter
  properties), imports with `.ts` extensions.
- Effect 4: `Effect.fn`/`Effect.gen` for IO workflows, `Schema` for external data, services at the
  edge (`FileSystem`, `Path`); parsing, graph, query and check stay pure. Its documentation ships
  in `node_modules/effect/AGENTS.md` — use it, not memory of Effect 2 or 3.
- The few words sdp interprets are roles of the vocabulary profile (`src/model/Vocabulary.ts`):
  ask it, never compare with one of its words as a literal — a scenario fails the run if you do.
- A spec says what is still to be built, or, once built, is its test. What does neither — a status,
  a plan of work that is done, a note nobody acts on — is not written, and is deleted where found.
- `specs/` is organised by what a spec is for:
  - `features/` — what sdp does and is still to do, one file per feature, named for what its users
    do (`ask-the-graph`: an id with no prefix is a feature's). The file is the feature's
    requirements document and its test suite at once. What is built declares no maturity: it is
    live, every rule has an example, every example passes, and `sdp check` fails when anything live
    at the git base stops being live. What is still to come declares a maturity, the feature or each
    of its rules: a change to a built feature is rules of it, and nothing moves when it is built.
  - `decisions/` — few. Only a choice that is hard to reverse, surprising without context and a
    real trade-off, and that spans features: a title and one to three sentences on what was chosen
    over what, why, and the cost accepted with it. A reason that concerns one feature is written
    under the rule it explains.
  - Architecture is a decision when it is significant and universal, a rule in a spec otherwise —
    `ARCHITECTURE` holds the rules this repository's code keeps — or a view sdp generates from the
    code's annotations (`sdp arch`): an element is the code anchored to it, that code's doc comment
    says what it is for, and sdp derives which element imports which. No architecture is prose.
  - `plan/` — the order of work still to come: iterations and the milestone they lead to, MVP first.
  - `VISION`, `GUIDE` and `ARCHITECTURE` are about the whole; `ask-the-graph` is the example to follow.
- A feature is written as a requirements document would be: under its name, who needs what and
  why, then what it is not; a `Rule:` per requirement, quality ones included, stated as what a user
  can observe, with its reason under it; its scenarios are the acceptance examples, and a quality
  one's example is measured. It names a technology only where users see one: a command, an output,
  a bound an answer reports.
- An id names what it is, so that a reader of a message that cites it needs no lookup:
  `files-are-the-source-of-truth`, not `ADR-0003`; `IT-packaging`, not `E2`. A feature and a
  decision have no prefix: a feature is what an id without one names, and a decision says its kind
  with `@kind=`. Elements, patterns, milestones, phases and iterations
  keep a prefix (`ARCH-`, `PAT-`, `MS-`, `PH-`, `IT-`), and no other kind has one.
- A decision that changes is rewritten or deleted: its history is git's.
- One word for one thing: a word this repository replaced does not come back.

How the work is done here, on whichever machine and with whichever agent:

- Design and writing are done by Claude models; GPT models review. Work reaches `main` only after
  a review by the other model family, and when the owner says so.
- A design question from the owner opens the solution space: answer it with advice and a worked
  example that runs, name the calls that are the owner's, and do not narrow it to the nearest edit
  of what exists.
- Nothing needed to continue lives in an agent's memory or outside this repository. A call that
  waits on the owner is an `@open` rule on the spec it concerns (`sdp q 'rule[tags=@open]'`), the
  next work is a spec in the backlog planned into an iteration (`sdp lifecycle`), and a reason is
  a decision (`sdp q decision`). An open question is asked only where its answer changes what is
  built next; one that only the design of later work can answer waits for that work.
- What is in the architecture, what code is anchored to it and how an element is described are the
  architect's: propose them, do not write them. Recording a milestone as met is the owner's act.
- The reviews, advisory reports and design brief behind the redesign of November 2026 are on the
  branch `archive/redesign-2026-11`. sdp reads nothing there.
