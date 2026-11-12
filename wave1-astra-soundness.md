# Wave 1 soundness review

## 1. Verdict

**Fix the three P1 findings before building further evidence-dependent features on this wave.** The main changes are real: ordinary/gate views, concurrent result publication, tag and lazy-import fingerprints, immutable graph copies, and read-only discovery all improve the previous state. But a clean workspace can still pass a completion gate with no execution evidence, repeated API execution can certify code it never ran, and gates can retain success after the ordinary evidence they inspected changes.

Reviewed `3139ff3..2b87280` in the supplied checkout. No tracked files changed; no commits or subagents. Created the authorized `node_modules` symlink. `npm run verify > /private/tmp/wave1-verify.log 2>&1` passed: typechecks; `0 error(s), 0 warning(s), 0 info`; `285 scenario(s): 285 passed`; `12 gate scenario(s): 7 passed, 5 failed`. The five unmet gates are expected. Excluded the explicitly deferred D8/D9/D10/D15/D18 and corpus work.

**Earlier findings: 21 closed, 10 partly closed, 1 open (32 total).** “Closed” means the original hole is closed under the approved brief, not that every related subsystem is defect-free. A-17 is closed under D13's expressly accepted best-effort fallback, not because Python strings became lexically parsed.

### Reproduction key

All commands were run from this checkout. The following exact abbreviation is used below:

```sh
sdp() {
  local fixture="$1"
  shift
  node /Users/darkomijic/.t3/worktrees/sdp-new/t3-e13373a5-0ebf9eff985b0002/src/cli/main.ts \
    -C "/private/tmp/wave1-astra/$fixture" "$@"
}
```

Fixture builders preserve the complete inputs, mutation sequences, commands, exit codes and output. Run them from the checkout; they modify only their own scratch fixtures:

| Command | Captured output |
| --- | --- |
| `python3 /private/tmp/wave1-astra/repro.py` | [old.log](/private/tmp/wave1-astra/old.log) |
| `python3 /private/tmp/wave1-astra/more.py` | [more.log](/private/tmp/wave1-astra/more.log) |
| `python3 /private/tmp/wave1-astra/final-repros.py` | [final.log](/private/tmp/wave1-astra/final.log) |
| `python3 /private/tmp/wave1-astra/attacks.py` | [attacks.log](/private/tmp/wave1-astra/attacks.log) |
| `node /private/tmp/wave1-astra/api.mjs` | [api.log](/private/tmp/wave1-astra/api.log) |
| `python3 /private/tmp/wave1-astra/more-attacks.py` | [more-attacks.log](/private/tmp/wave1-astra/more-attacks.log) |
| `python3 /private/tmp/wave1-astra/last.py` | [last.log](/private/tmp/wave1-astra/last.log) |
| `python3 /private/tmp/wave1-astra/layers.py` | [layers.log](/private/tmp/wave1-astra/layers.log) |

The first three adapt the previous scratch experiments to this checkout and `sdp/steps`. Deferred-query experiments remain in their transcripts but are not reported as findings. Individual commands below sometimes depend on intermediate file versions; use the corresponding builder to replay the entire sequence.

## 2. Status of each earlier finding

