# sdp review: concept model and spec corpus (Opus 5.5)

Scope: concept model, decisions and principles, the spec corpus as specification, scenario
quality, dogfooding, agent ergonomics. Checkout `t3/76abacf8` at `3139ff3`. Every claim below
cites a line I read. Behavioural claims come with the command I ran and what it printed. Probe
workspaces were scratch directories; nothing tracked was changed. The mutation harness and both
mutation lists are in `reviews/opus-concept-probes/` next to this file. Run them with
`node mutate.mjs <copy-of-repo> muts1.json`.

Baseline: `npm run verify` → `230 scenario(s): 230 passed`, `11 gate scenario(s): 7 passed, 4 failed`, 6.6 s.

---

## 1. Verdict

The core concept is sound and worth building on. Files are the truth and every fact has a
`file:line`. One Markdown-plus-Gherkin format serves every maturity. Maturity is declared and
checked, and evidence is derived from results. Significance is left to architects, and the plan
lives as graph data.

The biggest weakness is that the graph's meaning is not where the decisions say it is. DEC-0002
says "no code path depends on a closed vocabulary", yet the code quietly interprets `decision`,
`milestone`, `phase`, `iteration`, `pattern`, `supersedes`, five status words, `significant`,
`activity` and others. Rename one and features silently degrade instead of failing.

Two things make it worse. First, the same fact can be written in three ways: an explicit link, an
"implicit link" that exists only if the value happens to be an existing id, or a plain attribute.
Second, the boundary between declared and derived attributes is enforced only for file specs.
Together these let milestone gates and guards pass for the wrong reason, and let `stage: verified`
be declared, which contradicts DEC-0005's central promise.

The scenario corpus is good at what it covers: 27 of 40 mutants were killed, each by a precise
scenario. But it misses core semantics. A spec that is half automated can be reported as verified
and no scenario notices. And one assertion form dominates: matching rendered text.

---

## 2. Findings (most severe first)

### C-01 · P1 · DEC-0002 is false: sdp depends on a hidden, partly unconfigurable vocabulary

**Problem.** The code reads specific kind names, relation names, attribute names and status values.
Only some of them are configurable, and the glossary lists only some of them. Renaming one degrades
features silently.

**Evidence (code).**
- `decision` kind is hard-coded:
  - `src/graph/Context.ts:108`: decisions in reach
  - `src/graph/Context.ts:110`: "quality" is anything that is a driver and not of kind `decision`
  - `src/graph/Status.ts:25`
  - `src/graph/Export.ts:43`
  - `src/check/Check.ts:159` (decision rules)
  - `src/arch/Architecture.ts:62`
- `milestone` makes a gate: `src/graph/Build.ts:329`. Lifecycle also uses it at `src/lifecycle/Lifecycle.ts:174`. Not configurable.
- `phase` and `iteration` kinds:
  - `src/lifecycle/Lifecycle.ts:101`: plan relations must point at kind `iteration`, even though the relation name is configurable
  - `:133-134`
  - `src/check/Check.ts:105-107`
- `pattern` kind: `src/arch/Architecture.ts:107` and `src/graph/Context.ts:109`. The configured `architecture.kinds` is ignored there.
- `activity` attribute key: `src/lifecycle/Lifecycle.ts:91` and `src/check/Check.ts:242`. Not configurable, unlike `planRelations`.
- `order`, `start`, `end`: `src/lifecycle/Lifecycle.ts:77,82,189-190`.
- `supersedes` and decision statuses: `src/check/Check.ts:60,172-185`.
- `superseded|rejected|deprecated` stop the scenarios of **any** kind: `src/graph/Build.ts:319-322` and `src/run/Session.ts:109`.
- `significant` accepts `true|"true"|"yes"`: `src/arch/Architecture.ts:15-16`.
- `type` values `quality|non-functional|nfr|constraint`: `src/arch/Architecture.ts:25`.
- `verifies` and `mentions` get special treatment: `src/arch/Architecture.ts:89` and `src/graph/Context.ts:43`.
- Default kind `element` for code-declared nodes: `src/graph/Build.ts:226`.
- The spec's kind is injected as a Gherkin tag: `src/parse/Spec.ts:99`.
- The meaning of `iteration:` depends on a kind→discipline table: `src/model/Config.ts:81-89`.

**Evidence (docs).**
- `docs/decisions/DEC-0002-free-form-relations.md:29-31` claims there is no such dependency.
- `docs/GLOSSARY.md:27-30` (TERM-relation) lists only `verifies`, `mentions`, `is`, `supersedes` and the plan and phase relations.
- `specs/requirements/REQ-flexible-graph.md:19` says "the tool attaches no meaning to a fixed vocabulary".
- `specs/requirements/REQ-decision-records.md:16` does require `kind: decision`, so the corpus contradicts itself.

**Probe.** A team that says `adr` instead of `decision` and configures `architecture.drivers: [adr, nfr]`:
```
$ sdp context REQ-x          # REQ-x -realized-by-> ARCH-db -decided-by-> ADR-1 (superseded), ADR-2
## Quality requirements in reach
- ADR-1 — Use Postgres (adr) specs/ADR-1.md:1
- ADR-2 — Use SQLite (adr) specs/ADR-2.md:1
$ sdp status
decisions     —
check         no diagnostics      # no decision-status, no decision-supersede for the ADRs
```
The ADRs are presented as quality requirements, including the superseded one. They disappear from
the decision count, and no consistency rule runs on them.

**Why it matters.** Free-form vocabulary is a headline principle (PRIN-free-form-graph). In
practice it is "free-form unless you rename one of ~25 words that nobody listed". The failure mode
is silent degradation, which is the worst kind for an agent-facing tool. AGENTS.md also says "do
not add code that depends on a closed vocabulary", which the existing code contradicts.

