# Final code and architecture review

## 1. Verdict

**Do not replace main yet. Fix F-A-01 first:** an invalid annotation can remove a relationship, an absence assertion can then pass, and a milestone can be recorded as met with `complete: true`. The redesign otherwise holds together. The ordinary newcomer workflow works, the import graph matches the declared architecture, and CLI/MCP share application use cases.

Reviewed checkout HEAD `de618ee` (local branch `t3/review-sdp-redesign`). No tracked files changed and no commits made. Dependencies were missing; I used the authorized `node_modules` symlink. `npm run verify` passed: **349 ordinary scenarios passed; 19 gates, 8 passed and the expected 11 failed**. Verification log: [/tmp/sdp-final-review/verify.log](/tmp/sdp-final-review/verify.log).

The other findings are P2 authoring, evidence-display and configuration seams, plus two P3 contract/documentation corrections. They need small changes, not another architectural wave. I did not score the known release packaging, application-element assignment or future milestone work.

## 2. The newcomer's walk

I used README and the skill, then ran `--help`, `status`, `arch`, `steps`, `vocabulary`. For the commands below, this is the exact shell shorthand:

```sh
sdp() { node /Users/darkomijic/.t3/worktrees/sdp-new/t3-61c5f4c3-813c012041bd2e7c/src/cli/main.ts "$@"; }
```

The full walk, including every command, exit code and stdout/stderr, is in [walk.log](/tmp/sdp-final-review/walk.log); its fixtures and operations are in [walk.py](/tmp/sdp-final-review/walk.py). Workspace: `/tmp/sdp-final-review/walk`.

| Step | What happened |
| --- | --- |
| `sdp -C /tmp/sdp-final-review/walk init` | Exit 0; created config and skill, with a useful next command. The commented defaults make `evidence.inputs` and `evidence.env` understandable without reading implementation. |
| `new idea 'Saved carts'` | Exit 0; `REQ-saved-carts\tspecs/requirements/REQ-saved-carts.feature`; guidance stayed on stderr. `show ... --json` reported `maturity: idea`, `stage: idea`. `idea` being an alias for a requirement is explicit in help. |
| Grow to draft | Wrote intent, one rule and an `@open` rule. `check` printed `0 error(s), 0 warning(s), 0 info`. `context REQ-saved-carts` showed `[no example]`, `[open]`, the question and its line, and exactly what `ready` still needed. |
| Grow to specified | Added a three-step example and resolved the open question. `steps cart` returned no definitions. `run REQ-saved-carts --snippets` exited 0 with `1 scenario(s): 1 undefined`, plus a usable `sdp/steps` module and where to save it. Undefined being nonfailure is clearly explained. |
| Define steps, verify | Wrote a fresh cart world and Given/When/Then registrations. `run REQ-saved-carts` printed `1 scenario(s): 1 passed`; `show --json` reported `verification: passing`, `stage: verified`. |
| Decision and code | `new decision 'Keep carts in memory'` produced DEC-0001 with the short trade-off placeholder; replaced it with a sentence. `new element Carts` produced ARCH-carts. Added `@decided-by:DEC-0001`, an `@sdp is ARCH-carts` code comment, and the requirement's `@realized-by:ARCH-carts`. No implementation knowledge was needed to discover these forms. |
| Plan | Created Elaboration and First delivery with `new phase` and `new iteration`; the latter selected the sole phase and wrote two weeks of dates. Put `@iteration:ITER-first-delivery` on the requirement. The generated iteration id differs from the illustrative E1, but the command prints it clearly. |
| Milestone | Created First carts, replaced its suggested close target with `@closes:ITER-first-delivery`, and used a rule/scenario checking no error diagnostics. `gate MS-first-carts --record` printed `1 gate scenario(s) of MS-first-carts: 1 passed` and `MS-first-carts is recorded as met: 2026-11-12`. Immediately afterward lifecycle reported `met: 2026-11-12` **and** `gate.passed: 0`, `unmet: ["No errors"]` (F-A-06). |
| Query | `sdp -C /tmp/sdp-final-review/walk q '#REQ-saved-carts -realized-by-> element <-is- code' --ids` printed `code:src/cart.ts`. `sdp -C /tmp/sdp-final-review/walk graph \| jq -r 'select(.type=="edge" and .rel=="realized-by" and .to=="ARCH-carts") \| .from'` printed `REQ-saved-carts`. Both exited 0. |

The step API's seven handler fields are coherent: `world`, typed `args`, optional `doc` and `table`, `project`, `scenario`, `signal` ([src/run/Steps.ts:45](/Users/darkomijic/.t3/worktrees/sdp-new/t3-61c5f4c3-813c012041bd2e7c/src/run/Steps.ts:45)). The runnable snippet exposes only what the first step needs; the source API explains the rest. `project` is deliberately a getter so reading it records a dependency ([src/run/Runner.ts:122](/Users/darkomijic/.t3/worktrees/sdp-new/t3-61c5f4c3-813c012041bd2e7c/src/run/Runner.ts:122)). The lean subpath imports no workspace loader or parser at runtime ([src/steps.ts:10](/Users/darkomijic/.t3/worktrees/sdp-new/t3-61c5f4c3-813c012041bd2e7c/src/steps.ts:10), [src/run/Steps.ts:24](/Users/darkomijic/.t3/worktrees/sdp-new/t3-61c5f4c3-813c012041bd2e7c/src/run/Steps.ts:24)). I installed a scratch package symlink during the walk, but it is unnecessary for execution: the runner resolves its own three subpaths ([src/workspace/Workspace.ts:232](/Users/darkomijic/.t3/worktrees/sdp-new/t3-61c5f4c3-813c012041bd2e7c/src/workspace/Workspace.ts:232)). This is not an npm-installability finding.