| Id | Status | Evidence |
| --- | --- | --- |
| S-01 | partly | Old lazy-import mutation now removes `REQ-lazy` from verified results; declared env/data and an outside-workspace input yield `inputs-changed`, adding a lockfile invalidates evidence. Repeated API execution remains unsound (W1S-02), and removed imports persist (W1S-07). [src/workspace/Workspace.ts:161](/Users/darkomijic/.t3/worktrees/sdp-new/t3-e13373a5-0ebf9eff985b0002/src/workspace/Workspace.ts:161). |
| S-02 | closed | `sdp tags run` passes initially; adding only `@broken` makes `q 'requirement[stage=verified]' --ids` empty before rerun fails. [src/parse/Gherkin.ts:233](/Users/darkomijic/.t3/worktrees/sdp-new/t3-e13373a5-0ebf9eff985b0002/src/parse/Gherkin.ts:233). |
| S-03 | partly | Old ordinary query fails with “tag it @gate”; old gates no longer see other gates. Custom steps confirm ordinary `project.results` empty and gate records contain only ordinary ids on both runs. Metadata dependency and wildcard guard remain (W1S-03/05). [src/run/Evidence.ts:122](/Users/darkomijic/.t3/worktrees/sdp-new/t3-e13373a5-0ebf9eff985b0002/src/run/Evidence.ts:122). |
| S-04 | closed | Replayed A-waits/B-fails race: B exits 1; A exits 0 later; final verified ids contain only `REQ-a`. The delayed run does not restore B's old pass. [src/run/Store.ts:69](/Users/darkomijic/.t3/worktrees/sdp-new/t3-e13373a5-0ebf9eff985b0002/src/run/Store.ts:69). |
| S-05 | partly | Original forged inline attributes now yield two `derived-attribute` errors, invalid maturity an error, and verified query `[]`. Relation-name bypass still passes a clean gate (W1S-01). [src/graph/Build.ts:159](/Users/darkomijic/.t3/worktrees/sdp-new/t3-e13373a5-0ebf9eff985b0002/src/graph/Build.ts:159). |
| S-09 | closed | `sdp missing check` and `run` both exit 1 with `missing-id`; run says scenarios are unread. [src/parse/Spec.ts:90](/Users/darkomijic/.t3/worktrees/sdp-new/t3-e13373a5-0ebf9eff985b0002/src/parse/Spec.ts:90); [src/run/Session.ts:86](/Users/darkomijic/.t3/worktrees/sdp-new/t3-e13373a5-0ebf9eff985b0002/src/run/Session.ts:86). |
| S-10 | closed | `sdp nodemap check` exits 1: `nodes must be a list`, at `a.md:4`. [src/parse/Spec.ts:309](/Users/darkomijic/.t3/worktrees/sdp-new/t3-e13373a5-0ebf9eff985b0002/src/parse/Spec.ts:309). |
| S-11 | closed | Original TS template containing `// @sdp is ARCH-fiction`: check clean, `q '#ARCH-fiction' --json` returns `[]`. [src/parse/Annotations.ts:73](/Users/darkomijic/.t3/worktrees/sdp-new/t3-e13373a5-0ebf9eff985b0002/src/parse/Annotations.ts:73). |
| S-13 | closed | API probe's three synchronous 30 ms handlers with 1 ms deadline all print `["failed","step timed out"]`. [src/run/Runner.ts:140](/Users/darkomijic/.t3/worktrees/sdp-new/t3-e13373a5-0ebf9eff985b0002/src/run/Runner.ts:140). |
| S-15 | closed | Original empty text fence at draft now produces `maturity-gate: no description`, exit 1. [src/check/Check.ts:61](/Users/darkomijic/.t3/worktrees/sdp-new/t3-e13373a5-0ebf9eff985b0002/src/check/Check.ts:61). |
| S-16 | partly | Original absent `toString` no longer matches; negated query returns A. Authored `__proto__` keys disappear instead (W1S-10). [src/graph/Query.ts:391](/Users/darkomijic/.t3/worktrees/sdp-new/t3-e13373a5-0ebf9eff985b0002/src/graph/Query.ts:391). |
| S-17 | closed | A and B referencing MISSING now yield two `dangling-link` errors, one at each file's line 3. [src/graph/Build.ts:355](/Users/darkomijic/.t3/worktrees/sdp-new/t3-e13373a5-0ebf9eff985b0002/src/graph/Build.ts:355). |
| C-01 | partly | Renamed adr/checkpoint/era/sprint/cites/retired drive checks, gate classification, lifecycle, wildcard exclusion and inactive execution correctly. Authoring templates ignore the profile (W1S-06). [src/cli/templates.ts:128](/Users/darkomijic/.t3/worktrees/sdp-new/t3-e13373a5-0ebf9eff985b0002/src/cli/templates.ts:128). |
| C-02 | partly | Inline and code-declared ready nodes now fail maturity checks; authored stage/verification are rejected. Authored internal kinds escape all maturity checking (W1S-11), and links forge query evidence (W1S-01). [src/check/Check.ts:128](/Users/darkomijic/.t3/worktrees/sdp-new/t3-e13373a5-0ebf9eff985b0002/src/check/Check.ts:128). |
| C-03 | partly | Top-level `iteration: I1` and embedded `links: {iteration: I1}` both match `[iteration=I1]` and produce edges; bad extra-link/activity shapes are errors. Raw comma-list scalar still invents an attribute-only target (W1S-13). [src/graph/Query.ts:423](/Users/darkomijic/.t3/worktrees/sdp-new/t3-e13373a5-0ebf9eff985b0002/src/graph/Query.ts:423). |
| C-05 | closed | Failed tag scenario reports `verification: failing`, `stage: failing`; a plain unexecuted spec without maturity has no stage. Baseline stage scenarios pass. [src/graph/Build.ts:406](/Users/darkomijic/.t3/worktrees/sdp-new/t3-e13373a5-0ebf9eff985b0002/src/graph/Build.ts:406). |
| C-06 | closed | Renamed mention `cites`: `sdp vocab q '#A -*-> #B' --ids` empty; explicit `-cites->` returns B. Query, architecture and context use the same mention predicate. [src/graph/Query.ts:490](/Users/darkomijic/.t3/worktrees/sdp-new/t3-e13373a5-0ebf9eff985b0002/src/graph/Query.ts:490); [src/graph/Context.ts:212](/Users/darkomijic/.t3/worktrees/sdp-new/t3-e13373a5-0ebf9eff985b0002/src/graph/Context.ts:212); [src/arch/Architecture.ts:34](/Users/darkomijic/.t3/worktrees/sdp-new/t3-e13373a5-0ebf9eff985b0002/src/arch/Architecture.ts:34). |
| A-01 | closed | API probe calls real `sdp_context` and `sdp_snippets` via McpTest: both `error false`; top-level workspace marker remains absent. CLI reads likewise leave it absent. [src/mcp/Server.ts:124](/Users/darkomijic/.t3/worktrees/sdp-new/t3-e13373a5-0ebf9eff985b0002/src/mcp/Server.ts:124). |
| A-02 | closed | Same passing-then-tag-edited reproduction as S-02; hash now includes pickle tags. [src/parse/Gherkin.ts:235](/Users/darkomijic/.t3/worktrees/sdp-new/t3-e13373a5-0ebf9eff985b0002/src/parse/Gherkin.ts:235). |
| A-03 | closed | API probe mutates constructor node/edge inputs and attempts nested output mutation: `nested:{x:1}, from:"a", frozen:true`; adjacency remains correct. [src/model/Graph.ts:108](/Users/darkomijic/.t3/worktrees/sdp-new/t3-e13373a5-0ebf9eff985b0002/src/model/Graph.ts:108). |
| A-04 | partly | Invalid fence closer, indented code and HTML comment no longer produce ghost links/scenarios. Link URL text is still scanned as prose (W1S-12). [src/parse/Markdown.ts:136](/Users/darkomijic/.t3/worktrees/sdp-new/t3-e13373a5-0ebf9eff985b0002/src/parse/Markdown.ts:136). |
| A-05 | closed | Concurrent partial-run race preserves both ids and the newer B failure. Tag/path selection preserves unselected results; removed scenario is pruned. [src/run/Store.ts:70](/Users/darkomijic/.t3/worktrees/sdp-new/t3-e13373a5-0ebf9eff985b0002/src/run/Store.ts:70). |
| A-07 | closed | `sdp errors new requirement 'Checkout: guest flow'` succeeds; check reports only the expected placeholder warning, no YAML error. [src/cli/templates.ts:99](/Users/darkomijic/.t3/worktrees/sdp-new/t3-e13373a5-0ebf9eff985b0002/src/cli/templates.ts:99). |
| A-08 | closed | Malformed `{typo}` expression gives `a.steps.ts:1: invalid step expression…`, exit 1; context still renders. Invalid tags `(` give one actionable message, no stack. [src/run/Runner.ts:63](/Users/darkomijic/.t3/worktrees/sdp-new/t3-e13373a5-0ebf9eff985b0002/src/run/Runner.ts:63); [src/run/Session.ts:50](/Users/darkomijic/.t3/worktrees/sdp-new/t3-e13373a5-0ebf9eff985b0002/src/run/Session.ts:50). |
| A-09 | partly | Cyclic alias now becomes a located `front-matter` diagnostic rather than a JSON crash. Undefined aliases silently become null (W1S-08). [src/parse/Markdown.ts:247](/Users/darkomijic/.t3/worktrees/sdp-new/t3-e13373a5-0ebf9eff985b0002/src/parse/Markdown.ts:247). |
| A-10 | closed | Three concurrent scenarios with yielding reporter print `start First,end First,start Second,end Second,start Third,end Third`, exactly once each. [src/run/Runner.ts:209](/Users/darkomijic/.t3/worktrees/sdp-new/t3-e13373a5-0ebf9eff985b0002/src/run/Runner.ts:209). |
| A-11 | open | API `imports-before` and `imports-after` both contain helper.ts after its import is removed. Separate-process full runs retain it too (W1S-02/07). [src/workspace/Workspace.ts:213](/Users/darkomijic/.t3/worktrees/sdp-new/t3-e13373a5-0ebf9eff985b0002/src/workspace/Workspace.ts:213); [src/run/Store.ts:74](/Users/darkomijic/.t3/worktrees/sdp-new/t3-e13373a5-0ebf9eff985b0002/src/run/Store.ts:74). |
| A-16 | closed | Two distinct local `item` annotations now produce no annotations and two “target must be a module-level declaration” diagnostics. [src/parse/TypedAnnotations.ts:168](/Users/darkomijic/.t3/worktrees/sdp-new/t3-e13373a5-0ebf9eff985b0002/src/parse/TypedAnnotations.ts:168). |
| A-17 | closed | TS string case fixed; Python triple-string reproduction still yields GHOST, expressly permitted and tested as best effort under D13. [src/parse/Annotations.ts:57](/Users/darkomijic/.t3/worktrees/sdp-new/t3-e13373a5-0ebf9eff985b0002/src/parse/Annotations.ts:57); [docs/architecture/ARCH-code-annotations.md:399](/Users/darkomijic/.t3/worktrees/sdp-new/t3-e13373a5-0ebf9eff985b0002/docs/architecture/ARCH-code-annotations.md:399). |
| A-18 | partly | Explicit `links.uses: B` now points to line 5 despite earlier B text; new named-link path discards target lines (W1S-09). [src/parse/Spec.ts:299](/Users/darkomijic/.t3/worktrees/sdp-new/t3-e13373a5-0ebf9eff985b0002/src/parse/Spec.ts:299). |
| A-19 | closed | API merges two r edges: both sources, `extra:true`, and explicit via conflict; CLI reports `link-conflict` at second declaration. [src/model/Graph.ts:56](/Users/darkomijic/.t3/worktrees/sdp-new/t3-e13373a5-0ebf9eff985b0002/src/model/Graph.ts:56); [src/graph/Build.ts:372](/Users/darkomijic/.t3/worktrees/sdp-new/t3-e13373a5-0ebf9eff985b0002/src/graph/Build.ts:372). |
| A-20 | closed | Malformed nodes map now errors; usable-id validation is shared for main and embedded ids. Baseline malformed-container scenarios pass. [src/parse/Spec.ts:222](/Users/darkomijic/.t3/worktrees/sdp-new/t3-e13373a5-0ebf9eff985b0002/src/parse/Spec.ts:222); [src/parse/Spec.ts:309](/Users/darkomijic/.t3/worktrees/sdp-new/t3-e13373a5-0ebf9eff985b0002/src/parse/Spec.ts:309). |

