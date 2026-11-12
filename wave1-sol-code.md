# Wave 1 code and public-surface review

## 1. Verdict

**Keep this base, but fix W1A-01 and W1A-02 before building further evidence-dependent behaviour.** The changes are substantial improvements, not a reason to start over. Static discovery removes execution from reads; CommonMark and positioned YAML replace the scanners; normal JSON graphs own their data; concurrent partial runs keep both results. The remaining failures are concentrated at the boundaries between those changes.

Reviewed `3139ff3..2b872807c896471c6eb5d4b3c46e5b49a154bd4d`, after reading AGENTS.md, DESIGN-BRIEF.md (including Taste), the earlier A-review and the local Effect 4 guide. No tracked files changed and no commit was made. Created the authorized node_modules symlink. Node: `v24.22.2`. `npm run verify` exited 0 and printed `0 error(s), 0 warning(s), 0 info`, `285 scenario(s): 285 passed`, `12 gate scenario(s): 7 passed, 5 failed`. Those five milestone failures are expected and are not findings.

Reproduction scripts and captured output are under `/private/tmp/sdp-sol-architecture-review/wave1/`. They adapt the earlier probes to the changed API; the original scripts use removed graph properties and result signatures and cannot be rerun unchanged. Run the commands below from this checkout. Scratch fixtures are outside the checkout. No claim below depends on a new testing framework.

### Public surfaces as designs

| Surface | Could a newcomer use it from the names alone? | Redundancy and smallest design advice |
| --- | --- | --- |
| `vocabulary:` | Partly. `maturity`, `disciplines`, `relations.plan` and `relations.anchor` are intelligible together. `kinds.anchored` means a *default* kind, and `attributes.quality: type` beside `qualities` needs explanation. `links` means extra *attribute keys*, not the usual links container. | Keep the single profile. Rename `anchored` to `defaultAnchoredKind` and `links` to `linkKeys` if changing names now; no alias compatibility. The decision-status list, special statuses and inactive statuses express different roles, so they are not simply duplicate lists to delete, but need consistency checks. Fix W1A-04 and W1A-06 before calling remapping complete. See [src/model/Vocabulary.ts:19](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/model/Vocabulary.ts:19), [src/model/Config.ts:10](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/model/Config.ts:10), [specs/requirements/REQ-configuration.md:38](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/specs/requirements/REQ-configuration.md:38). |
| `evidence:` | Yes. `inputs` as file globs and `env` as variable names are a small, useful pair. | Keep it; no additional per-category switches. Hashes are stored, not environment values ([src/workspace/Workspace.ts:115](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/workspace/Workspace.ts:115)). The historical import union is a different concern and should not become another config option. |
| `sdp/steps` | Mostly. `defineSteps(worldFactory, registrar)` and `{ world, args, doc, table, scenario, signal }` are understandable. `project` is much broader than the inputs most handlers need. Its getter also secretly marks an evidence dependency. | Keep the lean entry and raw RegExp captures. The 252-module runtime closure contained no parser/workspace module; Effect accounts for much of the closure. Delete the unneeded `name` option rather than add more options. Restrict discovery to a small documented registration form; do not implement a JS evaluator. W1A-02 explains the material problem with handing the whole Project to handlers. [src/run/Steps.ts:45](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/run/Steps.ts:45), [src/run/Steps.ts:98](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/run/Steps.ts:98), [src/steps.ts:10](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/steps.ts:10). |
| Results v3 | Mostly. `.scenarios[] | {id,status}` and `.scenarios[].examples[].steps[]` are direct jq paths. The example level is necessary for outlines, not gratuitous nesting. | Keep the status/hash/evidence split. `sources`, `toolchain`, `inputs`, `specs`, `results` are **digests**, although their names look like data containers; suffixing them with `Hash` would improve the format. The outer `runAt` is actually a merge timestamp and has no reader in src; delete it. An id appears both as map key and record field, but keeping the field makes `.scenarios[]` self-describing. Avoid a second flat copy of the steps. [src/model/Results.ts:40](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/model/Results.ts:40), [src/model/Results.ts:54](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/model/Results.ts:54), [src/model/Results.ts:70](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/model/Results.ts:70), [src/run/Store.ts:73](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/run/Store.ts:73). |
| `sdp steps [text]` | Yes, after reading its one-line help: substring search **or** actual match, built-ins included. `{file,line,keyword,expression}` is a good JSON shape. | Keep exactly the optional text and `--json`; no extra filter flags. The implementation's discovery is currently unsound (W1A-03). JSON currently suppresses unreadable-step notes because it returns first ([src/cli/main.ts:341](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/cli/main.ts:341)); this is recorded as D8 work, **not** a wave-1 finding. |
| `sdp vocabulary` | The command name is good; the table explains role versus active word. Text is not valid YAML, so the spec's “copy its line” advice is misleading. `--json` is the usable copy source. | Keep both modes and no new flags. The output omits all the fixed/derived vocabulary, despite its own documentation and error hints (W1A-10). Do not add those as configurable keys. [src/model/Vocabulary.ts:199](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/model/Vocabulary.ts:199), [src/cli/main.ts:439](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/cli/main.ts:439). |
| Diagnostics | Generally yes. `missing-id`, `derived-attribute`, `link-conflict`, `step-unreadable`, `step-expression` describe concrete faults; most hints name the next edit. | Keep the distinction between an unreadable static registration (warning) and a malformed expression (error). Use the severity catalogue instead of repeating severity literals (W1A-09). Fix provenance (W1A-08) and the vocabulary hint (W1A-10). No additional rules framework is needed. |

