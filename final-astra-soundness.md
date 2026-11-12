# Final soundness review

## 1. Verdict

**Do not replace main yet. Fix F-S-01–03 first.** A run can certify deleted code, `gate --record` can close a milestone on evidence it already knows is stale, and a dropped authored link can be asserted absent by a passing scenario and reported as a complete empty answer by both CLI and MCP.

Reviewed `de618eec985e5b4b7724c9cf8208b71b1dc13543`. No tracked files changed, no commits, no subagents. Added the authorized `node_modules` symlink. This checkout has **241 rules and 368 scenarios**. `npm run verify` passed: `0 error(s), 0 warning(s), 0 info`; `349 scenario(s): 349 passed`; `19 gate scenario(s): 8 passed, 11 failed`. The eleven expected future gates are not findings. The scratch-copy control run produced the same result.

[Baseline log](/private/tmp/final-astra/baseline.log), [scratch-copy control](/private/tmp/final-astra/copy-baseline.log). The probes and their full stdout, stderr and exit codes are retained in [/private/tmp/final-astra](/private/tmp/final-astra). Commands below use this exact abbreviation:

```sh
sdp() {
  local fixture="$1"
  shift
  node /Users/darkomijic/.t3/worktrees/sdp-new/t3-c5f2aa8c-8166119757215c15/src/cli/main.ts \
    -C "/private/tmp/final-astra/$fixture" "$@"
}
```

The Python builders recreate the fixture files; sequences that change files must be replayed with their builder, not just their final CLI command. All behavioural findings below were reproduced. Source-only conclusions are marked separately.

## 2. Findings

### F-S-01 — P1 — A second run certifies a deleted imported module using Node's cached code

`changed()` checks only files that still exist, so deleting a loaded helper removes it from the comparison and the new evidence fingerprint while its cached implementation still executes.

**Location:** [src/workspace/Workspace.ts:307](/Users/darkomijic/.t3/worktrees/sdp-new/t3-c5f2aa8c-8166119757215c15/src/workspace/Workspace.ts:307) compares `sources.filter(...)`; [src/workspace/Workspace.ts:177](/Users/darkomijic/.t3/worktrees/sdp-new/t3-c5f2aa8c-8166119757215c15/src/workspace/Workspace.ts:177) reads imports through `readFiles`, which omits absent files; [src/workspace/Workspace.ts:184](/Users/darkomijic/.t3/worktrees/sdp-new/t3-c5f2aa8c-8166119757215c15/src/workspace/Workspace.ts:184) silently leaves them out of the fingerprint.

**Reproduction:** `python3 /private/tmp/final-astra/evidence.py` creates `delete-import`: a step imports `value=1` from `helper.ts`, passes, deletes the helper, then calls the public `run(root)` again in the same process. [Builder](/private/tmp/final-astra/evidence.py), [API script](/private/tmp/final-astra/delete-import.mjs), [output](/private/tmp/final-astra/evidence.log).

```text
node /private/tmp/final-astra/delete-import.mjs
first  ... "complete":true ... "passed":1 ... "sources":"68910fad3396" ...
second ... "complete":true ... "passed":1 ... "sources":"aa92b2afdf32" ...

sdp delete-import q 'requirement[stage=verified]' --ids
REQ-a                                                     [exit 0]
sdp delete-import run
steps/a.ts: could not load step definitions: Cannot find module '/private/tmp/final-astra/delete-import/helper.ts' imported from /private/tmp/final-astra/delete-import/steps/a.ts
                                                          [exit 1]
```

The two JSON lines above are excerpts; the full records are in the output. A fresh reader trusts the second result even though a fresh runner cannot execute that workspace. This is the remaining W1S-02 hole, not an untracked external-input issue.

**Smallest fix:** compare the required set of loaded module paths against the current files as well as comparing their contents. A missing loaded module is `SourcesChanged`; refuse publication. Add deletion beside the existing same-process edit scenario.

### F-S-02 — P1 — `gate --record` records a milestone after its passing result has become stale

Recording uses the batch's raw passed count, reads the current milestone file and appends `@met`, without checking that the gate or its dependencies are still those that passed.

**Location:** [src/app/Running.ts:280](/Users/darkomijic/.t3/worktrees/sdp-new/t3-c5f2aa8c-8166119757215c15/src/app/Running.ts:280)–288; the report's `passed` ignores staleness at [src/app/Running.ts:211](/Users/darkomijic/.t3/worktrees/sdp-new/t3-c5f2aa8c-8166119757215c15/src/app/Running.ts:211).

**Reproduction:** the `gate-change` part of `python3 /private/tmp/final-astra/evidence.py` starts a gate with a 1.5-second step, then changes `Then pause` to `Then never implemented` after 0.8 seconds. Same [builder](/private/tmp/final-astra/evidence.py) and [output](/private/tmp/final-astra/evidence.log).

```text
sdp gate-change gate MS-a --record
✔ passed    MS-a#s specs/ms.feature:4
1 gate scenario(s) of MS-a: 1 passed
MS-a is recorded as met: 2026-11-12
stale: 1 earlier result(s) no longer count (1 scenario-changed); run them again
                                                          [exit 0]
```

The resulting file contains both `@met=2026-11-12` and `Then never implemented`. Subsequently:

```text
sdp gate-change gate MS-a --json
{ "complete": true, "notes": [], "data": { "passed": true, ...,
  "scenarios": [], "milestone": "MS-a", "met": "2026-11-12" } }
                                                          [exit 0]
sdp gate-change lifecycle
MILESTONES  (2026-11-12 · every milestone is met · no iteration today)
  ✔ MS-a  M        met 2026-11-12
...                                                       [exit 0]
```

A legitimate edit during a slow gate permanently closes the *new*, unexecuted criterion. Closed milestones intentionally do not rerun, making this more serious than a transient stale report.

**Smallest fix:** immediately before recording, require the selected gate results to remain passing under the current evidence view, and require the milestone content being amended to match the version evaluated. Refuse recording on a mismatch; also recheck the recording preconditions against that current project. A stale-count check alone is insufficient because it includes unrelated scenarios and does not identify the selected gate.

### F-S-03 — P1 — Dropped annotations and links leave answers complete and can prove false absence

The completeness classifier omits `annotation` and `link-syntax`, although those diagnostics explicitly discard authored facts and links.

**Location:** [src/model/Diagnostic.ts:43](/Users/darkomijic/.t3/worktrees/sdp-new/t3-c5f2aa8c-8166119757215c15/src/model/Diagnostic.ts:43); dropped edges at [src/graph/Build.ts:308](/Users/darkomijic/.t3/worktrees/sdp-new/t3-c5f2aa8c-8166119757215c15/src/graph/Build.ts:308); all answers use this classifier at [src/app/Answer.ts:26](/Users/darkomijic/.t3/worktrees/sdp-new/t3-c5f2aa8c-8166119757215c15/src/app/Answer.ts:26), as do built-in query assertions at [src/run/Builtin.ts:67](/Users/darkomijic/.t3/worktrees/sdp-new/t3-c5f2aa8c-8166119757215c15/src/run/Builtin.ts:67).

**Reproduction:** `python3 /private/tmp/final-astra/probe.py`, then `python3 /private/tmp/final-astra/guards.py`. `absence` contains `REQ-a` with `@uses=value @uses:REQ-b`; a separate `REQ-b -uses-> REQ-c` makes `uses` a known relation. REQ-a's scenario asserts that its written link to REQ-b is absent. [Inputs](/private/tmp/final-astra/guards.py), [output](/private/tmp/final-astra/guards.log).

```text
sdp absence check
error [link-syntax] REQ-a -uses-> REQ-b: uses is already an attribute of REQ-a, so a link from it cannot have that name; the link is ignored  specs/a.feature:1
1 error(s), 0 warning(s), 0 info                           [exit 1]
sdp absence run
✔ passed    REQ-a#s specs/a.feature:4
1 scenario(s): 1 passed                                   [exit 0]
sdp absence q '#REQ-a -uses-> #REQ-b' --json
{ "complete": true, "notes": [], "data": { "nodes": [] } }
                                                          [exit 0]
sdp absence graph -q '#REQ-a -uses-> #REQ-b'
<no stdout or stderr>                                     [exit 0]
```

`python3 /private/tmp/final-astra/api-more.py` calls the real MCP registrations through McpTest. `node /private/tmp/final-astra/mcp.mjs` prints:

```text
{"content":[{"type":"text","text":"nothing"}],"isError":false}
```

The JSON call returns the same complete empty envelope, `isError:false`. [MCP output](/private/tmp/final-astra/api-more.log). An empty `@owner=` on a Scenario likewise produces `check` error, `run` pass and a complete verified answer (`ignored` in [probe.log](/private/tmp/final-astra/probe.log)).

**Smallest fix:** classify diagnostics that discarded authored input as unread, including annotation and link-syntax errors. Existing answer, built-in assertion and run guards then carry that loss consistently. Do not weaken the collision rejection: the rejection itself fixed W1S-01 correctly.

### F-S-04 — P2 — Invalid identity values and annotation-shaped tags silently become something else

An explicitly written but unusable identity falls back to a path-based suite, and tags with separators but unsupported key spellings become ordinary Cucumber tags without a diagnostic.

**Location:** [src/parse/Spec.ts:65](/Users/darkomijic/.t3/worktrees/sdp-new/t3-c5f2aa8c-8166119757215c15/src/parse/Spec.ts:65)–68, [src/parse/Spec.ts:139](/Users/darkomijic/.t3/worktrees/sdp-new/t3-c5f2aa8c-8166119757215c15/src/parse/Spec.ts:139), [src/parse/Gherkin.ts:166](/Users/darkomijic/.t3/worktrees/sdp-new/t3-c5f2aa8c-8166119757215c15/src/parse/Gherkin.ts:166) and [src/parse/Gherkin.ts:191](/Users/darkomijic/.t3/worktrees/sdp-new/t3-c5f2aa8c-8166119757215c15/src/parse/Gherkin.ts:191).

**Reproduction:** `python3 /private/tmp/final-astra/probe.py`; [full output](/private/tmp/final-astra/probe.log).