Graph records are easy to take apart: explicit `type`, stable node fields, empty edge attrs rather than missing fields, and a declaration array ([src/graph/Export.ts:18](/Users/darkomijic/.t3/worktrees/sdp-new/t3-61c5f4c3-813c012041bd2e7c/src/graph/Export.ts:18), [src/graph/Export.ts:48](/Users/darkomijic/.t3/worktrees/sdp-new/t3-61c5f4c3-813c012041bd2e7c/src/graph/Export.ts:48)). The envelope and ordinary errors generally work; diagnostics use one severity catalogue ([src/model/Diagnostic.ts:63](/Users/darkomijic/.t3/worktrees/sdp-new/t3-61c5f4c3-813c012041bd2e7c/src/model/Diagnostic.ts:63)). Bad tag syntax gives concrete replacement text. The defects are incompleteness classification (F-A-01), a generated-id collision whose message tells the author to rename their content (F-A-03), and a date error that escapes as a defect (F-A-02).

MCP was tested through actual stdio, not inferred from registrations: `python3 /tmp/sdp-final-review/mcp.py`. It listed the nine advertised tools; `sdp_context` with `depht` returned JSON-RPC `-32602`, `Expected no excess property ... ["depht"]`. Its query over the malformed annotation returned the same wrongly complete empty answer as CLI (F-A-01). Raw messages and replies: [mcp-input.jsonl](/tmp/sdp-final-review/mcp-input.jsonl), [mcp.log](/tmp/sdp-final-review/mcp.log). The transport itself is thin ([src/mcp/Server.ts:140](/Users/darkomijic/.t3/worktrees/sdp-new/t3-61c5f4c3-813c012041bd2e7c/src/mcp/Server.ts:140)); I found no separate MCP execution or lifetime regression.

**Structure.** Independently parsed imports and re-exports with oxc, including dynamic imports and distinguishing types: `node /tmp/sdp-final-review/imports.mjs`. Output: `40` files, `217` internal import/re-export entries, `runtimeSCC: []`, `elementSCC: []`, `missing: []`, `extra: []`. The sole all-import SCC is Annotations ↔ TypedAnnotations through a type reference. Full file edges and summary: [imports.json](/tmp/sdp-final-review/imports.json), [imports.log](/tmp/sdp-final-review/imports.log). The comparison uses actual `is` anchors, as [specs/architecture/ARCHITECTURE.feature:6](/Users/darkomijic/.t3/worktrees/sdp-new/t3-61c5f4c3-813c012041bd2e7c/specs/architecture/ARCHITECTURE.feature:6) specifies; eight unanchored entry/model/helper files are listed explicitly in the log. It does not pretend those files have architect-approved ownership. No source imports a transport except CLI's lazy MCP start ([src/cli/main.ts:394](/Users/darkomijic/.t3/worktrees/sdp-new/t3-61c5f4c3-813c012041bd2e7c/src/cli/main.ts:394)).

`src/app/` is a real shared use-case layer, not a second CLI. Reading orchestrates workspace reads, queries and DTO assembly; Running owns selection, stratification, commits and recording; Text renders both transports ([src/app/Reading.ts:31](/Users/darkomijic/.t3/worktrees/sdp-new/t3-61c5f4c3-813c012041bd2e7c/src/app/Reading.ts:31), [src/app/Running.ts:103](/Users/darkomijic/.t3/worktrees/sdp-new/t3-61c5f4c3-813c012041bd2e7c/src/app/Running.ts:103), [src/app/Text.ts:53](/Users/darkomijic/.t3/worktrees/sdp-new/t3-61c5f4c3-813c012041bd2e7c/src/app/Text.ts:53)). It is substantial because it now owns Session's work, not because logic was duplicated. The pure graph/parser/query/check core has no filesystem, environment or current-time reads; the filesystem and environment reads stay in Workspace. Rendering still lives partly in Lifecycle ([src/lifecycle/Lifecycle.ts:301](/Users/darkomijic/.t3/worktrees/sdp-new/t3-61c5f4c3-813c012041bd2e7c/src/lifecycle/Lifecycle.ts:301)); moving that existing function to Text would make the separation clearer without adding an interface.

The interpreted-word guard passes, and the core asks Vocabulary for roles. It is not proof that every output honors remapping: empty-plan help is still a literal second profile (F-A-09). Graph node/edge trees are owned and frozen; its conflict records remain an exception (F-A-10). I found no surviving Markdown reader, prose-mention edges, significance flags, decision statuses or calendar-driven due-gate enforcement. The remaining Markdown references describe the deliberate migration warning or rendered context, not a hidden second reader.

**Effect and resources.** The code mostly follows the local Effect 4 guide: named `Effect.fn` workflows, Schema at config/results/error boundaries, filesystem/path services at the edge. Store's lock uses `acquireUseRelease`, rereads under the lock, merges executed scenarios only, and renames a temporary file ([src/run/Store.ts:50](/Users/darkomijic/.t3/worktrees/sdp-new/t3-61c5f4c3-813c012041bd2e7c/src/run/Store.ts:50), [src/run/Store.ts:88](/Users/darkomijic/.t3/worktrees/sdp-new/t3-61c5f4c3-813c012041bd2e7c/src/run/Store.ts:88)). The failed acquisition path does not release someone else's lock. The deadline and AbortSignal handling is explicit and cooperative ([src/run/Runner.ts:128](/Users/darkomijic/.t3/worktrees/sdp-new/t3-61c5f4c3-813c012041bd2e7c/src/run/Runner.ts:128)). App errors are typed and rendered with a shared formatter ([src/app/Errors.ts:82](/Users/darkomijic/.t3/worktrees/sdp-new/t3-61c5f4c3-813c012041bd2e7c/src/app/Errors.ts:82)); arbitrary handler failures become scenario failures. F-A-02 is the verified user-input defect escape. I did not perform a process-kill soak or independently repeat concurrent lock contention; those conclusions are source inspection plus the passing repository scenarios.