**Recommendation (redesign).** Introduce an explicit **interpretation profile**, one module and one
config section, through which all such reads go:
```yaml
vocabulary:
  kinds:      { decision: [decision], milestone: [milestone], phase: [phase], iteration: [iteration],
                pattern: [pattern], element: [element] }
  relations:  { supersedes: supersedes, plan: [iteration], phase: [phase], mention: mentions,
                scenario-of: verifies, anchor: is }
  attributes: { significant: significant, rationale: rationale, activity: activity,
                order: order, start: start, end: end, quality-type: type }
  statuses:   { decision: [proposed, accepted, rejected, deprecated, superseded],
                inactive: [superseded, rejected, deprecated] }
```
Then:
- Generate the glossary's "attributes sdp reads" table from it.
- Have `sdp status` print the active profile.
- Rewrite DEC-0002 honestly: "authors' vocabulary is free; sdp interprets a small, named, configurable profile".
- Add a guard scenario (a fitness function) that greps `src/` for kind, relation or status string literals outside the profile module.

---

### C-02 · P1 · "Verified" and maturity can be declared, bypassing DEC-0005, through inline nodes and code annotations

**Problem.** Derived attributes (`stage`, `verification`) are overwritten only on file specs
(`src/graph/Build.ts:184-191`). Inline nodes keep whatever they declare (`:195-203`), and so do
`is`-declared code nodes (`:219-233`). Maturity gates run only over `project.specs`
(`src/check/Check.ts:116-157`).

**Probe 1 (inline node).**
```
# specs/BACKLOG.md:  nodes: - { id: REQ-export, kind: requirement, maturity: ready, stage: verified, significant: true }
$ sdp check                           → 0 error(s), 0 warning(s), 0 info
$ sdp q 'requirement[stage=verified]' → REQ-export
$ sdp arch                            → Significant (marked by architects): 1   REQ-export
```

**Probe 2 (code annotation).**
```
# src/pay.py:  // @sdp is REQ-pay kind=requirement maturity=ready stage=verified
$ sdp show REQ-pay  → maturity: "ready" · stage: "verified" · declaredIn: "code"
$ sdp check         → 0 error(s), 0 warning(s), 0 info
```
Every milestone gate filters on `stage!=verified` (for example
`docs/delivery/milestones/MS-PR.md:15`). So a declared `stage: verified` satisfies them.

**Why it matters.** "Nobody declares a requirement done" is principle 3
(`docs/VISION.md:74-76`) and DEC-0005's decision (`DEC-0005…md:22-24`). It holds only for one of
the three ways a node can come into being.

**Recommendation.**
- Reserve derived names (`stage`, `verification`, `scenarios`, `summary`, `file`, `openQuestions`, `declaredIn`) on every node source, and report an error (`derived-attribute`) when one is written.
- Decide whether inline and code-declared nodes may carry `maturity` at all. The simplest honest rule is that only file specs have maturity, since only they have content to gate.

---

### C-03 · P1 · One fact, three representations; gates read one and miss the others

**Problem.** A front-matter fact can be:
1. an explicit edge (`links: { iteration: I1 }`): an edge with no attribute;
2. an "implicit link": an attribute that *also* becomes an edge, but only if the value happens to be an existing id (`src/graph/Build.ts:269-287`, check at `:281`);
3. a plain attribute, if the target does not exist. Then there is no edge and no diagnostic.

Queries and gates pick one representation each, attribute or edge.

**Probe A (a gate misses an edge-only plan).**
```
DEC-0001: status: proposed, iteration: I1            (attribute + implicit edge)
DEC-0002: status: proposed, links: { iteration: I1 } (edge only)
$ sdp q 'decision[iteration=I1, status!=accepted]' --ids   → DEC-0001          # MS-LCO's form
$ sdp lifecycle                                            → I1 … 2 item(s) decision:2
```
The lifecycle counts both decisions as planned in I1. The MS-LCO gate query
(`docs/delivery/milestones/MS-LCO.md:28`) sees only one, so a proposed Inception decision passes
the gate.

**Probe B (a reference to a missing node is silently not a reference).**
```
REQ-a: owner: REQ-typo
$ sdp check   → only the plan-reference warning for `iteration: E9`; nothing about REQ-typo
```
This contradicts `DEC-0002…md:37` ("`sdp check` catches every reference to a missing node"). It
also hollows out DEC-0002's own guard, `the query "missing" returns no results`
(`DEC-0002…md:40-43`): a deleted or renamed target turns every implicit link to it into inert text.

**Also.** The most recent commit added edges for map entries (`activity.implementation`, …,
`src/graph/Build.ts:276-278`). The spec still says the opposite: "it adds no relation names …
Queries reach it as an attribute" (`specs/requirements/REQ-lifecycle-view.md:51-56`). Meanwhile
`sdp status` lists `activity.test 33 · activity.implementation 27 · activity.analysis-design 8 ·
activity.deployment 2`, and the gates query `-activity.implementation->`
(`MS-IOC.md:18`, `MS-LCA.md:27`). The lifecycle itself reads `activity` as an attribute
(`Lifecycle.ts:90-94`) and `iteration` as an edge (`:97-104`).

**Why it matters.** Gates are the whole mechanism for "milestones met by evidence". When the same
plan fact can be written so that one consumer sees it and another does not, gates pass for the
wrong reason, and RISK-0001's "silently misses" becomes structural, not just a matter of spelling.

**Recommendation (redesign).** Make link-ness a property of the key, not of the value.
- **Link keys** are the configured plan and phase relations, `activity.*`, and anything under `links:`. They always produce edges. Their targets must resolve (`dangling-link`), and they are also exposed as attributes, so `[iteration=I1]` and `-iteration->` always agree.
- **Every other key** is a value and never links.