```text
# identity/specs/a.feature starts: @id=true @kind=false
sdp identity check
0 error(s), 0 warning(s), 0 info                           [exit 0]
sdp identity q '*' --json
... "complete":true ... "id":"feature:specs/a.feature","kind":"feature" ...
                                                          [exit 0]

# badkey/specs/a.feature starts: @id=REQ-a @_owner=core @1team=core @=bad @:REQ-b
sdp badkey check
0 error(s), 0 warning(s), 0 info                           [exit 0]
sdp badkey q '*' --json
... "tags":["_owner=core","1team=core","=bad",":REQ-b"] ...
                                                          [exit 0]
```

`@id:REQ-b` also checks clean and declares a path-based suite, not REQ-b. A dotted key with an empty segment, `@owner..team=core`, becomes an object with an empty-string property rather than being rejected (`dotted` fixture). These slips can remove a requirement from kind queries and exempt its scenarios from the Rule requirement. This is distinct from an intentionally id-less foreign suite.

**Smallest fix:** distinguish absent identity from invalid written identity; validate `id`/`kind` as single scalar identity strings (or explicitly coerce supported scalar ids). Reserve their `=` spelling. For separator-bearing tags, either support the key or diagnose it; reject empty dotted segments. Apply the same grammar at every level. Preserve ordinary separator-free Cucumber tags.

### F-S-05 — P2 — A directory containing only Markdown specs is silently invisible

Markdown detection searches only directories in which a matching Feature was already found.

**Location:** [src/workspace/Workspace.ts:167](/Users/darkomijic/.t3/worktrees/sdp-new/t3-c5f2aa8c-8166119757215c15/src/workspace/Workspace.ts:167)–168. The promise is [specs/requirements/REQ-check-rules.feature:121](/Users/darkomijic/.t3/worktrees/sdp-new/t3-c5f2aa8c-8166119757215c15/specs/requirements/REQ-check-rules.feature:121).

**Reproduction:** `python3 /private/tmp/final-astra/probe.py` creates `mdonly/specs/a.md` and configures `features: ["specs/**/*.feature"]`; [output](/private/tmp/final-astra/probe.log).

```text
sdp mdonly check
0 error(s), 0 warning(s), 0 info                           [exit 0]
sdp mdonly q requirement --json
{ "complete": true, "notes": [], "data": { "nodes": [] } }
                                                          [exit 0]
```

The same Markdown file beside `b.feature` produces `warn [not-a-spec]` (`mdadjacent`), but queries still have `complete:true, notes:[]`. The first case misses even the intended migration safeguard, precisely when an agent starts a new directory using the old format.

**Smallest fix:** discover candidate `.md` files from the configured feature search scope, independently of already-found features. Regarding the question about `complete`: if Markdown is outside the source language, complete-over-supported-input is defensible, but suppressing even its warning on normal reading commands is poor guidance. Carry `not-a-spec` as a note on those answers; if “complete” instead means all apparent authored specs were read, make it incomplete. The undiscovered file is the definite defect here; the choice between those two meanings is an architect question.

### F-S-06 — P2 — A structurally invalid spec can still be certified verified

`scenario-outside-rule` is an error, but the execution guard ignores it and publishes passing evidence for the invalid spec.

**Location:** [src/parse/Spec.ts:73](/Users/darkomijic/.t3/worktrees/sdp-new/t3-c5f2aa8c-8166119757215c15/src/parse/Spec.ts:73), [src/app/Running.ts:61](/Users/darkomijic/.t3/worktrees/sdp-new/t3-c5f2aa8c-8166119757215c15/src/app/Running.ts:61), [src/model/Diagnostic.ts:43](/Users/darkomijic/.t3/worktrees/sdp-new/t3-c5f2aa8c-8166119757215c15/src/model/Diagnostic.ts:43).

**Reproduction:** `outside` in `python3 /private/tmp/final-astra/probe.py` has an identified Feature with a top-level Scenario and one passing built-in step. [Output](/private/tmp/final-astra/probe.log).

```text
sdp outside check
error [scenario-outside-rule] REQ-a: "S" is an example of no rule  specs/a.feature:3
1 error(s), 0 warning(s), 0 info                           [exit 1]
sdp outside run
✔ passed    REQ-a#s specs/a.feature:3
1 scenario(s): 1 passed                                   [exit 0]
sdp outside q 'requirement[stage=verified]' --ids
REQ-a                                                     [exit 0]
```

D22 says Rules are enforced, not optional. Currently a gate asking for verified requirements can accept this file; only a separate diagnostic assertion saves it.

**Smallest fix:** make this structural format error refuse execution of identified specs, independently of whether it means incomplete graph data. Keep the explicit foreign-suite exception only if intended (see questions). There is no need to make every maturity or planning warning block runs.

### F-S-07 — P2 — Static step discovery still reports a complete inventory that disagrees with execution

The scanner accepts unexported modules and unreachable registrations, and misses additional modules created through an alias once it has found one conventional module.

