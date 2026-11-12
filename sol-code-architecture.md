# Code architecture and design review of sdp

## 1. Verdict

This is a promising, understandable inception implementation, but I would fix its trust and evidence boundaries before building more features on it. The pure core is real and the source dependency graph is acyclic; the principal weakness is that important invariants are promises in comments and TypeScript interfaces rather than properties enforced at construction and IO boundaries. That already causes incorrect retained evidence, mutable graph indexes, execution through supposedly read-only tools, and silent loss of query/result information.

Review only: no tracked files were edited and no commits were made. Node was v24.22.2. `node_modules` was initially absent; I created the symlink authorized in the brief. `npm run verify` exited 0: typechecks passed, ordinary scenarios reported `230 scenario(s): 230 passed`, and gates reported `11 gate scenario(s): 7 passed, 4 failed`. The four milestone failures are expected, not findings. `node src/cli/main.ts arch` reported five significant nodes and ten declared, non-significant nodes; I made no significance decisions.

I read the Effect 4 guidance in [node_modules/effect/AGENTS.md](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/node_modules/effect/AGENTS.md), including its `Effect.fn`/`Effect.gen`, Schema boundary, and tagged-error guidance. No finding below assumes Effect 2/3 conventions. The missing hooks/custom parameter API, npm type-stripping obstacle, and large-workspace reading problem are not counted as new findings.

Reproduction artifacts are in `/private/tmp/sdp-sol-architecture-review/`. The scripts resolve this checkout through `root.txt`; they create and modify temporary workspaces only. The exact commands below were run from this checkout. Corresponding `.log` files preserve the observed outputs. These are exploratory probes, not proposed additions to the project's test system; regression acceptance should be written as Gherkin scenarios.


Probe sources and logs: [probe.mjs](/private/tmp/sdp-sol-architecture-review/probe.mjs), [probe.log](/private/tmp/sdp-sol-architecture-review/probe.log), [live.mjs](/private/tmp/sdp-sol-architecture-review/live.mjs), [live.log](/private/tmp/sdp-sol-architecture-review/live.log), [more.mjs](/private/tmp/sdp-sol-architecture-review/more.mjs), [more.log](/private/tmp/sdp-sol-architecture-review/more.log), [additional.mjs](/private/tmp/sdp-sol-architecture-review/additional.mjs), [additional.log](/private/tmp/sdp-sol-architecture-review/additional.log), [concurrent-runs.mjs](/private/tmp/sdp-sol-architecture-review/concurrent-runs.mjs), [concurrent-runs.log](/private/tmp/sdp-sol-architecture-review/concurrent-runs.log), [import-surface.mjs](/private/tmp/sdp-sol-architecture-review/import-surface.mjs), [imports.json](/private/tmp/sdp-sol-architecture-review/imports.json), [types.ts](/private/tmp/sdp-sol-architecture-review/types.ts), [tsconfig.json](/private/tmp/sdp-sol-architecture-review/tsconfig.json).

## 2. Findings

### A-01 — P1 — Read-only MCP tools execute arbitrary workspace module initialization

**Problem.** Asking for context or snippets executes workspace code, despite advertising read-only, non-destructive and idempotent tools.

**Evidence.** [src/mcp/Server.ts:35](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/mcp/Server.ts:35) applies those annotations to every tool; [src/mcp/Server.ts:125](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/mcp/Server.ts:125) calls `loadSteps(..., { fresh: true })`, including from context at [src/mcp/Server.ts:164](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/mcp/Server.ts:164) and snippets at [src/mcp/Server.ts:172](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/mcp/Server.ts:172). [src/workspace/Workspace.ts:225](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/workspace/Workspace.ts:225) dynamically imports each step module, executing its top-level statements. CLI context does the same at [src/cli/main.ts:177](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/cli/main.ts:177).

Command: `node /private/tmp/sdp-sol-architecture-review/live.mjs`. A temporary step file appended `executed\n` to a marker during module initialization. The tool listing printed:

```text
MCP-context-annotations {"readOnlyHint":true,"destructiveHint":false,"idempotentHint":true,"openWorldHint":false}
MCP-context 0 isError false
MCP-context 1 isError false
MCP-import-side-effect executed
executed
```

**Why it matters.** Inspecting a repository becomes a code-execution operation, and repeated reads repeat module side effects. A client can reasonably grant different authority to a read tool and a scenario runner. There is no process boundary, sandbox, or trust distinction here.

**Recommendation.** Separate static step-definition discovery from execution. Read context safely without importing steps by default; expose execution-backed matching as an explicitly trusted capability. A disposable worker can contain lifetime and failures, but merely moving arbitrary code into a worker does not make the tool read-only. Until static discovery exists, correct the advertised tool contract and make the trust requirement explicit in the product design.

### A-02 — P1 — Scenario evidence omits tags that handlers and scheduling can observe

**Problem.** Changing executable tags can leave a previous result valid even when rerunning the unchanged handler now fails.

**Evidence.** [src/parse/Gherkin.ts:232](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/parse/Gherkin.ts:232) hashes pickle names, step texts, doc strings and tables, but omits pickle tags. Tags are exposed to handlers at [src/run/Runner.ts:103](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/run/Runner.ts:103); they also decide gate and serial behavior at [src/graph/Build.ts:328](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/graph/Build.ts:328) and [src/run/Runner.ts:178](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/run/Runner.ts:178). Ordinary handlers that do not access `project` record no whole-spec fingerprint ([src/run/Runner.ts:165](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/run/Runner.ts:165)).

Command: `node /private/tmp/sdp-sol-architecture-review/more.mjs`. The probe passed a scenario whose handler fails when its tags include `@changed`, then added that tag and rebuilt with the stored result:

```text
tag-hash-and-evidence {"beforeHash":"20e143b847c9","afterHash":"20e143b847c9","cachedStatus":"passed","rerunStatus":"failed"}
```

**Why it matters.** The platform's central claim is that verified state comes from applicable evidence. The cache identity excludes part of the scenario's observable input. This is not a merely cosmetic tag edit.