If the convenience of "any id-valued attribute links" is wanted, report an implicit link whose
target is missing, at least when the value matches the id shape of a configured prefix
(`REQ-…`, `DEC-…`). Rewrite REQ-lifecycle-view:51-56 to describe what exists.

---

### C-04 · P1 · The scenarios miss core semantics: 13 of 40 behaviour mutants survive

Mutants were applied one at a time to a copy of the repository, with a full `sdp run` per mutant.
Every caught mutant was caught by a precise scenario, plus `MS-IOC#the-specification-graph-is-consistent`.

| Mutant (file) | Survived? | Note |
| --- | --- | --- |
| M3 `verificationOf`: `every passed` → `some passed` (`src/run/Results.ts:90`) | **survived** | A spec with one passing and one undefined scenario becomes `passing` → `stage: verified`. The evidence table promises the opposite (`REQ-executable-specs.md:109`, "some passed while others are not → pending → in-progress"), and nothing tests it. This is the heart of DEC-0005. |
| M18 `specified` no longer needs an outcome (`src/check/Check.ts:36`) | **survived** | `REQ-maturity-gates.md:25` defines `specified` by "a scenario that states an outcome"; the outline at `:77-96` only tests "no scenarios". |
| N16 plan-reference ignores phase relations (`src/check/Check.ts:107`) | **survived** | The scenario is titled "Plans name declared iterations, **phases** and disciplines" (`REQ-check-rules.md:94`), but none of its five examples (`:117-122`) names a phase. |
| M9 a gate of the current phase is shown "overdue" (`Lifecycle.ts:233`) | **survived** | "Overdue" exists only for phases the calendar has left (`REQ-lifecycle-view.md:72-75`); nothing tests that the current phase is not overdue. |
| M10 milestones count as planned work (`Lifecycle.ts:71`) | **survived** | |
| N1 `unplanned` no longer requires `maturity` (`Lifecycle.ts:184-186`) | **survived** | |
| N12 an empty `activity` list falls back to `iteration:` (`Lifecycle.ts:117`) | **survived** | `REQ-lifecycle-view.md:53` promises "an empty list plans none". |
| M4 `significant: "yes"` stops counting (`Architecture.ts:16`) | **survived** | The `"true"`/`"yes"` variants are unspecified behaviour. |
| N7 a `significant` attribute on any kind no longer makes a node architectural (`Architecture.ts:20`) | **survived** | |
| N10 a spec with no maturity gets `stage: draft` (`Build.ts:374-376`) | **survived** | |
| N15 `sdp status` counts stages over all nodes (`Status.ts:24`) | **survived** | |
| N19 the listing status cell shows a decision's stage instead of its status (`Export.ts:43`) | **survived** | |
| M19 `ready` allows a scenario without steps (`Check.ts:44-45`) | **survived** | This reason is unreachable on its own: a scenario with no steps also has no `Then` (`:42-43`). Dead rule. |
| M1, M2, M5–M8, M11–M17, M20, N2–N6, N8, N9, N11, N13, N14, N17, N18, N20 | killed | e.g. M14 by `REQ-agent-context#only-decisions-that-still-apply-are-included` and `REQ-executable-specs#records-that-no-longer-apply-do-not-run` |

**Why it matters.** There are no unit tests, so these scenarios are the only safety net. M3 and M18
sit exactly on the project's thesis: maturity is checked, and done means verified.

**Recommendation.**
- Add the missing rows: a mixed passed and undefined outline for `stage`, a `specified` example with a Then-less scenario, a phase example in `plan-reference`, an empty `activity` list, and the significance values (or reject non-boolean ones; see C-07).
- Delete the unreachable reason at `Check.ts:44-45`.
- Keep the mutation harness as an occasional fitness check of the corpus. It is 40 lines.

---

### C-05 · P2 · `stage` merges two ladders, and "in-progress" mislabels regressions

**Problem.** `stage` is the declared maturity until results exist, then `in-progress` or
`verified` (`src/graph/Build.ts:369-376`). The query engine compares it on one merged ladder,
`idea < draft < specified < ready < in-progress < verified` (`src/graph/Query.ts:34,488-492`).

This creates four problems:
- A failing **regression** of verified behaviour reads as `in-progress`, as if someone were working on it.
- An `idea` spec with a failing scenario compares above a `ready` one.
- `stage` also applies to decisions (guard holds), elements (contract holds), and even VISION and GLOSSARY (lint holds). The I1 evidence line in `sdp lifecycle` says `verified:26`, while `sdp status` says `spec stages … verified 19`, because `Status.ts:24` counts only nodes with `maturity`.
- The glossary's stage definition (`docs/GLOSSARY.md:172-174`) does not mention that partially automated specs (`pending`) count as `in-progress`.

**Why it matters.** The two axes DEC-0005 separates (declared authoring maturity, derived
evidence) are folded back into one attribute. That attribute is what gates query.

**Recommendation.** Keep `maturity` (declared) and `verification` (derived) as two orthogonal
axes. Either drop `stage`, or define it as a delivery ladder of its own (`not-automated |
partially-automated | failing | verified`) that is never compared against maturity. Rename
`in-progress` to `failing` when anything fails. State in the glossary which kinds get it.

---

### C-06 · P2 · "Linked" means three different things; a prose mention satisfies an architecture gate

**Problem.**
- The curated view pulls in drivers and patterns through **any** neighbour, mentions included (`src/arch/Architecture.ts:104-108`).
- The candidate ranking deliberately excludes `mentions` and `verifies` ("writing more of them must not make an element look central", `:83-89`).
- SDPQ's `-*-` includes mentions. MS-LCA's "curated and connected to the decisions behind it" uses `-*-` (`MS-LCA.md:35`), as does DEC-0008's example rule (`DEC-0008…md:39`).

