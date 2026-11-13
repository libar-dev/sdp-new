# Agent guide

**sdp** keeps requirements, decisions, architecture, the delivery plan and test evidence in one graph, rebuilt from a repository's files (`specs/VISION.feature`). Gherkin scenarios are both specification and test; work still to come declares a maturity, and live work takes its stage from its scenarios' results; the architecture is curated through code annotations, not harvested from every abstraction; the CLI, MCP, Promise and Effect APIs ask the same graph.

This repository is sdp, and it is specified *with* sdp. How to work in such a repository is the skill, `.claude/skills/sdp/SKILL.md`: read it first. What this repository keeps to and a scenario can check is a spec of kind `guide` in `specs/guide/`; here is only what no scenario can.

- **First:** run `node scripts/orient/orient.ts` (about 8k tokens), a work-in-progress orientation over sdp's state and API, and understand its first section, the taxonomy, before anything else; its README says what each section shows.
- sdp's state, its API and spec-driven development are being bootstrapped: this is the project's inception, so work iteratively, with an MVP mindset, and do not decide every detail upfront. Why the state holds what it holds is the decision `the-state-holds-what-is-significant`, and how a spec is written, `specs-say-what-not-how`.
- `npm run verify` must pass before a change is done.
- Scenarios are the only tests. Their step definitions (`specs/steps/*.steps.ts`, one world in `world.ts`) drive the real pipeline on an in-memory workspace, or the real CLI in a temporary directory (`cli.steps.ts`). `sdp steps` is the vocabulary scenarios are written in, a family per subject and a module per family: assert on data — a table of nodes, of what sdp reports, of JSON fields — before wording, and add a column before a step. `Given these specs:` writes one feature file per row; a fixture written whole puts its scenarios under a `Rule:` named in its own words, as its Feature is (`Rule: R` beside `Feature: A`).
- Code: Effect 4, documented in `node_modules/effect/AGENTS.md`: `Effect.fn`/`Effect.gen` for IO workflows, `Schema` for external data.
- A feature is named for what its users do; `specs/features/explore/ask-the-graph.feature` is the one to imitate.

How the work is done here, on whichever machine and with whichever agent:

- Design and writing are done by Claude models; GPT models review. Work reaches `main` only after a review by the other model family, and when the owner says so.
- A design question from the owner opens the solution space: answer it with advice and a worked example that runs, name the calls that are the owner's, and do not narrow it to the nearest edit of what exists.
- Nothing needed to continue lives in an agent's memory or outside this repository. A call that waits on the owner is an `@open` rule on the spec it concerns (`sdp q 'rule[tags=@open]'`), the next work is work still to come planned into an iteration (`sdp lifecycle`), and a reason is a decision (`sdp q decision`). An open question is asked only where its answer changes what is built next; one that only the design of later work can answer waits for that work.
- What is in the architecture, what code is anchored to it and how an element is described are the architect's: propose them, do not write them. Recording a milestone as met is the owner's act.
- The reviews, advisory reports and design brief behind the redesign of November 2026 are on the branch `archive/redesign-2026-11`, and the research and prototypes behind the organization of the specs and the choice of runner on `archive/organize-specs-2026-11`. sdp reads nothing there.