**Five specs, read both as files and through `sdp context <id>`.** Context captures are `/tmp/sdp-final-review/context-<id>.md`.

| Kind and spec | As its only reader |
| --- | --- |
| Requirement: `REQ-progressive-specs` ([specs/requirements/REQ-progressive-specs.feature:12](/Users/darkomijic/.t3/worktrees/sdp-new/t3-61c5f4c3-813c012041bd2e7c/specs/requirements/REQ-progressive-specs.feature:12)) | Rule names are contracts. The complete guest-checkout fixture teaches placement better than separate format prose. Its introductory paragraph mostly explains continuity, although “Decisions, quality requirements, the plan, milestones and risks are written the same way” can be deleted: the corpus already demonstrates it. |
| Quality: `NFR-greppable` ([specs/quality/NFR-greppable.feature:9](/Users/darkomijic/.t3/worktrees/sdp-new/t3-61c5f4c3-813c012041bd2e7c/specs/quality/NFR-greppable.feature:9)) | Two plain rules and examples; why grep matters is stated once. The file and context carry the needed contract; no missing prose manual. |
| Decision: `DEC-0001` ([specs/decisions/DEC-0001.feature:4](/Users/darkomijic/.t3/worktrees/sdp-new/t3-61c5f4c3-813c012041bd2e7c/specs/decisions/DEC-0001.feature:4)) | The title is the choice and the paragraph explains rejected alternatives. No statuses, sections or copied behavioral rules. Context's “Rules that rest on this” is useful evidence of the new placement. |
| Element: `ARCH-runner` ([specs/architecture/ARCH-runner.feature:6](/Users/darkomijic/.t3/worktrees/sdp-new/t3-61c5f4c3-813c012041bd2e7c/specs/architecture/ARCH-runner.feature:6)) | A responsibility and reason, with no pretend scenarios. Incoming `realized-by` links lead to REQ-executable-specs and REQ-builtin-steps; implementation anchors lead to the code. Enough navigation survives without the old prose. The phrase “every milestone gate” deriving stage is stale: milestones explicitly have no stage ([src/graph/Build.ts:169](/Users/darkomijic/.t3/worktrees/sdp-new/t3-61c5f4c3-813c012041bd2e7c/src/graph/Build.ts:169)); delete those words. |
| Milestone: `MS-LCA` ([specs/delivery/milestones/MS-LCA.feature:5](/Users/darkomijic/.t3/worktrees/sdp-new/t3-61c5f4c3-813c012041bd2e7c/specs/delivery/milestones/MS-LCA.feature:5)) | Rule names state criteria; examples expose the exact scope. The risk description at line 19 restates the rule/query and can go. The intentionally failing gates are legible in context; they are not findings. |

The most noticeable context excess is ARCH-reports' fallback: it concatenates descriptions of all its anchored modules, repeating API/help explanations in every nearby context ([src/arch/Architecture.ts:47](/Users/darkomijic/.t3/worktrees/sdp-new/t3-61c5f4c3-813c012041bd2e7c/src/arch/Architecture.ts:47)). This follows the known temporary ownership, so I am not scoring that assignment again. It reinforces keeping shared comments short rather than adding more docs.

## 3. Findings

### F-A-01 — P1 — Dropped tag annotations can certify a false absence and close a milestone

**Problem.** Annotation errors remove graph facts without making the answer incomplete or activating the built-in assertion guard.

**Evidence.** The multi-target branch discards `@uses:B,C` ([src/parse/Gherkin.ts:210](/Users/darkomijic/.t3/worktrees/sdp-new/t3-61c5f4c3-813c012041bd2e7c/src/parse/Gherkin.ts:210)). `unreadRules` excludes both `annotation` and `link-syntax` ([src/model/Diagnostic.ts:43](/Users/darkomijic/.t3/worktrees/sdp-new/t3-61c5f4c3-813c012041bd2e7c/src/model/Diagnostic.ts:43)); answer completeness, run preflight and built-in query safety all use that set ([src/app/Answer.ts:26](/Users/darkomijic/.t3/worktrees/sdp-new/t3-61c5f4c3-813c012041bd2e7c/src/app/Answer.ts:26), [src/app/Running.ts:61](/Users/darkomijic/.t3/worktrees/sdp-new/t3-61c5f4c3-813c012041bd2e7c/src/app/Running.ts:61), [src/run/Builtin.ts:67](/Users/darkomijic/.t3/worktrees/sdp-new/t3-61c5f4c3-813c012041bd2e7c/src/run/Builtin.ts:67)).

Commands, fixtures and full output: `python3 /tmp/sdp-final-review/probes.py`, `python3 /tmp/sdp-final-review/soundness.py`, `python3 /tmp/sdp-final-review/mcp.py`. Specifically:

```sh
sdp -C /tmp/sdp-final-review/bad-link q '#REQ-a -uses-> *' --json
# exit 0: {"complete":true,"notes":["no relation uses"],"data":{"nodes":[]}}
sdp -C /tmp/sdp-final-review/bad-link check --json
# exit 1: annotation/error, "@uses:B,C: one tag is one link", hint "write @uses:B @uses:C"
sdp -C /tmp/sdp-final-review/dropped-gate gate MS-a --record --json
# exit 0: complete=true, data.passed=true, gates.passed=1, met="2026-11-12"
```

The last fixture declares `uses` in `vocabulary.words.relations` and asserts that `#REQ-a -uses-> *` returns no results. It records the milestone despite the malformed authored link. MCP also returns `complete: true`, empty nodes, `isError: false` for the first query.

**Why it matters.** This violates the central incomplete-answer and nonvacuous-evidence promises, not just diagnostic presentation.

**Smallest fix.** Include rejected annotation/link syntax in the existing unread classification so readers report incomplete, built-in assertions refuse conclusions, and error-level unread content blocks recording. Keep the present concrete hints; no new severity or envelope type is needed.

### F-A-02 — P2 — Invalid delivery dates pass check, then crash authoring or silently close gates

**Evidence.** `nextIteration` sends any string end date to `Date.toISOString` ([src/app/Templates.ts:126](/Users/darkomijic/.t3/worktrees/sdp-new/t3-61c5f4c3-813c012041bd2e7c/src/app/Templates.ts:126), [src/app/Templates.ts:145](/Users/darkomijic/.t3/worktrees/sdp-new/t3-61c5f4c3-813c012041bd2e7c/src/app/Templates.ts:145)). `metOn` checks only a digit pattern ([src/model/Vocabulary.ts:190](/Users/darkomijic/.t3/worktrees/sdp-new/t3-61c5f4c3-813c012041bd2e7c/src/model/Vocabulary.ts:190)), and gate treats any resulting string as closure ([src/app/Running.ts:273](/Users/darkomijic/.t3/worktrees/sdp-new/t3-61c5f4c3-813c012041bd2e7c/src/app/Running.ts:273)).

Reproduce with `python3 /tmp/sdp-final-review/extra.py` and `python3 /tmp/sdp-final-review/soundness.py`:

```sh
sdp -C /tmp/sdp-final-review/bad-date check
# exit 0: 0 error(s), 0 warning(s), 0 info
sdp -C /tmp/sdp-final-review/bad-date new iteration Second
# exit 1: ERROR ... RangeError: Invalid time value
# stack: addDays .../src/app/Templates.ts:129:15, nextIteration ...:145:19, ...
sdp -C /tmp/sdp-final-review/bad-met check --json
# exit 0: complete=true, data=[]
sdp -C /tmp/sdp-final-review/bad-met gate MS-a --json
# exit 0: passed=true, scenarios=[], met="2026-99-99"
```

The fixtures contain `@end=banana` and `@met=2026-99-99` respectively.

**Why it matters.** A routine typo defeats both actionable errors and the milestone's recorded-date contract.

**Smallest fix.** Validate real ISO calendar dates when reading these roles. Invalid met must not close a milestone; invalid iteration dates must produce a diagnostic and a typed refusal naming the existing iteration/tag before calculating a successor. Use one date check, not a catch-all defect handler.

### F-A-03 — P2 — A rule and its example can collide in an id the author never wrote

**Evidence.** Rule ids are generated separately, then scenario uniqueness starts with an empty set ([src/parse/Gherkin.ts:366](/Users/darkomijic/.t3/worktrees/sdp-new/t3-61c5f4c3-813c012041bd2e7c/src/parse/Gherkin.ts:366)). For `Rule: A holds` and `Scenario: A holds`, `python3 /tmp/sdp-final-review/probes.py` recorded:

```sh
sdp -C /tmp/sdp-final-review/collision check --json
# exit 1: duplicate-id/error, "id REQ-a#a-holds is already declared at a.feature:6"
# source a.feature:4; hint "ids must be unique across the workspace; rename one of them"
sdp -C /tmp/sdp-final-review/collision run REQ-a
# exit 1: cannot run ... scenarios unread or their ids ambiguous
```

**Why it matters.** Legal Gherkin and natural names are refused because two generators share a namespace. Renaming contract language should not repair an implementation-generated collision.

**Smallest fix.** Seed scenario uniqueness with the generated rule ids; retain rule ids and suffix colliding scenario ids with the existing numbering mechanism. No new id syntax or option.

### F-A-04 — P2 — Static discovery advertises definitions from modules the runner cannot use

**Evidence.** Scanning accepts unexported top-level `defineSteps` calls ([src/parse/StepDefinitions.ts:139](/Users/darkomijic/.t3/worktrees/sdp-new/t3-61c5f4c3-813c012041bd2e7c/src/parse/StepDefinitions.ts:139)); runtime loading only takes exported StepModules ([src/workspace/Workspace.ts:287](/Users/darkomijic/.t3/worktrees/sdp-new/t3-61c5f4c3-813c012041bd2e7c/src/workspace/Workspace.ts:287)). In the `no-export` fixture, `const steps = defineSteps(...)` is never exported.

```sh
sdp -C /tmp/sdp-final-review/no-export steps --json
# exit 0: complete=true; includes a.steps.ts:3, Then, "the business rule holds"
sdp -C /tmp/sdp-final-review/no-export run REQ-a
# exit 0: 1 scenario(s): 1 undefined
# note: a.steps.ts defines no steps: export the module, e.g. `export default defineSteps(…)`
```

Full output/fixture: [probes.log](/tmp/sdp-final-review/probes.log), [probes.py](/tmp/sdp-final-review/probes.py).

**Why it matters.** `steps`, context and snippets tell an author the automation exists until execution contradicts them.