Observed commands: `python3 /private/tmp/sdp-sol-architecture-review/wave1/cli.py` captures `steps --help`, `vocabulary --help`, both vocabulary output modes, context, steps JSON and runs in one scratch workspace. `node /private/tmp/sdp-sol-architecture-review/wave1/surfaces.mjs` prints `lean-entry {"loaded":252,"heavy":[]}`. Exact fixture paths and CLI invocations are in `cli.log`.

### Structure and Effect assessment

Derived imports using oxc's import/export AST nodes, distinguishing type-only imports, rather than searching source text (which would count examples in comments):

```sh
node /private/tmp/sdp-sol-architecture-review/wave1/imports.mjs
python3 /private/tmp/sdp-sol-architecture-review/wave1/imports.py
```

Output: `runtime file SCCs []`; `all file SCCs [["src/parse/Annotations.ts", "src/parse/TypedAnnotations.ts"]]`. The latter is a type back-reference within one element. Full edges with source lines are in `imports.json`.

At the element level, mapped using [docs/architecture/overview.md:61](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/docs/architecture/overview.md:61):

- **Builder/runner:** the builder no longer imports the runner. `ProjectInput.evidence` is a pure callback, not runner IO ([src/graph/Build.ts:32](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/graph/Build.ts:32)). This closes that cycle. `Evidence.ts` still imports builder-owned interface types ([src/run/Evidence.ts:13](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/run/Evidence.ts:13)); moving Project/result-view data out of the builder would make the boundary clearer during D15.
- **Workspace/runner:** still cyclic as elements: Workspace imports Evidence/Steps/Store ([src/workspace/Workspace.ts:15](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/workspace/Workspace.ts:15)); Session imports Workspace ([src/run/Session.ts:19](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/run/Session.ts:19)). No file-level runtime cycle. The overview's declared links do not describe these dependencies. Move step loading to the runner and keep source/config IO in Workspace when doing D15; do not add another adapter layer.
- **Architecture view/reports:** no cycle remains, but the direction is now architecture → reports through `nodeJson` ([src/arch/Architecture.ts:14](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/arch/Architecture.ts:14)); no reports module imports Architecture. The overview still declares reports → architecture ([docs/architecture/overview.md:25](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/docs/architecture/overview.md:25)). Use the shared serialization boundary already planned in D18, with the architect deciding the graph change.
- Counting the no-op annotation API as part of the scanner element introduces vocabulary ↔ annotations: Vocabulary imports `sdp/annotations`, and `graph/Types.ts` imports Vocabulary. This is an artifact of assigning both the instrumentation API and the scanner to one element, not an ESM evaluation cycle. The architecture/import equality rule needs an explicit treatment of that API.
- The core remains pure by source inspection: no filesystem, environment or clock access in parse/build/query/check. Deterministic hashes and parsing native bindings do not themselves make a workflow effectful. Graph immutability is improved, but its public boundary is still wider than the implementation supports (W1A-05).
- The “only Vocabulary.ts interprets words” claim is not yet true. Templates switch on literal decision/element/pattern/milestone kinds, write fixed phase/iteration attributes, and keep a second maturity ladder ([src/cli/templates.ts:98](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/cli/templates.ts:98), [src/cli/templates.ts:117](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/cli/templates.ts:117), [src/cli/templates.ts:200](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/cli/templates.ts:200)). Builtin.ts also has its own literal scenario/result-attribute knowledge ([src/run/Builtin.ts:20](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/run/Builtin.ts:20), [src/run/Builtin.ts:34](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/run/Builtin.ts:34)). The guard only examines the configurable word set and syntactic graph-shaped expressions ([specs/steps/model.steps.ts:51](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/specs/steps/model.steps.ts:51)); passing it is not proof of the full rule. Fix the real remapping defect in W1A-06; use `made` for fixed scenario words rather than grow the guard into a general semantic analyzer.