**Probe.**
```
DEC-0001 (prose): "JSON logs. Unrelated to [[ARCH-db]], which we did not discuss."
ARCH-db: significant: true, rationale: holds all state     (no links)
$ sdp q '*[significant] !-*- decision|nfr'   → 0 node(s)        # MS-LCA scenario passes
$ sdp arch                                   → ARCH-db … <-mentions- DEC-0001  Logging format
```

**Recommendation.**
- Treat `mentions` (and the sdp-made `verifies`) as weak edges. Exclude them from `*` unless asked for, for example `-*-` for design relations and `-**-` or `-*|mentions-` for everything.
- Use the same `isDesignLink` predicate in the view, the context bundle, candidates and the query wildcard.
- Document the rule once in REQ-graph-query.

---

### C-07 · P2 · Significance has two definitions

**Problem.** `sdp arch` uses `isSignificant` (`true | "true" | "yes"`, `src/arch/Architecture.ts:15-16`).
SDPQ's `[significant]` means "set and not false" (`src/graph/Query.ts:384-385`). Gates and
DEC-0008's rule use the query form.

**Probe.**
```
ARCH-a significant: "no" · ARCH-b significant: "false" · ARCH-c significant: yes · ARCH-d significant: 1
$ sdp q '*[significant]' --ids   → ARCH-a ARCH-b ARCH-c ARCH-d
$ sdp arch                       → ARCH-c only; "3 declared, not significant: ARCH-a, ARCH-b, ARCH-d"
```

**Recommendation.** Accept only a boolean and report anything else as `significant-value`. This
is a syntax rule, not a judgement, so DEC-0008 is untouched. Alternatively, make the query engine
use the same predicate.

---

### C-08 · P2 · Gate assertions pass vacuously on attribute typos and on empty premises

**Problem.** The built-in steps refuse unknown kinds and relations (`src/run/Builtin.ts:21-36`),
which is a strong guard. Attribute keys and values are not guarded. The kind guard also counts
every kind named in the default config as "known" (`src/graph/Query.ts:499,508-515`), including
`story`, `epic`, `actor`, `environment` and others no node has.

**Probe.**
```
$ sdp q 'risk[exposre=high, status=open]'   → 0 node(s)    (no note)
$ sdp q 'risk[exposure=hihg]'               → 0 node(s)    (no note)
$ sdp q 'requirment[maturity<ready]'        → 0 node(s) + "no kind requirment; kinds in use: …"
```
Vacuous gates in this repository today:
- MS-LCA "No high-exposure risk is left open" (`MS-LCA.md:29-30`): no risk has `exposure: high`.
- DEC-0007's "A risk is mitigated only by verified work" (`DEC-0007…md:66-67`): `sdp q 'risk[status=mitigated]'` returns 0 nodes.

**Recommendation.**
- Extend the guard: a condition key that no node of the selected kinds has fails the built-in step.
- Optionally warn when an `=` value appears on no node.
- Do not count config-default kinds as "in use" for the guard.
- Consider a built-in `Then the premise "…" holds` for gates whose meaning depends on non-empty input.

---

### C-09 · P2 · The milestone gates do not encode what the plan and DEC-0007 say

1. **MS-IOC contradicts itself.**
   - Its prose: "everything whose implementation is planned … `activity: { implementation: … }` … is implemented" (`MS-IOC.md:10-13`).
   - Its first query also requires everything whose **requirements work** (`iteration:`) falls in Construction to be verified (`:17`).
   - Under DEC-0007's discipline semantics (`DEC-0007…md:28-31`), a requirement specified in C2 and built in T1 would block IOC.
   - Today MS-IOC fails on exactly those two specs: `REQ-history-lifecycle`, `REQ-web-explorer`.
2. **MS-IOC treats unmet `@gate` scenarios as inconsistencies.** `scenario[status=failed] -verifies-> *[kind!=milestone]` (`:22`) excludes milestones but not `@gate` policies such as the Definition-of-Ready example (`REQ-maturity-gates.md:61-67`). This contradicts TERM-gate's "No gate fails …".
3. **MS-PR "Everything planned is verified"** checks only `-iteration->` (`MS-PR.md:15`). Work planned only through `activity:` and releases (`REL-0.9`, `REL-1.0`) are not checked.
4. **MS-LCA checks only `exposure=high`** (`MS-LCA.md:30`). The plan says Elaboration retires RISK-0003 (low), RISK-0006 (medium) and RISK-0008 (accepted) (`docs/delivery/plan.md:51-55`). The gate cannot see any of them, and it already passes in Inception.
5. **MS-LCO hard-codes the iteration and uses the attribute form.** `decision[iteration=I1, …]` (`MS-LCO.md:28`), not `?-iteration-> iteration[phase=inception]` like the other gates. Combined with C-03, it is bypassable.

**Recommendation.**
- Write each gate from the plan's text.
- Query plan facts only as edges, once C-03 makes edges authoritative.
- Use a phase filter, not iteration ids.
- Make MS-LCA name the risks it must see retired (`#RISK-0003|RISK-0006|RISK-0008[status=open]`), or mark those risks with a `retire-by: elaboration` link that the gate can query.

---

### C-10 · P2 · `npm run verify` does not enforce the milestone that is due now

**Problem.** Gates never fail `sdp run` (DEC-0007). `verify` is typecheck, check and run
(`package.json` scripts). The lifecycle marks MS-LCO as due (`sdp lifecycle` →
`Inception I1* ◀ now … MS-LCO gate ✔ passing`), but nothing enforces it.