**Smallest fix.** Track whether each supported literal module is exported, including a simple later export of its name. Omit unexported definitions and report the same missing-export fix statically. Do not add execution to reading or a general module evaluator.

### F-A-05 — P2 — Vocabulary validation accepts role words that the tag grammar cannot express

**Evidence.** Validation rejects blanks and selected collisions, but does not validate role spelling or reserve the fixed `rule-of` relation ([src/model/Config.ts:160](/Users/darkomijic/.t3/worktrees/sdp-new/t3-61c5f4c3-813c012041bd2e7c/src/model/Config.ts:160), [src/model/Config.ts:194](/Users/darkomijic/.t3/worktrees/sdp-new/t3-61c5f4c3-813c012041bd2e7c/src/model/Config.ts:194)). The parser's key grammar is [src/parse/Gherkin.ts:166](/Users/darkomijic/.t3/worktrees/sdp-new/t3-61c5f4c3-813c012041bd2e7c/src/parse/Gherkin.ts:166).

```sh
sdp -C /tmp/sdp-final-review/vocab-space new iteration First
# exit 0; next: work is planned ... `@in iteration:ITER-first`
sdp -C /tmp/sdp-final-review/rule-vocab check --json
# exit 0: complete=true, data=[]
```

The configurations are `relations.plan: ["in iteration"]` and `relations.scenario: rule-of`. The first guidance cannot be pasted as a Gherkin tag; the second makes a scenario use the rule-ownership relation for both its spec and rule. Captured by [probes.py](/tmp/sdp-final-review/probes.py) and [extra.py](/tmp/sdp-final-review/extra.py).

**Why it matters.** Configuration is accepted at its boundary but makes ordinary authoring impossible or gives one generated relation two meanings. W1A-04 remains partly open.

**Smallest fix.** Validate key-bearing roles against the existing annotation-key grammar and keep fixed generated relations out of configurable roles. Require tag-representable tokens for kind/maturity roles. Extend the current small validation pass; no new profile mechanism.

### F-A-06 — P2 — Recording a milestone immediately reports its successful gate as unmet

**Evidence.** Recording changes the feature file after committing the run ([src/app/Running.ts:280](/Users/darkomijic/.t3/worktrees/sdp-new/t3-61c5f4c3-813c012041bd2e7c/src/app/Running.ts:280), [src/app/Running.ts:288](/Users/darkomijic/.t3/worktrees/sdp-new/t3-61c5f4c3-813c012041bd2e7c/src/app/Running.ts:288)). Graph-reading evidence fingerprints every feature file ([src/workspace/Workspace.ts:192](/Users/darkomijic/.t3/worktrees/sdp-new/t3-61c5f4c3-813c012041bd2e7c/src/workspace/Workspace.ts:192)); lifecycle counts only current passing results ([src/app/Reading.ts:226](/Users/darkomijic/.t3/worktrees/sdp-new/t3-61c5f4c3-813c012041bd2e7c/src/app/Reading.ts:226)).

```sh
sdp -C /tmp/sdp-final-review/walk gate MS-first-carts --record
# original walk: exit 0, 1 passed; recorded as met: 2026-11-12
sdp -C /tmp/sdp-final-review/walk lifecycle --json
# exit 0; met="2026-11-12", gate={passed:0,total:1,unmet:["No errors"]}
sdp -C /tmp/sdp-final-review/walk graph
# scenario status="stale", staleBecause="specs-changed"
```

Original sequence is preserved in [walk.log](/tmp/sdp-final-review/walk.log); repeating gate now correctly skips the closed milestone.

**Why it matters.** The first successful use of the new recording model produces conflicting delivery guidance, and rerunning cannot repair it because the milestone is closed.

**Smallest fix.** Treat a closed milestone as a closure fact in lifecycle: omit its live unmet-gate rollup. Do not relabel stale evidence as current passing evidence or change fingerprints to conceal a real graph change. Historical results can remain in the store.

### F-A-07 — P2 — New writes specs outside configured feature globs without saying they are invisible

**Evidence.** Create tests only physical containment ([src/app/Authoring.ts:89](/Users/darkomijic/.t3/worktrees/sdp-new/t3-61c5f4c3-813c012041bd2e7c/src/app/Authoring.ts:89)); the transport warns only when that is false ([src/cli/main.ts:349](/Users/darkomijic/.t3/worktrees/sdp-new/t3-61c5f4c3-813c012041bd2e7c/src/cli/main.ts:349)).

```sh
sdp -C /tmp/sdp-final-review/hidden-new new requirement Visible
# exit 0: REQ-visible\tspecs/requirements/REQ-visible.feature; normal next guidance
sdp -C /tmp/sdp-final-review/hidden-new q '#REQ-visible' --json
# exit 0: complete=true, nodes=[]; note: no node has the id REQ-visible
```

Config is `features: [requirements/**/*.feature]`. Reproducer: [extra.py](/tmp/sdp-final-review/extra.py).

**Why it matters.** A valid configured workspace's first authoring command succeeds, but its next read cannot find what was just created.

**Smallest fix.** After writing, check discovery using the existing configured globs and warn with `--dir requirements` or the feature-glob correction. Do not silently change config or invent a configurable template-directory registry.

### F-A-08 — P2 — Graph query export includes relations the query did not match