**Recommendation.** Define one canonical executable-scenario representation, including inherited feature/rule/example tags and all handler-visible scenario metadata, and hash it. Use the same representation for execution selection and evidence. Add a scenario that changes a tag and observes stale evidence before rerunning.

### A-03 — P1 — The immutable graph retains mutable aliases that can invalidate its indexes

**Problem.** `readonly` views do not prevent callers from mutating constructor inputs after the graph has indexed them.

**Evidence.** [src/model/Graph.ts:40](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/model/Graph.ts:40) retains node objects, [src/model/Graph.ts:50](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/model/Graph.ts:50) retains edge objects, and [src/model/Graph.ts:61](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/model/Graph.ts:61) returns the actual adjacency array. The public `nodes` map and `edges` array are ordinary mutable JS collections, merely typed as readonly. Nested `Attrs` values are `unknown`, with only a shallow readonly record ([src/model/Graph.ts:15](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/model/Graph.ts:15)). The architecture explicitly calls this graph immutable ([docs/architecture/overview.md:67](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/docs/architecture/overview.md:67)).

Command: `node /private/tmp/sdp-sol-architecture-review/probe.mjs`. Constructing an edge `a -> b`, building the graph, then changing the original edge's `from` to `b` printed:

```text
graph-alias {"edges":[{"from":"b","rel":"uses","to":"b"}],"fromA":[{"from":"b","rel":"uses","to":"b"}],"fromB":[]}
```

No cast is needed to mutate the original mutable input. Subgraphs also share node and edge objects ([src/model/Graph.ts:91](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/model/Graph.ts:91)).

**Why it matters.** Query traversal and graph export can disagree about the same graph. `project` exposes this graph directly to user step handlers, so this can contaminate other scenarios in a run.

**Recommendation.** Make graph construction an ownership boundary: copy and freeze nodes/edges and JSON-compatible attribute trees, keep mutable maps private, and expose read-only iteration/query methods or genuinely immutable map wrappers. Do not rely on `Object.freeze(new Map())`, which does not disable `.set()`. If runtime immutability is intentionally rejected, stop promising it and explicitly constrain/defend the execution API; the current half-contract is unsafe.

### A-04 — P1 — The Markdown scanner can turn fenced documentation into executable scenarios

**Problem.** Fence closing is a prefix test rather than Markdown fence syntax, and other code regions are treated as prose.

**Evidence.** [src/parse/Markdown.ts:63](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/parse/Markdown.ts:63) recognizes openings; [src/parse/Markdown.ts:96](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/parse/Markdown.ts:96) closes when any trim-started line starts with the opening marker, allowing trailing non-whitespace and arbitrary indentation. [src/parse/Markdown.ts:116](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/parse/Markdown.ts:116) then collects references from all remaining ordinary lines, including indented code and HTML comments.

Commands:

```sh
node /private/tmp/sdp-sol-architecture-review/probe.mjs
node /private/tmp/sdp-sol-architecture-review/additional.mjs
```

The first printed `markdown-indented [{"id":"GHOST","line":1},{"id":"HIDDEN","line":3}]` for an indented code line and an HTML comment. Its `markdown-invalid-close` probe extracted `[[GHOST]]` from inside a text fence after a ` ```not-a-close` line. The additional probe used this body:

````text
```text
```not-a-closer
```gherkin
Scenario: This is documentation
  Then hello
```
````

It printed `scenario-inside-text [ 'This is documentation' ]`. In Markdown, the info-bearing lines do not close the initial fence; the Gherkin is text inside that fence.

**Why it matters.** Rendered documentation and executed specifications disagree. Ordinary examples can create graph links, diagnostics, readiness inputs, or actual executable scenarios.

**Recommendation.** Use a Markdown block/inline tokenizer with source positions, such as a CommonMark-compatible parser, and extract only the supported nodes. Keep wiki-link extraction as a small extension over prose nodes. If the team deliberately wants a smaller dialect, specify it explicitly and enforce it; repair closing fence length/character/indentation/trailing-text rules at minimum. Parsing Markdown independently again in [src/check/Check.ts:82](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/check/Check.ts:82) and [src/graph/Context.ts:182](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/graph/Context.ts:182) increases the inconsistency risk.

### A-05 — P2 — Concurrent partial runs overwrite each other's successful results

**Problem.** Results persistence is an uncoordinated read/modify/write sequence, so two legitimate runs lose evidence.

**Evidence.** [src/run/Session.ts:124](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/run/Session.ts:124) loads previous results, merges and writes at [src/run/Session.ts:129](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/run/Session.ts:129), then writes again at [src/run/Session.ts:134](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/run/Session.ts:134). [src/workspace/Workspace.ts:116](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/workspace/Workspace.ts:116) uses plain `writeFileString`, with no lock, compare-and-swap, or atomic replacement.

Command: `node /private/tmp/sdp-sol-architecture-review/concurrent-runs.mjs`. It starts `node src/cli/main.ts -C <temporary-workspace> run Slow` and `... run Fast` concurrently. Both exited 0 and printed `1 scenario(s): 1 passed`. The final file contained:

```text
stored ["Slow#slow"]
```

The passed `Fast#fast` result disappeared. Separately, atomicity against process termination is a source-level risk of truncating the destination in place; I did not inject a crash.

**Why it matters.** Parallel agents or CI jobs can erase each other's verified state. A local JSON file is a reasonable design, but it still needs a transaction policy.

**Recommendation.** Serialize workspace result transactions with an interprocess lock and reload/merge under that lock; write a temporary file and atomically rename it. Define how the ordinary-run/gate phases interact with other runs. Prefer a single evidence-store abstraction rather than two ad hoc writes in session orchestration.

### A-06 — P2 — Machine-readable queries silently discard truncation information

**Problem.** `q --json` returns a partial answer as a successful bare array without revealing that it is incomplete.

**Evidence.** [src/graph/Query.ts:89](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/graph/Query.ts:89) correctly carries `truncated` and `limits`. [src/cli/main.ts:118](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/cli/main.ts:118) returns JSON before reaching the warning at [src/cli/main.ts:126](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/cli/main.ts:126). Query-selected graph export also ignores the flag ([src/cli/main.ts:85](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/cli/main.ts:85)). MCP handles it explicitly ([src/mcp/Server.ts:136](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/mcp/Server.ts:136)), so the transports disagree.

