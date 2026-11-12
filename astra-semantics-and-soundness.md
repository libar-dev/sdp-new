# sdp: runtime semantics and soundness review

## 1. Verdict

The tool's positive answers cannot yet be treated as reliable delivery evidence. It has a useful, largely coherent execution core, but it can report `verified` for code that would now fail, restore a superseded pass over a newer failure, accept authored verification without executing anything, and return a clean empty JSON answer for an incomplete graph traversal. The biggest weakness is the evidence model: a mutable cache with a partially observed dependency set is presented as a current fact about the workspace.

The previous fixes are valuable but incomplete. Fingerprints miss executable inputs and result dependencies; truncation protection works in built-in assertions but disappears in JSON and filtered exports; unreadable-spec protection works for parse errors in `run`/`gate`, but not for queries or scenarios dropped with a missing id. I found no P0 reason to abandon files, Gherkin, or a derived graph. The P1 issues should be resolved before building more workflow on these answers.

### Method and reproduction material

Review only; no tracked files changed and no subagents started. Dependencies were linked as instructed. Baseline `npm run verify` exited 0 and printed:

```text
0 error(s), 0 warning(s), 0 info
230 scenario(s): 230 passed
11 gate scenario(s): 7 passed, 4 failed
```

The four gate failures are expected, not findings. I read the requested introductory documents, decisions, architecture/status/lifecycle/help output, and the cited implementation. Findings distinguish implementation errors from deliberate semantics that are unsafe for the stated uses.

All adversarial fixtures are outside the checkout. Their complete contents, mutations, exact commands, and captured output are available in:

- [Main fixture builder and experiments](/private/tmp/sdp-soundness-review/repro.py), [captured transcript](/private/tmp/sdp-soundness-review/transcript.txt).
- [Additional experiments, including concurrent subprocess coordination](/private/tmp/sdp-soundness-review/more.py), [captured transcript](/private/tmp/sdp-soundness-review/more-transcript.txt).
- [Annotation and diagnostic experiments](/private/tmp/sdp-soundness-review/final-repros.py), [captured transcript](/private/tmp/sdp-soundness-review/final-transcript.txt).
- [Synchronous timeout experiment](/private/tmp/sdp-soundness-review/timeout.mjs).

Commands below use this exact shell abbreviation; output excerpts omit per-step provenance when it is not material:

```sh
sdp() {
  local fixture="$1"
  shift
  node /Users/darkomijic/.t3/worktrees/sdp-new/t3-b4ef25d9-561eb13f0f2778ff/src/cli/main.ts \
    -C "/private/tmp/sdp-soundness-review/$fixture" "$@"
}
```

The fixture scripts record sequences, including changes between runs; rerunning only their last command does not reconstruct earlier states. No claim about changing Node versions, installed dependency versions, or the sdp implementation was experimentally verified; omissions of those identities below are established by the cited source.

## 2. Findings

### S-01 — P1 — Evidence has no complete, explicit execution-input boundary

**Problem.** A passing result remains verified when lazy imports, runtime data, or environment inputs change; the execution toolchain and package dependencies are not fingerprinted either.

**Evidence.** [src/workspace/Workspace.ts:235](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b4ef25d9-561eb13f0f2778ff/src/workspace/Workspace.ts:235) computes the import list immediately after loading step modules, before their handlers execute. [src/workspace/Workspace.ts:186](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b4ef25d9-561eb13f0f2778ff/src/workspace/Workspace.ts:186) excludes package imports, and [src/workspace/Workspace.ts:254](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b4ef25d9-561eb13f0f2778ff/src/workspace/Workspace.ts:254) excludes files outside the workspace. [src/graph/Build.ts:132](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b4ef25d9-561eb13f0f2778ff/src/graph/Build.ts:132) hashes only the configuration file, configured code files, and step/import files. There is no Node, sdp build, dependency-lock, environment, or declared runtime-input identity in [src/run/Results.ts:33](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b4ef25d9-561eb13f0f2778ff/src/run/Results.ts:33).

In `lazy`, a step imports `./helper.ts` **inside its async handler**. The helper sits outside the default code globs. Run it with `export const ok = true`, then change only that helper to `false`:

```text
$ sdp lazy run
1 scenario(s): 1 passed                         [exit 0]
$ sdp lazy q 'requirement[stage=verified]' --ids
REQ-lazy                                       [exit 0]
$ sdp lazy run
... bad helper
1 scenario(s): 1 failed                         [exit 1]
```

In `inputs`, a step reads `data.json` with `readFileSync` and checks `process.env.SDP_BAD`. After a passing run:

```text
$ SDP_BAD=1 sdp inputs q 'requirement[stage=verified]' --ids
REQ-input                                      [exit 0]
$ SDP_BAD=1 sdp inputs run
... bad input
1 scenario(s): 1 failed                         [exit 1]
```

After rerunning without the variable, changing `data.json` from `true` to `false` and adding `package-lock.json` again leaves `REQ-input` verified, until the next execution fails. The scripts/transcript contain both sequences.

**Why it matters.** The lazy-import case contradicts the claimed coverage of imported workspace files. Runtime file reads are explicitly excluded in [specs/requirements/REQ-executable-specs.md:135](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b4ef25d9-561eb13f0f2778ff/specs/requirements/REQ-executable-specs.md:135), so that part is a design limitation, not an undocumented implementation mistake. But a broad `verified` state without a qualification or a way to declare those inputs still overclaims. Branches with different lockfiles, fixtures, or external services can share apparently fresh evidence. A plain generated file is a reasonable cache; it is insufficient as the sole identity of an execution.

**Recommendation.** Define an execution manifest: runner/schema identity, Node/platform identity where relevant, dependency-lock/package identity, scenario/context identity, and explicitly declared file/environment/service inputs. Collect dynamic imports through execution, or conservatively require them in declared inputs. Avoid recording secrets: persist safe names/digests or an environment identity. Keep an immutable run artifact with that manifest and a derived local index. `verified` should name the run/input scope it means; undeclared external inputs need an explicit freshness policy. Git remains the spec source of truth; CI can publish/import these evidence artifacts without introducing a graph database.

### S-02 — P1 — Scenario fingerprints omit tags that handlers actually execute against

**Problem.** Changing a scenario's tags can change its behavior without invalidating its passing evidence.

**Evidence.** [src/parse/Gherkin.ts:232](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b4ef25d9-561eb13f0f2778ff/src/parse/Gherkin.ts:232) hashes pickle names, step text, doc strings and tables, but not tags. [src/run/Runner.ts:103](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b4ef25d9-561eb13f0f2778ff/src/run/Runner.ts:103) exposes `pickle.tags` to handlers. Only handlers accessing `project` record a specs fingerprint ([src/run/Runner.ts:165](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b4ef25d9-561eb13f0f2778ff/src/run/Runner.ts:165)).

The `tags` step throws when `scenario.tags` includes `@broken`. It passes without that tag; adding only `@broken` produces:

```text
$ sdp tags q 'requirement[stage=verified]' --ids
REQ-tags                                       [exit 0]
$ sdp tags run
... broken tag
1 scenario(s): 1 failed                         [exit 1]
```

**Why it matters.** Tags are executable context, not merely labels: they also affect gate/selection/serial treatment. The scenario hash is not the hash of the executable scenario as advertised.

**Recommendation.** Hash the normalized executable pickle including tags and every handler-visible scenario context field, plus execution classification. Test tag-only changes, inherited tags, example tags, and transitions into/out of gate execution. Keep excluding irrelevant source-line shifts.

### S-03 — P1 — Result-dependent assertions remain fresh after their own inputs change

**Problem.** Ordinary assertions can read old scenario results without recording that dependency, while gates can read other gates whose outcomes are deliberately excluded from their dependency digest.

**Evidence.** [src/run/Runner.ts:168](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b4ef25d9-561eb13f0f2778ff/src/run/Runner.ts:168) records `evidence.results` only for gate runs. [src/graph/Build.ts:141](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b4ef25d9-561eb13f0f2778ff/src/graph/Build.ts:141) fingerprints only ordinary scenarios, and only their statuses ([src/graph/Build.ts:144](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b4ef25d9-561eb13f0f2778ff/src/graph/Build.ts:144)). [src/run/Session.ts:128](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b4ef25d9-561eb13f0f2778ff/src/run/Session.ts:128) executes an entire ordinary batch before rebuilding; the gate batch likewise shares one snapshot ([src/run/Session.ts:131](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b4ef25d9-561eb13f0f2778ff/src/run/Session.ts:131)). Nothing restricts graph assertions to the layer these fingerprints support.

`ordinary` has A asserting no failed scenario and B unconditionally failing. Starting without results:

```text
$ sdp ordinary run
2 scenario(s): 1 passed, 1 failed               [exit 1]
$ sdp ordinary q 'requirement[stage=verified]' --ids
REQ-a                                          [exit 0]
$ sdp ordinary run REQ-a
... query "scenario[status=failed]" returned 1 result(s), expected none
1 scenario(s): 1 failed                         [exit 1]
```

`gates` repeats this with milestone A and milestone B:

```text
$ sdp gates run
2 gate scenario(s): 1 passed, 1 failed          [exit 0]
$ sdp gates q 'milestone[stage=verified]' --ids
MS-a                                           [exit 0]
$ sdp gates gate MS-a
... query "scenario[status=failed]" returned 1 result(s), expected none
1 gate scenario(s): 1 failed                    [exit 1]
```

There were no source changes between these commands. The earlier successful assertions are already false in the graph that reports them verified. Reading `lastRun` or detailed `project.results` also exceeds a status-only digest; this latter consequence is source-inspected, not separately executed.

**Why it matters.** This is circular evidence, not merely coarse invalidation. A gate may read its own prior result or depend on another gate, but the system has no defined evaluation order or cycle semantics for those dependencies. Adding all results to every hash would create another unstable cycle.

**Recommendation.** Stratify evidence. Ordinary executions produce observations; policy gates evaluate a frozen set of eligible observations. Either prohibit current/own/gate-result reads in that phase, or model explicit gate dependencies as a DAG and reject cycles. Track the actual observed projection, including any supported metadata, rather than assuming that accessing `project` means only source specs or ordinary statuses were read.

### S-04 — P1 — Concurrent partial runs can replace a newer failure with an older pass

**Problem.** Whole-file read/merge/write operations lose other writers' results and can restore stale success.

**Evidence.** [src/run/Session.ts:124](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b4ef25d9-561eb13f0f2778ff/src/run/Session.ts:124) reads once before execution; [src/run/Session.ts:129](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b4ef25d9-561eb13f0f2778ff/src/run/Session.ts:129) merges against that snapshot. The second write merges its own earlier results variable ([src/run/Session.ts:133](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b4ef25d9-561eb13f0f2778ff/src/run/Session.ts:133)). [src/workspace/Workspace.ts:116](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b4ef25d9-561eb13f0f2778ff/src/workspace/Workspace.ts:116) directly overwrites the file, with neither a lock nor atomic publication.

The `race` experiment first passes A and B. It starts an A-only subprocess that signals it has entered the handler and waits 1.5 seconds. While A waits, a B-only subprocess fails and finishes. A then completes. No source file changes:

```text
$ sdp race run
2 scenario(s): 2 passed                        [exit 0]
$ SDP_WAIT=1 sdp race run REQ-a                 # starts first; waits
$ SDP_FAIL=1 sdp race run REQ-b
... B failed
1 scenario(s): 1 failed                        [exit 1]
# A then finishes:
1 scenario(s): 1 passed                        [exit 0]
$ sdp race q 'requirement[stage=verified]' --ids
REQ-a
REQ-b                                         [exit 0]
```

The exact `Popen` coordination and subprocess commands are in `more.py`; A never executed B. Its old B pass overwrote the newly recorded failure.

**Why it matters.** This is plausible with parallel agents, shells, IDE actions or CI jobs. Merely atomically renaming a temporary file would prevent torn JSON but would not fix lost updates. Torn-file readers silently losing the cache are also possible by inspection of `readResults`, but I did not reproduce a torn read.

**Recommendation.** Prefer immutable per-run artifacts and a deterministic merge/index policy. Alternatively serialize the entire workspace run, or lock/re-read/merge during commit with version checks and an explicit conflict policy. Publish atomically. Decide which overlapping observation is authoritative; never let unexecuted old entries overwrite another run's new entries.

### S-05 — P1 — Authored fields can manufacture verified work without scenarios

**Problem.** Derived delivery facts are not protected from authored values across all node forms.

**Evidence.** [src/graph/Build.ts:369](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b4ef25d9-561eb13f0f2778ff/src/graph/Build.ts:369) returns arbitrary maturity strings as the stage when there is no execution evidence. [src/check/Check.ts:119](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b4ef25d9-561eb13f0f2778ff/src/check/Check.ts:119) treats an invalid maturity as only a warning. Inline node attributes are copied unchanged at [src/graph/Build.ts:195](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b4ef25d9-561eb13f0f2778ff/src/graph/Build.ts:195), with `stage` and `verification` not reserved by [src/parse/Spec.ts:62](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b4ef25d9-561eb13f0f2778ff/src/parse/Spec.ts:62).

Fixture `forged` contains a top-level spec with `maturity: verified` and an inline requirement with `stage: verified, verification: passing`. Neither has scenarios:

```text
$ sdp forged check
warn [maturity-value] REQ-a: unknown maturity "verified"
0 error(s), 1 warning(s), 0 info                [exit 0]
$ sdp forged q 'requirement[stage=verified]' --json
```

The JSON returns both `REQ-a` (`scenarios: 0`, `verification: "none"`, `stage: "verified"`) and `REQ-inline` (`verification: "passing"`, `stage: "verified"`).