Additional verified boundaries: `--tags @one` retains A#two; a path run executes both; removing Two then running leaves only A#one. Copying source into an independent scratch root without `.sdp` yields `unrun`, not inherited evidence (separate roots tested, not actual new git worktrees). A pre-existing lock makes the CLI fail after 2.39 seconds including startup with the documented delete-if-no-run-active instruction; removing it permits the next run. No automatic dead-lock reclamation is promised, so that is not a finding. Crash injection mid-rename, different Node/sdp versions, live external services and literal worktree creation were not tested. Toolchain identity beyond the lockfile is source-inspected at [src/workspace/Workspace.ts:109](/Users/darkomijic/.t3/worktrees/sdp-new/t3-e13373a5-0ebf9eff985b0002/src/workspace/Workspace.ts:109).

## 3. New findings

### W1S-01 — P1 — Link names can forge derived verification in a clean workspace

**Problem:** the derived-attribute guard checks attributes, but query attribute resolution also accepts outgoing relations named `stage` and `verification`.

[src/graph/Build.ts:159](/Users/darkomijic/.t3/worktrees/sdp-new/t3-e13373a5-0ebf9eff985b0002/src/graph/Build.ts:159) filters only authored attributes; explicit edges are added separately at [src/graph/Build.ts:279](/Users/darkomijic/.t3/worktrees/sdp-new/t3-e13373a5-0ebf9eff985b0002/src/graph/Build.ts:279). [src/graph/Query.ts:420](/Users/darkomijic/.t3/worktrees/sdp-new/t3-e13373a5-0ebf9eff985b0002/src/graph/Query.ts:420) unions relation targets into queried attributes without reserving derived names.