Command: `node /private/tmp/sdp-sol-architecture-review/live.mjs`. Its temporary graph has a root with 10,001 outgoing edges, then invokes `node src/cli/main.ts -C <temporary-workspace> q '#ROOT -uses-> *' --json`:

```text
q-json-cut { status: 0, count: 10000, stderr: '' }
```

**Why it matters.** Agents and scripts receive weaker evidence than human users. A downstream completeness assertion cannot distinguish this from a full answer of 10,000 nodes.

**Recommendation.** Return a shared JSON result envelope containing nodes/paths, truncation, and limits; decide a consistent exit policy. At minimum emit the warning before every output-mode return. Refuse or explicitly mark incomplete query-selected exports.

### A-07 — P2 — Authoring templates interpolate unescaped user input into YAML

**Problem.** Ordinary titles can make `sdp new` create an invalid spec while reporting success.

**Evidence.** Examples of raw interpolation are [src/cli/templates.ts:85](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/cli/templates.ts:85), [src/cli/templates.ts:140](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/cli/templates.ts:140), and [src/cli/templates.ts:203](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/cli/templates.ts:203). The write path does not parse/validate generated content ([src/cli/main.ts:470](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/cli/main.ts:470), [src/cli/main.ts:490](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/cli/main.ts:490)).

Command: `node /private/tmp/sdp-sol-architecture-review/live.mjs`. Within its temporary workspace:

```text
sdp new requirement 'Checkout: guest flow'
exit 0; REQ-checkout-guest-flow\tspecs/requirements/REQ-checkout-guest-flow.md
sdp check --json
exit 1; invalid front matter: Nested mappings are not allowed in compact mappings
source: specs/requirements/REQ-checkout-guest-flow.md:4
```

The generated line is `title: Checkout: guest flow`. Hash characters and YAML-looking scalar titles create related interpretation risks; only the colon case was behaviorally tested.

**Why it matters.** The shortest supported authoring workflow can produce a file that immediately drops out of the graph.

**Recommendation.** Build front matter as data and serialize with the existing YAML dependency; keep comments/prose separately. Parse every generated spec before writing it. Quote custom ids, kinds, and maturity values as data too.

### A-08 — P2 — Expected user mistakes escape as Effect defects instead of typed input errors

**Problem.** Step-expression compilation and tag parsing can throw outside the typed error boundary, defeating graceful context fallback and machine output.

**Evidence.** [src/run/Match.ts:43](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/run/Match.ts:43) directly constructs Cucumber expressions; [src/run/Session.ts:31](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/run/Session.ts:31) directly parses tag expressions. CLI context catches only `StepLoadError` ([src/cli/main.ts:179](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/cli/main.ts:179)), and the top-level catch list ([src/cli/main.ts:577](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/cli/main.ts:577)) contains neither error. MCP similarly maps loading failures before an `Effect.map` callback constructs the matcher ([src/mcp/Server.ts:126](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/mcp/Server.ts:126)).

Command: `node /private/tmp/sdp-sol-architecture-review/live.mjs`:

- With a valid step module registering `hello {typo}`, `sdp context A` exited 1 and printed an Effect `ERROR (#1)` plus the Cucumber stack to stdout, starting `This Cucumber Expression has a problem at column 7:` and `Undefined parameter type 'typo'.` No context bundle was printed.
- `sdp run --tags '('` exited 1 and printed an Effect stack to stdout: `Tag expression "(" could not be parsed because of syntax error: Unmatched (.`, including [src/run/Session.ts:31:59](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/run/Session.ts:31:59).

**Why it matters.** These are ordinary authoring errors, not programmer defects. The documented intent that broken definitions only cost the matching part of context ([src/cli/main.ts:175](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/cli/main.ts:175)) is false for malformed expressions.

**Recommendation.** Give matcher construction and tag parsing explicit Result/Effect error types with step-definition location or argument name. Catch those at the application boundary; preserve the readable portion of context and return an MCP tool error where appropriate. Keep thrown assertions inside step execution—those already have a deliberate failure boundary.

### A-09 — P2 — Front matter admits cyclic and structurally invalid values into the pure model

**Problem.** YAML decoding checks only that the root is a mapping, leaving data that cannot be safely normalized or exported.

**Evidence.** [src/parse/Markdown.ts:157](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/parse/Markdown.ts:157) returns arbitrary parsed YAML after a root-object check. [src/parse/Spec.ts:96](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/parse/Spec.ts:96) puts arbitrary values in attrs; [src/parse/Spec.ts:265](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/parse/Spec.ts:265) can stringify malformed links while diagnosing them. `Attrs` is an unrestricted `Record<string, unknown>` ([src/model/Graph.ts:15](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/model/Graph.ts:15)), while JSON serialization is assumed later ([src/graph/Export.ts:22](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/graph/Export.ts:22)).

Command: `node /private/tmp/sdp-sol-architecture-review/additional.mjs`:

```text
ERROR Converting circular structure to JSON
built metadata: &x {self: *x}
ERROR Converting circular structure to JSON
```

The first case is front matter `links: &x [*x]`: construction itself throws while trying to diagnose malformed links. The second case successfully builds a spec with `metadata: &x {self: *x}`, then graph JSON export throws.

**Why it matters.** A valid YAML document can bypass diagnostics and crash a normal graph read. The claimed pure API is not total over its external format, and metadata cannot reliably round-trip through the advertised JSON surface.

**Recommendation.** Decode a small open front-matter schema: validate known structural keys, allow arbitrary author keys in an explicitly JSON-compatible recursive value model, and handle YAML aliases/cycles deliberately before normalization. Preserve free-form kinds/relations; schema validation need not prescribe their vocabulary. Convert invalid inputs to source-located diagnostics.

### A-10 — P2 — Ordered progress callbacks race when the callback yields

**Problem.** The runner's shared progress cursor advances after yielding to the callback, allowing concurrent fibers to report the same result repeatedly.