**Why it matters.** A gate checking `stage!=verified` accepts author-declared success. Even without an adversarial author, an imported status or misunderstanding of the field defeats the central product guarantee. Inline milestone `verification` is likewise consumed by lifecycle rendering ([src/lifecycle/Lifecycle.ts:230](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b4ef25d9-561eb13f0f2778ff/src/lifecycle/Lifecycle.ts:230)).

**Recommendation.** Separate authored and computed namespaces, or reject reserved derived keys on every node declaration and annotation path. Derive stage only from a valid authoring ladder or execution evidence; prevent custom authoring ladders from colliding with execution states. Define evidence eligibility for inline nodes explicitly.

### S-06 — P1 — JSON queries and filtered graph exports erase incompleteness

**Problem.** Machine-readable consumers receive an apparently complete empty answer after traversal was truncated.

**Evidence.** [src/cli/main.ts:118](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b4ef25d9-561eb13f0f2778ff/src/cli/main.ts:118) returns JSON before the truncation warning at line 126. Filtered exports at [src/cli/main.ts:85](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b4ef25d9-561eb13f0f2778ff/src/cli/main.ts:85) ignore `QueryResult.truncated` entirely.

`depth` is a chain from A0 to A13, one edge per hop:

```text
$ sdp depth q '#A0 -r+-> #A13' --json
[]                                             [exit 0]
$ sdp depth q '#A0 -r+-> #A13'
result cut short: a + edge reaches further than 12 hops — the answer may be incomplete
0 node(s)                                      [exit 0]
$ sdp depth graph -q '#A0 -r+-> #A13' -f json
{ "nodes": [], "edges": [] }                   [exit 0]
```

The JSON query emits no warning on stderr either. This is a direct gap in the earlier truncation fix.

**Why it matters.** Agent and CI consumers are particularly likely to use JSON or filtered exports and infer absence from these outputs.

**Recommendation.** Carry `{nodes, paths, completeness, limits, diagnostics}` through every query transport. Reject incomplete filtered exports unless explicitly requested as partial. If preserving the array JSON shape temporarily, emit a nonzero exit and diagnostic for incomplete evaluation. Built-in assertions' current refusal to prove anything from truncated output should remain.

### S-07 — P1 — Queries answer from an incomplete parse without reporting the parse failure

**Problem.** The unreadable-spec fix protects execution, but a query still returns “no results” after dropping an unreadable spec.

**Evidence.** [src/graph/Build.ts:73](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b4ef25d9-561eb13f0f2778ff/src/graph/Build.ts:73) retains diagnostics while omitting specs the parser could not construct. [src/cli/main.ts:114](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b4ef25d9-561eb13f0f2778ff/src/cli/main.ts:114) loads and queries that graph without checking diagnostics. Compare `ensureReadable` at [src/run/Session.ts:69](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b4ef25d9-561eb13f0f2778ff/src/run/Session.ts:69).

`invalid/a.md` has `id: REQ-a` and an unterminated YAML array:

```text
$ sdp invalid check
error [front-matter] invalid front matter: Flow sequence in block collection must be sufficiently indented and end with a ]
1 error(s), 0 warning(s), 0 info                [exit 1]
$ sdp invalid q requirement --json
[]                                             [exit 0]
$ sdp invalid run
cannot run: 1 problem(s) leave scenarios unread or their ids ambiguous; fix them first (sdp check)
... [front-matter] ...                          [exit 1]
```

**Why it matters.** A malformed requirement appears absent to an agent; malformed or duplicate input means the index cannot support complete-answer claims. MCP's query handler also ignores project diagnostics ([src/mcp/Server.ts:132](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b4ef25d9-561eb13f0f2778ff/src/mcp/Server.ts:132)); that transport consequence is source-inspected, not protocol-tested.

**Recommendation.** Represent graph completeness centrally and carry it into every result, not only runner preflight. Offer partial exploration explicitly, but make unsupported absence/coverage claims fail closed in machine-facing commands. Do not require callers to remember a separate `check` before every read.

### S-08 — P2 — Gate typo protection misses exact ids and rejects legitimate empty relations

**Problem.** Assertions permit a typo in a specific target to pass vacuously, yet reject a valid assertion that a custom relation has no occurrences.

**Evidence.** [src/graph/Query.ts:506](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b4ef25d9-561eb13f0f2778ff/src/graph/Query.ts:506) checks only kinds and relations, not selected ids. [src/run/Builtin.ts:83](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b4ef25d9-561eb13f0f2778ff/src/run/Builtin.ts:83) implements universal inclusion without a nonempty-subject requirement. [src/run/Builtin.ts:30](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b4ef25d9-561eb13f0f2778ff/src/run/Builtin.ts:30) rejects any unused relation outside the small conventional set.

