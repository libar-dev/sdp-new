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
  row, its tag line and the name of its Feature.
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