**Probe** (in a scratch copy): set DEC-0009 to `status: proposed`.
```
✘ failed    MS-LCO#decisions-made-in-inception-are-accepted
230 scenario(s): 230 passed
11 gate scenario(s): 5 passed, 6 failed
run exit: 0                    # and `sdp check` → 0 error(s)
```

**Recommendation.** Add `sdp gate --due` (the gates of the current and past phases, using the
same calendar logic as `sdp lifecycle`) and put it in `verify`. Alternatively, have `verify` run
`sdp gate MS-LCO` explicitly until LCO is passed.

---

### C-11 · P2 · The architecture overview does not match the import graph, and nothing checks it

**Declared element edges.** These are `sdp q 'element -uses|reads|feeds-> element' --paths`,
from `docs/architecture/overview.md:6-33` and the ARCH files.

**Actual value imports, mapped by the overview's own module table** (`overview.md:61-75`). These
are not declared:
- ARCH-workspace → ARCH-graph-builder: `src/workspace/Workspace.ts:12` `buildProject`. The overview says workspace *feeds* parser and annotations, which it never imports.
- ARCH-workspace → ARCH-runner: `Workspace.ts:14-15` (`RunResults`, `isStepModule`). Also ARCH-runner → ARCH-workspace: `src/run/Session.ts:16`. That is an **element cycle**.
- ARCH-graph-builder → ARCH-runner: `src/graph/Build.ts:16` `verificationOf`. Also ARCH-runner → ARCH-graph-builder: `Session.ts:12` `isActive`, `isGate`. Another **cycle**. Run concepts (`isGate`, `isActive`, staleness) live in the builder.
- ARCH-architecture-view → ARCH-reports: `src/arch/Architecture.ts:13` `nodeJson`. Reports → architecture-view is declared, so that is a **cycle** too.
- ARCH-checker → ARCH-code-annotations: `src/check/Check.ts:20` `idsDeclaration`.
- ARCH-reports → ARCH-runner: `src/graph/Context.ts:15` `unmatchedSteps`.
- ARCH-mcp → ARCH-lifecycle, ARCH-runner and ARCH-cli: `src/mcp/Server.ts:12,17,20-21`. The MCP server imports `relationVocabulary` from `cli/templates.ts`.

**Why it matters.** sdp sells fitness functions and a curated architecture. Its own view is a
data-flow sketch with undefined relation semantics (`feeds`, `reads` and `uses` are not
distinguished anywhere), and three element-level cycles go unrecorded. The `annotate()` calls
themselves are true (each module is anchored to the element the table says), so the data needed to
check this already exists.

**Recommendation.** Define what `uses` means: a value import between modules anchored to
different elements. Then add a guard scenario that derives element dependencies from imports plus
`is` annotations and compares them with declared `uses`. That would be a showcase fitness
function. Then decide whether to break the cycles: move `isGate`, `isActive` and staleness into
the runner, `nodeJson` into the graph, and `relationVocabulary` into a shared module.

---

### C-12 · P2 · The decision set has gaps: missing options, a bundle, a contradiction, and unrecorded decisions

**Missing options.** DEC-0004, DEC-0005 and DEC-0007 have no Options section. Headings:
`DEC-0004: Context, Decision, Consequences`, and the same for 0005 and 0007. TERM-decision-record
requires "context, options, the decision and its consequences" (`docs/GLOSSARY.md:194-196`), and
REQ-decision-records requires the MADR-like sections (`REQ-decision-records.md:20`). DEC-0004 is
the decision the owner says REQ-npm-package threatens, and it records no alternatives: compile on
pack, a loader such as tsx, Bun or Deno, or a build step. Its title also bundles three decisions:
language and library, runtime, and no build. Only the last is threatened.

**A bundle.** DEC-0007 decides at least seven things in one record (`DEC-0007…md:21-43`):
- iteration length and plan
- milestone gates
- discipline planning
- the chart shows only the plan
- gates never fail `sdp run`
- the risk model
- the Inception rewrite policy

It cannot be partly rewritten, which matters precisely because of its own rewrite-not-supersede
policy.

**A contradiction.**
- DEC-0005's consequence says "'Ready' has a definition that a machine can check (a Definition of Ready as code)" (`DEC-0005…md:28`).
- REQ-maturity-gates says `ready` is only structural and that a DoR is the team's own gate (`REQ-maturity-gates.md:37-47`). GLOSSARY says the same (`:97-108`).

**Decisions taken in code but never recorded**, each with alternatives worth stating:
- **Implicit links** (`Build.ts:265-287`): a value that equals an id becomes an edge, and silence when it does not (C-03).
- **Evidence invalidation.** One fingerprint over *all* code and step files (`Build.ts:132-135`), so any code edit sends every verified spec back to its declared maturity until the next full run. This is a product-visible choice; it is specified in `REQ-executable-specs.md:133-136` but never weighed against per-dependency tracking.
- **Scenario identity** is a slug of the name, truncated at 64 characters (`src/parse/Gherkin.ts:188-190,228-230`). Renaming a scenario is a new scenario.
- **Inactive statuses** apply to every kind (`Session.ts:109`).
- **The merged `stage` ladder** (C-05).
- **Kind inferred from the id prefix**, with `ids` serving two purposes: the prefixes for `sdp new` and the inference (`Spec.ts:201-210`).

**Recommendation.**
- Add Options to 0004, 0005 and 0007.
- Split DEC-0004: keep "Effect 4" and "Node 24", and make "no build step" its own decision, which is the one REQ-npm-package threatens.
- Split DEC-0007 into plan/milestones, discipline planning, gate enforcement and risk model.
- Fix DEC-0005:28.
- Record the implicit-link and evidence-invalidation decisions.

---

### C-13 · P2 · Many scenarios assert on incidental wording; some are tautological or misnamed