These are the requested structural status observations, **not new findings against deferred D15 or the CLI/MCP structure**. D8–D10, D15, D18, release packaging and untouched corpus prose are not scored as missing implementations.

Effect use is generally proportionate. Store uses typed filesystem failures, a tagged lock error and `acquireUseRelease` to release the lock ([src/run/Store.ts:50](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/run/Store.ts:50)); the write/rename happens under it. Session's tag parser now uses `Effect.try` and `InvalidTags` ([src/run/Session.ts:46](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/run/Session.ts:46)), and Runner converts invalid expressions into `InvalidStepExpressions` ([src/run/Runner.ts:60](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/run/Runner.ts:60)). The probe printed errors on stderr without Effect stacks. Markdown's located YAML-to-JSON conversion is justified by provenance and cyclic-alias checks; wrapping its pure walk in Effect would not help. `Evidence.ts` is appropriately plain deterministic code. Static discovery's hand-cast generic AST and second `languageOf`/line-offset implementation duplicate parts of TypedAnnotations, but a shared parser result is enough; no service or generic parser framework is warranted. I did not inject process death, filesystem rename failures, or perform a memory soak; crash cleanup and long-term memory bounds remain unverified.

## 2. Status of each earlier A-finding

**16 closed, 5 partly closed, 1 open (22 in scope).** “Closed” refers to the earlier problem, not a promise that the surrounding subsystem has no new defect.