`derived-links/a.md` declares `REQ-a`, no scenarios, `links: {stage: verified, verification: passing}`, and two target nodes with those ids. A milestone asserts that every requirement matches `requirement[stage=verified]`.

```text
sdp derived-links check
0 error(s), 0 warning(s), 0 info                         [exit 0]
sdp derived-links gate MS-gate
1 gate scenario(s): 1 passed                            [exit 0]
sdp derived-links q 'requirement[stage=verified]' --json
[{"id":"REQ-a", …, "attrs":{"scenarios":0,"verification":"none", …}}]
```

**Impact:** the central completion gate is bypassable with valid authored data, and JSON contradicts the predicate that selected it. **Smallest fix:** derived fields must resolve exclusively to computed attributes; diagnose relation/derived-field collisions rather than treating those links as attribute writes. Cover every edge origin, not just front matter. Add a gate regression using this fixture; existing direct-attribute rejection scenarios do not exercise it.

### W1S-02 — P1 — Repeated programmatic runs certify edited code using cached handlers

**Problem:** `loadSteps` imports the same Node module URL after files change, while `runWorkspace` fingerprints the new disk content.

[src/workspace/Workspace.ts:243](/Users/darkomijic/.t3/worktrees/sdp-new/t3-e13373a5-0ebf9eff985b0002/src/workspace/Workspace.ts:243) has no generation or changed-source rejection; [src/run/Session.ts:130](/Users/darkomijic/.t3/worktrees/sdp-new/t3-e13373a5-0ebf9eff985b0002/src/run/Session.ts:130) reloads current source files. The public loader and session are exported at [src/index.ts:18](/Users/darkomijic/.t3/worktrees/sdp-new/t3-e13373a5-0ebf9eff985b0002/src/index.ts:18).

