---
id: AGENTS
kind: guide
title: Agent guide
links:
  introduces: CAP-agent-collaboration
---

# Agent guide

This repository is **sdp**, and it is specified *with* sdp. How to work in such a repository is
the skill, `.claude/skills/sdp/SKILL.md`: read it first. Here is only what is specific to this one.

- `sdp` is `node src/cli/main.ts`.
- There are no tests but the scenarios. Their step definitions live in `specs/steps/*.steps.ts`
  and share one world (`specs/steps/world.ts`); they drive the real pipeline against an in-memory
  workspace, or the real CLI in a temporary directory (`cli.steps.ts`).
- `npm run verify` must pass before a change is done. After adding or renaming a spec, run
  `npm run types` so the compiler knows its id.
- Node.js 24 runs `.ts` directly: erasable syntax only (no enums, namespaces, parameter
  properties), imports with `.ts` extensions.
- Effect 4: `Effect.fn`/`Effect.gen` for IO workflows, `Schema` for external data, services at the
  edge (`FileSystem`, `Path`); parsing, graph, query and check stay pure. Its documentation ships
  in `node_modules/effect/AGENTS.md` — use it, not memory of Effect 2 or 3.
- The few words sdp interprets are roles of the vocabulary profile (`src/model/Vocabulary.ts`):
  ask it, never compare with one of its words as a literal — a scenario fails the run if you do.
- While the project is in Inception, a decision that changes is rewritten or deleted, not
  superseded.
- A risk links what it threatens (`affects`) and the work that retires it (`mitigated-by`).
- One word for one thing: a word this repository replaced does not come back.

~~~gherkin
Scenario: A word this repository replaced does not come back
  When I run "grep -rnE '[Mm]aturity gates?|NFR[s]|(draft|specified|ready).? gate' README.md AGENTS.md .claude specs src examples" in the repository
  Then the exit code is 1
~~~