`idtypo` declares REQ-a, but its gate universally checks `#REQ-typo` against verified requirements and asserts no unverified `#REQ-typo`:

```text
$ sdp idtypo gate MS-gate
1 gate scenario(s): 1 passed                    [exit 0]
```

Conversely, a workspace with no `leaks-to` edges cannot assert their absence:

```text
$ sdp absentrel gate MS-gate
... query "* -leaks-to-> *" names relation leaks-to, which no edge has; relations in use: verifies
1 gate scenario(s): 1 failed                    [exit 1]
```

**Why it matters.** Unknown-id selection is deliberately empty in [specs/requirements/REQ-graph-query.md:30](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b4ef25d9-561eb13f0f2778ff/specs/requirements/REQ-graph-query.md:30), and universal quantification over an empty set is mathematically valid. The problem is using those semantics as proof of delivery with no explicit coverage precondition, while conflating “unused” and “misspelled” for free-form relations. That inconsistency cannot be fixed by more hard-coded names.

**Recommendation.** Keep exploratory queries permissive, but give assertions explicit binding/existence and coverage requirements. Validate literal ids in strict assertions unless absence is explicitly requested. Allow a workspace to declare an open vocabulary for relations independently of edge occurrences; support intentional empty relations without inventing dummy edges. Distinguish a vacuously true policy from evidence that its intended scope was checked.

### S-09 — P2 — Missing ids still silently remove executable scenarios from a successful run

**Problem.** A document clearly claiming to be a spec can lose all its scenarios and leave `run` successful.

**Evidence.** [src/parse/Spec.ts:80](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b4ef25d9-561eb13f0f2778ff/src/parse/Spec.ts:80) emits only a `missing-id` warning and returns no spec. [src/run/Session.ts:66](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b4ef25d9-561eb13f0f2778ff/src/run/Session.ts:66) excludes that rule from unreadability, and the CLI does not print load diagnostics during the run.

`missing/a.md` has `kind: requirement`, no id, and a Gherkin scenario intended to assert an impossible condition:

```text
$ sdp missing check
warn [missing-id] front matter declares kind "requirement" but no id, so the file is not part of the graph
0 error(s), 1 warning(s), 0 info                [exit 0]
$ sdp missing run
0 scenario(s): none                           [exit 0]
```

**Why it matters.** This is a remaining “unread scenarios but green run” path. Ordinary Markdown without an id is intentionally not a spec; the proposed change need not reject ordinary documentation. An explicit kind plus executable content is enough to identify likely accidental loss.

**Recommendation.** Treat malformed spec identity as an execution-blocking diagnostic for spec-intended documents, or require an explicit opt-out. At minimum surface dropped-document/scenario counts and diagnostics during runs. Test removing the id from a previously executable spec.

### S-10 — P2 — A mapping under `nodes:` is discarded with a completely clean check

**Problem.** A malformed inline-node container erases declarations without any diagnostic.

**Evidence.** [src/parse/Spec.ts:282](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b4ef25d9-561eb13f0f2778ff/src/parse/Spec.ts:282) returns an empty list for every non-array `nodes` value before constructing an `inline-node` diagnostic.

`nodemap/a.md` contains:

```yaml
id: PLAN
nodes:
  REQ-a: {kind: requirement}
```

```text
$ sdp nodemap check
0 error(s), 0 warning(s), 0 info                [exit 0]
$ sdp nodemap q requirement --json
[]                                             [exit 0]
```

**Why it matters.** The node shape is invalid, but `check` claims the workspace is clean and downstream coverage checks see less work. This is structural data loss, not freedom of vocabulary.

**Recommendation.** Validate reserved containers explicitly; diagnose wrong types before returning. Make dropping declarations/links a first-class incompleteness condition, with an error or strict CI policy. Preserve free-form kinds and attributes inside valid structures.

### S-11 — P2 — Comment scanning invents graph nodes from string-literal examples

**Problem.** A source string containing annotation-looking text is treated as a real annotation.

**Evidence.** [src/parse/Annotations.ts:38](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b4ef25d9-561eb13f0f2778ff/src/parse/Annotations.ts:38) scans raw source lines without lexical context; [src/graph/Build.ts:85](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b4ef25d9-561eb13f0f2778ff/src/graph/Build.ts:85) runs it even for TypeScript, where an AST parser is available. [src/graph/Build.ts:219](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b4ef25d9-561eb13f0f2778ff/src/graph/Build.ts:219) lets its `is` edge declare a node.

`annotations/src/a.ts` contains only:

```ts
export const example = `
// @sdp is ARCH-fiction
`;
```