| Finding | Status | Evidence |
| --- | --- | --- |
| A-01 read tools execute code | Closed | [src/mcp/Server.ts:154](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/mcp/Server.ts:154) and [src/run/Match.ts:93](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/run/Match.ts:93) use static definitions; `node /private/tmp/sdp-sol-architecture-review/wave1/mcp.mjs` printed two `sdp_context` and one `sdp_snippets` calls with `isError:false, marker:false`. |
| A-02 tags missing from evidence | Closed | [src/parse/Gherkin.ts:233](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/parse/Gherkin.ts:233) hashes pickle tags; adapted `tag-hash` probe prints distinct `624ae9865b58` and `08411f4d2e6b`. |
| A-03 mutable graph aliases | Partly | [src/model/Graph.ts:107](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/model/Graph.ts:107) copies/freezes normal nodes and edges; `graph-ownership` retains edge `a→b` and `[1]` after input mutation. Non-plain values still alias; W1A-05. |
| A-04 Markdown fence/code confusion | Closed | [src/parse/Markdown.ts:107](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/parse/Markdown.ts:107) uses CommonMark; `markdown` prints `indented:[], invalidClose:0`. |
| A-05 concurrent runs lose results | Closed | [src/run/Store.ts:83](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/run/Store.ts:83) locks/re-reads/renames; adapted `concurrent-runs.mjs` prints both runs exit 0, `stored ["Fast#fast","Slow#slow"]`. |
| A-07 YAML injection in templates | Closed | [src/cli/templates.ts:84](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/cli/templates.ts:84) uses YAML Document; `templates` returns Success with `title: "Checkout: guest flow"`. |
| A-08 user mistakes become defects | Closed | [src/run/Session.ts:46](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/run/Session.ts:46), [src/run/Runner.ts:60](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/run/Runner.ts:60); `cli.py` prints exit 1 and `invalid --tags "(": syntax error: Unmatched (.` / `invalid step expression "hello {typo}": Undefined parameter type 'typo'.`, no stack. |
| A-09 cyclic/non-JSON YAML | Closed | [src/parse/Markdown.ts:247](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/parse/Markdown.ts:247) rejects cyclic aliases; both old cyclic forms print `front-matter/error` in `yaml-and-shell`, not exceptions. |
| A-10 yielding progress callbacks race | Closed | [src/run/Runner.ts:214](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/run/Runner.ts:214) has one queue consumer; `progress` prints `start First,end First,start Second,end Second,start Third,end Third`. |
| A-11 stale import dependencies | Open | [src/workspace/Workspace.ts:196](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/workspace/Workspace.ts:196) still owns an append-only graph; `repeated-load` prints helper before/after removal and expression `old`; store also unions imports forever ([src/run/Store.ts:74](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/run/Store.ts:74)). W1A-01 adds the stronger false-evidence reproduction. |
| A-12 unbounded fresh MCP generations | Closed | Fresh generation URLs are gone ([src/workspace/Workspace.ts:243](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/workspace/Workspace.ts:243)), and MCP reads import no steps. The marker remains absent across repeated requests. No RSS claim. |
| A-13 prototype dictionaries | Partly | `tally` and ids now use safe records ([src/model/Graph.ts:213](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/model/Graph.ts:213), [src/model/Config.ts:103](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/model/Config.ts:103)); graph copying still drops `__proto__` and installs an inherited value, W1A-05. |
| A-14 heavyweight step entry / id namespaces | Partly | [src/steps.ts:10](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/steps.ts:10) has a lean runtime; probe finds no heavy modules. `StepContext` still type-imports Project ([src/run/Steps.ts:26](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/run/Steps.ts:26)), and [examples/shop/tsconfig.json:6](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/examples/shop/tsconfig.json:6) still includes the tool's ids alongside the example's. Declaration packaging is deferred, not a new finding. |
| A-15 incorrectly typed RegExp captures | Closed | [src/run/Steps.ts:85](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/run/Steps.ts:85) promises raw string/undefined; [src/run/Match.ts:61](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/run/Match.ts:61) supplies raw captures. `regex-captures` prints `value:"4",type:"string"`. |
| A-16 local annotation target collisions | Closed | [src/parse/TypedAnnotations.ts:168](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/parse/TypedAnnotations.ts:168) rejects locals; adapted two-local probe emits no annotations and two located module-level-target diagnostics. |
| A-17 comment strings become annotations | Closed within D13 | [src/parse/Annotations.ts:86](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/parse/Annotations.ts:86) consumes parser comments; TS multiline-string probe emits no annotations. Other languages explicitly retain the brief's best-effort scanner ([src/parse/Annotations.ts:15](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/parse/Annotations.ts:15)). |
| A-18 guessed source locations | Partly | Scalar links now use YAML positions: old probe reports line 5 correctly. Aliases and attributed targets still report the wrong declaration line; W1A-08. |
| A-19 lost edge attrs/provenance | Closed in model | [src/model/Graph.ts:53](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/model/Graph.ts:53) merges attributes and sources; `edge-union` retains `{a:1,b:2}` and both sources. Builder emits `link-conflict` ([src/graph/Build.ts:365](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/graph/Build.ts:365)). Export DTO completeness is D18, not rescored here. |
| A-20 malformed structural containers disappear | Closed | [src/parse/Spec.ts:310](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/parse/Spec.ts:310) validates nodes; malformed map and whitespace-id probes emit `inline-node/error`. |
| A-21 inconsistent significance | Closed by deletion | Architecture selects all architectural kinds ([src/arch/Architecture.ts:29](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/arch/Architecture.ts:29)), and diagram shapes have no significance branch ([src/graph/Export.ts:74](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/graph/Export.ts:74)). D6 supersedes the old marker contract. |
| A-22 insufficient config validation | Partly | Empty/duplicate ladders and invalid prefixes are rejected ([src/model/Config.ts:168](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/model/Config.ts:168)); `surfaces.mjs` captured those errors. Blank words and incompatible role assignments still pass, W1A-04. Prefix round-trip was solved by restricting to letters, not the brief's escaping approach; see architect question. |
| A-25 memory glob root ignored | Closed | [src/workspace/MemoryFileSystem.ts:48](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/workspace/MemoryFileSystem.ts:48) roots and strips paths; adapted probe prints `subdirectory-glob ["child.md"]`. |

Unless a separate command is shown, probe labels above are output from:

```sh
node /private/tmp/sdp-sol-architecture-review/wave1/probes.mjs
```

