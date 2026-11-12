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
- `npm run verify` must pass before a change is done. After adding or renaming a spec, run
  `npm run types` so the compiler knows its id.
- Node.js 24 runs `.ts` directly: erasable syntax only (no enums, namespaces, parameter
  properties), imports with `.ts` extensions.
- Effect 4: `Effect.fn`/`Effect.gen` for IO workflows, `Schema` for external data, services at the
  edge (`FileSystem`, `Path`); parsing, graph, query and check stay pure. Its documentation ships
  in `node_modules/effect/AGENTS.md` — use it, not memory of Effect 2 or 3.
- The few words sdp interprets are roles of the vocabulary profile (`src/model/Vocabulary.ts`):
  ask it, never compare with one of its words as a literal — a scenario fails the run if you do.
- A decision that changes is rewritten or deleted: its history is git's.
- A risk links what it threatens (`@affects:`), the work that retires it (`@mitigated-by:`) and the
  milestone that work is `@due:` at; `@status=tolerated` says we live with it instead.
- An id's prefix says its kind, and a kind has one prefix.
- Two attributes are this repository's own: `@quality=` names the quality attribute of an `NFR-`,
  and `@planned=after-the-fact` an iteration written down after its work.
- One word for one thing: a word this repository replaced does not come back.

How the work is done here, on whichever machine and with whichever agent:

- Design and writing are done by Claude models; GPT models review. Work reaches `main` only after
  a review by the other model family, and when the owner says so.
- A design question from the owner opens the solution space: answer it with advice and a worked
  example that runs, name the calls that are the owner's, and do not narrow it to the nearest edit
  of what exists.
- Nothing needed to continue lives in an agent's memory or outside this repository. A call that
  waits on the owner is an `@open` rule on the spec it concerns (`sdp q 'rule[tags~open]'`), the
  next work is a draft planned into an iteration (`sdp q 'requirement|nfr[maturity<ready]'`,
  `sdp lifecycle`), and a reason is a decision (`sdp q decision`).
- What is in the architecture, what code is anchored to it and how an element is described are the
  architect's: propose them, do not write them. Recording a milestone as met is the owner's act.
- The reviews, advisory reports and design brief behind the redesign of November 2026 are on the
  branch `archive/redesign-2026-11`. sdp reads nothing there.