**Location:** [src/parse/StepDefinitions.ts:122](/Users/darkomijic/.t3/worktrees/sdp-new/t3-c5f2aa8c-8166119757215c15/src/parse/StepDefinitions.ts:122) walks registration statements without checking a preceding return; [src/parse/StepDefinitions.ts:138](/Users/darkomijic/.t3/worktrees/sdp-new/t3-c5f2aa8c-8166119757215c15/src/parse/StepDefinitions.ts:138) treats exported and unexported declarations alike; [src/parse/StepDefinitions.ts:155](/Users/darkomijic/.t3/worktrees/sdp-new/t3-c5f2aa8c-8166119757215c15/src/parse/StepDefinitions.ts:155) only diagnoses absence when *no* conventional module was found. Runtime loads exports only at [src/workspace/Workspace.ts:287](/Users/darkomijic/.t3/worktrees/sdp-new/t3-c5f2aa8c-8166119757215c15/src/workspace/Workspace.ts:287).

**Reproduction:** `python3 /private/tmp/final-astra/more.py`; [fixtures and output](/private/tmp/final-astra/more.log).

| Fixture and exact commands | Static answer | Runtime answer |
| --- | --- | --- |
| `sdp early-return steps --json`; `sdp early-return run` | `complete:true, notes:[]`, definition `phantom` | `1 scenario(s): 1 undefined` |
| `sdp unexported steps --json`; `sdp unexported run` | Same complete `phantom` definition | `1 scenario(s): 1 undefined`; note to export the module |
| `sdp extra-module steps --json`; `sdp extra-module run` | `complete:true, notes:[]`, workspace definition `real` only | `1 scenario(s): 1 passed` for step `hidden` |

All six commands exit 0. The first callback contains `return; Then('phantom',...)`; the second is `const unused = defineSteps(...)`; the third exports both a normal module and `const define=defineSteps; export const hidden=define(...)`. Thus context can claim a definition exists when it does not, or recommend writing a step that already exists.

**Smallest fix:** limit a complete inventory to statically identifiable exported modules and straight-line registrations. Diagnose early control flow and escapes of the imported factory even when another module was readable. Do not execute arbitrary module code to discover it. W1S-04 is partly fixed, not closed.

### F-S-08 — P2 — A date-shaped non-date closes a milestone and passes the entire corpus when emitted by `--record`

`metOn` validates the shape of a date, not its validity, so `2026-99-99` records completion and prevents the gate from running.

**Location:** [src/model/Vocabulary.ts:190](/Users/darkomijic/.t3/worktrees/sdp-new/t3-c5f2aa8c-8166119757215c15/src/model/Vocabulary.ts:190)–192; the recording assertion at [specs/requirements/REQ-cli.feature:898](/Users/darkomijic/.t3/worktrees/sdp-new/t3-c5f2aa8c-8166119757215c15/specs/requirements/REQ-cli.feature:898) checks only the `@met=20` prefix.

**Reproduction:** `bad-date` in `python3 /private/tmp/final-astra/more.py` contains `@id=MS-a @met=2026-99-99 @version=1.0` and an unimplemented gate. [Output](/private/tmp/final-astra/more.log).

```text
sdp bad-date check
0 error(s), 0 warning(s), 0 info                           [exit 0]
sdp bad-date gate MS-a
MS-a was met on 2026-99-99: it is closed, and its gate does not run again
                                                          [exit 0]
sdp bad-date lifecycle
MILESTONES  (2026-11-12 · every milestone is met · no iteration today)
  ✔ MS-a  M        met 2026-99-99
...                                                       [exit 0]
```

A scratch mutation that changes the recorder to `DateTime.formatIsoDate(yield* DateTime.now).slice(0, 4) + "-99-99"` also passes `npm run verify`: **349 passed, the same 11 expected unmet gates**, exit 0. [Mutation driver](/private/tmp/final-astra/mutation-extra.py), [log](/private/tmp/final-astra/05-cli-valid.log).

**Smallest fix:** validate a real calendar date by strict parse and round-trip, and assert the recorded date equals the controlled clock's date. This is not a demand to authenticate hand-written `@met`; D20 explicitly leaves that to review.

### F-S-09 — P2 — Two built-in typo guards can pass on nonexistent fields or severities

A missing node attribute is stringified to `"undefined"`, and severity lookup accepts inherited object properties.

**Location:** [src/run/Builtin.ts:136](/Users/darkomijic/.t3/worktrees/sdp-new/t3-c5f2aa8c-8166119757215c15/src/run/Builtin.ts:136) and [src/run/Builtin.ts:157](/Users/darkomijic/.t3/worktrees/sdp-new/t3-c5f2aa8c-8166119757215c15/src/run/Builtin.ts:157).

**Reproduction:** `python3 /private/tmp/final-astra/guards.py` writes two scenarios:

```gherkin
Then the node "REQ-a" has maturty "undefined"
Then there are no constructor diagnostics
```

```text
sdp guards run
✔ passed    REQ-a#typo specs/a.feature:4
✔ passed    REQ-a#severity specs/a.feature:6
2 scenario(s): 2 passed                                   [exit 0]
```

[Output](/private/tmp/final-astra/guards.log). These are vacuous successful assertions, contrary to the built-in trust rule. `vocabulary.words` correctly handles intentional empty queries in the existing scenarios; it should not be necessary to use query syntax to get a typo check.

**Smallest fix:** own-property-check the severity table; validate the node assertion's key against the same known-attribute rules used for query assertions, and distinguish an absent value from a literal string value `undefined`.

### F-S-10 — P2 — Lifecycle chooses a different next milestone from the recording order

Milestones sort by the *start-order position* of their closing iteration, while `unmetBefore` compares their end dates; overlapping iterations make the two disagree.