**Evidence.** [src/run/Runner.ts:181](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/run/Runner.ts:181) creates shared mutable `done`/`reported`; [src/run/Runner.ts:186](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/run/Runner.ts:186) yields `onScenario` before incrementing `reported`, while parallel runs call `report` at [src/run/Runner.ts:190](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/run/Runner.ts:190). The callback's public type explicitly permits an arbitrary Effect ([src/run/Runner.ts:29](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/run/Runner.ts:29)).

Command: `node /private/tmp/sdp-sol-architecture-review/additional.mjs`. With three concurrent scenarios and an `onScenario` callback sleeping five milliseconds:

```text
async-progress ["start First","start First","start First","end First","start Second","end First","start Third","end First","end Second","end Third"]
```

**Why it matters.** Public callback consumers can receive duplicate/out-of-order events even though the code promises ordered reporting. A yielding logger, reporter, or artifact writer is a normal consumer.

**Recommendation.** Have workers enqueue indexed completion events and a single consumer publish them in order, or guard the whole cursor/drain operation with a semaphore. Define callback failure behavior. Do not fix this merely by moving the increment: that avoids some duplication but permits overlapping ordered callbacks.

### A-11 — P2 — Fresh step loading keeps dependencies removed from the source

**Problem.** The import graph accumulates old edges and cannot describe the current source snapshot accurately after edits.

**Evidence.** [src/workspace/Workspace.ts:166](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/workspace/Workspace.ts:166) owns a process-global import graph. Resolution adds to existing sets at [src/workspace/Workspace.ts:188](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/workspace/Workspace.ts:188); `importedBy` traverses those accumulated sets at [src/workspace/Workspace.ts:246](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/workspace/Workspace.ts:246). No fresh-load path clears or versions them.

Command: `node /private/tmp/sdp-sol-architecture-review/live.mjs`. It freshly loads a module importing `helper.ts`, removes that import, then freshly loads again:

```text
imports-before ["helper.ts"]
imports-after-removal ["helper.ts"]
```

**Why it matters.** Dependency lists and evidence depend on process history. Former helpers remain fingerprint inputs, so unrelated edits can invalidate results; the source-of-truth graph is no longer a function of current files alone.

**Recommendation.** Record dependencies per load generation and replace the previous generation atomically. Make the dependency snapshot an output of a loader instance, not an append-only process singleton. Preserve any deliberately shared package dependencies separately.

### A-12 — P2 — MCP step refresh has no lifetime boundary for imported module generations

**Problem.** Each context/snippet request creates a new generation of ESM modules in the long-lived server, with no disposal mechanism.

**Evidence.** [src/mcp/Server.ts:125](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/mcp/Server.ts:125) requests fresh imports for every matching read; [src/workspace/Workspace.ts:201](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/workspace/Workspace.ts:201) holds a monotonic generation counter; [src/workspace/Workspace.ts:222](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/workspace/Workspace.ts:222) appends a unique query string, propagating it through workspace imports at [src/workspace/Workspace.ts:190](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/workspace/Workspace.ts:190). `hookImports` registers a process-global hook once ([src/workspace/Workspace.ts:175](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/workspace/Workspace.ts:175)), without retaining/deregistering its handle. This is a separate lifetime problem from the stale dependency edges in A-11.

Command: `node /private/tmp/sdp-sol-architecture-review/live.mjs` showed two successful context requests reevaluating the same unchanged step module twice (`executed` twice). The unique ESM identities and absent disposal are directly visible in the cited implementation. **Unverified:** long-duration memory growth magnitude and impact; no RSS soak test was performed.

**Why it matters.** Module initialization, package-level singletons, listeners and cached ESM generations live in the server process. Refreshing source through ever-new URLs has no bounded ownership or cleanup policy.

**Recommendation.** Use a disposable execution worker/process per source generation, recycling it when steps change. Prefer content-fingerprint refresh to unconditional refresh. Keep package resolution hooks scoped to that worker so loading one workspace cannot alter unrelated imports in the host process.

### A-13 — P2 — Plain-object dictionaries break on legitimate free-form names

**Problem.** User vocabulary is used as keys in ordinary objects without excluding inherited properties.

**Evidence.** [src/graph/Status.ts:6](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/graph/Status.ts:6) increments counts through `counts[key]`; [src/cli/templates.ts:22](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/cli/templates.ts:22) reads `config.ids[kind]`, and [src/cli/templates.ts:55](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/cli/templates.ts:55) reads `directoryFor[kind]` through the prototype chain. Similar patterns appear in lifecycle counts ([src/lifecycle/Lifecycle.ts:159](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/lifecycle/Lifecycle.ts:159)) and the shop VAT lookup ([examples/shop/src/pricing.ts:13](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/examples/shop/src/pricing.ts:13)).

Commands:

```sh
node /private/tmp/sdp-sol-architecture-review/probe.mjs
node /private/tmp/sdp-sol-architecture-review/more.mjs
```

Observed:

```text
prototype-stage-counts {"constructor":"function Object() { [native code] }1"}
prototype-template-kind THREW (dir ?? directoryFor[options.kind] ?? kind).replace is not a function
```

The inputs were a maturity named `constructor` and `newSpec({ kind: 'constructor', ... })`. Neither should have special JS object semantics in a free-form graph.

**Why it matters.** This imposes an accidental reserved vocabulary and can yield corrupted output or defects. It is a design-level dictionary policy, not an isolated arithmetic mistake.

**Recommendation.** Use `Map`, null-prototype records, or own-property access consistently for author-provided names. Apply the same rule to config lookup tables, serializers, counters and examples; centralize counting where it avoids repeating this defect.

### A-14 — P2 — The step API barrel eagerly loads the application and merges workspace id namespaces

**Problem.** Importing `defineSteps` from the supported package entry pulls in workspace IO, native parsing and the complete graph application; source imports also pollute consumers' annotation ids.

**Evidence.** [src/index.ts:8](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/index.ts:8) through [src/index.ts:20](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/index.ts:20) eagerly re-export builders, reports, runner, loader and memory filesystem. [package.json:10](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/package.json:10) offers only that entry and the lean annotation subpath. [examples/shop/tsconfig.json:2](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/examples/shop/tsconfig.json:2) explicitly admits that importing `sdp` brings its sources into the example, requiring both its own generated ids and sdp's ids at [examples/shop/tsconfig.json:6](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/examples/shop/tsconfig.json:6). Thus the example's ids are a union with the host tool's, not an isolated workspace catalogue.

