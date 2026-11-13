Carefully investigate this deep research report: docs/research/research-organizing-specs.md

Propose the best option to organize our specs, taking into account all of the options provided in the report. It is critical that we set a good example for organizing specs because larger codebases will be adopting this project for managing delivery processes.

04:54

I recommend a two-level layout. The top folder says what a spec is for (feature, decision, plan), which is how sdp works today. Under `specs/features/` only, add one folder per **bounded context** once a workspace has more than one. Everything else the report lists stays a tag. sdp itself is one bounded context with 18 features, so this repository should stay as it is. The two things to change are what adopters copy: the skill and the GUIDE.

I tested the key claims with a small "large codebase" workspace run through the real CLI: `/private/tmp/claude-502/-Users-darkomijic-work-sdp-new/402c1ada-7de9-4ad9-bfe1-d63499de8b17/scratchpad/acme`.

`★ Insight ─────────────────────────────────────`

- The report assumes a feature's identity is its file path, so it worries that moving files churns history and links. In sdp the identity is the id, and checks compare examples by id. In the worked example, `git mv` of a feature from `billing/` to `payments/` on a branch gave `sdp check` 0 errors. A folder layout is therefore cheap to undo, which by `AGENTS.md`'s bar makes it a convention (a GUIDE rule), not a decision.
- The reverse also holds: folders are not namespaces. The same id in two context folders is a `duplicate-id` error. When two contexts use the same word, the id has to tell them apart; the folder can't.
  `─────────────────────────────────────────────────`

## Proposed layout

```
specs/
  VISION.feature  GUIDE.feature  ARCHITECTURE.feature   about the whole: one of each
  features/
    <feature>.feature              one bounded context: flat (sdp today)
    <context>/<feature>.feature    several: one folder per bounded context, one level deep
  architecture/<id>.feature        more rules the code keeps (`sdp new architecture` writes here)
  decisions/<id>.feature           always flat: a decision spans features
  plan/MS-… PH-… IT-…              always flat: the plan spans contexts
  steps/<subject>.steps.ts         by what the steps speak of, never one file per feature
```

The rules behind it:

1. **What a spec is for comes first.** It is the most stable fact about a spec: a decision never becomes a feature. `sdp new` already places specs this way.
2. **Then the bounded context, for features only, and only when there is more than one.** A context is a boundary of language and ownership, not a count of files. It is also where CODEOWNERS routes reviews, since CODEOWNERS works only by path. `sdp new feature … --dir specs/features/billing` already works. One area can be queried with `sdp q 'feature[file~^specs/features/billing/]'` and run with `sdp run specs/features/billing`, so the report's `@context:`/`@capability:` tags would only repeat the path.
3. **Never in a path:**
   - maturity
   - iteration, epic, story, ticket
   - test layer or speed
   - team, unless the team is the context
   - architecture element: every live feature here is `@realized-by` two to five elements, so a feature has no single code folder to sit in.
4. **Everything else is a tag:**
   - `@maturity=` is lifecycle.
   - `@iteration:` is the plan.
   - `@realized-by:` is the architecture.
   - Bare Cucumber tags (`@slow`, `@ui`, `@smoke`) choose what runs, through `--tags`.
   - An external ticket is a fact (`@ticket=PAY-488`). Written as a link, `@req:PAY-488` is a `dangling-link` error (tested).
5. **Monorepos:** when contexts are separate deployables with their own teams, their features may live in `services/<x>/specs/`. Keep **one** root workspace and add that folder to `features:`. A service spec linking to a central feature resolved and `sdp check` stayed clean (tested). Decisions and the plan stay central. Separate workspaces don't link to each other, so use them only for separate products.

## The report's options, judged for sdp

| Report option | Verdict |
| --- | --- |
| One tree, lifecycle tags | Adopt. sdp already does it, more strongly: `@maturity=` on work still to come, live when it's absent, stage derived from runs (decision `still-to-come-is-marked-where-it-is-written`) |
| `planned/` and `implemented/` trees | Reject. The same decision already rejects it |
| Discovery kept outside Gherkin | Differ on purpose. An idea is a spec, and questions are `@open` rules, because nothing may live in chat or memory |
| Status from undefined steps | Reject. A planned rule's examples run and fail no run (tested: the planned rule showed "still to come", run exited 0) |
| `@lifecycle:deprecated` | Not needed. `@replaces:` plus "nothing live goes back" is stronger |
| Context → capability → feature folders | Partly. The context level is adopted; in sdp a feature *is* the capability, so no capability folder by default |
| Specs beside each service | Supported for service-aligned contexts, in one root workspace |
| Separate acceptance-test repo | Reject. Code anchors, step definitions and the git base all need the code |
| Story or epic folders, test-layer folders | Reject; use tags |
| Steps grouped by domain concept | Adopt. `AGENTS.md` already says "one family per subject" |

## For this repository

- **Nothing moves.** I tried grouping the 18 features (write / verify / ask / plan / adopt). `configure-a-workspace`, `use-the-command-line` and `serve-agents` straddle the groups, and some groups held a single feature. Folders made up like that would teach adopters to guess. Holding back until a second context exists is itself the example to set.
- **Add a "Where a spec goes" section to the skill**, with the five rules above. `sdp init` writes this skill into every adopting repository, so it is where the guidance reaches the most people.
- **Extend the GUIDE rule** "A feature is in specs/features" so it pins decisions and the plan as flat and features as at most one folder deep. Two queries would do it: `decision[file!~^specs/decisions/[^/]+$]` and `feature[file~^specs/features/[^/]+/[^/]+/]`, each returning nothing.

`★ Insight ─────────────────────────────────────`

- The report's real advice is that the files should describe the system as it is, not the history of the work. sdp already enforces this through `@maturity` plus "nothing live goes back", so the folder layout only has to help people find things.
- Folder size is not the scaling problem. The size of a feature is: `plan-delivery` has 29 rules. The report's test, "a feature file answers one stable question", is the useful check here.
  `─────────────────────────────────────────────────`

## Decisions for you

1. **Keep this repository flat until there is a second bounded context?** I recommend yes. The alternative is capability folders now.
2. **Split `plan-delivery`?** Its gate, `--record`, milestone-order and Definition-of-Ready rules read like a separate user goal, perhaps "meet a milestone". Moving rules is safe as long as each example keeps its name or its steps.
3. **Should sdp ever know about contexts** (for example `status` grouped by folder)? I'd wait until an adopter has several; `--dir` and path queries cover it for now.
4. **`docs/research/` is untracked.** Once the conclusion is in the skill and the GUIDE, the report has done its job, and `AGENTS.md` says nothing needed to continue should live outside the specs.

If you agree, I'll write the skill section and the GUIDE rule and run `npm run verify` before handing them over for review. I can also put this proposal on a shareable page.

1 changed file
04:59

No we really need to organize these people properly but I understand your concerns. You can investigate resources I will share and draft the most basic idea-level specs, which I will enumerate, which will give us a proper sample to organize.

1. Proper adoption of Effect 4 and various suggestions from this research report:

   docs/research/effect4.md
2. Implementation of harness-agnostic plugin with skills hook, etc. This is a new standard and you can check how we did it here.

   /Users/darkomijic/work/software-delivery-protocol/
3. Creation of sample projections for live mermaid diagrams, not hard-coded but generated from the SDP state. You can check the same repo above.
4. Implementation of studio generation. You can also check the same repo and we will probably use the same approach of generating an Obsidian vault.
5. Check the same repo again. Implementation of AI-friendly API for accessing the graph/SDP state with recipes for useful views
6. Setup of CI/CD, GitHub workflows, branch protection, pre-push and pre-commit hooks, etc
7. Adoption of some Gherkin extensions or a dedicated native plugin for SDP, or switching to one of the more capable forks `docs/research/gherkin-forks.md`

Feel free to use your context to investigate these resources to correctly do both tasks of creating actual valid specs at idea level or any level of maturity. You find practical and also organizing aspects. One of the important things for me as a human is some kind of organization into epics, maybe even some functional units for navigation purposes and so on. Epics can be very simple and just reference other specs. This work requires creation of a feature blank. And don't worry if this will consume a lot of your context window because we will not be doing any detailed implementation and so on. This setup work is more important. Depending on what we decide, we will either record organization as a spec or as a decision record. If it fits in a decision that's probably a better option but let's focus on actually creating a solid structured organization. If you check the other repo with the software delivery protocol implementation, which unfortunately suffered from enabling spec-driven development too late, it is swamped in a mountain of Markdown documents. Even Markdown documents are registered in the SDP state even though they are not specifications and they are not deliverables or software that we are specifying. Still you will get a sense of volume and size.

05:17

The specs are now organized into six areas and eight epics on a new branch, `organize-specs`, with idea-level specs for all seven of your items. `npm run verify` passes with exit 0, but only with `docs/` moved aside for the run. With your untracked `docs/research/*.md` in place, one GUIDE scenario fails, because it pins every Markdown file in the repository. Nothing is committed.

## The organization

```
specs/
  VISION · GUIDE · ARCHITECTURE .feature
  features/                         areas: folders for reading and ownership
    adopt/      install-from-npm, configure-a-workspace, use-the-command-line, work-from-any-agent-harness★
    specify/    start-a-spec, write-a-spec, link-specs, write-specs-in-an-editor
    verify/     write-step-definitions, run-specs, check-specs, know-what-is-verified
    architect/  link-code-to-specs, see-the-architecture
    deliver/    plan-delivery, review-a-pull-request-by-its-specs, guard-the-main-branch★
    explore/    ask-the-graph, serve-agents, explore-the-graph-in-a-browser,
                ask-by-recipe★, draw-diagrams-from-the-graph★, browse-the-graph-in-obsidian★
  decisions/    + areas-for-reading-epics-for-work★
  plan/         MS-mvp, IT-scale, IT-packaging + 8 epics★
```