The output is preserved in `probes.log`; other scripts have same-name `.log` captures. A-06/A-23/A-24 are deliberately omitted from the scored table, as requested.

## 3. New findings

### W1A-01 — P1 — Reloading steps can certify edited code that never ran

**Problem:** a second public `loadSteps`/`runWorkspace` cycle executes cached modules but fingerprints current disk contents as their evidence.

**Evidence:** [src/workspace/Workspace.ts:243](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/workspace/Workspace.ts:243) imports the same URL on every load; [src/run/Session.ts:130](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/run/Session.ts:130) independently reloads source text. [src/workspace/Workspace.ts:196](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/workspace/Workspace.ts:196) retains old dependency edges, while [src/run/Store.ts:74](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/run/Store.ts:74) retains every historical imported path. Run:

```sh
node /private/tmp/sdp-sol-architecture-review/wave1/reload-run.mjs
```

The script runs a passing handler, rewrites it to throw `NEW HANDLER FAILS`, loads and runs again in the same process. It printed `{"secondRun":"passed","currentGraph":"passed","stage":"verified"}` (plus the scratch workspace path). The adapted dependency probe separately printed `repeated-load {"before":["helper.mjs"],"after":["helper.mjs"],"expressions":["old"]}`.

**Why it matters:** “verified against these sources” is false. Removing fresh generations cured the MCP lifetime issue by deleting refresh, but did not make the exported execution API safe to reuse. The persisted union also makes dependency identity depend on run history across fresh processes.

**Smallest fix:** before reusing loaded modules, reject a changed source fingerprint with an explicit “restart this runner process” error; no worker framework is needed for today's CLI. Bind that check to the loaded modules so callers cannot accidentally pair stale modules with fresh evidence. Stop the process-global/historical append-only dependency policy: retain dependency membership with the result/load that needs it, and derive the active union from retained results rather than all past runs. Do not reintroduce unbounded query-string generations.

### W1A-02 — P1 — Gate evidence ignores ordinary-result data the gate can observe

**Problem:** only scenario ids and statuses are fingerprinted, while handlers receive ordinary results, timestamps, examples, step failures and durations.

**Evidence:** [src/run/Evidence.ts:122](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/run/Evidence.ts:122) hashes only `id=status`; [src/run/Evidence.ts:130](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/run/Evidence.ts:130) passes the raw results records through; [src/run/Runner.ts:119](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/run/Runner.ts:119) returns the entire Project to the handler. Command `node /private/tmp/sdp-sol-architecture-review/wave1/probes.mjs` prints:

```text
gate-result-details {"a":"19d58254929b","b":"19d58254929b","detailsChanged":true}
gate-retained-after-detail-change {"assertionBefore":true,"assertionNow":false,"gateStatus":"passed"}
```

The second probe changes an ordinary result's duration from 1 to 999 while keeping its passed status. A gate predicate `durationMs < 100` changes truth, but its stored result still settles as passed. This is an in-memory store transformation, not a claim that sdp itself edits a result's duration in place.

**Why it matters:** stratification removes a dependency cycle, but does not make the dependency fingerprint complete. Even the graph exposes `lastRun` and `staleBecause` that this hash omits. The store-wide `runAt` retained in an ordinary view also changes when gates commit, leaking metadata of the gate layer itself.

**Smallest fix:** fingerprint all ordinary-result data actually exposed to gates, including settled graph result attributes; exclude gate/store-wide metadata from their view. Delete the unused outer `runAt`. Alternatively narrow the handler view so the status fingerprint covers everything observable, but do not leave the broad Project contract with a narrow digest.

### W1A-03 — P2 — Static step discovery invents definitions and silently misses real ones

**Problem:** the scanner recursively walks handler bodies and arbitrary control flow using registrar names without scope checks, but silently ignores aliases.

**Evidence:** [src/parse/StepDefinitions.ts:114](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/parse/StepDefinitions.ts:114) traverses every descendant of the registration callback, including handlers at line 124. `python3 /private/tmp/sdp-sol-architecture-review/wave1/cli.py` creates a handler-local unrelated `Then("phantom",...)` and registers a real step through `const alias=Then; alias("missing",...)`.

```text
steps --json: expressions include "real" and "phantom", omit "missing"; exit 0, stderr empty
context A: Phantom has no undefined-step entry; Missing gets a suggested definition
run --json: [["Phantom","undefined"],["Missing","passed"]]
```