```text
node /private/tmp/wave1-astra/api.mjs
imports-before [ 'helper.ts' ]
imports-after [ 'helper.ts' ]
reload-results [ 'passed' ]
reload-stage verified
sdp reload run
NEW FAILURE
1 scenario(s): 1 failed                                 [exit 1]
```

The script first loads/passes a handler, rewrites it to unconditionally throw `NEW FAILURE`, calls `loadSteps` and `runWorkspace` again, and obtains fresh verified evidence. A separate CLI process fails on exactly that file.

**Impact:** this is stronger than stale invalidation: new evidence claims execution of source never executed. **Smallest fix:** tie loaded modules to their input snapshot and reject reuse after any dependency changes, asking for a fresh process. If reload is supported, use an actual fresh module generation including dependencies. Add a two-run API scenario with a handler edit; current CLI scenarios start new processes and miss it.

### W1S-03 — P1 — Gates fingerprint statuses but can read changing result metadata

**Problem:** a gate receives full ordinary result records and `lastRun`, but its dependency digest contains only scenario ids and statuses.

[src/run/Evidence.ts:119](/Users/darkomijic/.t3/worktrees/sdp-new/t3-e13373a5-0ebf9eff985b0002/src/run/Evidence.ts:119) exposes runAt; lines 122–130 hash statuses but return complete ordinary records. [src/run/Runner.ts:195](/Users/darkomijic/.t3/worktrees/sdp-new/t3-e13373a5-0ebf9eff985b0002/src/run/Runner.ts:195) records only that digest.

The `metadata` gate compares the `runAt` values of two ordinary results; both initially come from one batch.

```text
sdp metadata run
2 scenario(s): 2 passed; 1 gate scenario(s): 1 passed
sdp metadata run REQ-a
1 scenario(s): 1 passed
sdp metadata q 'milestone[stage=verified]' --ids
MS-gate
sdp metadata gate MS-gate
different ordinary batches
1 gate scenario(s): 1 failed                            [exit 1]
```

No source or status changed between the last three commands. **Impact:** an already-false gate is reported verified. **Smallest fix:** digest the complete eligible ordinary evidence exposed to gates, or expose only the hashed projection. Exclude gate records and store-level timestamps from that projection to avoid self-invalidation. [specs/requirements/REQ-executable-specs.md:158](/Users/darkomijic/.t3/worktrees/sdp-new/t3-e13373a5-0ebf9eff985b0002/specs/requirements/REQ-executable-specs.md:158) explicitly specifies status-only hashing while lines 169–178 promise reliable layered dependencies; make those contracts agree and add a metadata-only-change scenario.

### W1S-04 — P2 — Static discovery invents registrations and silently misses real ones

**Problem:** the AST visitor treats every matching call anywhere inside the callback as a registration, ignoring control flow and bindings, while unrecognized uses of the registrar receive no diagnostic.

[src/parse/StepDefinitions.ts:115](/Users/darkomijic/.t3/worktrees/sdp-new/t3-e13373a5-0ebf9eff985b0002/src/parse/StepDefinitions.ts:115) recursively visits conditional and nested bodies; only recognized direct calls reach `register`, so alias/helper escapes disappear.

The static fixture has `if (false) Then('phantom', …)` and `const register=Then; register('hidden', …)`.