**Problem.** Outcome steps by frequency across `specs/`, `docs/`, README and AGENTS:
- `the output contains "…"`: 127 (74 + 53)
- `the output section/line … contains`: ~35 more
- `the query … returns no results`: 26

Examples:
- `AGENTS.md`'s "Architects get suggestions, never decisions" asserts only that the output contains the sentence "what is significant is the architect's call". It would pass if `--candidates` marked nodes significant.
- "The query syntax is one --help away" asserts help wording.
- `REQ-check-rules.md:117-122` asserts exact diagnostic messages ('activity names "testing", which is not a discipline').
- `specs/quality/NFR-greppable.md:28-31` is tautological. The step "it searches each file for the ids of the nodes declared there" (`specs/steps/docs.steps.ts:130-142`) checks that an id read *from* a file occurs *in* that file. It cannot fail unless the parser invents ids. The step "an agent that explores this repository with grep" (`:124-126`) never greps.
- `NFR-no-build-step.md:24-28` passes as long as `dist/`, `build/` and `out/` are absent and `--version` exits 0.

**Why it matters.** Wording assertions make every message edit a spec edit, and they test the
label rather than the behaviour. Tautologies inflate the 230-passing count without guarding
anything.

**Recommendation.**
- Assert on `--json` and data (rule id, `node`, `file:line`) and keep wording checks to the few places where wording *is* the contract (help, hints for agents).
- Rewrite the AGENTS "suggestions" scenario to check that nothing became significant.
- Turn NFR-greppable's first scenario into a real check of the property. For example: every edge's target id occurs literally at the edge's source line, which would catch the `activity.*` and implicit-edge cases. Or delete it.

---

### C-14 · P2 · The step vocabulary already shows RISK-0002

**Evidence.** About 139 step definitions across five modules (`grep -hoE '(Given|When|Then|Step)\(\s*"[^"]+"' specs/steps/*.ts | wc -l` → 139), plus 9 built-ins. They form overlapping families:
- **Node attribute:**
  - `node {string} has attribute {word} = {string}` (`sdp.steps.ts:34`)
  - the built-in `the node {string} has {word} {string}` (`src/run/Builtin.ts:106`)
  - `the parsed spec has {word} {string}` (`components.steps.ts:42`)
- **Edges:**
  - `there is an edge …` (`sdp.steps.ts:41`)
  - `the workspace graph has edges:` (`components.steps.ts:184`)
  - `the implicit edges are …` (`:205`)
- **Query result:**
  - `the result is {string}` (`sdp.steps.ts:72`)
  - the built-in `the query {string} returns:`
  - `the result has {int} node(s)`
- **Running:**
  - `the scenarios are run`
  - `the workspace is run`, with four variants
  - `I run "sdp run"`
- **Check:** seven assertion forms, plus `building the graph reports:` and `parsing reports:`.
- **Output text:** six forms.

The loose matcher in `the check reports {string} for {string}` (`sdp.steps.ts:92`,
`d.message.includes(id)`) means `REQ-a` also matches a message about `REQ-ab`.

**Recommendation.**
- Converge on one table-driven family per subject. `components.steps.ts`'s `assertRows` is the good pattern.
- Retire the free-text duplicates.
- Add `sdp steps` (or a context section) listing defined expressions with `file:line`, so "prefer extending existing steps" is actionable without grepping five files.
- Tighten the `for {string}` matcher to `d.node === id`.

---

### C-15 · P2 · Requirement specs are mostly after-the-fact reference documentation

**Evidence.**
- REQ-cli calls itself "the reference: each command with its purpose, main flags and an example" (`REQ-cli.md:16-19`). It is 786 lines with 49 scenarios.
- Specs pin implementation constants: a 30-second step timeout (`REQ-executable-specs.md:45`), 10 000 paths and 12 hops (`ARCH-query-engine.md:28-34`).
- Every `ready` requirement is `verified`, planned `iteration: I1, activity: { implementation: I1, test: I1 }`. The plan says so: "What it verified is planned in I1" (`plan.md:34-37`).
- No requirement names a stakeholder or need beyond its first paragraph.
- No ready requirement is ahead of the code.

**Why it matters.** It is natural for a prototype written in one session. But the corpus shows the
format can *document* a system, not yet that it can *drive* one. The I1 column of the discipline
chart is history presented as plan (RISK-0007 by construction). And needs, contract and manual
cannot be told apart.

**Recommendation.** Keep the reference specs, but separate layers:
- `REQ-*` state needs and acceptance;
- element and `CLI-*` reference specs carry flags, messages and limits.

Mark retroactive planning explicitly (`planned: retroactive` or `iteration: I1` without an `activity:` claim). For the next iteration, write at least one requirement fully before its code, as a test of the process itself.

---

### C-16 · P2 · Risk records contradict the risk model

**Evidence.**
- RISK-0008 is `status: accepted` (`RISK-0008…md:5`), yet it has `mitigated-by: REQ-npm-package` (`:9`), and the plan says Elaboration *retires* it (`plan.md:51-55`). In risk management, "accepted" means it will not be mitigated.
- RISK-0008 bundles a risk (a young stack) with a known fact: Node does not strip types under `node_modules` (`:17-19`). That is an issue, not a risk.
- "accepted" also means "in force" for decisions. One query word, two meanings.

**Recommendation.**
- Split RISK-0008: keep "young stack" as accepted, and record "installed package cannot run from source" as an issue or a constraint on REQ-npm-package.
- Give risks a status vocabulary that does not collide, for example `open | mitigating | retired | accepted`, or rename the decision status to `in-force`.

---

### C-17 · P3 · Terminology overloads