The exact CLI commands and full JSON are captured in `cli.log`. The pure `static-scopes` probe also reports an `if(false)` registration as a definition, with `problems:[]`.

**Why it matters:** agents are directed to reuse a nonexistent handler or write a duplicate of a real one. Read-only safety is fixed; matching truth is not.

**Smallest fix:** read only direct registration statements in the inline callback, never traverse handler/function bodies; warn on control flow or escaping/aliased registrar use as `step-unreadable`. Document that narrow form. No symbolic execution or full binding engine is needed.

### W1A-04 — P2 — Configuration accepts empty and contradictory vocabulary roles

**Problem:** scalar/array words are unrestricted strings, and role compatibility is not validated.

**Evidence:** [src/model/Config.ts:6](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/model/Config.ts:6) uses bare strings; [src/model/Config.ts:163](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/model/Config.ts:163) checks ladder size, duplicate levels, derived stages and prefixes, but not blank words or role collisions. `probes.mjs` prints successful decodes for:

```text
{"vocabulary":{"maturity":[""]}}
{"vocabulary":{"relations":{"anchor":""}}}
{"vocabulary":{"attributes":{"activity":"stage"}}}
{"vocabulary":{"relations":{"mention":"iteration"}}}
profile-collision-wildcard ... "edges":[{"from":"A","rel":"iteration","to":"I1",...}],"wildcard":[]
```

The last accepted profile turns an authored plan edge into a “mention” for wildcard traversal. Naming activity `stage` instead makes authored activity a forbidden derived attribute.

**Why it matters:** accepted configuration can disable central graph behaviours, rather than merely choose different words. The error then appears in a spec or query instead of the config that caused it.

**Smallest fix:** require nonblank words and reject the few incompatible assignments: configurable attributes versus reserved derived attributes; generated mention/scenario relations versus authored plan/phase/anchor/link roles; special decision statuses outside the configured decision-status list. Keep this as a small validation pass, not an extensible constraint system.

### W1A-05 — P2 — The graph's copy boundary loses legal keys and retains non-plain mutable inputs

**Problem:** deep copying through assignment to `{}` treats `__proto__` as a setter, while non-plain objects are returned unchanged.

**Evidence:** [src/model/Graph.ts:181](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/model/Graph.ts:181) creates `{}`, line 182 assigns dynamic keys, and line 185 returns unsupported objects by reference. [src/graph/Build.ts:160](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/graph/Build.ts:160) likewise accumulates arbitrary attrs into `{}`. Commands:

```sh
node /private/tmp/sdp-sol-architecture-review/wave1/probes.mjs
node /private/tmp/sdp-sol-architecture-review/wave1/surfaces.mjs
```

Observed `proto-data`: `own:false,nestedOwn:false,inherited:true`, and the authored keys vanish from serialized attrs. The Graph probe passes a Date in the publicly allowed `unknown` attrs, mutates the original date, and prints `graph-date 2030-01-01T00:00:00.000Z`. No cast is needed to supply that input.

**Why it matters:** JSON round-trip loses an author's valid key; the advertised public ownership guarantee remains false outside JSON-shaped inputs. This is not a claim of global Object.prototype pollution.

**Smallest fix:** construct dynamic records with `Object.fromEntries` or null prototypes at every copying/merging point. Make Attrs explicitly JSON data and reject unsupported runtime values at Graph construction; do not add special copying semantics for Date/Map/etc. The existing parser Json type should live with the model if shared.

### W1A-06 — P2 — Authoring templates bypass the vocabulary they just validated

**Problem:** templates keep interpreted kinds, statuses, lifecycle keys and maturity levels as a second hard-coded profile.

**Evidence:** [src/cli/templates.ts:98](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/cli/templates.ts:98) duplicates the ladder, line 124 writes `proposed`, and lines 200–207 write literal phase/iteration kinds and phase/order/start/end keys. `node /private/tmp/sdp-sol-architecture-review/wave1/surfaces.mjs` supplies remapped decision statuses and lifecycle roles and prints:

```text
custom-template decision ... "decision status should be one of pending, approved, retired (got proposed)"
custom-template plan ... "kinds":["plan","phase","phase","phase","phase","iteration","iteration","iteration","iteration"],"diagnostics":[]
```