**Location:** [src/lifecycle/Lifecycle.ts:159](/Users/darkomijic/.t3/worktrees/sdp-new/t3-c5f2aa8c-8166119757215c15/src/lifecycle/Lifecycle.ts:159), [src/lifecycle/Lifecycle.ts:216](/Users/darkomijic/.t3/worktrees/sdp-new/t3-c5f2aa8c-8166119757215c15/src/lifecycle/Lifecycle.ts:216)–225 and [src/lifecycle/Lifecycle.ts:275](/Users/darkomijic/.t3/worktrees/sdp-new/t3-c5f2aa8c-8166119757215c15/src/lifecycle/Lifecycle.ts:275).

**Reproduction:** `python3 /private/tmp/final-astra/plan.py` creates I1 = January 1–December 31 and I2 = February 1–March 1, each closed by a milestone. [Output](/private/tmp/final-astra/plan.log).

```text
sdp overlap check
0 error(s), 0 warning(s), 0 info                           [exit 0]
sdp overlap lifecycle
MILESTONES  (2026-11-12 · project at MS-long · calendar in I1)
  ▶ MS-long   long     I1*  2026-12-31  0/1
    MS-short  short    I2   2026-03-01  0/1  late 256d
...                                                       [exit 0]
sdp overlap gate MS-long --record
MS-long cannot be met before MS-short, which is dated before it and is not met
                                                          [exit 1]
```

The supposedly current milestone is not the first milestone that may be closed. A phase's end is also taken from its last iteration by start-order, rather than the maximum end.

**Smallest fix:** use one chronological milestone order for position and recording, with phase end derived from its latest end date. If overlapping iterations are outside the model, reject them explicitly instead; the current model accepts them without warning.

### F-S-11 — P2 — Moving the last criterion out of a met milestone makes `sdp gate` fail

The command requires a remaining gate scenario before checking whether the milestone is already closed.

**Location:** [src/app/Running.ts:268](/Users/darkomijic/.t3/worktrees/sdp-new/t3-c5f2aa8c-8166119757215c15/src/app/Running.ts:268)–276.

**Reproduction:** `closed-empty` in `python3 /private/tmp/final-astra/boundaries.py` is a two-line milestone with `@met=2026-11-12 @version=1.0`. [Output](/private/tmp/final-astra/boundaries.log).

```text
sdp closed-empty check
0 error(s), 0 warning(s), 0 info                           [exit 0]
sdp closed-empty gate MS-a
MS-a has no gate scenarios: gates are the scenarios of milestones and scenarios tagged @gate
                                                          [exit 1]
sdp closed-empty lifecycle
... every milestone is met ...
  ✔ MS-a  Released        met 2026-11-12                   [exit 0]
```

D20 explicitly tells the team to move lasting criteria to their owning specs in the closing commit. Doing so to the last criterion breaks the promised closed-milestone command behaviour.

**Smallest fix:** after resolving the spec, return the closed-milestone answer before requiring executable gate scenarios. An unmet milestone with no scenarios should still be refused.

## 3. Earlier findings still open or partly closed after wave 1

“Closed” below means the original mechanism is closed, not that every adjacent path is sound. Baseline scenarios are runtime evidence; “source-only” means I did not independently replay that old fixture.