```text
$ sdp annotations check
0 error(s), 0 warning(s), 0 info                [exit 0]
$ sdp annotations q '#ARCH-fiction' --json
```

The answer is an `element` node with `declaredIn: "code"`, sourced to [src/a.ts:2](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b4ef25d9-561eb13f0f2778ff/src/a.ts:2).

**Why it matters.** Examples, fixtures and generated strings can fabricate architecture or traceability, and therefore satisfy existence/coverage gates. The source is valid TypeScript and contains no actual annotation call or comment.

**Recommendation.** Use parser-provided comment tokens for supported languages, sharing the TS/JS parse with typed annotations. For languages without a parser, define an explicit conservative lexical contract or sidecar option; don't treat arbitrary string content as reliable declarations.

### S-12 — P2 — Path output loses directions and can print a transitive route that does not exist

**Problem.** `--paths` is neither complete route output nor a faithful representation of mixed-relation closure.

**Evidence.** [src/graph/Query.ts:159](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b4ef25d9-561eb13f0f2778ff/src/graph/Query.ts:159) deduplicates without direction, as does `pathKey` at line 485. `reachable` at [src/graph/Query.ts:475](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b4ef25d9-561eb13f0f2778ff/src/graph/Query.ts:475) replaces a reached node's provenance with just its final relation plus `+`.

`routes` has `A -r-> B`, `B -r-> A`, and `B -s-> C`:

```text
$ sdp routes q '#A -r- #B' --paths
A -r-> B
1 node(s)                                     [exit 0]
$ sdp routes q '#A -r|s+-> #C' --paths
A -s+-> C
1 node(s)                                     [exit 0]
$ sdp routes q '#A -s+-> #C' --ids
                                               [exit 0; no output]
```

The first command loses `A <-r- B`. The second claims an s-only closure although the route needs both r and s.

**Why it matters.** [specs/requirements/REQ-graph-query.md:48](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b4ef25d9-561eb13f0f2778ff/specs/requirements/REQ-graph-query.md:48) promises every route and direction. These outputs mislead debugging and provenance consumers even when the end-node set is correct.

**Recommendation.** Preserve witness paths with actual edge direction and identity. Alternatively explicitly return one reachability witness per endpoint and label the whole relation expression on compressed closure steps. Include direction in dedup keys. Specify whether parallel edges/alternative routes are intentionally collapsed.

### S-13 — P2 — Synchronous steps can exceed their timeout and still pass

**Problem.** The advertised step timeout does not reject a synchronous handler that blocks beyond the deadline.

**Evidence.** [src/run/Runner.ts:106](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b4ef25d9-561eb13f0f2778ff/src/run/Runner.ts:106) invokes the handler inside the event loop; [src/run/Runner.ts:110](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b4ef25d9-561eb13f0f2778ff/src/run/Runner.ts:110) relies on Effect's scheduled timeout. A success is recorded without checking elapsed time at [src/run/Runner.ts:114](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b4ef25d9-561eb13f0f2778ff/src/run/Runner.ts:114).

From the checkout, the saved script constructs one real project and calls the real runner with a 1 ms timeout and a synchronous 100 ms busy loop:

```sh
node --input-type=module < /private/tmp/sdp-soundness-review/timeout.mjs
```

Observed output (definition location omitted):

```json
{"status":"passed","step":{"keyword":"Then","text":"busy work","line":6,"status":"passed","durationMs":101}}
```

Exit 0. The 30-second guarantee is stated without a synchronous-work exception in [specs/requirements/REQ-executable-specs.md:45](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b4ef25d9-561eb13f0f2778ff/specs/requirements/REQ-executable-specs.md:45).

**Why it matters.** A blocked event loop cannot deliver a timeout or cancellation. Timing-sensitive quality checks can therefore be classified passed after the runner's deadline. Infinite synchronous work would need isolation to terminate; that case was not executed.

**Recommendation.** At minimum reject successful completion after the measured deadline. For a hard timeout contract, run scenarios in terminable workers/processes. Specify cooperative Promise cancellation separately: an AbortSignal is useful but cannot force arbitrary asynchronous side effects to stop.

### S-14 — P2 — Positive-length cycles disappear from transitive reachability

**Problem.** The `+` operator excludes the starting node even when a nonempty cycle reaches it, making an apparent no-cycle assertion pass.

**Evidence.** [src/graph/Query.ts:467](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b4ef25d9-561eb13f0f2778ff/src/graph/Query.ts:467) seeds `visited` with the starting node; line 473 suppresses every return to it. In `query`, A and B have reciprocal r edges:

```text
$ sdp query q '#A -r+-> #A' --json
[]                                             [exit 0]
$ sdp query q '#A !-r+-> #A' --ids
A                                              [exit 0]
```

**Why it matters.** The spec explicitly says “without revisiting nodes” ([specs/requirements/REQ-graph-query.md:44](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b4ef25d9-561eb13f0f2778ff/specs/requirements/REQ-graph-query.md:44)), so this is a design issue, not a mismatch with that wording. Nevertheless `+` is also described as one-or-more hops/transitive closure, for which the positive-length cycle exists. In an architecture/gate language, this makes a natural cycle check confidently wrong under the reachability interpretation, without a truncation warning.

**Recommendation.** Separate expansion visitation from reachable endpoints: emit the start when a positive-length edge sequence reaches it, but don't expand it twice. If simple-path semantics are intentional, give the operation an explicit contract/name and supply a supported cycle predicate instead of relying on users to infer that `+` cannot test cycles.

### S-15 — P3 — Empty fenced markup satisfies the draft-description gate

**Problem.** A draft with no description passes the structural maturity check because fence delimiters count as body content.

**Evidence.** [src/check/Check.ts:30](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b4ef25d9-561eb13f0f2778ff/src/check/Check.ts:30) strips headings but not empty fences when deciding whether a description exists. Fixture `draft` contains `maturity: draft`, a title, and an empty `text` fence, with no paragraph:

```text
$ sdp draft check
0 error(s), 0 warning(s), 0 info                [exit 0]
```

**Why it matters.** This isn't a request to judge prose quality; there is literally no description. Even the intentionally structural definition of draft is not enforced.

**Recommendation.** Test meaningful parsed body content instead of raw delimiter text. Specify whether tables/lists count, then ignore empty markup and comments consistently.

### S-16 — P3 — Query property lookup includes JavaScript prototype properties

**Problem.** An absent attribute such as `toString` is reported as present.

**Evidence.** [src/graph/Query.ts:374](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b4ef25d9-561eb13f0f2778ff/src/graph/Query.ts:374) uses `in`, and nested lookup at line 378 also permits inherited properties. `isSet` then treats the inherited function as a real value. A has no `toString` attribute:

```text
$ sdp query q '#A[toString]' --ids
A                                              [exit 0]
$ sdp query q '#A[!toString]' --ids
                                               [exit 0; no output]
```

**Why it matters.** A free-form attribute language should reflect graph data, not its JavaScript storage prototype. This also affects nested paths and `constructor`/`__proto__` names.

**Recommendation.** Use own-property lookup at every segment, ideally with null-prototype records for parsed attribute maps. Preserve intentionally authored keys of those names as ordinary data.

### S-17 — P3 — Only the first reference to a missing node receives a diagnostic

**Problem.** Adding the placeholder missing node suppresses diagnostics for later dangling references to the same target.

**Evidence.** [src/graph/Build.ts:291](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b4ef25d9-561eb13f0f2778ff/src/graph/Build.ts:291) skips any target already in `nodes`; line 300 adds the missing placeholder during that same loop. `dangling` contains A and B both linking to MISSING:

```text
$ sdp dangling check
error [dangling-link] A -uses-> MISSING: no node has id MISSING  a.md:3
1 error(s), 0 warning(s), 0 info                [exit 1]
$ sdp dangling q '#MISSING <-uses- *' --ids
A
B                                              [exit 0]
```

**Why it matters.** Exit status is correctly failing, but diagnostic counts and file locations omit B. A batch fixer or editor cannot see all broken references; deleting A's reference reveals another problem later.

**Recommendation.** Determine real declarations before inserting placeholders, and diagnose every unresolved edge (or deliberately aggregate all reference locations in one diagnostic). Keep the shared missing node for querying.

## 3. The three changes I would make first

1. **Define and implement an execution-evidence contract.** Address S-01–S-04 together: immutable run artifacts with explicit input manifests; hashes including handler-visible context; frozen, stratified observations for policy gates; and conflict-safe result publication. Keep a replaceable local index, but attach provenance and scope to verified claims. This removes multiple independent ways that old success becomes current truth, and lets CI and teammates exchange evidence as artifacts rather than sharing an untracked mutable file.
2. **Make computed delivery facts unforgeable through normal authoring.** Address S-05 with reserved computed attributes across specs, inline nodes and code annotations, valid authoring ladders, and an explicit policy for what can carry execution evidence. A source-of-truth document must not be able to assert the outcome that the tool promises to derive.
3. **Carry completeness and coverage through every answer.** Address S-06–S-10: central graph/query completeness, consistent machine-readable envelopes or failures, missing-id/container diagnostics, and explicit assertion scope/existence semantics. Then fix the path witness/cycle contracts before expanding SDPQ. Consumers should not need to discover which output mode silently erases uncertainty.