**Evidence.** Selection induces a subgraph over matched nodes, retaining every edge between them ([src/app/Reading.ts:270](/Users/darkomijic/.t3/worktrees/sdp-new/t3-61c5f4c3-813c012041bd2e7c/src/app/Reading.ts:270)), despite `graph --query` promising edges along matched paths ([src/cli/main.ts:152](/Users/darkomijic/.t3/worktrees/sdp-new/t3-61c5f4c3-813c012041bd2e7c/src/cli/main.ts:152), [specs/requirements/REQ-graph-export.feature:96](/Users/darkomijic/.t3/worktrees/sdp-new/t3-61c5f4c3-813c012041bd2e7c/specs/requirements/REQ-graph-export.feature:96)).

```sh
sdp -C /tmp/sdp-final-review/graph-paths graph -q '#A -uses-> #B'
# exit 0: nodes A and B, edge A uses B, AND edge A avoids B
```

Fixture/output: [soundness.py](/tmp/sdp-final-review/soundness.py), [soundness.log](/tmp/sdp-final-review/soundness.log).

**Why it matters.** A script or diagram intended to isolate one relationship includes unrelated facts; the implementation and named rule disagree.

**Smallest fix.** Build the selected graph from the matched nodes and the actual path edges, using the existing QueryPath edge records. Keep induced subgraph semantics for the callers that explicitly request them.

### F-A-09 — P2 — Empty-plan guidance still uses a hard-coded vocabulary

**Evidence.** `emptyPlanHint` is a literal default profile with fixed dates and ids ([src/lifecycle/Lifecycle.ts:398](/Users/darkomijic/.t3/worktrees/sdp-new/t3-61c5f4c3-813c012041bd2e7c/src/lifecycle/Lifecycle.ts:398)). It ignores the Vocabulary already held by LifecycleReport.

```sh
sdp -C /tmp/sdp-final-review/remap lifecycle
# exit 0; recommends `sdp new phase "Elaboration"` and `sdp new iteration "Architecture baseline" --id E1`
sdp -C /tmp/sdp-final-review/remap new phase Elaboration
sdp -C /tmp/sdp-final-review/remap new iteration 'Architecture baseline' --id E1
# both exit 0, but get generic idea guidance
sdp -C /tmp/sdp-final-review/remap lifecycle --json
# exit 0: phases=[], iterations=[], unplanned=["E1","PH-elaboration"]
```

Config renames phase to `stage`, iteration to `sprint`, and the relations to `in-stage`/`in-sprint`. [remap.py](/tmp/sdp-final-review/remap.py) and [remap.log](/tmp/sdp-final-review/remap.log) preserve the exact sequence.

**Why it matters.** Following the product's own next instruction creates nodes its delivery view cannot recognize. The template fix did not remove this second authoring surface.

**Smallest fix.** Replace the long literal example with two commands using the active phase/iteration role words; let `new` supply dates and subsequent guidance. Delete the fixed sample dates and duplicated tag instructions.

### F-A-10 — P3 — Graph conflict records escape its ownership and immutability boundary

**Evidence.** Only the conflicts array is frozen; its entries retain original edge/value references ([src/model/Graph.ts:110](/Users/darkomijic/.t3/worktrees/sdp-new/t3-61c5f4c3-813c012041bd2e7c/src/model/Graph.ts:110), [src/model/Graph.ts:70](/Users/darkomijic/.t3/worktrees/sdp-new/t3-61c5f4c3-813c012041bd2e7c/src/model/Graph.ts:70)). `node /tmp/sdp-final-review/api.mjs` mutated `graph.conflicts[0].dropped.value` and printed `conflicts-mutable changed`, without a TypeError. The same probe confirmed that node `__proto__` data survives and is frozen, and Date input is refused.

**Why it matters.** The public “nothing read from the graph can be changed” contract still has a narrow exception ([specs/architecture/ARCH-graph.feature:11](/Users/darkomijic/.t3/worktrees/sdp-new/t3-61c5f4c3-813c012041bd2e7c/specs/architecture/ARCH-graph.feature:11)). This does not mutate the graph's separately frozen node/edge copies.

**Smallest fix.** Prefer deleting edge-attribute/conflict support, as below. If retained, copy and deeply freeze the conflict records through the same ownership boundary; do not create another deep copier.

### F-A-11 — P3 — The skill overstates evidence stability and universal rule enforcement

**Evidence.** The skill says annotation changes leave results valid ([.claude/skills/sdp/SKILL.md:49](/Users/darkomijic/.t3/worktrees/sdp-new/t3-61c5f4c3-813c012041bd2e7c/.claude/skills/sdp/SKILL.md:49)) and every scenario belongs to a rule ([.claude/skills/sdp/SKILL.md:53](/Users/darkomijic/.t3/worktrees/sdp-new/t3-61c5f4c3-813c012041bd2e7c/.claude/skills/sdp/SKILL.md:53)). Graph-reading evidence deliberately fingerprints feature files ([src/workspace/Workspace.ts:192](/Users/darkomijic/.t3/worktrees/sdp-new/t3-61c5f4c3-813c012041bd2e7c/src/workspace/Workspace.ts:192)), and id-less suites are explicitly exempt from the rule check ([src/parse/Spec.ts:73](/Users/darkomijic/.t3/worktrees/sdp-new/t3-61c5f4c3-813c012041bd2e7c/src/parse/Spec.ts:73)).

`python3 /tmp/sdp-final-review/docs.py` ran REQ-a's no-error-diagnostics scenario to passing, added only `@iteration:I1`, then:

```sh
sdp -C /tmp/sdp-final-review/replan q 'scenario[status=stale]' --json
# exit 0: REQ-a#clean, staleBecause="specs-changed", unchanged scenario hash
sdp -C /tmp/sdp-final-review/foreign check --json
# exit 0: complete=true, data=[] for an id-less Feature with a Scenario and no Rule
```