| Earlier finding | Final status and evidence |
| --- | --- |
| W1S-01; S-05 / C-02 | Original forged verification link closed: `sdp forged check` rejects `stage` as `link-syntax`; it is absent from the exported attributes. [src/graph/Build.ts:308](/Users/darkomijic/.t3/worktrees/sdp-new/t3-c5f2aa8c-8166119757215c15/src/graph/Build.ts:308). New completeness consequence is F-S-03. |
| W1S-02; S-01 / A-11 | **Partly closed.** Same-process content edit now raises `SourcesChanged` (exact run in [api-more.log](/private/tmp/final-astra/api-more.log)); deletion still certifies cached code, F-S-01. |
| W1S-03; S-03 | Closed for the supplied gate view. [src/run/Evidence.ts:129](/Users/darkomijic/.t3/worktrees/sdp-new/t3-c5f2aa8c-8166119757215c15/src/run/Evidence.ts:129) hides lastRun; line 138 hides raw results; ordinary status/staleness is what the fingerprint covers. The real scenario at [specs/requirements/REQ-executable-specs.feature:1087](/Users/darkomijic/.t3/worktrees/sdp-new/t3-c5f2aa8c-8166119757215c15/specs/requirements/REQ-executable-specs.feature:1087) passed, including raw-results and lastRun probes. Arbitrary custom-step IO remains outside this supplied-view contract. |
| W1S-04 | **Partly closed**, F-S-07. Conditions, loops and registrar aliases are diagnosed in the baseline tests; unexported/early-return/extra-factory cases still lie. |
| W1S-05; S-03 | Closed: wildcard selectors are checked at [src/run/Builtin.ts:48](/Users/darkomijic/.t3/worktrees/sdp-new/t3-c5f2aa8c-8166119757215c15/src/run/Builtin.ts:48); the `*[status=failed]` baseline example passed its expected refusal assertion at [specs/requirements/REQ-executable-specs.feature:1083](/Users/darkomijic/.t3/worktrees/sdp-new/t3-c5f2aa8c-8166119757215c15/specs/requirements/REQ-executable-specs.feature:1083). |
| W1S-06; C-01 | Closed by role-driven template dispatch at [src/app/Templates.ts:43](/Users/darkomijic/.t3/worktrees/sdp-new/t3-c5f2aa8c-8166119757215c15/src/app/Templates.ts:43) and numbering at line 63; renamed-vocabulary authoring examples pass in the baseline. No new independent renamed-profile fixture in this review. |
| W1S-07; S-01 / A-11 | Closed for fresh-process import retirement: remove import, run fully, edit unused helper, then `q requirement[stage=verified] --ids` still prints REQ-a, exit 0 ([api-more.log](/private/tmp/final-astra/api-more.log)). [src/run/Store.ts:72](/Users/darkomijic/.t3/worktrees/sdp-new/t3-c5f2aa8c-8166119757215c15/src/run/Store.ts:72) retains manifests only while results name them. Same-process execution intentionally requires unchanged loaded code; F-S-01 is its remaining gap. |
| W1S-08; A-09 | Removed with the Markdown/YAML spec parser. Config YAML remains a different boundary; not asserting all alias handling everywhere is fixed. |
| W1S-09; A-18 | Old YAML container-line loss removed with that format. Tag links retain `tag.location.line`, [src/parse/Gherkin.ts:199](/Users/darkomijic/.t3/worktrees/sdp-new/t3-c5f2aa8c-8166119757215c15/src/parse/Gherkin.ts:199); located repeated-link and parser scenarios pass. |
| W1S-10; S-16 | Graph copy fix closed: arbitrary keys use `Object.fromEntries`, [src/model/Graph.ts:191](/Users/darkomijic/.t3/worktrees/sdp-new/t3-c5f2aa8c-8166119757215c15/src/model/Graph.ts:191). The nested `owner.__proto__.valueOf` fixture passes at [specs/requirements/REQ-flexible-graph.feature:25](/Users/darkomijic/.t3/worktrees/sdp-new/t3-c5f2aa8c-8166119757215c15/specs/requirements/REQ-flexible-graph.feature:25). Top-level underscore-prefixed annotation keys now have a *parser* gap, F-S-04. |
| W1S-11; C-02 | Closed: authored internal kinds are rejected at [src/parse/Spec.ts:139](/Users/darkomijic/.t3/worktrees/sdp-new/t3-c5f2aa8c-8166119757215c15/src/parse/Spec.ts:139), and maturity is checked on every node at [src/check/Check.ts:129](/Users/darkomijic/.t3/worktrees/sdp-new/t3-c5f2aa8c-8166119757215c15/src/check/Check.ts:129). Baseline internal-kind examples pass. |
| W1S-12; A-04 | Removed with Markdown prose-link scanning. No prose-mention edges in the final format. |
| W1S-13; C-03 | Original comma-list splitting removed; comma targets are diagnosed at [src/parse/Gherkin.ts:210](/Users/darkomijic/.t3/worktrees/sdp-new/t3-c5f2aa8c-8166119757215c15/src/parse/Gherkin.ts:210). Value/link conflicts are rejected at [src/graph/Build.ts:308](/Users/darkomijic/.t3/worktrees/sdp-new/t3-c5f2aa8c-8166119757215c15/src/graph/Build.ts:308), rather than unioned. Completeness on that rejection is F-S-03. |
| Deferred S-06 / S-07 | Standard parse failure and traversal-limit envelopes are fixed by [src/app/Answer.ts:38](/Users/darkomijic/.t3/worktrees/sdp-new/t3-c5f2aa8c-8166119757215c15/src/app/Answer.ts:38) and [src/app/Reading.ts:55](/Users/darkomijic/.t3/worktrees/sdp-new/t3-c5f2aa8c-8166119757215c15/src/app/Reading.ts:55), with passing CLI/MCP/export scenarios. The malformed trailing-tag probe exits 2 with `complete:false`; new omitted-diagnostic cases remain F-S-03/F-S-05. |
| Deferred S-08 | Exact-id and declared-vocabulary query guards pass baseline coverage at [specs/requirements/REQ-builtin-steps.feature:95](/Users/darkomijic/.t3/worktrees/sdp-new/t3-c5f2aa8c-8166119757215c15/specs/requirements/REQ-builtin-steps.feature:95) and line 122. Non-query assertion holes remain F-S-09. |
| Deferred S-12 / S-14 | Baseline path-direction and positive-cycle examples pass at [specs/requirements/REQ-graph-query.feature:260](/Users/darkomijic/.t3/worktrees/sdp-new/t3-c5f2aa8c-8166119757215c15/specs/requirements/REQ-graph-query.feature:260) and line 216. No additional independent stress replay here. |

Additional rechecks: the disjoint concurrent-run probe preserves A's pass and B's failure after A finishes last ([boundaries.log](/private/tmp/final-astra/boundaries.log)); the repository's concurrent partial-run and partial-Examples scenarios also pass. Crash injection and simultaneous edits during the final file-write syscall were not tested.

