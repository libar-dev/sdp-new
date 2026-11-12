# Wave 4 handoff: what the two writers reported, for whoever merges them

Two packages were written in parallel from `80d9488`:

- **Prose** (`t3/specs-prose-cleanup`, already merged into `review/redesign` at `6061a5c`): D21.
- **Decisions and milestones** (`t3/redesign-decisions-milestones`, not merged): D19 and D20.

A trial merge of the second into `review/redesign` gives 18 content conflicts and five
modify/delete conflicts (files the prose branch moved or deleted and the decisions branch edited
at their old path).

## What the prose branch did that the merge must respect

- Moved `docs/architecture/*` to `specs/architecture/` (`overview.md` is now
  `specs/architecture/ARCHITECTURE.md`; the patterns sit beside the elements) and deleted
  `docs/GLOSSARY.md`. It left the `docs/**/*.md` glob in `sdp.config.yaml` on purpose.
- Deleted prose and tables whose rules scenario names now carry, in every requirement and element
  spec it owned. In the three shared specs it says the conflicts resolve by taking its deletion and
  keeping the other branch's scenario edits:
  - REQ-check-rules: the rules table is gone; `decision-shape` (and now `milestone-met`) need only
    a row in the outline of examples.
  - REQ-configuration: the vocabulary prose block is gone; it changed the paths in "sdp new writes
    what a renamed profile reads".
  - REQ-cli: the `sdp vocabulary` paragraph and the exit-code table are gone; one scenario now
    holds only the decision and milestone template rows; the `gate` and `lifecycle` sections were
    left byte-identical apart from two `sdp new` paths.
  - REQ-executable-specs: the "Specs whose `status` is…" paragraph is gone.
- `sdp new` writes every kind under `specs/` (`directoryFor`); templates write only front matter,
  a title and, from `specified` on, a scenario skeleton; guidance is printed as `next:` lines.
  A new spec above `idea` therefore fails `maturity-criteria` until described — the owner
  confirmed this is wanted.
- `sdp init` writes `.claude/skills/sdp/SKILL.md` from the skill in this repository;
  `agentsTemplate` and the `AGENTS-sdp` node are gone. AGENTS.md has one scenario left ("A word
  this repository replaced does not come back").
- `sdp context` leads with scenario names and status, a `###` line per `Rule:`; `sdp arch` lists
  each element's anchored code and shows an anchor's `doc` when the element has no description.
- It edited two files of the other branch minimally: `src/check/Check.ts` (removed five template
  prompts and the open-question copy from `placeholderLines`) and `src/model/Vocabulary.ts`
  (added `made.codeAttributes`).
- Fixture paths are only partly renamed from `docs/` to `specs/`; `examples/shop` still has a
  `docs/` folder; the plan template still carries a six-line how-to that should move to
  `guidance()` in `src/app/Templates.ts`.
- README links to `specs/VISION.md`, which exists once the decisions branch is in.

Reasons it took out of specs that need a home (decisions are now one to three sentences, so a
reason goes into a decision only if it fits there; otherwise it is one sentence on the spec):

| Reason | Belongs to |
| --- | --- |
| `sdp graph` writes nothing to disk: a dump cannot say that it is stale or incomplete. | files are the source of truth (DEC-0003) |
| Invalidation is coarse on purpose; imported files are compared per run because which they are is a fact about one run. | the evidence decision (now DEC-0010) |
| A gate sees what its fingerprint covers, not when or how a scenario ran, or it would be stale the moment it was recorded. | the evidence decision (now DEC-0010) |
| Removing a vocabulary role would switch off what sdp reads through it; renaming is free. | free vocabulary (DEC-0002) |
| Exit code 2 in every output mode, because the reader of `--ids` or `--json` is the one most likely to conclude absence. | a sentence in REQ-cli |
| Default concurrency is one, because step definitions written for a sequential run may share state. | the `--concurrency` help text |

The glossary's repository conventions (`quality`, `role`, `exposure`, `planned`) are explained
nowhere now; `exposure` was since removed from the risks by the other branch.

It found that a Gherkin `Rule:` in one fence holds every scenario in later fences of the same
file, Background included, and removed one `Rule:` from REQ-cli that was leaking its step file
into every later scenario. The owner has ruled: **a `Rule:` ends with its fence**, and adds that
"rules are probably one of the most important parts of specs and a lot of the parser will probably
land there".

## What the decisions branch did that the merge must respect

- Ten decisions remain, `DEC-0001`…`DEC-0010`, each `id:`, a title and one to three sentences,
  under `specs/decisions/`. Old 0011 (evidence) is now 0010; old 0010 and 0012–0018 are gone.
  Their sentences and guard scenarios were moved to the spec each is a rule about — several into
  files the prose branch had moved, edited at the **old** `docs/architecture/` paths:
  - the vocabulary guard and its self-test → ARCH-vocabulary;
  - "the next command sees an edit" → PAT-derived-index;
  - "the core does no IO" → PAT-pipes-and-filters, which gained `decided-by: DEC-0004`;
  - two annotation guards → ARCH-code-annotations, a section "In this repository";
  - the link-key reason → a row of ARCH-graph-builder's table (the prose branch deleted that
    table: keep the reason as one sentence);
  - the scenario-id reason → the id line of ARCH-spec-parser;
  - "every phase has iterations and a milestone", "work is planned only into declared iterations"
    and the risk rules → the plan;
  - the id-prefix outline → AGENTS.md (the prose branch reduced AGENTS.md to one scenario; decide
    whether this outline belongs there or in REQ-configuration, which already states the rule).
  It also made link fixes in `docs/GLOSSARY.md`, which stays deleted.
- Removed from the code: `vocabulary.statuses`, `relations.supersedes`, `isActive` and the
  runner's skip by status; the rules `decision-status`, `decision-supersede`, `decision-content`;
  `sdp gate --due`, `dueMilestones`, `currentPhase`, `attributes.order`, the gate in
  `npm run verify`. Added: `relations.closes`, `attributes.met`, the rules `decision-shape`
  (a warning) and `milestone-met`, `sdp gate <id> --record`, a risk template, `MS-beta`.
- The plan, milestones, risks and vision are under `specs/` (`specs/delivery/`, `specs/risks/`,
  `specs/VISION.md`); the vision links to the decisions with a relation of its own, `principle`.
- MS-LCA's "every element has a description" is `element|pattern[!summary]` and is unmet for the
  seven elements declared inline in the architecture spec. Giving them a sentence is the
  architect's call: leave it unmet.
- Four of its scenarios (REQ-cli lifecycle, REQ-configuration) assert `docs/…` paths because in
  its tree `directoryFor` still wrote there.
- Left on purpose: REQ-maturity-criteria's Definition of Ready example still queries
  `decision[status!=accepted]`; several fixtures still carry `status: accepted` or `proposed`.

Lines it reports as false after its changes (the prose branch has since rewritten some of them):

- README: the link to `docs/VISION.md`; a fixture decision with `status: proposed`.
- AGENTS.md: "Markdown in `specs/` and `docs/`"; the folders named for `DEC-`, `RISK-`, `MS-`,
  `PH-`, `PLAN`; "the gates that are due (`sdp gate --due`)"; the paragraph about a gate of the
  current phase; a fixture with `status: proposed` and the query on it.
- The skill: "`sdp lifecycle` (phases, iterations, which gates are due)"; "`sdp gate --due` (the
  milestone that is due still holds)" and "`sdp gate` is what enforces them".

Both branches pass `npm run verify` on their own: 365 scenarios on the prose branch, 346 on the
decisions branch.