**Why it matters.** The skill is now the primary authoring manual. These are demonstrably broader promises than the implementation makes.

**Smallest fix.** Say annotations do not change a scenario hash, while results that read the graph still depend on spec changes; state the id-less-suite exception to the rule requirement. No implementation change is needed for these two claims.

## 4. What I would delete outright

- **Edge attributes and link-conflict machinery**: `GraphEdge.attrs`, EdgeConflict, attribute-union/conflict handling, Build's non-anchor attribute copying and `link-conflict` emission ([src/model/Graph.ts:33](/Users/darkomijic/.t3/worktrees/sdp-new/t3-61c5f4c3-813c012041bd2e7c/src/model/Graph.ts:33), [src/model/Graph.ts:41](/Users/darkomijic/.t3/worktrees/sdp-new/t3-61c5f4c3-813c012041bd2e7c/src/model/Graph.ts:41), [src/graph/Build.ts:301](/Users/darkomijic/.t3/worktrees/sdp-new/t3-61c5f4c3-813c012041bd2e7c/src/graph/Build.ts:301), [src/graph/Build.ts:357](/Users/darkomijic/.t3/worktrees/sdp-new/t3-61c5f4c3-813c012041bd2e7c/src/graph/Build.ts:357)). Preserve triple deduplication and *all* declaration locations. `sdp graph | jq -s '[.[] | select(.type=="edge" and .attrs!={})] | length'` printed `0` on this repository. The remaining nonempty examples are synthetic annotation fixtures ([specs/architecture/ARCH-graph-builder.feature:111](/Users/darkomijic/.t3/worktrees/sdp-new/t3-61c5f4c3-813c012041bd2e7c/specs/architecture/ARCH-graph-builder.feature:111)), not product uses. Their existence does not justify keeping the feature after D22. Anchor declaration attrs still belong on nodes and should remain. If the export field is retained as a stable shape, emit `{}`.
- The long fixed `emptyPlanHint` example; replace with active-role commands (F-A-09).
- The always-empty successful `GherkinResult.errors` channel and its second syntax-diagnostic pass ([src/parse/Gherkin.ts:116](/Users/darkomijic/.t3/worktrees/sdp-new/t3-61c5f4c3-813c012041bd2e7c/src/parse/Gherkin.ts:116), [src/parse/Gherkin.ts:414](/Users/darkomijic/.t3/worktrees/sdp-new/t3-61c5f4c3-813c012041bd2e7c/src/parse/Gherkin.ts:414), [src/parse/Spec.ts:123](/Users/darkomijic/.t3/worktrees/sdp-new/t3-61c5f4c3-813c012041bd2e7c/src/parse/Spec.ts:123)). Parse failures already leave through Result. There is no second embedded-Gherkin parse now.
- `export` on helpers with only local callers: `templatePlaceholders` ([src/check/Check.ts:92](/Users/darkomijic/.t3/worktrees/sdp-new/t3-61c5f4c3-813c012041bd2e7c/src/check/Check.ts:92)), `planIterations` ([src/lifecycle/Lifecycle.ts:114](/Users/darkomijic/.t3/worktrees/sdp-new/t3-61c5f4c3-813c012041bd2e7c/src/lifecycle/Lifecycle.ts:114)), `neighbourhood` ([src/graph/Context.ts:248](/Users/darkomijic/.t3/worktrees/sdp-new/t3-61c5f4c3-813c012041bd2e7c/src/graph/Context.ts:248)) and `LayeredResults` ([src/run/Evidence.ts:107](/Users/darkomijic/.t3/worktrees/sdp-new/t3-61c5f4c3-813c012041bd2e7c/src/run/Evidence.ts:107)). Searches across src/specs/examples found no external imports of these names. Keep the functions/types locally.
- Build's second source formatter, `fmt` ([src/graph/Build.ts:446](/Users/darkomijic/.t3/worktrees/sdp-new/t3-61c5f4c3-813c012041bd2e7c/src/graph/Build.ts:446)); use `formatSource(source) || "?"` where that fallback matters.
- The `ARCH-runner` “every milestone gate” stage clause and MS-LCA's repeated risk-retirement description, identified in the five-spec reading above.
- “none overwrites what is there” in Authoring's module comment ([src/app/Authoring.ts:3](/Users/darkomijic/.t3/worktrees/sdp-new/t3-61c5f4c3-813c012041bd2e7c/src/app/Authoring.ts:3)): types intentionally rewrites its derived declaration ([src/app/Authoring.ts:106](/Users/darkomijic/.t3/worktrees/sdp-new/t3-61c5f4c3-813c012041bd2e7c/src/app/Authoring.ts:106)).

I would **not** delete the application layer, the import hook needed for evidence, the lean subpaths, or source provenance merging. No new service, generic adapter or type parameter is needed for any finding.

## 5. Status of earlier findings

“Closed” below means closed against the original issue, not a claim that the whole surface is now defect-free. API reprobes: [api.mjs](/tmp/sdp-final-review/api.mjs), [api.log](/tmp/sdp-final-review/api.log); other rows explicitly distinguish source checks from behavioral reprobes.