Command: `node /private/tmp/sdp-sol-architecture-review/import-surface.mjs`:

```text
public-index loaded 449 modules
.../node_modules/oxc-parser/src-js/index.js
.../src/workspace/Workspace.ts
.../src/workspace/MemoryFileSystem.ts
.../node_modules/@oxc-parser/binding-darwin-arm64/package.json
```

This probes the same ESM entry used by `import { defineSteps } from 'sdp'`; named imports do not tree-shake runtime ESM evaluation. I am not attributing the known npm type-stripping failure as a new issue here.

**Why it matters.** A tiny step module is coupled to the tool's full runtime dependency/platform surface. Compile-time ids also depend on the tool's own source program, undermining the advertised per-workspace typing.

**Recommendation.** Make the default entry the minimal authoring API, or introduce `sdp/steps` and use it consistently. Put graph/programmatic APIs behind explicit subpaths; keep memory test support separate. Ship declaration files at the package boundary so implementation annotations do not become client program input. Export the types/config constructors needed by any supported programmatic entry rather than forcing consumers toward internal source paths.

### A-15 — P2 — RegExp step captures are typed as strings but can be numbers

**Problem.** The public handler contract disagrees with Cucumber's parameter conversion.

**Evidence.** [src/run/Steps.ts:76](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/run/Steps.ts:76) types all RegExp arguments as `ReadonlyArray<string>`. [src/run/Match.ts:49](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/run/Match.ts:49) uses Cucumber `RegularExpression`, and [src/run/Runner.ts:96](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/run/Runner.ts:96) calls each argument's converter, which can infer registered numeric parameter types from captures.

Command: `node /private/tmp/sdp-sol-architecture-review/probe.mjs`:

```text
regex-typed-as-string [{"value":4,"type":"number"}]
```

Command: `./node_modules/.bin/tsc --noEmit -p /private/tmp/sdp-sol-architecture-review/tsconfig.json` exited 0 with no output. The checked handler was:

```ts
Then(/^there are (\d+) items$/, ({ args: [n] }) => { n?.toUpperCase() })
```

The typecheck permits a string method on the actual numeric value. The non-null optional access accounts for `noUncheckedIndexedAccess`; it does not make numbers support that method.

**Why it matters.** The central type-safe step API can approve handlers that fail only at runtime.

**Recommendation.** Use unknown captures unless callers supply an explicit decoder/typed RegExp registration, or guarantee raw string captures instead of invoking inferred Cucumber conversion. Keep literal Cucumber-expression inference as a separate typed overload; do not pretend arbitrary RegExp capture inference is equivalent.

### A-16 — P2 — Typed annotation identity conflates distinct local declarations

**Problem.** The scanner accepts annotations inside scopes but identifies their targets by unqualified text, collapsing different symbols into one code node.

**Evidence.** [src/parse/TypedAnnotations.ts:128](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/parse/TypedAnnotations.ts:128) walks nested scopes, while its declaration map covers only top-level declarations ([src/parse/TypedAnnotations.ts:114](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/parse/TypedAnnotations.ts:114)). It emits only a textual symbol name at [src/parse/TypedAnnotations.ts:170](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/parse/TypedAnnotations.ts:170). [src/parse/Annotations.ts:92](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/parse/Annotations.ts:92) builds code ids as file plus that name; [src/graph/Build.ts:209](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/graph/Build.ts:209) silently reuses the first matching code node.

Command: `node /private/tmp/sdp-sol-architecture-review/additional.mjs`. With `first()` and `second()` each declaring a local `item` and annotating it as `A` and `B`, the graph printed one code node, `code:x.ts#item`, sourced at line 2, and both `is A` and `is B` edges from that node. The second symbol is at line 3.

**Why it matters.** A typed link to a real symbol loses its identity on entry to the graph; code navigation and architectural attribution become false.

**Recommendation.** Resolve lexical declaration identity and assign stable qualified names, retaining actual declaration locations. If local targets are outside the intended contract, reject them with an actionable annotation diagnostic instead of accepting them and merging them. Reuse the parser's binding facilities where available rather than maintaining a second partial binder indefinitely.

### A-17 — P2 — Comment annotations are recognized inside multiline string literals

**Problem.** The language-agnostic scanner cannot distinguish a comment-looking line inside a string from an actual source comment.

**Evidence.** [src/parse/Annotations.ts:38](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/parse/Annotations.ts:38) scans independent lines with a comment-prefix regex. [src/graph/Build.ts:85](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/graph/Build.ts:85) runs it for all configured code, including TS/JS already parsed with oxc. The module claims strings mentioning annotations are not annotations ([src/parse/Annotations.ts:6](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/parse/Annotations.ts:6)).

Command: `node /private/tmp/sdp-sol-architecture-review/probe.mjs`. Input:

```python
text = '''
# @sdp is GHOST
'''
```

Output:

```text
comment-in-multiline-string [{"file":"x.py","line":2,"rel":"is","targets":["GHOST"],"attrs":{}}]
```

**Why it matters.** Examples, generated templates and embedded source can create phantom architecture/code nodes. Since `is` may declare missing nodes, this does not necessarily appear as a dangling-link error.

**Recommendation.** Consume actual comment tokens for TS/JS through the existing parser. Define supported comment-scanner language contracts for other languages and use lexical state/tokenizers where necessary; do not claim string exclusion from line regexes. Retain a documented best-effort fallback only if the architect accepts its ambiguity.

### A-18 — P2 — Source locations are guessed by searching values instead of preserving YAML positions

**Problem.** A link can be reported at an unrelated earlier occurrence of its target id.

**Evidence.** [src/parse/Spec.ts:113](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/parse/Spec.ts:113) asks `frontMatterLineOf` for target positions. That helper ([src/parse/Markdown.ts:202](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/parse/Markdown.ts:202)) searches every front-matter line for the first matching token, without regard to key or YAML node. Quoted top-level keys also evade `frontMatterKeyLine`'s raw `startsWith` test ([src/parse/Markdown.ts:211](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/parse/Markdown.ts:211)).