```text
sdp static check
0 error(s), 0 warning(s), 0 info
sdp static steps
… a.steps.ts:5  Then  phantom
sdp static run
2 scenario(s): 1 passed, 1 undefined
```

Runtime's passed step is **hidden**, its undefined step **phantom**. Context offers a snippet for the already implemented hidden step. API probes additionally print: alias/helper `definitions:[], problems:[]`; a two-iteration loop produces one static definition (runtime would register twice); a literal template is read; an interpolated template and re-export-only file are diagnosed. MCP/CLI do not execute code—the defect is false completeness.

**Smallest fix:** define a small supported unconditional registration form; diagnose registrar escape, conditional/loop/nested registration, and shadowing instead of guessing. Supporting all JS control flow is unnecessary. [specs/requirements/REQ-executable-specs.md:77](/Users/darkomijic/.t3/worktrees/sdp-new/t3-e13373a5-0ebf9eff985b0002/specs/requirements/REQ-executable-specs.md:77) says “anywhere in that callback,” while line 83 promises nothing unreadable is silently omitted. Narrow that wording and add the paired false-positive/false-negative fixture.

### W1S-05 — P2 — Wildcard status queries bypass the ordinary-scenario gate guard

**Problem:** the guard recognizes `status` as result-derived only when the selector explicitly names scenario kind or a scenario id.

[src/run/Builtin.ts:34](/Users/darkomijic/.t3/worktrees/sdp-new/t3-e13373a5-0ebf9eff985b0002/src/run/Builtin.ts:34) does not classify wildcard selectors as capable of selecting scenarios.

```text
sdp wildcard run
✔ passed REQ-a#hidden-failures
1 scenario(s): 1 passed                                 [exit 0]
```

Its sole step is `Then the query "*[status=failed]" returns no results`; the equivalent explicit `scenario[status=failed]` correctly fails in the old reproduction. **Impact:** an ordinary delivery-state assertion silently passes against a result-free graph. This does not leak old results, but defeats the promised corrective diagnostic. **Smallest fix:** assess whether the selector can target scenario nodes before evaluating result predicates; include wildcard cases. [specs/requirements/REQ-executable-specs.md:1151](/Users/darkomijic/.t3/worktrees/sdp-new/t3-e13373a5-0ebf9eff985b0002/specs/requirements/REQ-executable-specs.md:1151) tests only explicit selectors and remains green with this hole.

### W1S-06 — P2 — Authoring templates ignore renamed vocabulary roles

**Problem:** checks and views honor renamed roles, but `sdp new` dispatches and emits default words directly.

[src/cli/templates.ts:31](/Users/darkomijic/.t3/worktrees/sdp-new/t3-e13373a5-0ebf9eff985b0002/src/cli/templates.ts:31) compares bare kind names for numbering; line 128 switches on default kinds, and line 200 constructs literal phase/iteration nodes. The guard at [specs/steps/model.steps.ts:74](/Users/darkomijic/.t3/worktrees/sdp-new/t3-e13373a5-0ebf9eff985b0002/specs/steps/model.steps.ts:74) only detects selected graph-data expressions, so these interpretations escape it.

In `vocab`, roles are decision→adr, milestone→checkpoint, phase→era, iteration→sprint, mention→cites, inactive→retired.

```text
sdp vocab new adr 'A decision'
ADR-a-decision specs/adr/ADR-a-decision.md
sdp vocab check
… [decision-status] ADR-a-decision … got undefined
sdp vocab new plan Roadmap
PLAN-roadmap docs/delivery/PLAN-roadmap.md
sdp vocab q 'phase|iteration' --ids
inception elaboration construction transition I1 E1 C1 T1
```

The created “plan” has none of the configured lifecycle kinds; adr gets a generic requirement-like template without decision status/sections. Renamed roles do work for existing files, so this is specifically the authoring path. **Smallest fix:** pass the vocabulary into template selection/emission and number decisions by role. Add renamed-profile authoring scenarios; the currently passing DEC-0002 guard does not enforce its full claim at [docs/decisions/DEC-0002-free-form-relations.md:41](/Users/darkomijic/.t3/worktrees/sdp-new/t3-e13373a5-0ebf9eff985b0002/docs/decisions/DEC-0002-free-form-relations.md:41).

### W1S-07 — P2 — Removed imports remain fingerprint inputs forever

**Problem:** each commit unions every historical import into the store, and every future workspace load reads that union even after a complete run stops importing the file.