Configured lifecycle kinds were `stage` and `sprint`; the generated nodes therefore are not recognized as lifecycle nodes. This is generated content, not stale repository prose.

**Why it matters:** the first authoring command after configuring the product creates data its own readers cannot interpret. The passing vocabulary guard misses this.

**Smallest fix:** pass the active Vocabulary to template generation and read its roles. Use built-in `criteria` for template content thresholds instead of a second ladder. Omit a suggested default status if none can be selected honestly from the profile; do not add a new “initial status” option merely for the template.

### W1A-07 — P2 — Annotation-supplied maturity does not update an existing node's stage

**Problem:** the annotation merge adds authored attrs after stage derivation and never derives stage again.

**Evidence:** [src/graph/Build.ts:279](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/graph/Build.ts:279) spreads new attrs into a previously derived node. `probes.mjs`, label `code-maturity-stage`, creates a spec A without maturity plus `// @sdp is A maturity=idea`; it prints:

```text
{"attrs":{"maturity":"idea","file":"a.md","scenarios":0,"verification":"none"},"diagnostics":[]}
```

There is no stage, although the same maturity written in the spec yields stage `idea`.

**Why it matters:** D4's summary depends on where an identical authored fact was written. Reports then undercount nodes with valid maturity.

**Smallest fix:** merge all authored declaration attributes before deriving stage/verification, once. If making the local change first, recompute stage after the annotation merge using the existing verification; do not duplicate the stage algorithm.

### W1A-08 — P2 — YAML alias and attributed-link locations still point away from the target

**Problem:** alias resolution replaces use-site location with the anchor's, and attributed links use the mapping's start instead of its `to` value.

**Evidence:** [src/parse/Markdown.ts:250](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/parse/Markdown.ts:250) recurses to the anchor and line 253 overwrites the incoming location; [src/parse/Spec.ts:257](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/parse/Spec.ts:257) discards the located `to` wrapper and line 266 uses `target.line`. `probes.mjs` prints:

```text
yaml-alias-location ... "source":{"file":"a.md","line":3}
yaml-object-location ... "source":{"file":"a.md","line":5}
```

The first reference is `uses: *target` on line 5 (anchor on line 3). The second `to: B` is line 6 (preceded by `note: reason` on line 5).

**Why it matters:** diagnostics and navigation still send an agent to a different fact. Positioned parsing should eliminate, rather than relocate, guessed provenance.

**Smallest fix:** preserve the alias node's use-site line on the resolved Located value; retain and use `field(target,"to").line` for attributed links. No new location abstraction is needed.

### W1A-09 — P3 — The severity catalogue disagrees with emitted diagnostics

**Problem:** `link-syntax` and `inline-node` are warnings in the supposed authoritative catalogue but errors in the parser and spec.

**Evidence:** [src/model/Diagnostic.ts:15](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/model/Diagnostic.ts:15) and line 18 say warning; [src/parse/Spec.ts:254](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/parse/Spec.ts:254) and line 310 emit error. REQ-check-rules lists both as errors ([specs/requirements/REQ-check-rules.md:38](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/specs/requirements/REQ-check-rules.md:38)). `probes.mjs`, label `severity-catalog`, prints:

```text
[[{"rule":"link-syntax","severity":"error","catalog":"warning"}],
 [{"rule":"inline-node","severity":"error","catalog":"warning"}]]
```

The current CLI emits the intended error severity; this probe does not establish a current CLI exit-code failure. The defect is the contradictory exported catalogue, and the repeated declarations that let it drift.

**Why it matters:** callers cannot use the catalogue to classify a rule reliably; future code following it can weaken the error gate. The suite checks emitted examples but not catalogue agreement.

**Smallest fix:** change those two catalogue entries to error and use `rules[rule]` when constructing diagnostics. Delete repeated severity declarations rather than add another mapping.

### W1A-10 — P3 — Vocabulary output omits the fixed words its diagnostics tell users to look up

**Problem:** both vocabulary output modes return only the configurable profile, although the module and a diagnostic promise the generated/derived words too.

**Evidence:** [src/model/Vocabulary.ts:128](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/model/Vocabulary.ts:128) defines `made`; [src/model/Vocabulary.ts:199](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/model/Vocabulary.ts:199) serializes only Vocabulary; [src/graph/Build.ts:172](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/graph/Build.ts:172) says “sdp vocabulary lists what it derives.” Run `python3 /private/tmp/sdp-sol-architecture-review/wave1/cli.py`: neither output includes `stage`, `verification`, `scenario`, `code` or the derived stages. Full output is in `cli.log`.