Command: `node /private/tmp/sdp-sol-architecture-review/probe.mjs`. Input front matter has `rationale: mentions B` on line 3 and `links: / uses: B` on lines 4–5. Output:

```text
wrong-source-line [{"from":"A","rel":"uses","to":"B","source":{"file":"a.md","line":3}}]
```

**Why it matters.** Exact `file:line` provenance is a core navigation contract; agents can be directed to edit the wrong fact. Literal grepability does not make the first occurrence the declaration.

**Recommendation.** Parse YAML with its AST/ranges and a line counter, carry locations through normalization, and retire value-search heuristics. Keep unknown attributes free-form while preserving their actual source spans.

### A-19 — P2 — Edge de-duplication silently destroys attributes and additional provenance

**Problem.** Distinct declarations of the same relation triple are collapsed with first-wins metadata and no conflict policy.

**Evidence.** [src/model/Graph.ts:47](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/model/Graph.ts:47) keys only `(from, rel, to)` and discards subsequent edges at [src/model/Graph.ts:48](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/model/Graph.ts:48), including their attrs and source. Neither the constructor nor builder merges declaration evidence or reports attribute conflicts.

Command: `node /private/tmp/sdp-sol-architecture-review/probe.mjs`. Two `a -uses-> b` edges respectively had `via: http` at `a.md:3` and `via: queue` at `b.md:8`. Output:

```text
edge-provenance-loss [{"from":"a","to":"b","rel":"uses","source":{"file":"a.md","line":3},"attrs":{"via":"http"}}]
```

**Why it matters.** Multiple declarations are normal in a graph assembled from front matter, prose, implicit attributes and annotations. The graph currently cannot explain all supporting evidence, and traversal order decides which attributed fact survives.

**Recommendation.** Decide whether an edge is a relation triple with multiple declarations, or an attributed multigraph edge. For the former, retain a list of source declarations and define attribute merge/conflict behavior; for the latter, give edges stable identities. De-duplicate traversal without deleting source facts.

### A-20 — P2 — Malformed structural front matter can disappear without any diagnostic

**Problem.** Reserved keys have selectively permissive normalization, so malformed declarations can be silently dropped.

**Evidence.** [src/parse/Spec.ts:282](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/parse/Spec.ts:282) returns no nodes when `nodes` is not an array. Main ids are trimmed and checked for emptiness at [src/parse/Spec.ts:80](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/parse/Spec.ts:80), whereas inline ids are merely checked for string type at [src/parse/Spec.ts:285](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/parse/Spec.ts:285) and copied unchanged at [src/parse/Spec.ts:296](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/parse/Spec.ts:296).

Command: `node /private/tmp/sdp-sol-architecture-review/probe.mjs`:

```text
inline-bad-shape {"ids":["A"],"diagnostics":[]}
```

The input declared `nodes: {id: B}` rather than a list. The intended `B` declaration vanished. The whitespace/empty inline-id inconsistency is source-verified; it was not separately executed.

**Why it matters.** A typo in a structural field should not look like successful parsing of a smaller, possibly vacuously valid graph. This weakens the checker before any architectural rules run.

**Recommendation.** Validate the structural shell of front matter with Schema, using the same id constructor for top-level and inline declarations. Keep arbitrary author metadata open. Report malformed reserved structures with their actual YAML locations rather than quietly substituting empty collections.

### A-21 — P2 — Significance is interpreted differently by architecture, queries and exports

**Problem.** Different readers disagree about the same explicitly authored marker.

**Evidence.** [src/arch/Architecture.ts:15](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/arch/Architecture.ts:15) accepts boolean `true`, string `"true"`, and string `"yes"`. Diagram styling at [src/graph/Export.ts:80](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/graph/Export.ts:80) and [src/graph/Export.ts:110](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/graph/Export.ts:110), listing fallback at [src/graph/Export.ts:43](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/graph/Export.ts:43), and context text at [src/graph/Context.ts:206](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/graph/Context.ts:206) accept only boolean `true`. Queries compare the stored raw value ([src/graph/Query.ts:403](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/graph/Query.ts:403)).

Command: `node /private/tmp/sdp-sol-architecture-review/additional.mjs`, with `significant: "yes"`:

```text
significance {"marked":["A"],"mermaid":"flowchart LR\n  n0[\"A<br/><small>A</small>\"]\n","queryTrue":[]}
```

Architecture considers A significant, Mermaid emits no significant style, and `[significant=true]` finds nothing.

**Why it matters.** The architect's authored decision does not travel consistently through the product. This finding asks for consistent interpretation, not automatic significance decisions, limits or checks.

**Recommendation.** Choose one documented representation of the architect's marker and use a shared accessor/normalization in all views. Do not add any rule judging whether the choice is appropriate. If aliases are supported, preserve authored raw metadata separately from the normalized interpretation.

### A-22 — P2 — Configuration Schema validates containers but misses invariants its consumers require

**Problem.** Accepted configuration can contradict the authoring/query model or crash ordinary commands.

**Evidence.** [src/model/Config.ts:14](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/model/Config.ts:14) accepts any string array as a maturity ladder; [src/cli/templates.ts:53](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/cli/templates.ts:53) falls back to `idea` when that ladder is empty. Id prefixes are unrestricted strings ([src/model/Config.ts:15](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/model/Config.ts:15)), inserted unescaped into a RegExp at [src/cli/templates.ts:26](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/cli/templates.ts:26), while kind inference recognizes only an alphabetic segment ([src/parse/Spec.ts:203](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/parse/Spec.ts:203)).

Command: `node /private/tmp/sdp-sol-architecture-review/more.mjs`:

```text
empty-maturity {"maturity":[],"new":"maturity: idea   #  (implemented/verified is derived from scenario results)"}
config-prefix-roundtrip {"id":"MY-COMP-name","withoutExplicitKind":"spec"}
```

The same script calls `newSpec` with `resolveConfig({ ids: { decision: '[' } })` and existing id `A`; it prints:

```text
prefix-regexp THREW Invalid regular expression: /^[-(\d+)$/: Unterminated character class
```