[src/run/Store.ts:74](/Users/darkomijic/.t3/worktrees/sdp-new/t3-e13373a5-0ebf9eff985b0002/src/run/Store.ts:74); [src/workspace/Workspace.ts:161](/Users/darkomijic/.t3/worktrees/sdp-new/t3-e13373a5-0ebf9eff985b0002/src/workspace/Workspace.ts:161).

`more-attacks.py` runs `history` with an imported helper, removes the import, performs a full successful run in a fresh process, then edits only that now-unused helper:

```text
sdp history run                         # both versions
1 scenario(s): 1 passed
sdp history q scenario --json           # after unused helper edit
… "status":"stale", "staleBecause":"code-changed" …
```

**Impact:** the dependency set depends on all past runs, not current execution; unrelated dead files continually invalidate evidence. The same-process import graph also retains the old edge (A-11), independently of persistent storage. **Smallest fix:** replace import manifests for the execution generation; retain dependencies only for live results that still need them. A full run should retire the old manifest. [specs/requirements/REQ-executable-specs.md:195](/Users/darkomijic/.t3/worktrees/sdp-new/t3-e13373a5-0ebf9eff985b0002/specs/requirements/REQ-executable-specs.md:195) now explicitly says “imported in any run,” contrary to D7's generation requirement. Add removal, not just addition/change, as a scenario.

### W1S-08 — P2 — Undefined YAML aliases silently become null

**Problem:** alias resolution returning undefined is treated as a null YAML value instead of an invalid document.

[src/parse/Markdown.ts:246](/Users/darkomijic/.t3/worktrees/sdp-new/t3-e13373a5-0ebf9eff985b0002/src/parse/Markdown.ts:246) follows `node.resolve(doc)` without checking for an unresolved target.

Fixture: `id: A` and `owner: *undefined`.

```text
sdp alias check
0 error(s), 0 warning(s), 0 info                         [exit 0]
sdp alias show A
… owner: null …
```

**Impact:** malformed source is silently rewritten, so checks operate on a different document. **Smallest fix:** fail with a located `front-matter` diagnostic when an alias cannot resolve. Add an undefined-alias scenario alongside cyclic-alias coverage; cycle detection alone does not cover this branch.

### W1S-09 — P3 — Named link keys discard YAML target locations

**Problem:** precise YAML positions survive for `links:` but are replaced by the key's line for profile-defined link attributes.

[src/parse/Spec.ts:286](/Users/darkomijic/.t3/worktrees/sdp-new/t3-e13373a5-0ebf9eff985b0002/src/parse/Spec.ts:286) recursively fabricates one shared line; [src/graph/Build.ts:309](/Users/darkomijic/.t3/worktrees/sdp-new/t3-e13373a5-0ebf9eff985b0002/src/graph/Build.ts:309) uses the same source for every generated edge.

```text
sdp locations check
A -iteration-> MISSING1 … a.md:3
A -iteration-> MISSING2 … a.md:3
A -uses-> MISSING3 … a.md:8
A -uses-> MISSING4 … a.md:9
```

MISSING1 and MISSING2 are actually at lines 4 and 5; the explicit `links.uses` examples are correctly located. **Impact:** editor fixes and “every declaration has file:line” provenance point at the container, not the declaration. **Smallest fix:** retain located values for link-key expansion rather than reconstructing them from raw attributes; test a multiline list outside `links:`.

### W1S-10 — P2 — Own `__proto__` attributes are lost during graph copying

**Problem:** assigning free-form keys into `{}` invokes the legacy `__proto__` setter rather than preserving an own field.

[src/graph/Build.ts:160](/Users/darkomijic/.t3/worktrees/sdp-new/t3-e13373a5-0ebf9eff985b0002/src/graph/Build.ts:160) does this at the top level; [src/model/Graph.ts:181](/Users/darkomijic/.t3/worktrees/sdp-new/t3-e13373a5-0ebf9eff985b0002/src/model/Graph.ts:181) repeats it in nested frozen copies.

Fixture A declares `__proto__: {valid: true}` and `meta: {__proto__: {valid: true}}`.

```text
sdp prototype q '#A[__proto__]' --ids
<empty>
sdp prototype q '#A[meta.__proto__]' --ids
<empty>
sdp prototype q '#A[toString]' --ids
<empty>
```

The last result correctly closes the original inherited-property bug; the first two incorrectly discard authored own data. **Impact:** legal free-form metadata cannot round-trip or be queried. **Smallest fix:** use `Object.fromEntries` or null-prototype objects for arbitrary-key copies. Add authored prototype-named-key scenarios, not only absent-key tests.