## 4. What is sound and should be kept

- The pure graph build plus an IO edge is a good foundation for testing real behavior in memory. Files can remain greppable and authoritative; none of these findings requires a database or closed kind/relation vocabulary.
- The ordinary/gate split is useful as an initial stratification. Ordinary failures fail the run; later unmet milestones remain informational. The empty-gate enforcement explicitly requires at least one passing gate ([src/cli/main.ts:243](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b4ef25d9-561eb13f0f2778ff/src/cli/main.ts:243)), and the gate command rejects nodes without gate scenarios ([src/cli/main.ts:323](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b4ef25d9-561eb13f0f2778ff/src/cli/main.ts:323)). Keep those protections while defining dependencies more precisely.
- Built-in assertions explicitly reject truncated results ([src/run/Builtin.ts:38](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b4ef25d9-561eb13f0f2778ff/src/run/Builtin.ts:38)). The engine retains the truncation flag across stages ([src/graph/Query.ts:130](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b4ef25d9-561eb13f0f2778ff/src/graph/Query.ts:130)), and MCP propagates that flag ([src/mcp/Server.ts:137](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b4ef25d9-561eb13f0f2778ff/src/mcp/Server.ts:137)). The defect is not that the limit information is unavailable; some transports discard it.
- Parse errors and duplicate ids are blocked before execution ([src/run/Session.ts:66](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b4ef25d9-561eb13f0f2778ff/src/run/Session.ts:66)); the malformed-YAML reproduction confirms that protection at the runner boundary in the tested case.
- Outline results include unselected examples as skipped ([src/run/Runner.ts:149](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b4ef25d9-561eb13f0f2778ff/src/run/Runner.ts:149)), preventing a partial example run from becoming a complete pass. Scenario hashes include expanded texts, doc strings and tables. Removed scenario entries are pruned during merge ([src/run/Runner.ts:208](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b4ef25d9-561eb13f0f2778ff/src/run/Runner.ts:208)). Retain these conservative choices.
- Step matching checks all definitions, reports ambiguity, and continues diagnosing missing definitions after execution is blocked ([src/run/Runner.ts:60](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b4ef25d9-561eb13f0f2778ff/src/run/Runner.ts:60)). Worlds are allocated per pickle and factory ([src/run/Runner.ts:53](/Users/darkomijic/.t3/worktrees/sdp-new/t3-b4ef25d9-561eb13f0f2778ff/src/run/Runner.ts:53)), which is the right local isolation boundary. Runtime-global state remains the step author's responsibility unless worker isolation is adopted.
- The baseline executable corpus is substantial and passing. It should be extended with these adversarial fixtures as Gherkin scenarios, not supplemented by a competing unit-test system.

## 5. Questions for the architect

1. What does `verified` promise: “this execution passed for this declared manifest,” or “this workspace works now”? Arbitrary environment/service IO makes the latter impossible without an explicit scope/freshness contract. Should evidence with undeclared external inputs be reusable at all?
2. Which evidence is authoritative across developer machines, CI, branches and dirty workspaces? Should a view select a named CI run, the latest compatible local run, or require agreement? Immutable artifacts solve transport; the trust/selection policy is a product decision. The current ignored results file need not become tracked source.
3. May gates depend on other gates or their own prior outcomes? If yes, choose a dependency model, cycle policy and the exact snapshot represented. If no, enforce that restriction rather than allowing unrestricted graph/result inspection.
4. What is an inline requirement or milestone allowed to claim, given that it has no scenario attachment mechanism of its own? Should it derive evidence from its owning document, explicit `verifies` relationships, or remain ineligible for verified/met states?
5. Should assertions require nonempty scopes by default, with explicit syntax for intended vacuity? How should a team declare permissible but currently unused relations while preserving the open vocabulary?
6. Is SDPQ primarily an endpoint reachability language or a path/witness language? Keep the small language if desired, but decide cycle semantics, alternate routes and compressed witnesses before more specs embed them.
7. Is a timeout a cooperative convenience or a hard execution boundary? A hard promise changes the runner's isolation architecture; an elapsed-time check alone cannot stop a blocked worker.

### Verification limits

The behavioral findings above were reproduced against the checkout. Toolchain identity omissions and additional consequences explicitly labeled source-inspected were not tested by replacing Node, dependencies or sdp. I did not test a live MCP client, torn filesystem writes, cross-machine artifacts, or infinite CPU loops. Hooks, custom parameter types, npm source packaging and large-workspace scaling are known planned work and are not reported as new findings. The review did not attempt to exhaust every parser or annotation-language grammar.