- **gate**: a *maturity gate* (structural content criteria, rule `maturity-gate`, `GLOSSARY.md:93-100`) versus a *gate scenario* (run last, `:282-290`) and the `sdp gate` command. Rename the former "maturity criteria".
- **pending**: a step status (`Results.ts:3`) versus the verification value "partially automated" (`Results.ts:85`, `GLOSSARY.md:162`).
- **evidence**: the fingerprints a result recorded (`Results.ts:29-40`, `Build.ts:41-50`) versus the stages and results shown under "EVIDENCE" (`Lifecycle.ts:258`). Call the former `provenance` or `ranAgainst`.
- **status**: declared on decisions and risks, derived on scenarios, and `accepted` means different things on the two declared kinds (C-16).
- **verifies**: the sdp-made edge means "is a scenario of" (`Build.ts:176`). That is why VISION, GLOSSARY and decisions end up `verified` (C-05).
- **Quality requirement**: kind `nfr`, `type: quality|non-functional|nfr|constraint`, the attribute `quality:`, the prefix `NFR`, the folder `specs/quality/`, and the glossary term "quality requirement". Six names for one concept.
- **idea**: a maturity level, a `sdp new` template, and a folder (`specs/ideas/` holds only `draft` specs; see C-21).

### C-18 · P3 · Stale or false statements in the corpus

- `specs/capabilities/CAP-agent-collaboration.md:17`: "`grep -rn "@sdp" src/` lists every code link". In this repository it lists none; the links are `annotate()` calls. Lines 16-17 also say grepping an id finds its "code annotations", but no code links to any requirement (C-22).
- `specs/requirements/REQ-flexible-graph.md:24-25` and `REQ-curated-architecture.md:23` present comments as *the* code-linking mechanism, against DEC-0009.
- `REQ-lifecycle-view.md:51-56` (C-03).
- `DEC-0002…md:30,37` (C-01, C-03).
- `DEC-0003…md:29` and `PAT-derived-index.md:17-18` say "scenario results are the only persisted state". `.sdp/ids.d.ts` and `examples/shop/.sdp/ids.d.ts` are derived *and committed* (`git ls-files .sdp`).
- The `GLOSSARY.md:27-30` relation list is incomplete (C-01). The derived-attribute table (`:359-365`) omits the code node `doc` (DEC-0009) and `declaredIn: "code"`.

### C-19 · P3 · Plan prose contradicts plan data

- `docs/delivery/plan.md:56-57` says "The construction features are specified alongside, in E2". But `REQ-web-explorer` has `iteration: C1` and `REQ-history-lifecycle` has `iteration: C2`.
- `:62-63` says "designed in the iteration before it is built — the last two also specified there". Web explorer: built C3, designed C2, specified C1. History: built C4, designed C3, specified C2.

Nothing checks prose against data, and this happened in the plan whose risk is drift (RISK-0007).
Either generate such sentences from data (`sdp q` in the text), or keep the prose free of facts the
data holds.

### C-20 · P3 · Phase ids are bare words

`inception`, `elaboration`, `construction` and `transition` (`plan.md:8-11`) are the only
unprefixed ids. `grep -rniw elaboration specs docs README.md AGENTS.md | wc -l` → 43 hits, nearly
all prose. This defeats "ids are literal and greppable" (`NFR-greppable.md:17`, `AGENTS.md`). With
implicit links (C-03), any attribute whose value is one of these words becomes an edge. Use
`PH-elaboration` or similar, and update the `sdp new plan` template (`src/cli/templates.ts:178-181`).

### C-21 · P3 · Folders encode a declared state

`sdp new idea` writes to `specs/ideas/` (probe: `REQ-dark-mode specs/ideas/REQ-dark-mode.md`).
`specs/ideas/` now holds six `maturity: draft` specs. As a spec matures it either moves, which is
churn against "never moves", or its folder lies. Group by kind or area instead and let
`maturity` carry the state.

### C-22 · P3 · The advertised code-to-requirement link is unused in sdp itself

The MCP instructions and templates teach `annotate(pay, { implements: "REQ-…" })`
(`src/mcp/Server.ts:209`, `src/cli/templates.ts:308`). Only `examples/shop` does this. In sdp,
`sdp q 'code -*-> requirement|nfr' --ids` prints nothing. All traceability runs through elements.
That is a fine design, but then say so in AGENTS.md, or dogfood `implements` on at least the
entry points.

### C-23 · P3 · Ceremony nodes

- **Terms and principles.** There are 42 TERM nodes and 6 PRIN nodes. Their only consumers are their own lint scenarios (`GLOSSARY.md:370-374`, `VISION.md:120-121`). Context bundles show term titles, not definitions. For example, `sdp context REQ-maturity-gates` lists `<-specified-by- TERM-maturity — Maturity (term)`, so the agent still has to open the glossary.
- **Duplicated edges.** Prose mentions duplicate typed links, so the same bundle lists `-decided-by-> DEC-0005` and `-mentions-> DEC-0005`, and `<-affects- RISK-0004` and `<-mentions- RISK-0004`.

Either surface `definition` in bundles, or drop the per-term nodes and keep one glossary spec. Suppress a `mentions` edge when a typed edge between the same pair exists.

### C-24 · P3 · Planned work and the discipline chart can disagree

A node of a kind that maps to no discipline (`risk`, `policy`, `guide`, `plan`) with `iteration:`
counts as planned work in that iteration (`Lifecycle.ts:143-146`). But it appears in no discipline
row (`:115-121`), so the PLANNED WORK and DISCIPLINE ACTIVITY sections disagree silently. Either
warn (`plan-reference`: "kind X belongs to no discipline") or fall back to a named default
discipline. *(Read from the code; not probed.)*

### C-25 · P3 · AGENTS.md misleads or omits in places