**Why it matters:** following the suggested fix's documentation route does not answer the user's question. It also conceals which words cannot be remapped.

**Smallest fix:** include a clearly read-only fixed/derived section from `made` in text and JSON output, distinct from the copyable config profile; adjust the copy-as-config claim accordingly. Do not add configurable keys or another flag. At minimum remove the false hint until that output exists.

## 4. What I would delete outright

- The outer results `runAt`, its DateTime read in Store, and the schema field: there is no src reader; the per-scenario timestamp is the fact that matters ([src/run/Store.ts:73](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/run/Store.ts:73), [src/model/Results.ts:72](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/model/Results.ts:72)).
- `defineSteps`' third `options.name` parameter: it has no scenario/example caller, and the default source location already identifies a module ([src/run/Steps.ts:101](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/run/Steps.ts:101)). Keep the source-based name needed by world-creation errors.
- The hard-coded template maturity list, replacing uses with `criteria`/the active profile ([src/cli/templates.ts:98](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/cli/templates.ts:98)).
- Repeated severity literals; the catalogue already exists ([src/model/Diagnostic.ts:10](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/model/Diagnostic.ts:10)).
- The second deep traversal over registration-handler bodies ([src/parse/StepDefinitions.ts:123](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/parse/StepDefinitions.ts:123)); narrow supported syntax instead of adding a second scope resolver.
- `export` on `Content` and `achievableMaturity`: no other src module imports those names ([src/check/Check.ts:41](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/check/Check.ts:41), [src/check/Check.ts:73](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/check/Check.ts:73)). Keep the functions/data themselves where used.
- The public memory-filesystem exports from the main programmatic barrel; executable specs already import their module directly ([src/index.ts:20](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/index.ts:20)). They are test infrastructure, not an essential sdp user surface.
- The duplicate invocation of `mergeEdges` in builder then Graph ([src/graph/Build.ts:365](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/graph/Build.ts:365), [src/model/Graph.ts:110](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/model/Graph.ts:110)), when consolidating ownership: let one construction boundary own merging and expose conflicts for the checker. Do not add a public `alreadyMerged` flag.
- The duplicate AST language/line-offset setup in StepDefinitions when sharing the existing script reader ([src/parse/StepDefinitions.ts:45](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/parse/StepDefinitions.ts:45), [src/parse/TypedAnnotations.ts:64](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/parse/TypedAnnotations.ts:64)). This is a small function reuse, not a parser framework.

The scalar `anchor` parameter from Build → scanCode → readTypedAnnotations is reasonable: the annotation parser needs that one role ([src/graph/Build.ts:101](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/graph/Build.ts:101), [src/parse/Annotations.ts:54](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/parse/Annotations.ts:54)). Passing the whole Config there would make the dependency worse. Conversely, Session's private `select(gates,vocabulary)` repeatedly passes the same workspace profile within a run ([src/run/Session.ts:136](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/run/Session.ts:136), [src/run/Session.ts:157](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/src/run/Session.ts:157)); close over `config.vocabulary` rather than imply per-call variation. ExportGraph's Vocabulary parameter is needed for diagrams; it should not acquire additional flags merely because the data-only formats do not use it.

## 5. Questions for the architect

1. Is reusable execution in one process a supported promise of the exported API? If yes, do bounded worker generations belong in this wave, or is explicit “sources changed; restart” rejection sufficient until isolation is built? Silent cached execution is not an acceptable third answer.
2. Are handlers intended to inspect raw result durations/errors/timestamps, or only settled graph state? That choice determines the smallest honest gate fingerprint (W1A-02); no new user option is needed.
3. May id prefixes be restricted to letters? That is now specified and enforced ([specs/requirements/REQ-configuration.md:60](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b34ce6d3-8b8b328d4344d8e7/specs/requirements/REQ-configuration.md:60)), whereas D1 asked for escaped prefixes that round-trip. The safe restriction closes the crash, but this is a design change to acknowledge rather than call equivalent.
4. For D15's architecture/import equality scenario, how should shared DTOs and the no-op annotation API be represented? The current element assignments create instrumentation cycles and an architecture→reports serialization dependency. These are proposals for the architect, not architectural edits made during this review.