★ is new.

There are two constructs, because you asked for two different things:

- **Areas (your "functional units")** are folders named for what users of sdp do. They are permanent, give people something to browse, and CODEOWNERS can route reviews by them. A folder is not part of a spec's identity, so the 18 moves left `sdp check` at 0 errors.
- **Epics** are specs of kind `epic` in `plan/`. Each has a title, one sentence on the outcome, and an `@includes:` link to each feature or rule it groups, in any area. They are planning nodes like milestones: no maturity, no status. One is deleted once its work is live, as `AGENTS.md` asks for anything that is no longer to be built or tested. I took `epic` out of the requirements discipline in `sdp.config.yaml`; otherwise sdp would treat an epic as work and hold it to maturities and live rules.

I recorded this as a **decision** (`areas-for-reading-epics-for-work`). It meets your bar: it spans features, it's surprising without context (epics get deleted), and it's a real trade-off. The trade-off cites what the old repository went through: one epic over 106 features for 98 days, and a pack holding 465 of its 470 specs. A GUIDE scenario pins the layout, and the skill and `AGENTS.md` describe it.

## Your seven items

| Epic | What it groups |
| --- | --- |
| `effect-4-in-full` (1) | 4 idea-level rules in ARCHITECTURE (Effect's own type-checker diagnostics, `exactOptionalPropertyTypes`, an explicit policy for unreadable installed files, open question on `@effect/vitest`); a memory-bound quality rule for `check` against large repositories; Effect upgrades moving together |
| `sdp-in-every-agent-harness` (2) | `work-from-any-agent-harness`: one Agent Plugins package with per-harness wiring files that hold no skill text; a harness counts as supported only once a scenario shows the model received the content; a session-start summary within 7,500 characters and 25 seconds; the hook reports, never instructs |
| `diagrams-that-stay-true` (3) | `draw-diagrams-from-the-graph`: named Mermaid views, byte-identical output for the same graph, `check` reports a stale diagram, a 60-node limit, no diagram kind the graph can't back |
| `a-studio-for-readers` (4) | `browse-the-graph-in-obsidian` (the Studio as a generated vault with Bases views) plus the existing browser draft, which now asks whether it should simply be that vault published as a static site |
| `answers-shaped-for-agents` (5) | `ask-by-recipe` (named jobs, refuse a missing subject, an 8,000-character budget, every node with its file and line, every answer with its commit), `serve-agents`, session orientation |
| `nothing-unverified-reaches-main` (6) | `guard-the-main-branch` (pre-commit and pre-push hooks, CI on every PR, release from a tag, upgrades as reviewed PRs) plus a GUIDE rule that branch protection enforces review by the other model family |
| `gherkin-that-says-more` (7) | the open question of parser versus fork (linked `@reconsiders:` to `specs-are-gherkin-files`), area-scoped step definitions, steps matched only by their keyword, Cucumber Messages output, a Cucumber-JS plugin, examples from data files, the editor feature |
| `work-organized-by-area-and-epic` | sdp support for the organization itself: `lifecycle` shows each epic with its work, and points out an epic that is done |

## Housekeeping on the branch

- **The baseline already failed before my changes.** `sdp.config.yaml` compared against `origin/review/redesign`, which no longer exists now that it's merged into `main`. I removed that key, as its own comment said to once the merge happened.
- **I deleted 13 `@replaces:` tags** that `check` flagged as merged. The skill says to delete those once they're on `main`.

## Decisions for you

There are 24 open questions in total. The ones that most change what gets built next:

- **Tests outside the scenarios.** Should Effect's runtime behaviour be tested with `@effect/vitest`? `AGENTS.md` currently says there are no tests but the scenarios.
- **The skill and the plugin.** Does `sdp init` still copy the skill once the plugin ships it? And one skill, or one per job?
- **Diagrams in Markdown.** Should sdp write diagrams into Markdown pages it otherwise never reads?
- **Committing the vault.** Should the generated vault be committed, or generated in each checkout?
- **The parser.** Keep the official Gherkin parser with a layer of meaning over it, or move to a fork?
- **The research docs.** The research is now captured in specs; delete `docs/research/` or move it out of the repository? Until then, the GUIDE scenario above keeps failing.

Run `sdp q 'rule[tags=@open]'` for the full list. Once you've looked, I can commit on `organize-specs` and open the PR for the GPT-family review.

39 changed files
05:29

The example is in place and `check` is clean:

```
specs/features/adopt/
  configure-a-workspace.feature
  use-the-command-line.feature
  sdp-in-every-agent-harness/            ← epic of one area, beside its work
    sdp-in-every-agent-harness.feature     (@kind=epic, @includes: the two below)
    work-from-any-agent-harness.feature
    install-from-npm.feature
```

The other seven epics span areas and stay in `specs/plan/`. When this epic's work is live, the epic file is deleted and the two features move up into `adopt/`. That's a free move, since ids, not paths, identify specs. The GUIDE scenario, the decision, `AGENTS.md` and the skill now describe both homes.

The four investigation agents are still running. When they report I'll fold their findings into one pass:

- close the open questions that have natural answers
- reshape the plugin epic into the small set of specs the next PR implements (skills, hook, any CLI addition)
- cut verbosity from my drafts

7 changed files
05:36

The vault and diagram report is in. Its clearest findings:

- **Vault:** generated and ignored by git, never committed.
- **Diagrams:** sdp writes them into files of its own, never between markers in Markdown it doesn't read.
- **Browser explorer:** it's just the vault, published by a renderer the team chooses, so that draft feature goes.
- **A real bug in today's code:** `sdp graph --mermaid` names diagram nodes by position, so adding one node renames every node after it, and it escapes only `"`.

I'll apply everything in one pass once the other three agents report.

05:39

Ten of the fifteen remaining questions close or go. The sharpest point: `guard-the-main-branch` is mostly this repository's own process dressed up as a product feature. The parts that are real work (the CI workflow, the pre-push hook, branch protection, exact pins on the Effect packages) belong as rules of the GUIDE, which already pins `npm run verify`. The release rule belongs to `install-from-npm`.

One of its notes is stale: it saw the epic folder appear mid-move. The decision and the skill were updated to the scope rule right after. Waiting on the Effect and plugin agents.

05:39

The Effect check found that the audit's points mostly don't survive contact with the code:

- **The "missing requirement / Effect 3 API" part of rule 1:** plain `tsc` already catches both. Only the floating effect is new.
- **The 300 MB memory rule:** the premise is false. Memory goes to parsing the working tree and the base, not to git's output, and batching git changed nothing.
- **`@effect/vitest`:** every behaviour the audit worried about already has a scenario.

What survives: one ARCHITECTURE rule (Effect's diagnostics in the typecheck, with `exactOptionalPropertyTypes` folded in as a five-line fix), and exact Effect versions in the published package. Waiting on the last report, the plugin/skills/hook/CLI design.

05:41

The four agents' findings are applied, all 24 open questions are closed or deleted, and `npm run verify` passes (exit 0, 474 scenarios), again with your `docs/` moved aside for the run and restored. Nothing is committed.

## What the next PR implements

These specs sit together in `features/adopt/sdp-in-every-agent-harness/`, beside their epic, and are marked `specified`:

| Spec | Rules (short form) |
| --- | --- |
| `install-the-agent-plugin` | The npm package is the plugin. Claude Code and Codex come first, each installed with one command that `sdp init` names. `init` stops writing the skill (`@replaces` its current rule). A gate checks that each harness's model actually receives the skill and the hook output. |
| `teach-agents-the-way-of-working` | One skill for the whole loop: orient, change the rule and its example, steps, implement, check and run, plan. The format's details go in a reference read on demand. The skill an agent loads first is under 10,000 characters (today's is 18,169). |
| `orient-agents-through-hooks` | A session-start hook prints the current milestone, the work planned now and its open questions, within 2,000 characters and 5 seconds. Silent outside an sdp workspace, one line on failure. It runs the workspace's own installed sdp and says when that differs from the plugin's version. |
| `plan-delivery` rule | The one CLI addition: `sdp lifecycle --brief`, which the hook prints. |

The design the plugin agent checked against current Claude Code and Codex docs: no build step, and a single marketplace file and a single hooks file that serve both harnesses. The hook is about 30 lines that call the workspace's sdp, with no `/tmp` state or duplicate-run guard. Every hook bug the old repository had came from wiring the hook twice. Two things the docs didn't settle: whether Codex sets `CLAUDE_PLUGIN_ROOT`, and whether it loads a local-path plugin in place. The gate rule exists to check them.

## What the agents changed

- **Effect.** Of the audit's items, one rule survived: the typecheck fails on an effect that is built and never run, and on an optional property set to `undefined`. `@effect/tsgo` 0.68.1 works with TypeScript 7.0.2. With two noisy rule groups turned off, it reports a single error, at `src/cli/main.ts:423`.
  - **Memory bound cut:** the 300 MB rule rested on a false premise. Measured: 1.1 GB for 5,000 specs, spent on parsing, not on reading git.
  - **`@effect/vitest` dropped:** every lifecycle behaviour it would test already has a scenario, so it would break "no tests but the scenarios" for nothing.
- **Studio and diagrams.**
  - The vault is generated in each checkout and ignored by git. A rule is a heading in its feature's note, links are wikilinks by id, and an unchanged graph writes nothing.
  - Diagrams go into files sdp owns, never into Markdown it doesn't read, and `check` fails on a stale one.
  - The browser explorer is gone: publishing the vault is the team's choice of renderer.
- **CI/CD.** `guard-the-main-branch` was this repository's process dressed as a product feature, so it's gone.
  - Three idea-level GUIDE rules replace it: branch protection, CI running `npm run verify` on Node 24, and a commit hook (`sdp check`) plus a push hook (`npm run verify`).
  - `install-from-npm` gains the release rules: CI publishes from a tag with provenance, reruns the CLI scenarios against the packed package, and pins exact Effect versions.
- **Verbosity.** Status notes, history and duplicated rules are cut. `ask-by-recipe` went from 9 rules to 3, the plugin specs are 3 to 5 rules each, epics are 1 to 2 sentences, and the "work organized" epic was deleted as too thin.

`★ Insight ─────────────────────────────────────`

- Most closures came from evidence, not opinion: a registry lookup, a measured benchmark, a scenario that already covered the case. Questions answered by facts close cheaply; questions only later design can answer wait for that design.
- Every epic whose work sits in one area now lives beside that work (`adopt/`, three in `explore/`). Only the three that genuinely span areas remain in `plan/`. That makes the folder rule a test of scope rather than of readiness.
  `─────────────────────────────────────────────────`

## Decisions for you

1. **I closed three questions that were already in the repository.** Please confirm or reopen:
   - *Phases and disciplines:* phases are already optional and live, so only a cosmetic lifecycle row remained.
   - *Markdown completeness:* `check`'s warning stands, and an answer stays complete, since sdp never reads Markdown.
   - *Parser versus fork:* `specs-are-gherkin-files` already chose the official parser.
2. **The package name, `@libar-dev/sdp`.** `sdp` on npm belongs to another project. This changes the `sdp/steps` imports in about 10 step files.
3. **Planning.** The three `specified` plugin specs aren't planned into an iteration yet. Neither existing iteration fits (`IT-scale` is about scale, `IT-packaging` starts Nov 30), so you may want a new one.
4. **A live bug.** `sdp graph --mermaid` names nodes by position (`n0…`), so one new node renames every later one, and it escapes only `"`. It's specified in `draw-diagrams-from-the-graph`, but it's broken today.

Once you've reviewed this, I can commit on `organize-specs` and open the PR for the GPT-family review.

31 changed files
05:45

The package name is recorded, and the parser question is open again on `write-a-spec`, in the "Gherkin that says more" epic. `check` is clean. Here's the elaboration.

## Package name

`install-from-npm` now says sdp is published as **`@libar-dev/software-delivery-protocol`**, with the command `sdp`. The earlier project never published under that name (npm returns 404), so whichever project survives takes it. When this is built, the `sdp/steps` imports in the step files change to the new name. sdp currently imports itself by its own package name, `sdp`.

## The official parser: what it gives and what it costs

The worked example is `/private/tmp/claude-502/-Users-darkomijic-work-sdp-new/402c1ada-7de9-4ad9-bfe1-d63499de8b17/scratchpad/parser-demo/demo.mjs`. It runs against the `@cucumber/gherkin` 42 that sdp uses.

**What sdp gets from it:**

- A typed tree with tags, descriptions and line numbers on Feature, Rule and Scenario. sdp's graph is built directly on this.
- Pickles: compiled scenarios with outlines expanded and tags inherited. Cucumber-JS, Playwright-BDD and every Cucumber reporter consume these.
- Editors and code review: every editor highlights the files, and GitHub renders them. Specs read like ordinary test files, which matters for adoption by large codebases.
- Maintenance by the Cucumber project, plus about 70 spoken languages.

**What it costs (all demonstrated):**

| Edge | Behaviour | sdp's mitigation today |
| --- | --- | --- |
| `#` line in a description | Dropped without a word | `check` warns (`description-comment`) |
| A description sentence that starts with Given/When/Then | Silently becomes a step | None. The skill tells authors to avoid it |
| `@` at the start of a description line | Parse error | Reported at its line |
| A fact with a space (`@title=Two words`) | Parse error | Such a value goes in a description |
| Metadata | Lives only in tags. Facts and links reach pickles as ordinary Cucumber tags | sdp strips them from the hash; other tools see noise |
| Structure | Only Feature, Rule, Scenario, Background, Examples | A question is `@open Rule:`; the kind comes from the id or `@kind=` |

## The options

| Option | Gain | Cost |
| --- | --- | --- |
| **A. Official parser, meaning in tags** (today) | Every tool reads the files | The edges above |
| **B. A, with sdp turning more silent edges into diagnostics, live in the editor** | Same compatibility; the edges become loud | The step-sentence edge can't be detected, because the parser has already made it a step |
| **C. A dialect of sdp's own** (`# language: en-sdp`: `Question:`, `Requirement:`, `Decision:`) | Still the official parser, unchanged. Specs read naturally | Every other tool fails on the file (the demo's last case). That costs exactly the compatibility A exists for, and adds a second way to state a kind |
| **D. A fork of the grammar** (Cucumber's generated `.berp` parser) | Room for typed fields, nested structure, values with spaces | Incompatible with all tools, and sdp maintains a generated parser itself. The earlier project tested this and found that a compatible fork is just tags on Gherkin again, while an incompatible fork is worse than owning a small parser outright |
| **E. A language of sdp's own, compiled to Gherkin for runners** (StructBDD and PICKLES are precedents) | Any structure sdp wants | Designing a language, plus its editor support, from scratch |

**My recommendation: A, plus B.** The costs of A are edges a check can catch, except one. The gains are the main reason a large codebase would adopt sdp at all. The earlier project's record agrees: the parser was its least painful part, and the pain was in step matching and metadata. sdp already fixed the metadata side by making facts and links tags.

Revisit when one of these concrete needs appears:

- typed example spaces or alternatives inside a scenario, which Gherkin has no structure for
- metadata that must hold spaces or `@`
- `check` showing authors and agents repeatedly falling into the step-sentence edge

`★ Insight ─────────────────────────────────────`

- Option C is the surprise: the official parser already accepts custom keywords through dialects, so `Question:` needs no fork. What it costs is the same thing a fork costs, which is compatibility. The parser was never the obstacle; the tools around it are.
- So the choice isn't really "official parser or fork". It's how much tool compatibility to trade for expressiveness. A keeps all of it, C and D give it up, and E trades it for a whole new language.
  `─────────────────────────────────────────────────`

## Decisions for you

1. **Accept A + B?** Then the open question becomes the rule "Specs stay on the official Gherkin parser…", and B becomes a few rules of `check-specs` (which edges to report).
2. **Is option C worth a look for readability alone?** `Question:` and `Decision:` are nicer than tags. Its cost is that Cucumber, editors and GitHub highlighting can no longer read the file.

Nothing is committed yet. Once you've decided, I can commit on `organize-specs` and open the PR for review.

3 changed files
05:51

Please put option A + B as the recommended option. But that doesn't eliminate the option to have multiple ideas in the same spec or maybe multiple very small idea-level specs. I hope you check the research in detail. Here is what one of the initial sessions reported after checking the report

```markdown
Task: assess `/Users/darkomijic/work/gherkin-research.md` against D1–D22, verify its Gherkin claims on the installed packages, and say what to take now, what conflicts and what waits. No repository file was touched; probes are in the scratchpad.

## What the research is

- A survey of projects that extend Gherkin (Cucumber-JS plugin API, Playwright-BDD, Gwen, Karate, Reqnroll, pytest-bdd-ng/StructBDD, QAF BDD2, Yadda, four Vitest/Jest integrations, Serenity/JS, PICKLES, pytest-bdd-property, Markdown-with-Gherkin, Gauge), with a synthesis.
- It is about the **runner and evidence side**, not the file format. Almost nothing in it bears on wave 5; most of it bears on the next decision after it (own runner or adapter).
- It reads as ChatGPT output (links carry `utm_source=chatgpt.com`). Every claim I could check locally holds on gherkin 42.0.1, messages 34.2.1, tag-expressions 11.0.1 and cucumber-expressions 20.2.0. Nothing was wrong or outdated.
- Not checkable here, so leads only: the Cucumber-JS plugin API "since v12.5.0" (`@cucumber/cucumber` is not installed), and all version numbers and dates for third-party projects.

## Take now

1. **Steer to the running stage 1: rule ids can collide.** The parser accepts two rules with the same name without complaint. Rule ids are `SPEC#slug` in the scenario namespace, so a rule and a scenario of the same name collide too. This closes the integration agent's open proposal. Instruction:

   > Pin with a scenario in ARCH-spec-parser that two `Rule:` lines with the same name in one spec, and a rule and a scenario whose names give the same slug, are each a `duplicate-id` error that stops `sdp run`. The official parser accepts both silently.

2. **Steer to stage 1: three corrections to the skill's sharp-edge list.** Instruction:

   > Add to the skill's sharp edges: a tag value cannot contain `@` (`@owner=a@b.c` is read as `@owner=a` and a bare tag `@b.c`); whitespace followed by `#` ends a tag line, so anything after it on that line is dropped, while `#` inside a tag is kept (`@verifies:REQ-a#slug` works). Correct one row: `Examples:` at the start of a description line under a Feature or Rule is plain text, not a new block.

3. **Steer to stage 1: a third rejected alternative for DEC-0001.** It answers the obvious question "why not Cucumber's own Markdown format, which GitHub renders?". Instruction:

   > DEC-0001 may add one clause: not Cucumber's Markdown-with-Gherkin (`.feature.md`), because the official parser returns an empty description for every Feature, Rule and Scenario written that way, and the description is where intent and a rule's reason live.

4. **Stage 2 brief: where a reason may be written.** Instruction:

   > Write a reason under `Rule:`. Under `Scenario:` or `Background:`, a description line that starts with `Given`, `When`, `Then`, `And`, `But` or `*` silently becomes a step. In any description, a line starting with `Scenario:`, `Example:`, `Scenario Outline:`, `Rule:` or `Background:` silently opens a new block, a line starting with `@` is a parse error, and a line starting with `#` is dropped.

5. **Stage 2 brief: indentation is not structure.** Instruction:

   > After the first `Rule:` every scenario belongs to the rule above it, whatever its indentation. The converter appends `@open` rules at the end of a file, so after grouping, list each spec's scenarios with their rule and confirm none sits under an `@open` rule or the wrong one.

6. **Stage 2 brief: nested doc strings in feature fixtures.** Instruction:

   > When a fixture feature inside a doc string itself contains a doc string, delimit one with `"""` and the other with three backticks, or escape the inner one as `\"\"\"`. Both work on the installed parser.

7. **Stage 2 brief, optional: candidate rules for REQ-cucumber-compatibility.** It is a draft, so in the new format it is rules without examples. The research's four dimensions (syntax, binding, execution, evidence) are the natural four rules and make RISK-0006 concrete. Skip it if the hand pass is already full.

## Conflicts

- **None at the parser level.** D22's grammar is accepted as written: `=`, `:`, `.`, `,`, `"`, `#` and non-ASCII are legal inside a tag, and tags may sit on Feature, Rule, Scenario and Examples. Tag expressions also match `@id=REQ-x` and `@decided-by:DEC-0003`.
- **One direction conflict.** The synthesis suggests several authoring formats feeding one model ("typed TypeScript specifications and Gherkin scenarios both feed a common model", after StructBDD). That is written for the owner's other project and contradicts D22's single format. No change.
- **One design difference, no change needed.** QAF BDD2 and the owner's other project write values as `@key:value` and inherit feature metadata into scenarios. D22 uses `=` for values, `:` for links, and annotations are not inherited. sdp has to filter them itself, because the parser puts every tag, annotations included, on each pickle; that is already item 2 of the design.

## Next session, in priority order

1. **Own runner, or an adapter.** Options: sdp as a Cucumber-JS plugin (`pickles:filter`, `pickles:order`, the message stream), or compiling to a host runner as Playwright-BDD does. This decides hooks, parameter types and RISK-0006 together. Wait because wave 5 changes the reader, not the runner, and it deserves its own advisory round; verify the plugin API claim first.
2. **A scenario-end hook.** It closes the command-outcome gap (a scenario whose last step runs a command) and cleans up temporary directories. Wait because its shape depends on 1.
3. **Custom parameter types.** The library supports them (`ParameterTypeRegistry.defineParameterType` verified). Wait because it needs a public API in `sdp/steps` and static discovery has to read the definitions.
4. **Cucumber Messages as an evidence export.** sdp's six step statuses are exactly the Messages statuses minus `UNKNOWN`, so existing HTML reporters could render a run. That partly answers the reader without a terminal and REQ-shared-evidence. Wait because the results format just changed to v4.
5. **Step semantics.** Keyword-sensitive matching and step categories (Gwen, Playwright-BDD `matchKeywords`), and scoped step libraries against RISK-0002. Wait because it reverses pinned behaviour ("matching whatever the keyword") and is the owner's call.
6. **A localised suite reads the same.** `# language: de` parses, with `Regel` and `Szenario` as keywords. One scenario would pin that the new reader takes structure from the AST. Wait because it belongs with compatibility work.
7. **Rules as properties.** `@property` scenarios (pytest-bdd-property) and typed invariants (PICKLES) fit "rules are the most important part". Wait because it is well beyond inception.
8. **Steps composed in Gherkin** (Gwen `@StepDef`, Karate `call`). Wait because of the language-design cost the research itself warns about.

## Not worth doing

- **`.feature.md` as a GitHub-friendly container:** the parser discards every description (verified).
- **External data and dynamic examples through tags** (Reqnroll, Karate): execution meaning hidden in tags other tools ignore, against "annotations never affect execution".
- **Generating or deleting implementation when a spec changes** (`@amiceli/vitest-cucumber`): sdp keeps the divergence visible through undefined steps, stale evidence and snippets.
- **Context-scored step matching** (Yadda): binding would not be reproducible.
- **Gauge:** a different language.

## Commands and what they printed

Both scripts are in `/private/tmp/claude-502/-Users-darkomijic-work-sdp-new/f78736bd-df53-4618-92d1-62879af1c3d6/scratchpad/research-probe/`, run as `node probe.mjs` and `node probe2.mjs`. They call `generateMessages` from the packages installed in `/Users/darkomijic/work/sdp-new`.

| Probe                                                                                                              | Result                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Tags `@id=REQ-x @decided-by:DEC-0003 @activity.test:T1 @verifies:REQ-a#some-slug @list=a,b @q="x" @v=1.0.0 @uni=é` | no errors; all read with line and column                                                                         |
| `@title=Two words`                                                                                                 | `A tag may not contain whitespace`                                                                               |
| `@id=A #trailing comment @hidden=1` then `@x#y @mail=a@b.c`                                                        | tags `@id=A`, `@x#y`, `@mail=a`, `@b.c`                                                                          |
| Tags on Feature, Rule, Scenario, Examples                                                                          | accepted; the pickle carries all eight, annotations included                                                     |
| Tag on `Background:` or on a step                                                                                  | parse error                                                                                                      |
| Descriptions                                                                                                       | kept under Feature, Background, Rule, Scenario and Examples; blank lines kept; `#` lines removed into `comments` |
| Scenario description line starting `When`, `And`, `But`, `*`, `Given`                                              | becomes a step; description empty                                                                                |
| Rule description line starting `Given`                                                                             | stays description                                                                                                |
| Rule description line starting `Scenario:`, `Example:`, `Scenario Outline:`, `Background:`, `Rule:`                | opens a new block, no error                                                                                      |
| Rule description line starting `Examples:` or `Feature:`                                                           | stays description                                                                                                |
| Description line starting `@`                                                                                      | parse error                                                                                                      |
| Second `Feature:` in a file                                                                                        | swallowed into the first Feature's description, no error                                                         |
| Rule with no scenarios; Feature with no scenarios; two rules named `Same`                                          | no errors                                                                                                        |
| Scenario with no steps                                                                                             | no error; one pickle                                                                                             |
| Scenario written after a Rule at Feature indentation                                                               | belongs to that Rule                                                                                             |
| Scenario before the first Rule                                                                                     | allowed                                                                                                          |
| `Background:` under a Rule                                                                                         | accepted; pickle steps are feature background, rule background, then the scenario's                              |
| Doc strings `"""gherkin` and three backticks with `json`                                                           | media types `gherkin` and `json` recorded; backticks nest `"""` unescaped; `\"\"\"` unescapes                    |
| `# language: de`                                                                                                   | `Funktionalität`, `Regel` parsed                                                                                 |
| Markdown-with-Gherkin (`# Feature:`, `## Rule:`, `### Scenario:`, `* Given`)                                       | parses, one pickle; `featureDescription`, `ruleDescription`, `scenarioDescription` all `""`                      |
| Tag expressions `@decided-by:DEC-0003`, `@id=REQ-x`, `not @id=REQ-y`                                               | all evaluate                                                                                                     |
| `TestStepResultStatus`                                                                                             | `UNKNOWN PASSED SKIPPED PENDING UNDEFINED AMBIGUOUS FAILED`                                                      |
| `HookType`                                                                                                         | includes `BEFORE_TEST_CASE`, `AFTER_TEST_CASE`                                                                   |
| Custom parameter type `{id}`                                                                                       | matched `REQ-graph-query` and transformed it                                                                     |

```

05:54

Yes, and it's smaller than it sounds. **A needs no work:** it's what sdp already runs on. **B is the only work,** and the probe shows exactly how much.

## What `check` catches today

I ran each sharp edge through today's `sdp check` in a scratch workspace:

| Edge | Today | Risk |
| --- | --- | --- |
| `@` at the start of a description line | **error** at its line | — |
| Space in a tag (`@title=Two words`) | **error** | — |
| A second `Feature:` in a file | **error** | — |
| `Scenario:` line inside a description | **warning** (`scenario-empty`) | — |
| `#` line *between* description lines | **warning** (`description-comment`) | — |
| `#` line as the *first* line of a description, i.e. a heading | **silent**: dropped | the heading is lost |
| Text after ` #` on a tag line (`@maturity=idea #note @depends-on:y`) | **silent**: `@depends-on:y` is dropped | **a link vanishes** |
| `@` inside a tag value (`@owner=a@b.c`) | **silent**: becomes `@owner=a` plus a stray Cucumber tag | wrong fact |
| `Background:` line in a Feature description | **silent**: a Background is born | odd structure |
| `Rule:` line inside a rule description | **silent**: a new rule is born; errors only once live | odd structure |
| Then-sentence under a Scenario | **silent** in `check`; `sdp run` shows it as an undefined step | a reason becomes a step |

So five edges are already loud, and six are silent. The one to fix first is the dropped link: a comment on a tag line can silently delete a relation, which is exactly the kind of loss agents writing many specs will trigger.

## How quick is B?

Each check is a few lines in `src/parse/Gherkin.ts`, which already has the raw lines of every description and tag line. Each gets one row in an existing table scenario of `check-specs`.

| Check | Difficulty | Reliability |
| --- | --- | --- |
| A tag after ` #` on a tag line is reported | easy | exact |
| A tag value holding `@` is reported | easy | exact |
| A `#` line opening a description is reported, like one inside it | easy | near exact |
| A Background with a name and no steps is reported | easy | exact (one with no steps does nothing) |
| A step that reads as prose (after a Then, ends in a full stop) | easy | **heuristic**; may flag a real step |
| A `Rule:` line inside a description | skip | can't be told from a real rule |

All in, I'd estimate **half a day**, including writing the examples first. My recommendation: do it as a small PR of its own **right before** the CLI-and-skills PR, or as that PR's first commit. The next PR has agents writing many specs, and these checks are what make their mistakes loud.

## Adopting A + B doesn't close the other ideas

- **Answering the question** would rename the `@open` rule on `write-a-spec` into the chosen rule: "Specs stay on the official Gherkin parser, and check reports each of its silent edges it can see."
- **The alternatives stay:** `write-specs-in-a-richer-grammar` keeps its three idea rules (dialect, fork, own language) untouched. Choosing A + B now only says what's built; any of those ideas can be raised to a draft later.

`★ Insight ─────────────────────────────────────`

- The `#` check misses a heading because of a deliberate scoping choice in the code. It reports only comments "inside" a description, so a comment placed above one stays legal. Extending it to the first line closes the gap with almost no risk of false alarms.
- The worst edge is a link that silently vanishes, not a format error. In a graph tool, losing a relation corrupts every answer built on it, so that check matters most.
  `─────────────────────────────────────────────────`

If you agree, the next step:

1. Close the question as A + B.
2. Write the five checks as `specified` rules of `check-specs`, with their example rows.
3. Implement them in a small PR before the CLI and skills.

The probes are at `/private/tmp/claude-502/-Users-darkomijic-work-sdp-new/402c1ada-7de9-4ad9-bfe1-d63499de8b17/scratchpad/edges`.

06:00

I've started an agent on A + B on `organize-specs`, in place and uncommitted. It touches only:

- `specify/write-a-spec.feature`
- `verify/check-specs.feature`
- `plan/gherkin-that-says-more.feature`
- `src/parse/Gherkin.ts`, plus the diagnostics registry if a new id is needed
- the skill's sharp-edges table

Everything else is yours to review undisturbed. If it finds something outside that list that needs changing, it reports it instead of editing.

What it's doing:

1. **Answering the question:** the `@open` rule becomes the live rule "Specs stay on the official Gherkin parser, and check reports each of its silent edges that it can see". The richer-grammar ideas stay untouched.
2. **Five checks, examples first:**
   - a tag dropped by ` #` on a tag line (**error**)
   - `@` inside a tag value (**error**)
   - a `#` heading opening a description (**warning**)
   - a named `Background:` with no steps (**warning**)
   - a step that reads as prose after a Then (**warning**). This one is a heuristic, so it gets enabled only if it raises no false alarms on this repository's own specs and the shop example; otherwise it's narrowed or dropped, with the reason reported.
3. **The skill's sharp-edges table:** each row will say what `check` now reports.
4. **The epic:** links to the answered question and the merged idea rule are removed.
5. **Verify:** `check` at 0 errors and 0 warnings, then `npm run verify` at exit 0. Your `docs/` folder is moved aside for the run only and put back whatever the result.

I'll report what it changed when it finishes.

06:05

06:08
Yes, a few. The numbers above show where the difficulty actually is. Your 29 specs fall into three groups:

| Group | Specs | What a folder can do |
| --- | --- | --- |
| **Wholly live:** every rule built | 8 | already where it belongs |
| **Wholly to come:** no rule built | 13 | can be separated cleanly |
| **Mixed:** live, with rules still to come | 8 (27 rules to come) | can't be split without changing ids |

The mixed group is the crux. A rule's id is `<spec>#<rule-slug>`, so moving a rule into another file changes its id and breaks every link, epic and plan tag that names it. Moving a *whole file* changes nothing, since ids don't depend on paths. So a folder can separate *specs*, not *rules*.

## Options

**1. A "to come" zone for wholly unbuilt specs (my recommendation).**
Directly in an area folder sits only a spec with at least one live rule. A spec with none sits in a subfolder of that area: its epic's folder, as `adopt/sdp-in-every-agent-harness/` already is, or `to-come/` when no epic groups it.

```
specs/features/verify/
  check-specs.feature  run-specs.feature  …            ← live (some with rules to come)
  to-come/
    run-specs-in-another-runner.feature
    check-a-rule-against-generated-examples.feature
```

- **The move happens once,** when a spec first becomes live, and it costs nothing: ids stay the same and `check` stays clean, as tested earlier.
- **It's enforceable.** Two GUIDE queries, "no spec still to come directly in an area" and "no live spec in a subfolder", fail the run if anyone forgets to move a file. So the folder never lies.
- **Most of it is already in place.** 7 of the 13 unbuilt specs are already in epic folders; the other 6 would move into `to-come/`.

**2. Splitting mixed specs into a live file and a "next" file.** I'd reject this. Every rule moving across changes its id, and building it means moving rules back by hand. The decision `still-to-come-is-marked-where-it-is-written` rejected exactly this, for that reason.

**3. Views instead of folders, for the 27 rules inside live files.** Folders can't show these, so they need a projection:

- a listing of the work still to come by area, built the same way as `sdp questions`: every rule still to come, under its spec, with its maturity and iteration;
- the vault, which can lay notes out by stage, because generated files can move freely;
- the editor, which can mark each file built, mixed or to come in its file tree, as an idea in `write-specs-in-an-editor`.

## What it costs

Option 1 writes state into a path, which the research report and the current decision both warn against: two places say "not built", the maturity tag and the folder. I think that's acceptable here for three reasons:

- **It changes once per spec.** It's the one-way transition from wholly to come to live, never every iteration.
- **A scenario keeps the two in step,** so they can't silently disagree.
- **It's bounded.** It applies only to whole specs. Rules keep their maturity in tags, where the decision's reasoning ("a rule is the unit that is built") still holds.

The decision would be rewritten to say: a spec still wholly to come sits in a subfolder of its area until its first rule is live; a rule still to come stays in its spec, and a view lists it.

`★ Insight ─────────────────────────────────────`

- The deciding fact is identity: in sdp, moving a *file* is free and moving a *rule* is not. That splits the problem in two. Whole specs can live in folders; rules need a view.
- Option 1 grows naturally out of the epic folders you asked for. They already hold only unbuilt work, so `to-come/` is the same zone for work no epic groups.
  `─────────────────────────────────────────────────`

## Decisions for you

1. **Option 1, a to-come zone per area?** Possible folder names: `to-come/` (sdp's own words), `next/` or `backlog/`.
2. **For the mixed rules,** a listing command shaped like `sdp questions`? It would be cheap to specify now, as a sibling recipe.
3. **For adopters:** should this stay a convention of this repository, pinned by GUIDE, or become something `check` enforces for any workspace?

I'll hold any edits until the A + B agent finishes, since it's editing files nearby, and until you've decided.

6 changed files
06:09

06:11
A + B is implemented on `organize-specs`, uncommitted. I confirmed it independently:

- `check` reports 0 errors and 0 warnings on the repository.
- The dropped-link case from my earlier probe is now an error, with a fix hint.
- The agent reports `npm run verify` at exit 0 with 475 scenarios, one more than before: the new live example.

## What was built

- **The parser question is answered.** It's now the live rule "Specs stay on the official Gherkin parser, and check reports each of its silent edges that it can see". It has an example, and `write-specs-in-a-richer-grammar` keeps all three alternatives as ideas.
- **Five silent edges are now loud:**

| Edge | Diagnostic |
| --- | --- |
| Tags after ` #` on a tag line | **error** `tag-syntax`: `"#note @depends-on:y" is a comment, so the tags in it are dropped: @depends-on:y` |
| `@` inside a tag value | **error** `tag-syntax`: `@owner=a@b.c: a tag holds no @, so Gherkin reads it as @owner=a and @b.c` |
| A `#` heading opening a description | **warning** `description-comment` |
| A named `Background:` with no steps | **warning** `background-empty` (new) |
| A step that reads as prose after a Then | **warning** `prose-step` (new). Nothing in `specs/` or `examples/` ends a step with a full stop, so it raises no false alarms here |

- **The skill's sharp-edges table** now has a column saying what `sdp check` reports for each edge.
- **Files changed:** 5, about 130 lines. Most of it is in `src/parse/Gherkin.ts`; the rest is two diagnostic ids and the spec rows that test them.

**Not done:** a `Rule:` line inside a description, which can't be told apart from a real rule. I also rewrote the epic's description so it names only work still to come, as the agent pointed out.

## One live example changed

"A second Feature in a file…" now asserts `sdp reports at least:` rather than an exact list. Its fixture's Background is legitimately reported by the new `background-empty` check as well. The example kept its name, so it's the same example as far as "nothing live goes back" is concerned. Worth a look in your review.

Still waiting on you: the folder question for specs still to come (a `to-come/` subfolder per area, and a view for rules still to come inside live specs). When you're done reviewing, I can commit on `organize-specs` and open the PR for the GPT-family review.

2 changed files
06:11

We definitely need a backlog. I think that's the most standard term that will be immediately obvious. For other questions I think we need to investigate deeper. Actually before we do that, we haven't properly considered the option that specs live parallel to source files, like it's very common for tests. Let's not take action immediately on this but give me your opinion. For tests it is very important that they actually fail if something is wrong and that they are easily included in test suites and CI/CD and so on. Can you enumerate all of the mixed specs, which rules are missing, and also adapters?

06:18

06:18
No edits this turn. "Backlog" is noted as the folder name, to apply when you say so.

## Opinion: specs next to source files

**My recommendation: keep features central. Allow colocation only where a spec has one code home, and get the qualities you listed from the runner, not from file location.**

Colocation works for unit tests because a test has exactly one home: the module it tests. An sdp feature usually doesn't. Every live feature here is `@realized-by` two to five elements (`plan-delivery` by five), so `src/plan/` would be no more right than `src/run/`. Placing it next to one of them hides it from the others, and from the product owner, who navigates by what users do, not by module. The locality colocation offers already exists as links: `sdp context <feature>` lists the files behind a feature, and `sdp q '#ARCH-runner <-realized-by- feature'` gives the features behind a module.

Where colocation *does* fit:

| Case | Why it fits |
| --- | --- |
| A monorepo package that is its own bounded context and team (`packages/billing/specs/`) | One home and one owner. Kept in one root workspace, so links across packages still resolve (tested earlier) |
| Rules the code of one element keeps (`@kind=architecture`, e.g. "the runner never…") | They describe one element, so next to its code is where they're read |
| Features, decisions, the plan, epics, the backlog | Not colocated: they span modules, and readers navigate them by purpose |

The two properties you named don't depend on location:

1. **"They fail if something is wrong."** sdp is stricter than an ordinary test suite here. `sdp run` exits 1 on any live example that fails, or is undefined, pending or ambiguous. `npm run verify` fails on one that didn't run at all. And `sdp check` fails when a live example is removed or turned back into work still to come; in Jest, the equivalent `.skip` is silent. The deliberate exception is work still to come, which runs and fails no run. That's exactly why a backlog folder helps: it makes "these don't count yet" visible in the file tree.
2. **"They're easily included in suites and CI."** Here sdp is weaker today, and that's the adapter question below.

## The mixed specs: 8 specs, 27 rules still to come

**`ARCHITECTURE`** (9 live): the typecheck fails on a floating effect and an undefined optional (idea, epic `effect-4-in-full`)

**`GUIDE`** (13 live):

- a table cell holds one line… (**ready**, and its example fails today)
- PRs reviewed by the other model family (idea)
- CI runs `npm run verify` (idea)
- commit and push hooks (idea)

The last three are in the epic `nothing-unverified-reaches-main`.

**`plan-delivery`** (26 live):

- each iteration shows what git saw change (draft)
- an iteration with no change stands out (draft)
- `lifecycle --brief` (**specified**, plugin epic)
- epics are plan by default (**specified**)
- lifecycle shows epics with their work (idea)
- an epic whose work is all live is pointed out (idea)

**`ask-the-graph`** (13 live):

- five drafts on graph data: programs compute what answers say; specs held whole; step results; unreadable files; format version
- 5,000 specs on disk answer within a second (draft, **planned `IT-scale`**)
- an answer names its commit (idea)

**`check-specs`** (17 live): what check reports is computed, never kept (draft)

**`know-what-is-verified`** (15 live): a result CI recorded counts in matching checkouts (idea)

**`run-specs`** (8 live): writes Cucumber Messages (idea)

**`write-step-definitions`** (12 live):

- a step that overruns its timeout is stopped, whether or not it yields (idea)
- **no scenario sees the global state another scenario left** (idea)
- steps scoped to an area (idea)
- *open:* match a step only by its keyword?
- custom parameter types (idea)
- cleanup after each scenario (idea)

Two of these bear directly on your "fail if something is wrong" point: **scenario isolation** and **stopping a step that never yields**. Without them, one scenario's leftovers can make another pass or fail by accident. They're the reliability rules I'd raise first. Apart from those, only three rules are planned or specified; the rest are unplanned ideas and drafts.

## Adapters: how specs get into suites, CI and tools

| Adapter | State | What it gives |
| --- | --- | --- |
| `sdp run` / `npm run verify` as a CI step | **built** | exit codes, `--tags`, targets by id or directory |
| Programmatic API (`run`, `gate` in the package) | **built** | a program or a test can run specs and get results |
| MCP server (`sdp mcp`) | **built** | agents ask the graph; it doesn't run tests |
| **A JUnit XML report** | **missing, not specified** | GitHub, GitLab, Jenkins and Azure DevOps all show JUnit test results natively: failures inline in the PR, history, flaky-test views. The cheapest, highest-value adapter |
| Cucumber Messages output | idea (`run-specs`) | Cucumber's HTML reporters and dashboards |
| Cucumber-JS plugin | idea (`run-specs-in-another-runner`) | teams keep their Cucumber-JS runner |
| Compile to Vitest/Jest/Playwright tests | idea (same spec) | specs run inside `npm test`, next to unit tests: true "parallel to source" |
| CI workflow and git hooks | idea (GUIDE) | the repository's own guard |
| Editor test explorer (VS Code Testing API) | **missing, not specified** | run a scenario from the editor, see pass or fail in the gutter |
| Language server | draft (`write-specs-in-an-editor`) | diagnostics and completion while writing |

`★ Insight ─────────────────────────────────────`

- Unit tests feel "included" because the test runner finds them by file name. sdp specs are included by `sdp run` finding them through its config globs, so they could live anywhere. Location is a reader's choice, not something the runner needs. The real gap is that CI can't *show* sdp results yet, which is what a JUnit report fixes.
- sdp's "nothing live goes back" check is a test-suite property most frameworks lack. The backlog folder would make its counterpart visible: what isn't held to that standard yet.
  `─────────────────────────────────────────────────`

## Candidates for you

1. **Make features in a backlog subfolder of their area** a convention pinned by the GUIDE, as `<area>/backlog/`, beside the epic folders.
2. **Specify a JUnit report** (`sdp run --junit <file>`), and maybe the editor test explorer, as adapters.
3. **Raise the two isolation rules** in `write-step-definitions` from idea, given your emphasis on tests failing reliably.
4. **Colocation:** keep features central, and allow element-level architecture rules next to their code. Or not at all for now.

06:19

Please take a look at one more thing and then I will have all of the information from all of your reports here to give everything a proper think. This is the first repo that immediately needs to adopt this new SDP. We need to remove the old specs. The Markdown format used in this previous implementation is very dangerous because it is not really naturally understood as a specification and it gets extremely verbose. This is an app that actually has a chunk of features implemented and a lot of specs which are not implemented yet. It's a very good example for our decision-making regarding organization because it's a much more substantial repo.

/Users/darkomijic/work/libar-platform/

```markdown
Here is the feature-level summary. I took it from the outcome line of each capability Spec and checked it against `src/`, `example/` and the acceptance results already reported. Each implemented item is proven by tests: at the `convex-test` tier, and for the Layer 0 to 2 acceptance scenarios also at the native backend tier on a local backend.

## Implemented

### Layer 0: the domain core
- **Deciders.** Business logic is a pure function: state plus command in, events and a result (or a rejection) out. The next state is the fold of `evolve` over the new events.
- **Rebuild equality.** Replaying a stream's events gives the same business state and the same version as the saved state.
- **One outcome model.** Every command ends as exactly one of four outcomes: applied, business failure, rejection or technical failure. Each has fixed commit rules.

### Layer 1: a single context (one bounded area of the business)
- **Context as a Convex component.** Each context owns its state, its journal (event log) and its stream metadata behind sanctioned operations. Its calls commit or roll back together with the caller's mutation.
- **Journal.** Appends are ordered within a stream by an indexed check in the same transaction. Every event has the same 15-field envelope, with operation and cause linking events across streams.
- **Persistence adapter.** Each write runs load, decide, fold, append, save. It tells a logical version conflict apart from a Convex engine retry. Size budgets per stream and per event are enforced.
- **List-shaped operations.** Every context operation takes and returns lists, so a use case makes one call per context. A list over its declared bound is rejected rather than split.
- **Command pipeline.** Each command is one top-level mutation with fixed steps. Any failure throws and rolls everything back, sub-transactions inside components included.
- **Command declarations.** Typed declarations cover input, output, permission, writes, read models, rejections and bounds. Renaming a handler or breaking its argument contract fails the type check before any traffic.
- **Idempotency and receipts.** A business intent runs once:
  - A request key plus a stored receipt answers retries and concurrent duplicates.
  - Reusing a key with changed input is an explicit conflict.
  - A rejected or transiently refused command stores nothing, so its key stays free.
- **Receipt sweep.** `receipts.sweep` deletes expired receipts, one tenant at a time. It is built and tested, but nothing schedules it yet.
- **Tenancy and authority.**
  - Every record, command and query names its tenant.
  - The parent app establishes the actor and authorizes from grants read inside the transaction.
  - Clients cannot claim worker or agent namespaces.
  - A revoked caller cannot see a stored outcome.
- **Outcome wire shape.** A closed list of error codes lets a client tell a rejection from a transient refusal from a technical failure without parsing messages.
- **Context queries.** Each context has a query surface, mapping to DTOs (the shapes it returns) and pagination across the component boundary.
- **Audit and diagnostics.** A failed audit write fails the command. A failed diagnostic never aborts valid work. This is scenario Sc ALL-1, passing at the native backend tier.

### Layer 2: the composed application
- **Parent use cases.** Rules that cross contexts run as one mutation with one call per context, one receipt and one outcome. If the second context rejects, everything rolls back.
- **Read models without workers.** Live projection runs inside the command, so after a successful command a query sees committed state with no background job.
- **Per-entity online rebuild.** A read model rebuilds as a new generation while commands keep running. It covers interrupt and resume, verify, a one-write cutover and rollback, with cursor-safe pagination across the switch (Sc L2-5).
- **Generation registry.** Generations, progress rows and the allowed state transitions, with who may make each one.
- **Write pause, the maintenance gate.** Operators can close and reopen writes per scope. Every writer checks the gate inside its own mutation, and background writers are fenced. A restore door exists in the gate.
- **The example app.** Orders and Inventory with `PlaceOrder`, `CancelOrder`, `ReceiveStock` and stock release, an order summary read model, and its rebuild.
- **Measured performance** (native backend, local, quiet machine):
  - Median latency for `PlaceOrder`: 20.3 ms at 1 line, 35.1 ms at 10 lines, 166.3 ms at 100 lines.
  - Under contention, the stock invariant holds and logical conflicts are told apart from engine retries.
- **Harness and tooling.** A native-backend test harness with a pinned backend, an acceptance check derived from the design graph, codegen, and dev scripts. The hosted-tier test runner is built but has never run against a hosted deployment.

## Not implemented

### Layer 2 gaps: the 4 missing acceptance scenarios
- **History view (Sc L2-6, roadmap 5d).** A read model that folds events from several streams into one row, such as the order allocation history, rebuilt under a write pause with resume, abort and verification before writes reopen.
  - Fully designed (`pack:history-view`), and the pure fold function exists.
  - The build waits for your `ready` on the history projection and history rebuild Specs, and for your ruling on OD-157.
- **Baselines and migration (Sc L2-7, roadmap 5a).** Snapshot ("baseline") events that let a stream rebuild from a checkpoint, and event or state schema migration.
  - The journal stores and reads a `baselineVersion` field, but nothing writes baselines.
  - The adapter rejects a schema-version mismatch rather than migrating.
- **Restore (Sc L2-8, roadmap 5b).** Restoring a backup with matching code and configuration while writers are held out, checking domain, journal and read-model invariants, recording the result, and reopening only on a clean check.
  - The gate's restore door and the harness's backup export and import exist.
  - The procedure and the drill do not.
- **Aggregate projection.** One row summing contributions from many entities, such as totals per key. Deferred until a real view needs it (OD-075).

### Layer 3: obligations and external effects (12 Specs, all design only)
- **Obligation module.** Deferred work recorded as a promise that commits with the business change. It has a six-state lifecycle, is proven by evidence rather than callbacks, and comes with dispatch, recovery, inspection, retention and repair.
- **Local reaction wrapper.** Background follow-up work inside the app, with retry, a maintenance reschedule and rollback semantics.
- **Sweeper.** Finds failed or missing dispatches, rearms them within bounds, and leaves a legitimate backlog alone.
- **External effects.** Claim in one transaction, call the provider in an action, settle in a second transaction. Each effect declares a repetition policy, and an irreversible effect is never repeated without the provider's idempotency key or a reconciliation.
- **Retry ownership.** One owner per retried piece of work.
- **Fan-out and chains.** Bounded fan-out, causation carried on derived commands, and no cycles in reaction chains.
- **Operator operations.** Inspect, retry, reconcile, cancel and abandon, each writing a repair record.
- **Obligation retention and restore rules.**

In practice: **no sanctioned way yet to send email, take a payment, call an LLM or run any scheduled background job.**

### Layer 4: processes (deferred, `scoped`)
- Durable workflows on Convex's Workflow component, with business process records independent of engine step names, and deploy-safe migration of running workflows.
- Approvals: proof that an authorized person approved an exact proposal, re-checked at execution, with every race against expiry and revocation handled.
- A worked example: a checkout that waits on a payment provider.

### Layer 5: agents (deferred, `scoped`)
- Agent actions as proposals that policy checks, approved where policy says so and executed through the ordinary command boundary. Runs are bounded, and untrusted input cannot widen capabilities.
- Budget accounting for paid calls: reserve before the call, settle once, never treat unknown cost as zero.

### Layer 6: advanced reads (deferred, each waits for its own trigger)
- Coalesced recomputation with staleness shown.
- Cross-stream rebuild that stays online, without a write pause.
- An ordered event consumer, partitioned, with isolation of a failed partition.
- A trigger table that installs each capability only when it is needed.

### Not features, but missing for adopters
- No npm package or exports; the example imports `src/` by relative path (roadmap 5c).
- No client or UI example, and no guide to using the request key from a frontend.
- The production auth provider is not settled (OD-032); the first grant is inserted by hand.
- Never deployed to hosted Convex.
- No Spec states `ready`.

★ Insight ─────────────────────────────────────
- The built and unbuilt parts split cleanly by layer because of the design rule that "a lower profile never imports, mounts or configures a higher profile's machinery". Layers 0 to 2 can be complete and usable while Layer 3 does not exist.
- The four missing Layer 2 scenarios are all about maintaining data over time (history views, baselines, migration, restore), not the everyday command path. That is why a small new app feels the missing Layer 3 (no background work, no external calls) far sooner than it feels these gaps.
─────────────────────────────────────────────────
```

06:25

06:25
Done looking. `libar-platform` is a strong test case, and it changes my view on one point: **adapters move from "later" to the deciding question.** I also converted one capability in a scratch workspace to measure what migration really involves.

## What the repository shows

|  |  |
| --- | --- |
| Specs | 249 `.sdp.md` files, **11,600 lines**, more than the **7,900 lines** of code they describe |
| Markdown in total | 398 files, including `STATE.md`, `SESSIONS.md`, `PLAN.md`, `ROADMAP.md`, advisor memos and reviews |
| Spec kinds | 122 `example` files (scenarios kept apart from their rules), 28 constraints, 28 rules, 22 decisions, 19 contracts, 15 behaviors, 7 workflows, 2 models |
| Readiness | 232 of 249 say `defined`, so it cannot tell built from unbuilt |
| Tests | 272 vitest files across five tiers (`pure`, `simulator`, `native`, `types`, `hosted`); 234 code and test files cite spec ids in comments |
| Built, going by those citations | `command` 24/24, `context` 11/12, `application` 35/43, `kernel` 6/7, `operations` 3/3 |
| Unbuilt | `obligations`, `effects`, `processes`, `agents`, `advanced`: 0 cited. All 19 decisions and 12 laws: 0 cited |

## One capability, converted

The worked example is `/private/tmp/claude-502/-Users-darkomijic-work-sdp-new/402c1ada-7de9-4ad9-bfe1-d63499de8b17/scratchpad/platform-sample`, and `sdp check` passes on it with 0 errors.

**Idempotency and receipts** goes from **356 lines in 7 files to 64 lines in one**: `features/commands/run-a-business-intent-once.feature`.

- **Kept:** every rule a caller can observe, with its reason under it.
- **Folded in:** the six `example` files become six Scenarios. A `{requestKey: "k-1"}`-style step becomes plain Gherkin.
- **Became an `@open` rule:** the open question about `ConvexHttpClient`.
- **Became a small decision:** "receipts are thin".
- **Became an idea rule:** the receipt sweep, which is built but nothing schedules.
- **Dropped:** the "Design" sections that restate TypeScript signatures (the code is the design), the "Traces: D6, D7, Law 4…" lines (links do that), and status prose.

At that ratio, the whole corpus comes to roughly **2,500 lines**.

The sample also shows two patterns this repository would add:

- **Facts about the platform** (`specs/platform/`, kind `fact`): the 59 facts and probes about Convex become live specs whose scenarios run against the pinned backend. Being outside every discipline, they're not work, just verified knowledge the design rests on. A probe that starts failing after a Convex upgrade fails the run.
- **A whole area in the backlog** (`features/effects/backlog/`): Layer 3 isn't built at all, and the tree says so at a glance.

## The organization it suggests

```
specs/
  ARCHITECTURE.feature        ← the 12 laws and 8 constraints, as rules of the code
  platform/                   ← facts about Convex, verified by scenarios (kind fact)
  features/
    decide/                   ← L0: deciders, rebuild equality, the outcome model
    contexts/                 ← L1: component, journal, persistence, list operations, queries
    commands/                 ← L1: pipeline, declarations, receipts, tenancy, wire outcomes, audit
    read-models/              ← L2: live projection, online rebuild, generations
      backlog/                ←     aggregate projection
      history-view/           ←     epic 5d beside its specs (one area)
    operations/               ← write pause, receipt sweep
      restore/                ←     epic 5b
    effects/backlog/          ← L3: obligations, reactions, sweeper, provider calls
    processes/backlog/        ← L4
    agents/backlog/           ← L5
  decisions/                  ← a few of the 19; the "OD-…" items become @open rules where they apply
  plan/                       ← epics spanning areas: 5a baselines & migration, 5c first adopter cut
```

What it confirms about the open decisions:

- **Backlog:** confirmed, and very visible here. Roughly 40 specs, three whole layers, plus the backlog of `read-models`.
- **Mixed specs:** real but few. Baselines are the typical case: the journal already stores `baselineVersion`, so "a stream rebuilds from a baseline" is a rule still to come inside the live journal feature.
- **Epics:** roadmap units 5a–5d map one-to-one. The old "packs" were review groupings, the failure the earlier repository recorded, and they'd go.
- **Colocation:** the code lives in `src/kernel`, `context`, `command`, `read-model`, `gate`, `audit` and `operations`, close to the areas but not one-to-one. Idempotency alone touches `command`, `context` and the receipts table. Tests are grouped by tier, not by feature. So again: features central, nothing colocated.

## The deciding question: how scenarios run here

This repository's tests run in **vitest** with a `globalSetup` that starts a pinned local Convex backend, and CI runs vitest. The new sdp runs scenarios in its own runner and has **no suite-level setup hook**: nothing starts a backend once before the scenarios. So the converted spec checks clean, but it can't run yet. There are two ways to get there:

| Path | What it takes | Effect |
| --- | --- | --- |
| **1. `sdp run`, with step definitions over the existing harness** (`tests/native/receipted-calls.ts` and the like) | Suite-level setup and teardown in sdp (an idea today), and tiers as tags (`@native`, `@hosted`) | sdp is the runner; CI runs `sdp run` beside or instead of vitest |
| **2. A Vitest adapter:** scenarios run inside vitest, which already has `globalSetup` and tiers | The "compile to a host runner" idea of `run-specs-in-another-runner`, made concrete for Vitest | CI is unchanged; specs are included in the suite exactly like tests, which is what you asked for |

For this adopter, **path 2 is the stronger case**. It meets your two criteria (failures fail CI, specs included in the suite) without changing its pipeline. Path 1 needs suite hooks anyway. I'd raise both from idea: the **Vitest adapter** and **suite-level setup**. Along with the **JUnit report**, they're what an adopter like this needs first.

`★ Insight ─────────────────────────────────────`

- In the old format, "verified" meant a test file citing a spec id. In the new one, the scenario *is* the test. So migrating `libar-platform` is mostly about making scenarios runnable where its tests already run, not about converting text. That's why adapters decide adoption.
- Facts about the platform are a pattern sdp-new doesn't have yet, and they belong in sdp's vocabulary: knowledge the design depends on, kept honest by running it. In this repository they're 59 of the 249 specs.
  `─────────────────────────────────────────────────`

## For your deliberation

1. **Areas named for what developers do with the platform** (decide, contexts, commands, read-models, operations, effects…) or **by layer number** (L0–L6)? The layers are a real architectural rule here: a lower layer never imports a higher one's machinery.
2. **Path 2, the Vitest adapter,** as the first adapter, ahead of the Cucumber-JS plugin?
3. **`fact` as a kind** for verified platform knowledge, in sdp's default vocabulary or left to each team?
4. **Migration order:** the built areas first (their tests exist to back the step definitions), the backlog areas in bulk (rules without examples are cheap), and all status Markdown deleted. The old `.sdp.md` and new `.feature` files can coexist during migration, since each tool reads only its own glob.

Nothing changed in either repository.

3 changed files
06:27

Layers can easily be modeled using an annotation and a metadata value.

You can check this taxonomy. This is from an even older version, generation 1, and this is actually a live auto-generated document from the state. For example this role tag can have various values, which can name the layers:

https://github.com/libar-ai/architect-studio/blob/main/docs-live/TAXONOMY.md

And please help me understand what a Vitest adapter concretely implies. I would like to actually refactor all of the tests to Gherkin. Maybe some exceptions can be defined for small unit tests but I'm leaning toward having proper BDD tests (Gherkin).

06:34

06:34
Both are done.

## Layers as metadata: agreed

sdp-new can already carry layers this way, at two levels:

- **On code (canonical):** an element's annotation takes attributes, as in `@sdp is ARCH-journal layer=1 role=decider context=orders`. `check` already reports two anchors of one element that disagree on an attribute. A layer belongs to code, because the rule "a lower layer never imports a higher layer's machinery" is about imports, and sdp derives imports from that code.
- **On specs, through the links already there:** `sdp q 'feature -realized-by-> element[layer=3]'` gives every feature of Layer 3, with no layer tag on the feature itself. A feature tag like `@layer=3` works too, but it repeats what the code already says.

Folders for areas and metadata for layers then don't compete. Areas are what a reader browses; layers are a query, a column in a view, or a colour in a diagram. A layer rule could even become an ARCHITECTURE rule with an example: "no element of layer *n* imports one of a higher layer".

How generation 1's taxonomy maps onto sdp-new:

| Gen 1 tag | In sdp-new |
| --- | --- |
| `role` (decider, projection, read-model, service…) | an element attribute `role=…`, or a pattern (`@sdp plays PAT-decider`) where instances share code |
| `bounded-context` | an element attribute `context=…`, and an area folder when it's a navigation unit |
| `product-area` | the area folder |
| `uses`, `implements`, `extends`, `see-also` | links (`@uses:…`); imports are derived from code |
| `level` / `parent` (epic › phase › task › slice) | epics with `@includes:`, phases and iterations in the plan |
| `status`, `completed` (date) | **dropped**: maturity is declared only while work is still to come, the stage is derived from runs, and a milestone's date is when it's recorded as met |
| `adr`, `adr-status`, `adr-supersedes`… | a decision spec with a meaningful id; replaced decisions are rewritten, history is git's |
| `usecase "quoted value"` | a description, since tags can't hold spaces |

## What a Vitest adapter concretely means: a working prototype

The prototype is in `/private/tmp/claude-502/-Users-darkomijic-work-sdp-new/402c1ada-7de9-4ad9-bfe1-d63499de8b17/scratchpad/vitest-adapter`. It's about 70 lines, running on `libar-platform`'s own vitest 5.0.3, and nothing in that repository changed.

**What it does:** a Vite plugin compiles each `.feature` into a vitest test module, with Feature and Rule as `describe` and each Scenario as a `test`. A small runtime matches each step against step definitions with Cucumber expressions and runs it. Real output:

```
✓ Cart > A cart holds each item once > An item added twice
× Cart > A cart holds each item once > Two items           → 2 !== 3, pointing at steps/cart.steps.mjs:5
↓ Cart > A cart expires after a week > A week-old cart     [still to come: undefined step: a cart from 8 days ago]
Tests  1 failed | 1 passed | 1 skipped     exit 1
```

- A **failing live scenario fails the run** (exit 1), and the error points at the step definition's line.
- **Work still to come runs but fails nothing**: it shows as skipped, with the reason.
- **The JUnit report comes for free**: one `<testcase>` per scenario, with `<failure>` or `<skipped/>`, which GitHub, GitLab and Jenkins all display.
- **Tiers are tag filters**: `SDP_TAGS=@native` runs only `@native` scenarios. A scenario tagged `@simulator @native` runs in both of your vitest projects.

**What a real adapter needs beyond the prototype:**

| Piece | Why |
| --- | --- |
| **One execution core shared with `sdp run`**: matching, the six step statuses, the `defineSteps` world, typed arguments, the `AbortSignal`, timeouts | Otherwise two runners drift apart. It means extracting the core of `src/run/` and putting two front ends on it |
| **An evidence reporter** writing sdp's results: scenario id, status, hash, and the files it ran against (from vitest's module graph) | Without it, `sdp status`, stages, `gate` and staleness see nothing. `libar-platform` already has its own `harness/evidence.ts` reporter, the same idea |
| A package entry: `…/vitest` | adopters write `plugins: [sdp()]` |
| A mapping of semantics: step timeout vs `testTimeout`, `@serial` vs `describe.sequential` | vitest's equivalents differ slightly |

**What vitest gives you for free:**

- `globalSetup`, which is how your native backend gets started
- projects for tiers
- fake timers and mocking
- coverage of what the scenarios exercise
- watch mode
- the VS Code test explorer listing each scenario
- **one worker per feature file**, which is half of the isolation rule sdp's runner still only has as an idea

`sdp check` remains the guard that nothing live is silently turned off. Vitest only runs the scenarios.

## Refactoring all tests to Gherkin: I agree, with one test for exceptions

**A test stays a unit test when no rule a developer could observe names what it checks.** Applied to `libar-platform`:

| Tests now | Becomes |
| --- | --- |
| `native` (179), `simulator` (28), `hosted` (4) | **Scenarios**, with the tier as a tag (`@native`, `@simulator`, `@hosted`) instead of a folder |
| `pure` (46): deciders | **Scenarios**. A decider is the textbook BDD case: *Given these events, When this command, Then these events* (or this rejection) |
| `pure`: helpers (canonical JSON, digests) | **Stay unit tests**, below the level of any spec |
| `types` (15) | **Scenarios** for the few that are requirements ("renaming a handler fails the type check", with a step that runs `tsc` on a fixture); the rest stay `.test-d.ts` |
| `*.test.generated.ts` | **Deleted**: the scenario *is* the test now |

Two things will decide the quality:

- **Steps are grouped by subject** (tenants and actors, commands and receipts, journal, read models, gate, platform probes), not one step file per feature. The research calls feature-coupled steps an anti-pattern.
- **Steps stay in business language**, as in the sample conversion. Most of the work becomes a step library over the harness you already have.

`★ Insight ─────────────────────────────────────`

- In the prototype the adapter is the small part: about 70 lines to compile and run. The real work is shared semantics, meaning one execution core plus the evidence reporter. Without both, a scenario passes in vitest but sdp doesn't know it's verified.
- Vitest projects and tags combine nicely. Tiers stop being folders that duplicate tests and become tags that run *one* scenario against several backends, which is what your Layer 0–2 acceptance already does by hand.
  `─────────────────────────────────────────────────`

## For your deliberation

1. **The runner architecture** is decision-sized: hard to reverse, and it spans features. One execution core with two front ends (`sdp run` for sdp-new and small workspaces, the Vitest adapter for `libar-platform` and larger codebases)? Or make vitest *the* runner and retire sdp's own? I'd choose the first: sdp's evidence and staleness model is built on its runner, and the core can serve both.
2. **The Vitest adapter as the first adapter,** specified now (raising `run-specs-in-another-runner` from idea), with the evidence reporter as a rule of it.
3. **Layers:** an element attribute (`layer=`) as `libar-platform`'s convention, plus an ARCHITECTURE rule "a lower layer imports no higher one" with a measured example?

1 changed file
06:36