I traced one change on paper: "make `[significant]` agree with `sdp arch`".
- **Which spec owns it?** There are two homes, REQ-graph-query (query semantics) and REQ-curated-architecture (significance). AGENTS gives no ownership rule. The REQ-versus-ARCH contract split exists (`overview.md:54`) but AGENTS does not mention it.
- **"Ids are literal everywhere"** (`AGENTS.md:18`) is overstated: scenario ids are slugs, code ids are `code:path#symbol`, and phase ids are words (C-20).
- **"Prefer extending existing steps"** (`AGENTS.md:37-38`) has no tool support (C-14).
- **"Do not add code that depends on a closed vocabulary"** (`AGENTS.md:51`) contradicts the code the agent will read (C-01).
- **`node src/cli/main.ts types`** (`AGENTS.md:20-21`) misses `examples/shop`. `npm run types` does both.
- **"The later milestones it reports unmet are expected"** (`AGENTS.md:41-43`) does not tell the agent how to notice that it broke the *due* one (C-10).
- **Planning new work** ("Plan work in the spec", `AGENTS.md:58-59`) gives no rule for which iteration to choose. I1 ends 2026-11-13.

---

## 3. The three changes I would make first

1. **Make the interpreted vocabulary explicit, and make DEC-0002 true (C-01).** Route every
   kind, relation, attribute and status sdp reads through one profile with defaults. Rewrite
   DEC-0002 and the glossary from it, and add the src-grep fitness scenario. This is the
   root of C-01 and part of C-06, C-07, C-17 and C-24. It is also the cheapest time to do it,
   before workspaces exist.
2. **One link model, and reserved derived attributes (C-02, C-03).** Link-ness is a property of the
   key (configured link keys and `links:`), and link keys always become edges that must resolve.
   Attributes and edges for the same key always agree. Derived names are rejected on every node
   source, and inline and code nodes do not claim maturity. This closes every route found by which
   a gate passes for the wrong reason or "verified" is declared, and it makes the gates (C-09)
   fixable.
3. **Make the scenarios carry the thesis (C-04, C-08, C-10).**
   - Kill the 13 surviving mutants that matter, M3 and M18 first.
   - Extend the built-in typo guard to attribute keys.
   - Add `sdp gate --due` to `verify`.
   - Replace sentence-matching "principle" scenarios with behavioural ones.
   - Keep the mutation harness as a periodic check.

   With no unit tests, nothing else protects the concept while it is being reshaped by changes 1 and 2.

(Next in line: split `stage` from maturity and rename `in-progress` (C-05). Treat mentions as weak
edges (C-06).)

---

## 4. What is sound and should be kept

- Files as the only source of truth, rebuilt per command, with `file:line` on every node, edge and diagnostic. Diagnostics carry rule ids and actionable hints.
- Markdown, front matter and fenced standard Gherkin, parsed by the official Cucumber parser, with `.feature` files accepted unchanged.
- Declared maturity checked structurally. `ready` is documented honestly as structural, and the Definition of Ready is left to team-written gates.
- *Undefined is not failing*, and snippets make automation incremental.
- Results bound to fingerprints and going stale visibly (`staleBecause`). The idea is right even if the granularity (C-12) deserves a decision.
- Built-in steps that refuse unknown kinds and relations and truncated results: a principled defence against vacuous assertions. Extend it (C-08); don't replace it.
- Gates run last against fresh results, never fail `sdp run`, and are enforced by `sdp gate`: a clean separation of reporting and enforcing.
- DEC-0008 as implemented: significance only marked, never computed. Candidates exclude `verifies` and `mentions` from scoring, which is the right instinct to spread to the rest (C-06).
- Typed `annotate()` read statically, with generated id types and a `types-stale` check (DEC-0009).
- The plan as graph data with `activity:` per discipline. The RUP chart drawn from the data is genuinely useful. Fix the representation (C-03); keep the idea.
- An in-memory workspace running the real pipeline. 27 of 40 mutants were killed by narrowly named scenarios, which shows the approach works where it is applied.

---

## 5. Questions for the architect

1. **Vocabulary.** Should `decision`, `milestone`, `phase`, `iteration` and `pattern` be roles that a workspace can rename (a profile), or fixed kinds that DEC-0002 names as exceptions?
2. **Implicit links.** Keep "any attribute whose value is an existing id becomes an edge", or require declared link keys? If kept, should an id-shaped value that resolves to nothing be an error?
3. **Inline and code nodes.** May inline nodes and code-declared nodes carry `maturity`? Today they bypass the maturity gates entirely.
4. **`stage`.** Is it worth keeping as one merged ladder? If kept, is `in-progress` the right word for "a scenario fails", including regressions?
5. **Mentions.** Should `-*-` include prose mentions? MS-LCA's "connected to the decisions behind it" is satisfied by a mention today.
6. **IOC semantics.** Does planning a requirement's *specification* into a Construction iteration commit to it being *verified* at IOC (MS-IOC's first query), or only its `activity.implementation`?
7. **Due gates.** Should the build fail on the milestone that is due now (`sdp gate --due` in `verify`)?
8. **Elaboration risks.** Should MS-LCA check the specific risks the plan says Elaboration retires (RISK-0003, -0006, -0008), not only `exposure=high`? And is RISK-0008 accepted, or to be mitigated?
9. **RUP disciplines.** The defaults omit the supporting disciplines (configuration and change management, project management, environment). Intended, or should risk work and the plan itself be visible as project-management activity?
10. **Requirements vs. reference.** Should `REQ-*` keep doubling as the user manual (REQ-cli), or should needs and reference be separate spec layers?
11. **Folders.** Is grouping by maturity (`specs/ideas/`) intended, given that it encodes a declared state in the path?
12. **Evidence granularity.** Should one code edit invalidate *every* result (today), or is per-dependency invalidation a goal worth a decision now?