| Finding | Status now | Evidence |
| --- | --- | --- |
| A-11 accumulating dependency generations | Closed by rejecting reuse after source edits | The process keeps one loaded generation; the second API run fails `SourcesChanged`, rather than executing cached code with new evidence. [src/workspace/Workspace.ts:307](/Users/darkomijic/.t3/worktrees/sdp-new/t3-61c5f4c3-813c012041bd2e7c/src/workspace/Workspace.ts:307); api.log. |
| A-12 unbounded MCP module refresh | Closed | Read-only MCP calls use static discovery, no fresh workspace module generations. [src/mcp/Server.ts:159](/Users/darkomijic/.t3/worktrees/sdp-new/t3-61c5f4c3-813c012041bd2e7c/src/mcp/Server.ts:159), [src/app/Reading.ts:157](/Users/darkomijic/.t3/worktrees/sdp-new/t3-61c5f4c3-813c012041bd2e7c/src/app/Reading.ts:157); actual stdio probe plus verify's static-read scenarios. No new RSS soak was needed to establish deletion of that mechanism. |
| A-14 heavy step barrel / merged annotation ids | Step surface closed; release isolation remains known work | [src/steps.ts:10](/Users/darkomijic/.t3/worktrees/sdp-new/t3-61c5f4c3-813c012041bd2e7c/src/steps.ts:10) is lean; main barrel exposes app use cases ([src/index.ts:18](/Users/darkomijic/.t3/worktrees/sdp-new/t3-61c5f4c3-813c012041bd2e7c/src/index.ts:18)). Example id union remains the expressly excluded release-packaging limitation. |
| A-22 config invariants | Partly closed | Empty/duplicate ladders, unsafe prefixes and several role collisions are rejected ([src/model/Config.ts:211](/Users/darkomijic/.t3/worktrees/sdp-new/t3-61c5f4c3-813c012041bd2e7c/src/model/Config.ts:211)); api.log confirms blank/reserved/prefix errors. F-A-05 covers remaining role problems. |
| W1A-01 cached edited code certified | Closed on supported execution path | API reprobe: first run `passed`, second `SourcesChanged ... nothing is recorded. Run again in a new process`. [src/app/Running.ts:113](/Users/darkomijic/.t3/worktrees/sdp-new/t3-61c5f4c3-813c012041bd2e7c/src/app/Running.ts:113). |
| W1A-02 gate fingerprint narrower than visible result data | Closed | Raw results and lastRun are absent from a running gate's view ([src/run/Evidence.ts:129](/Users/darkomijic/.t3/worktrees/sdp-new/t3-61c5f4c3-813c012041bd2e7c/src/run/Evidence.ts:129), [src/run/Evidence.ts:138](/Users/darkomijic/.t3/worktrees/sdp-new/t3-61c5f4c3-813c012041bd2e7c/src/run/Evidence.ts:138)); source check, backed by the repository's handler-view scenarios. |
| W1A-03 static registration discovery unsound | Partly closed | Scanner now restricts callback statements and does not traverse handler bodies ([src/parse/StepDefinitions.ts:120](/Users/darkomijic/.t3/worktrees/sdp-new/t3-61c5f4c3-813c012041bd2e7c/src/parse/StepDefinitions.ts:120)); runtime parity still fails for unexported modules, F-A-04. |
| W1A-04 incomplete vocabulary validation | Partly closed | Blank/reserved/role collisions have checks; F-A-05 reproduces remaining unrepresentable/fixed-relation assignments. |
| W1A-05 graph copy boundary | Original proto/Date cases closed; narrow residual | api.log: preserved frozen `__proto__`, Date rejected. Conflict records still escape, F-A-10. [src/model/Graph.ts:182](/Users/darkomijic/.t3/worktrees/sdp-new/t3-61c5f4c3-813c012041bd2e7c/src/model/Graph.ts:182). |
| W1A-06 hard-coded authoring vocabulary | Templates fixed; guidance partly open | Templates use roles ([src/app/Templates.ts:43](/Users/darkomijic/.t3/worktrees/sdp-new/t3-61c5f4c3-813c012041bd2e7c/src/app/Templates.ts:43)); empty lifecycle guidance still recreates the defect, F-A-09. |
| W1A-07 annotation maturity stage | Closed | API reprobe prints `annotation-stage idea`. [src/graph/Build.ts:280](/Users/darkomijic/.t3/worktrees/sdp-new/t3-61c5f4c3-813c012041bd2e7c/src/graph/Build.ts:280). |
| W1A-08 YAML alias/link positions | Closed by format deletion | No Markdown/front-matter reader remains; link tags carry their actual location ([src/parse/Gherkin.ts:213](/Users/darkomijic/.t3/worktrees/sdp-new/t3-61c5f4c3-813c012041bd2e7c/src/parse/Gherkin.ts:213)). No alias path to retest. |
| W1A-09 severity catalogue disagreement | Closed | Diagnostics are constructed from the catalogue ([src/model/Diagnostic.ts:63](/Users/darkomijic/.t3/worktrees/sdp-new/t3-61c5f4c3-813c012041bd2e7c/src/model/Diagnostic.ts:63)); old inline-node rule is deleted, link-syntax is error. |
| W1A-10 missing derived vocabulary output | Closed | `vocabulary --json` includes `data.made`, stages, fixed kinds, relations and attributes ([src/model/Vocabulary.ts:218](/Users/darkomijic/.t3/worktrees/sdp-new/t3-61c5f4c3-813c012041bd2e7c/src/model/Vocabulary.ts:218)); captured in probes.log. |

## 6. Questions for the architect

1. For a closed milestone, is `met` alone sufficient in lifecycle, or must the view also show the historical gate result at closure? I recommend `met` alone: it fixes F-A-06 by deleting misleading live evidence presentation and preserves the one recorded fact model.
2. Does D22's “link attributes go” also retire attributes on non-anchor code-comment links? I recommend yes: no current repository edge uses them, and retaining them keeps union/conflict machinery plus the remaining immutability exception. If deliberately retained, F-A-10 needs the small ownership fix instead.