The Feature and Rule Background changes each produced `status:stale, staleBecause:scenario-changed`; changing only an annotation, a Rule's name, or Scenario indentation left the no-graph-reader result passed. Those are exact `HASH PROBE` lines in [boundaries.log](/private/tmp/final-astra/boundaries.log), generated by [boundaries.py](/private/tmp/final-astra/boundaries.py). Step keywords/types are absent from the hash, but handlers receive neither and matching is by step text, so I found no execution-changing keyword-only hole. Graph-reading steps separately fingerprint spec files; editorial changes can legitimately stale those results.

Duplicate Rules and Rule/Scenario id collisions are diagnosed by the graph and blocked by the duplicate-id run guard; the current collision scenarios passed. Indentation is not hierarchy, as documented and confirmed by the probe. Splitting `@owner=a@b.c` into a value and a plain tag is also documented official-parser behaviour, not a new finding. Valid repeated values and Rule/Scenario links are covered by the passing parser scenarios. These controls do not erase F-S-04's unsupported-key and identity problems.

## 4. The ten rules I tried to break

The runner copies the checkout to `/private/tmp/final-astra/mutant`, changes **one implementation behaviour at a time**, runs `npm run verify`, and restores the file. No scenario text was weakened. Exact substitutions are in [mutate.py](/private/tmp/final-astra/mutate.py); [mutation summary](/private/tmp/final-astra/mutations.log). The recorder mutation was rerun with a type-valid expression in [mutation-extra.py](/private/tmp/final-astra/mutation-extra.py): the initial version stopped at an unused import and was **not** counted as a killed behavioural mutant.

| Rule (ten distinct specs) | Mutation | Outcome |
| --- | --- | --- |
| [specs/architecture/ARCH-spec-parser.feature:448](/Users/darkomijic/.t3/worktrees/sdp-new/t3-c5f2aa8c-8166119757215c15/specs/architecture/ARCH-spec-parser.feature:448) — hash covers what a handler observes | Remove tags from the hash | **Killed:** 347/349 ordinary scenarios pass. The rule's own hash table fails, as does tag-dependent evidence coverage. [log](/private/tmp/final-astra/01-parser.log) |
| [specs/architecture/ARCH-graph-builder.feature:9](/Users/darkomijic/.t3/worktrees/sdp-new/t3-c5f2aa8c-8166119757215c15/specs/architecture/ARCH-graph-builder.feature:9) — each spec/rule/scenario is a node with its verification links | Force every Rule's verification to `none` | **Killed elsewhere:** 346/349 pass. Context and export scenarios catch it; this rule's own example does not pin passing roll-up. [log](/private/tmp/final-astra/02-builder.log) |
| [specs/requirements/REQ-executable-specs.feature:114](/Users/darkomijic/.t3/worktrees/sdp-new/t3-c5f2aa8c-8166119757215c15/specs/requirements/REQ-executable-specs.feature:114) — a result counts only while inputs are unchanged | Ignore the declared-input fingerprint | **Killed:** 347/349 pass; source-change/staleness examples fail. [log](/private/tmp/final-astra/03-evidence.log) |
| [specs/requirements/REQ-lifecycle-view.feature:89](/Users/darkomijic/.t3/worktrees/sdp-new/t3-c5f2aa8c-8166119757215c15/specs/requirements/REQ-lifecycle-view.feature:89) — first milestone not met determines position | Treat every nonempty `met` string as a date | **Killed elsewhere:** 348/349 pass; REQ-check-rules' malformed-date example catches it. The position examples themselves only use well-shaped dates. [log](/private/tmp/final-astra/04-lifecycle.log) |
| [specs/requirements/REQ-cli.feature:875](/Users/darkomijic/.t3/worktrees/sdp-new/t3-c5f2aa8c-8166119757215c15/specs/requirements/REQ-cli.feature:875) — record only passing milestones and close them | Recorder emits current year + `-99-99` | **Survived:** verify exit 0, 349/349 pass, same 8/19 gate passes. Its example checks only `@met=20`, not today's date. F-S-08. [log](/private/tmp/final-astra/05-cli-valid.log) |
| [specs/requirements/REQ-check-rules.feature:121](/Users/darkomijic/.t3/worktrees/sdp-new/t3-c5f2aa8c-8166119757215c15/specs/requirements/REQ-check-rules.feature:121) — report Markdown where specs live | Stop discovering `.md` files | **Killed:** 348/349 pass. The example pins adjacent Markdown; it does not cover Markdown-only directories (F-S-05). [log](/private/tmp/final-astra/06-check.log) |
| [specs/requirements/REQ-builtin-steps.feature:90](/Users/darkomijic/.t3/worktrees/sdp-new/t3-c5f2aa8c-8166119757215c15/specs/requirements/REQ-builtin-steps.feature:90) — an untrustworthy answer fails its step | Disable unknown-query-word rejection | **Killed:** 347/349 pass. Good query coverage; node-field and inherited-severity holes remain F-S-09. [log](/private/tmp/final-astra/07-builtin.log) |
| [specs/requirements/REQ-graph-export.feature:35](/Users/darkomijic/.t3/worktrees/sdp-new/t3-c5f2aa8c-8166119757215c15/specs/requirements/REQ-graph-export.feature:35) — one stable record with all declarations per edge | Export only the first declaration | **Killed:** 348/349 pass; its nodes-and-edges example fails. [log](/private/tmp/final-astra/08-export.log) |
| [specs/requirements/REQ-maturity-criteria.feature:48](/Users/darkomijic/.t3/worktrees/sdp-new/t3-c5f2aa8c-8166119757215c15/specs/requirements/REQ-maturity-criteria.feature:48) — ready requires an example of every Rule | Disable the bare-Rule criterion | **Killed:** 347/349 pass; content and explanatory diagnostics fail. [log](/private/tmp/final-astra/09-maturity.log) |
| [specs/architecture/ARCH-graph.feature:11](/Users/darkomijic/.t3/worktrees/sdp-new/t3-c5f2aa8c-8166119757215c15/specs/architecture/ARCH-graph.feature:11) — a graph cannot be mutated through inputs or outputs | Copy arrays without freezing them | **Killed:** 348/349 pass; its mutation example fails. [log](/private/tmp/final-astra/10-graph.log) |