**Why it matters.** Schema's presence is misleading if consumers depend on stronger assumptions. A configured vocabulary can generate ids the same configuration cannot infer.

**Recommendation.** Enforce an explicit nonempty/distinct maturity contract and document handling of derived stage names. Escape configured prefixes in regular expressions, and make generation/inference inverse operations over actual configured prefixes. Reject ambiguous prefix mappings or establish precedence. This is format validation, not a closed set of allowed kinds or relations.

### A-23 — P2 — CLI and MCP lack a shared application boundary and have already drifted

**Problem.** Both transports independently assemble loading, step discovery, matching, validation and presentation policy instead of calling shared use cases.

**Evidence.** CLI context composes these operations at [src/cli/main.ts:171](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/cli/main.ts:171); MCP repeats the composition at [src/mcp/Server.ts:125](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/mcp/Server.ts:125) and [src/mcp/Server.ts:160](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/mcp/Server.ts:160). CLI catches step loading errors and prints a partial context ([src/cli/main.ts:179](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/cli/main.ts:179)), whereas MCP fails the whole context. CLI accepts unrestricted integer depth ([src/cli/main.ts:166](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/cli/main.ts:166)); MCP requires 1–6 ([src/mcp/Server.ts:67](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/mcp/Server.ts:67)). MCP imports relation vocabulary upward from CLI templates ([src/mcp/Server.ts:12](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/mcp/Server.ts:12)). The docs depict sibling transports at [docs/architecture/overview.md:49](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/docs/architecture/overview.md:49).

Command: `node /private/tmp/sdp-sol-architecture-review/live.mjs` showed `sdp context A --depth -1` exiting 0 and printing a bundle; the MCP schema excludes that value. The different broken-step fallback is source-verified, not separately exercised through MCP in this review. A-06 demonstrates an additional observed policy drift in query completeness.

**Why it matters.** Fixes to trust, errors and response completeness need to land twice. The 587-line CLI is not intrinsically wrong; mixing use-case policy into it is the actionable problem.

**Recommendation.** Introduce small shared application operations for query, context/discovery, status and execution. They should return typed data/errors, leaving text/JSON/MCP rendering to adapters. Move shared vocabulary/help out of `cli/`. Split `Project`/evidence policy from the construction implementation in `graph/Build.ts` so views need not all name a builder as their domain home. Preserve the existing pure query/check functions; a framework-wide rewrite is unnecessary.

### A-24 — P3 — JSON responses use incompatible source representations and drop edge metadata

**Problem.** Equivalent graph facts have different wire shapes depending on which command exposes them.

**Evidence.** [src/graph/Export.ts:33](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/graph/Export.ts:33) turns a node source into `"file:line"`; [src/graph/Export.ts:45](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/graph/Export.ts:45) similarly converts edge sources for graph exports. [src/cli/main.ts:154](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/cli/main.ts:154) and [src/mcp/Server.ts:158](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/mcp/Server.ts:158) combine that node DTO with raw `GraphEdge` arrays whose sources remain `{file,line}` objects. [src/arch/Architecture.ts:123](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/arch/Architecture.ts:123) emits edge triples with neither source nor attrs. These are direct source-level shape comparisons, not claims about an unrun renderer.

**Why it matters.** Agents need command-specific decoders, and architecture JSON loses the provenance otherwise promised for graph facts. A string location also requires reparsing when a machine needs the line separately.

**Recommendation.** Define shared node/edge DTOs and explicit report envelopes. Keep structured `SourceRef` in JSON and derive `file:line` only for text output. If a view deliberately strips metadata, name it a reference/summary object and document the difference.

### A-25 — P3 — The in-memory filesystem ignores glob roots, weakening pipeline-equivalence claims

**Problem.** Its glob implementation matches the whole backing map regardless of the requested root.

**Evidence.** [src/workspace/MemoryFileSystem.ts:26](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/workspace/MemoryFileSystem.ts:26) ignores `options.root`, whereas production `findFiles` supplies it ([src/workspace/Workspace.ts:89](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/workspace/Workspace.ts:89)). The architecture claims the identical pipeline runs against memory ([docs/architecture/overview.md:77](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/docs/architecture/overview.md:77)).

Command: `node /private/tmp/sdp-sol-architecture-review/additional.mjs`. A memory filesystem contained `root.md` and `sub/child.md`; calling `findFiles('/ws/sub', ['**/*.md'], [])` printed:

```text
subdirectory-glob [ 'root.md', 'sub/child.md' ]
```

A filesystem glob rooted at that subdirectory should expose `child.md`, not the parent's file or a root-relative `sub/` prefix.

**Why it matters.** Root/subdirectory behavior tested only against this double can pass for the wrong reason or fail differently from production. This does not invalidate the existing whole-workspace scenarios, which mostly use `/ws`.

**Recommendation.** Honor root-relative glob semantics and path normalization in the memory service, or explicitly reject unsupported roots. Add Gherkin coverage comparing the same small root/subdirectory scenario against memory and a temporary real filesystem.

## 3. The three changes I would make first

1. **Make evidence a trustworthy, owned snapshot.** Fix executable identity (including tags), immutable graph ownership, transactional results storage, and the progress callback race (A-02, A-03, A-05, A-10). These affect the platform's reason for existing: reported delivery state must correspond to what actually ran against an unchanged workspace. Move canonical scenario/evidence types into a clear domain module rather than expanding `Build.ts` further.
2. **Make reading files safe and structurally faithful.** Separate read-only inspection from executing step modules (A-01), use a source-positioned Markdown/YAML parsing boundary, validate open structural data, and serialize templates as YAML (A-04, A-07–A-09, A-17–A-20). Preserve files, grepability, free-form vocabulary and self-hosted Gherkin testing. None requires introducing a database or a second specification format.
3. **Create a small authoring API and shared application layer.** Split the lean steps API from heavyweight programmatic exports; make CLI/MCP consume shared typed answers with completeness/provenance; isolate and recycle execution loaders (A-06, A-11–A-16, A-21–A-25). As part of that boundary, rewrite DEC-0004 to distinguish source execution during development from JavaScript/declaration emission for distribution.