### W1S-11 — P2 — Authoring an internal kind bypasses every maturity check

**Problem:** the checker identifies generated nodes by their free-form kind, excluding authored specs and embedded nodes with those same names.

[src/check/Check.ts:128](/Users/darkomijic/.t3/worktrees/sdp-new/t3-e13373a5-0ebf9eff985b0002/src/check/Check.ts:128) removes every `scenario`, `code` and `missing` before maturity validation.

Fixture A is a file spec with `kind: code, maturity: ready`; embedded E has `kind: scenario, maturity: ready`, F has `kind: missing, maturity: unknown`. None has a description or scenario.

```text
sdp reserved check
0 error(s), 0 warning(s), 0 info                         [exit 0]
sdp reserved q '*[stage=ready]' --ids
A
E
```

**Impact:** D3's “every node that declares maturity” is false, including invalid maturity values. **Smallest fix:** distinguish generated identity/origin from authored kind when selecting nodes to check—or simply check every node actually carrying maturity. Add authored nodes using the internal kind words.

### W1S-12 — P2 — Wiki-links inside Markdown link destinations become graph edges

**Problem:** after blanking code/HTML nodes, the parser scans remaining raw Markdown, including URL destinations that are not prose.

[src/parse/Markdown.ts:136](/Users/darkomijic/.t3/worktrees/sdp-new/t3-e13373a5-0ebf9eff985b0002/src/parse/Markdown.ts:136) scans raw remaining lines; [src/parse/Markdown.ts:279](/Users/darkomijic/.t3/worktrees/sdp-new/t3-e13373a5-0ebf9eff985b0002/src/parse/Markdown.ts:279) applies the wiki-link regex without AST context.

The Markdown fixture contains `[web](https://example.com/[[URL]])` plus the old invalid-fence/indented-code/comment probes.

```text
sdp markdown check
error [dangling-link] A -mentions-> URL … a.md:17
sdp markdown graph -f json
… {"from":"A","rel":"mentions","to":"URL","source":"a.md:17"} …
```

The old ghost scenarios and code/comment links are gone, but the hidden URL manufactures a reference. **Smallest fix:** collect wiki-links from prose/text AST nodes with their source spans, excluding destination/title/definition syntax. Add a link-destination fixture; CommonMark fence tests alone cannot catch this.

### W1S-13 — P2 — A link key retains a raw value that has no corresponding edge

**Problem:** query attribute resolution unions raw authored scalar text with normalized edge targets instead of using one canonical link value.

[src/parse/Spec.ts:259](/Users/darkomijic/.t3/worktrees/sdp-new/t3-e13373a5-0ebf9eff985b0002/src/parse/Spec.ts:259) splits comma-delimited targets; [src/graph/Query.ts:423](/Users/darkomijic/.t3/worktrees/sdp-new/t3-e13373a5-0ebf9eff985b0002/src/graph/Query.ts:423) adds the unsplit scalar back.

Fixture A declares `iteration: I1,I2` and declares I1/I2 as iterations.

```text
sdp union q '#A[iteration="I1,I2"]' --ids
A
sdp union q '#A -iteration-> *' --ids
I1
I2
```

There is no target `I1,I2`. The normal I1 spelling works, but DEC-0010's attribute/edge equivalence fails for an accepted link shape. **Smallest fix:** for declared link keys, queries should read normalized targets only; diagnose mixed value/link declarations rather than union incompatible representations. Add one comma-list/object-shape equivalence scenario.

## 4. Questions for the architect

1. Is stratification a contract of the supplied `project` view, or a restriction on all code a step can invoke? The supplied view passed direct custom-step probes: no ordinary results; no gate results in a gate. But public `loadProject(root)` explicitly defaults to all results ([src/workspace/Workspace.ts:179](/Users/darkomijic/.t3/worktrees/sdp-new/t3-e13373a5-0ebf9eff985b0002/src/workspace/Workspace.ts:179)), and custom steps can perform arbitrary IO. That bypass is **source-inspected, not executed here**. If fresh reads inside steps are supported, make a layer-aware read path the default during execution; otherwise state that reloading results is outside the evidence contract. Hard sandboxing is not needed to fix W1S-03/05 and should not be inferred from this question.
2. Is a process intentionally allowed only one immutable workspace execution generation? If so, enforce and document that boundary rather than allowing W1S-02 to publish misleading evidence. A clear restart error is sufficient at inception.

No additional architecture elements or abstractions are proposed. The fixes above can stay inside the existing parser, profile, query, loader, evidence and store boundaries.