The nine killed mutations exit 1 on scenario failures, not the eleven deliberately unmet gates. Their gate totals vary because ordinary regressions feed the gates. The restored copy passes all 349 ordinary scenarios and reproduces the original 8/19 gate total.

**Rule wording and placement:** I inspected the actual graph's Rule titles and Scenario-to-Rule assignments (saved [rules.json](/private/tmp/final-astra/rules.json), [scenarios.json](/private/tmp/final-astra/scenarios.json)). I found no untagged, top-level topic-only Rule title and no unequivocally unrelated top-level example worth reporting. The 31 `@open` Rules are intentionally questions, so not propositions and not defects. Inside fixtures, `Rule: Options` at [specs/requirements/REQ-builtin-steps.feature:21](/Users/darkomijic/.t3/worktrees/sdp-new/t3-c5f2aa8c-8166119757215c15/specs/requirements/REQ-builtin-steps.feature:21) is a topic, not a proposition; replace it with the condition it is meant to model. Short fixture Rules such as `R` are deliberately allowed by AGENTS.md and are not corpus claims.

There are still gaps between prose promises and examples: “a decision is a title and one to three sentences” at [specs/requirements/REQ-decision-records.feature:12](/Users/darkomijic/.t3/worktrees/sdp-new/t3-c5f2aa8c-8166119757215c15/specs/requirements/REQ-decision-records.feature:12) is checked only for Rule/Scenario children by [src/check/Check.ts:173](/Users/darkomijic/.t3/worktrees/sdp-new/t3-c5f2aa8c-8166119757215c15/src/check/Check.ts:173), not sentence count or prohibited metadata. This is source inspection, not an extra mutation finding; D21's no-prose-diagnostic ruling may make the sentence limit a review convention. Likewise the gate concurrency hole and static registration gaps above are not made safe by the nine killed mutants.

## 5. Questions for the architect

1. **Does `verified` mean every existing example passed, or every declared Rule is supported?** The current explicit design implements the former. `python3 /private/tmp/final-astra/boundaries.py` verifies execution semantics; the separate [noexample fixture/output](/private/tmp/final-astra/noexample.log) shows `sdp noexample run` → `1 passed`, `q 'requirement[stage=verified]' --ids` → `REQ-a`, and `context` simultaneously shows `stage: verified`, `[no example]`, and `[open]`. [src/graph/Build.ts:233](/Users/darkomijic/.t3/worktrees/sdp-new/t3-c5f2aa8c-8166119757215c15/src/graph/Build.ts:233) rolls up only scenarios. I have not called this a defect against the accepted brief. For rules to be the unit of the contract, either make verified require their closure, or teach every completion gate to require ready content as well as passing examples.
2. **Is the foreign-suite exception intentional in the finished product?** [src/parse/Spec.ts:71](/Users/darkomijic/.t3/worktrees/sdp-new/t3-c5f2aa8c-8166119757215c15/src/parse/Spec.ts:71) and [specs/architecture/ARCH-spec-parser.feature:281](/Users/darkomijic/.t3/worktrees/sdp-new/t3-c5f2aa8c-8166119757215c15/specs/architecture/ARCH-spec-parser.feature:281) exempt a file with no `@id=` from the Rule requirement. That is useful for compatibility but weaker than D22's “every scenario of every spec” and [specs/requirements/REQ-progressive-specs.feature:51](/Users/darkomijic/.t3/worktrees/sdp-new/t3-c5f2aa8c-8166119757215c15/specs/requirements/REQ-progressive-specs.feature:51)'s minimum id/name. Do not confuse this deliberate exception with invalid written identity falling into it (F-S-04).
3. **What does completeness promise about apparent specs written in the wrong format?** Choose the semantics described in F-S-05 and expose the warning consistently. Discovery must work either way.
4. **Must iteration ranges be non-overlapping?** If yes, one validation rule is smaller than generalising milestone stretches. If no, chronology and phase ends must support overlaps (F-S-10).

Hand-written valid `@met`, historical closed milestones whose old criteria would now fail, and a release represented by `@version` are accepted D20 semantics, not evidence-forgery findings. `sdp gate` explicitly reports that a met milestone is closed; it does not claim to rerun it. F-S-02 concerns the tool itself recording the wrong version, F-S-08 an invalid date, and F-S-11 the supported closing workflow losing its closed response.