**DEC-0004 assessment.** Keep direct Node 24 execution of erasable TypeScript for this repository and for developers editing sdp: it is simple and the existing typechecks guard the syntax. Treat “no build step” as a development workflow, not an absolute package constraint. The least bad npm path is a release-only emit of JS plus declarations, preserving the module layout, with package exports/bin pointing at that output and the existing Gherkin CLI scenarios run against an installed tarball as a release acceptance suite. Local source commands can remain unchanged. A-14's consumer-source/id leakage is another reason to provide declaration boundaries. I would not choose global type-stripping hooks or a bundled monolith just to keep the literal “no dist” statement. The explicit repository scenario at [specs/steps/docs.steps.ts:160](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/specs/steps/docs.steps.ts:160) and DEC-0004's consequence at [docs/decisions/DEC-0004-effect-on-node-without-build.md:29](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/docs/decisions/DEC-0004-effect-on-node-without-build.md:29) must be scoped to development, not carried forward as absolute distribution requirements. This is an assessment of the known plan, not a separate finding that npm packaging is missing.

## 4. What is sound and should be kept

- **An acyclic and mostly honest dependency structure.** I derived local import edges for every `src/**/*.ts` file (including package-self `sdp/annotations` imports, and distinguishing type-only statements), saved them in `imports.json`, and searched the resulting graph for cycles: both all-import and runtime graphs were empty of cycles. The script conservatively counts mixed type/value import statements as runtime edges; no-cycle still holds. No filesystem reads, clock reads, or environment reads were found in the core parser/build/query/check modules. Node crypto there is deterministic hashing, not IO.
- **The actual central flow matches the overview.** Workspace loads sources; `parse/` produces plain data; `Build.ts` constructs the model and derives evidence/stage; Graph owns adjacency; query/check/views consume it; CLI/MCP adapt answers. The justified sideways edges include reports using check/architecture and checks using lifecycle. The needed changes are clearer ownership/application boundaries, not wholesale inversion of this design.
- **Effect is generally used where it earns its place.** FileSystem and Path services make the real loading pipeline substitutable; named loader/session workflows use `Effect.fn`; Schema handles config/results/MCP shape decoding; step execution handles Promise/Effect outcomes and cooperative cancellation. The defects are missed expected-error boundaries and mutable ownership, not evidence that Effect itself should go.
- **Adjacency is built once, with sensible deterministic file discovery.** [src/model/Graph.ts:37](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/model/Graph.ts:37) maintains in/out indexes and [src/workspace/Workspace.ts:80](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/workspace/Workspace.ts:80) de-duplicates/sorts glob results. `ofKind`, kind/relation counts and many report summaries scan again; at this size that is not a demonstrated design failure, and I would not add caching before a measured need and immutable ownership.
- **Official Gherkin/Cucumber components and static TS parsing are sound dependency choices.** They earn their dependencies; `@cucumber/messages` is directly used rather than an accidental transitive import. YAML and Effect likewise have clear uses. Oxc has a real job; its eager loading through the step barrel and the partial hand-written binder are the concerns. I found no basis to remove a dependency merely to reduce the package count.
- **The annotation subpath is genuinely lean.** [src/annotations.ts](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/src/annotations.ts) has no imports and can remain a no-op runtime identity function. Keep free-form relation names and real-symbol references; fix identity and client declaration boundaries.
- **Self-hosted Gherkin testing is viable.** The normal verification suite is fast and passed. The executable docs, realistic shop example and temporary-directory CLI scenarios are valuable. Add missing boundary scenarios through that same system; there is no need to introduce a separate unit-test framework.
- **Tooling is appropriately strict for direct-source development.** NodeNext, explicit `.ts` extensions, `strict`, `noUncheckedIndexedAccess`, and `erasableSyntaxOnly` fit the chosen runtime ([tsconfig.json:3](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/tsconfig.json:3)). The second typecheck is presently necessary because the example is a separate TypeScript program. Its id-union workaround should disappear with A-14, rather than merely deleting the second check. [bin/sdp.js:1](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/bin/sdp.js:1) is appropriately thin. `git ls-files .sdp examples/shop/.sdp` listed only the two generated id declaration files; results and graph exports are ignored ([.gitignore:2](/Users/darkomijic/.t3/worktrees/sdp-new/t3-458b2b6b-34074375f3e45784/.gitignore:2)). Tracking the generated declarations is defensible while typechecks depend on them.

## 5. Questions for the architect

1. **What authority does inspecting a workspace imply?** Should context/snippet requests ever execute repository code, or must read tools be safe before trusting a checkout? This determines the step-discovery contract; the current read-only claim cannot coexist with arbitrary imports.
2. **What is an edge?** A unique relation triple with several declarations, or an attributed edge that can coexist with another of the same triple? Decide this before fixing A-19; either answer is compatible with a free-form graph, but it changes provenance and conflict handling.
3. **Which annotation targets are supported?** Only module/top-level abstractions, or arbitrary local and member symbols? The latter needs a proper binding/identity model. Do authors need stable code identity across moves/renames, or only accurate current locations?
4. **How much Markdown is the public format?** CommonMark-style code/HTML/list behavior, or a deliberately narrower dialect? The owner's Markdown-and-grep principle does not require a hand-written scanner. A parser-backed implementation can preserve the exact source format and positions.
5. **Is one workspace allowed more than one runner at a time?** Independent agents make this likely. A lock/retry policy can preserve files as truth without adopting a database; alternatively, require and enforce exclusive runs rather than silently losing results.
6. **Which APIs are commitments?** Is `sdp` principally a CLI/MCP product with a small step authoring API, or also a stable graph library? The current barrel implicitly promises both and exports test infrastructure too. The answer should determine explicit package subpaths and DTO stability.
7. **Can DEC-0004 distinguish development from publication?** I recommend source execution in development plus release-only JS/declaration emission. If absolutely no emitted artifact is required, distribution options must be narrowed honestly; ordinary installed npm execution cannot be assumed as the next incremental step.
8. **How should typed annotation catalogues be scoped?** Per workspace/program, per package, or an intentional union? The example currently needs the tool's own ids. That workaround should not accidentally become the user-facing model.
