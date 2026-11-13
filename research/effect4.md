# Effect 4 Audit of `libar-dev/sdp-new`

## Executive summary

The repository is **genuinely using Effect 4, not Effect 3**, and it is doing so in several places that are unmistakably v4-native. The dependency graph pins both `effect` and `@effect/platform-node` to the matching `4.1.4` line; the lockfile resolves both to exactly `4.1.4`; the code imports consolidated v4 modules such as `effect/cli` and `effect/process`; and it uses `Context.Reference`, which is the v4 replacement path for an important class of v3 `FiberRef`/context patterns. Effect's v4 migration guide explicitly says ecosystem packages now share versions, that platform-specific packages such as `@effect/platform-node` remain separate, and that consolidated modules such as `cli` and `process` live under `effect/*`. [raw.githubusercontent.com](https://raw.githubusercontent.com/libar-dev/sdp-new/main/package.json)

More importantly, the project is not merely "wrapped in Effect." Its important boundaries are modeled in Effect terms: `FileSystem` and `Path` are requirements rather than global dependencies; Git access is a replaceable `Context.Reference` supplied through a `Layer`; CLI startup is delegated to `NodeRuntime.runMain`; application failures are typed and frequently schema-backed; subprocesses are scoped; file commits use acquisition/release semantics; scenario concurrency uses fibers and queues; cancellation propagates into user step handlers through `AbortSignal`; and the public package deliberately exposes both an Effect-native API and a Promise compatibility API. Those are substantive architectural uses of Effect, not cosmetic ones. [raw.githubusercontent.com](https://raw.githubusercontent.com/libar-dev/sdp-new/main/src/effect.ts)

My overall assessment is therefore:

| Area | Assessment | Main conclusion |
| --- | --- | --- |
| Effect version / imports | **Excellent** | Clearly Effect 4; no Effect 3 compatibility pattern was found in the audited code. |
| Architecture / requirements | **Very good** | Functional use-case modules plus explicit platform services are a better fit here than gratuitous service classes. |
| Errors / Schema | **Very good** | Typed, tagged application errors are consistently modeled and preserved until deliberate presentation boundaries. |
| Resources / scopes | **Excellent** | Subprocess and result-store lifecycle handling are especially strong. |
| Fibers / concurrency | **Very good** | Structured concurrency is used correctly and deliberately. |
| Streams | **Good** | Appropriate use for child-process I/O; one scaling caveat around `runCollect`. |
| Runtime boundary | **Excellent** | `NodeRuntime.runMain` for CLI and `runPromise` only at JS API edges is idiomatic. |
| Testing | **Good, but incomplete for Effect-specific semantics** | The executable-spec strategy is strong; targeted `@effect/vitest` tests would improve determinism and lifecycle coverage. |
| Tooling / diagnostics | **Underused** | TypeScript is strong, but Effect 4's `@effect/tsgo` diagnostics and `exactOptionalPropertyTypes` are not enabled. |
| CI | **Weak / apparently absent** | The repository has a good `verify` command, but no `.github/workflows` directory is visible on `main`. |

I found **no high-severity correctness bug attributable to misuse of Effect 4**. The highest-value changes are instead defensive engineering: run Effect's v4-specific diagnostics in development/CI, add focused Effect-runtime tests around cancellation/resources/time, and put the existing `verify` command under CI. There are also two smaller code-level improvements worth considering: make the package-owned `readFile` failure policy explicit instead of relying silently on `Effect.promise`'s defect semantics, and bound or stream large Git stdout if this tool is expected to operate on very large specification repositories. [effect.website](https://effect.website/docs/v4/getting-started/devtools?utm_source=chatgpt.com)

A useful high-level reading of the implementation is:

That separation is sound: Effect is concentrated where it buys something—requirements, asynchronous control flow, typed failures, cancellation, resources and runtime integration—while pure graph/domain code remains plain TypeScript. That is closer to "using Effect fully" than converting every module into a service. Effect's own guidance treats effects, services and layers as tools for requirements and lifecycle management rather than an obligation to represent every module as a `Context.Service`. [effect.website](https://effect.website/docs/v4/requirements-management/services)

## Effect 4 correctness and architecture

### Dependencies and imports are correctly v4-native

`package.json` declares `effect: ^4.1.4` and `@effect/platform-node: ^4.1.4`, while `package-lock.json` resolves each to `4.1.4`; the platform package's peer dependency is itself `effect: ^4.1.4`. That is exactly the alignment Effect 4's new unified versioning scheme expects. [raw.githubusercontent.com](https://raw.githubusercontent.com/libar-dev/sdp-new/main/package.json)

The repository also follows v4's package-consolidation model correctly. `src/cli/main.ts` imports CLI facilities from `effect/cli`; `src/workspace/Revisions.ts` imports process facilities from `effect/process`; platform-specific Node services remain in `@effect/platform-node`. The v4 migration guide specifically identifies `cli` and `process` among the consolidated `effect/*` modules while retaining `@effect/platform-*` as separate packages. [github.com](https://github.com/libar-dev/sdp-new/blob/main/src/cli/main.ts)

This matters because a superficially migrated Effect 3 project commonly leaves telltale package/import inconsistencies. I did not find such evidence here. The project instead uses a v4-only shape in `Revisions`:

ts

```ts
export const Revisions =
  Context.Reference<RevisionsReader>(
    "sdp/Revisions",
    { defaultValue: () => noRevisions }
  )
```

That is particularly strong evidence of intentional v4 design, because Effect's migration documentation explicitly describes the v4 transition from `FiberRef` to `Context.Reference`. [raw.githubusercontent.com](https://raw.githubusercontent.com/libar-dev/sdp-new/main/src/workspace/Revisions.ts)

The one dependency-management caveat is not correctness but stability policy: Effect's migration guide marks the consolidated modules such as `cli` and `process`, and packages outside core such as `@effect/platform-node`, as unstable APIs. Your use is correct, but `^4.1.4` therefore permits minor-version changes in APIs whose stability contract is weaker than ordinary stable-semver expectations. For a CLI tool under active development that is reasonable, but for releases intended to be highly reproducible, pinning Effect packages exactly or letting a dependency-update bot produce reviewed upgrades would reduce surprise. [github.com](https://github.com/Effect-TS/effect/blob/main/MIGRATION.md)

**Classification:** optional enhancement. **Severity:** low. **Effort:** low.

### The service boundary is appropriately small

`src/effect.ts` documents the native API as effects requiring `FileSystem` and `Path`, with `gitRevisions` optionally supplying Git capability. This is a clean requirements model: filesystem dependence is visible in the effect type, the application layer remains independent of Node's filesystem implementation, and callers can substitute a different layer. [raw.githubusercontent.com](https://raw.githubusercontent.com/libar-dev/sdp-new/main/src/effect.ts)

`Workspace.ts` reinforces that architecture explicitly: workspace reading uses Effect's `FileSystem`, passes plain values into the pure graph builder, and can run against a memory filesystem. `Running.ts` likewise says the executable-spec pipeline works over any `FileSystem`. [raw.githubusercontent.com](https://raw.githubusercontent.com/libar-dev/sdp-new/main/src/workspace/Workspace.ts)

I would **not** recommend converting `Reading`, `Running` or `Authoring` into `Context.Service` classes merely to "use more Effect." Their exported functions are cohesive use cases and their dependencies already appear naturally in the environment through the services they yield. Effect's service abstraction is valuable when a domain capability itself needs abstraction/substitution; turning simple stateless orchestration modules into service layers would add indirection without improving lifecycle or testability. Effect's service and layer documentation emphasizes requirements and construction dependencies, not service-class maximalism. [effect.website](https://effect.website/docs/v4/requirements-management/services)

`Revisions` is the place where a custom capability abstraction _is_ justified, and it is modeled well. A default `noRevisions` implementation makes Git an optional contextual capability rather than forcing every pure/in-memory caller to provide it. The Node-facing layer then supplies the actual Git implementation. [raw.githubusercontent.com](https://raw.githubusercontent.com/libar-dev/sdp-new/main/src/workspace/Revisions.ts)

That is a good example of using Effect "to full effect": abstraction is introduced where the execution environment genuinely varies.

### Effect API and Promise API form a clean boundary

The split between `sdp/effect` and the default `sdp` export is particularly well designed. The Effect API leaves `FileSystem | Path` requirements visible, while `src/index.ts` adapts those use cases to disk-backed promises with `NodeServices.layer`. [raw.githubusercontent.com](https://raw.githubusercontent.com/libar-dev/sdp-new/main/src/effect.ts)

`run` and `gate` additionally expose an `AbortSignal`, and `runOnDisk` passes it into `Effect.runPromise`. That preserves Effect interruption semantics even for conventional JavaScript callers. [raw.githubusercontent.com](https://raw.githubusercontent.com/libar-dev/sdp-new/main/src/index.ts)

This is preferable to sprinkling `Effect.runPromise` throughout application code. Official guidance positions `runPromise` as an execution-boundary operation for compatibility with Promise code, which is exactly how it is used here. [effect.website](https://effect.website/docs/v4/getting-started/running-effects?utm_source=chatgpt.com)

The CLI's final pipeline is similarly correct:

ts

```ts
sdp.pipe(
  Command.withSubcommands([...]),
  Command.run({ version: sdpVersion }),
  Effect.catchIf(isAppError, (e) => fail(describe(e))),
  Effect.provide(Layer.provideMerge(gitRevisions, NodeServices.layer)),
  NodeRuntime.runMain
)
```

Effect 4's Node runtime documentation recommends `runMain` for process entry points specifically because it handles signals, root-fiber interruption, error reporting and process exit behavior. [github.com](https://github.com/libar-dev/sdp-new/blob/main/src/cli/main.ts)

**Finding:** no change required.

## Errors, Schema, resources and streams

### Error modeling is one of the strongest parts of the codebase

The project consistently distinguishes expected application failure from defects. `UnknownNode`, `Refused`, `InvalidTags`, `UnreadableSpecs`, `BaseNotFound`, `ResultsLocked`, workspace errors and runner errors are tagged values, many implemented via `Schema.TaggedError`. `AppError` then forms an explicit closed union, and `appErrorTags` uses a mapped type so adding a new `_tag` to the union without updating the runtime recognizer causes a compile-time failure. [raw.githubusercontent.com](https://raw.githubusercontent.com/libar-dev/sdp-new/main/src/app/Errors.ts)

This aligns directly with Effect's recommended expected-error model: failures that callers can reasonably react to belong in the typed error channel, and `Schema.TaggedError` provides a schema-backed yieldable error class. [effect.website](https://effect.website/docs/v4/error-management/expected-errors?utm_source=chatgpt.com)

The runner makes a deliberate exception at the **step-execution boundary**. A step definition may return `Effect<unknown, unknown, never>`, and `runPickle` captures its `Exit`, squashes its cause, and records a failed/pending scenario rather than allowing arbitrary user-step error types to become part of SDP's application error algebra. [raw.githubusercontent.com](https://raw.githubusercontent.com/libar-dev/sdp-new/main/src/run/Steps.ts)

That is correct abstraction. A failing test step is _data about the scenario_, not a failure of the runner itself. Letting every possible step's error type escape through `runScenarios` would make the runner's error channel uncontrollable and collapse the distinction between "test failed" and "test infrastructure failed."

### Scope and resource management are unusually careful

Git subprocesses are created inside `Effect.scoped`; the process handle's stdout and exit code are consumed while that scope is active. Effect's scope abstraction exists specifically to tie resource finalization to a lexical effect lifetime, so the design is aligned with the framework. [raw.githubusercontent.com](https://raw.githubusercontent.com/libar-dev/sdp-new/main/src/workspace/Revisions.ts)

The results-store code is even more explicit. `commitResults`:

1.  acquires a filesystem lock,
2.  performs the merge,
3.  publishes via a rename so readers do not observe a half-written file,
4.  cleans up the temporary file on failure,
5.  keeps the critical merge uninterruptible after acquisition, and
6.  releases the lock with `Effect.acquireUseRelease`.

Those choices are visible in `src/run/Store.ts:48-92`. [raw.githubusercontent.com](https://raw.githubusercontent.com/libar-dev/sdp-new/main/src/run/Store.ts)

The comment explaining why the merge becomes uninterruptible is technically important: once a Node filesystem write/rename has started, interruption cannot reverse the external operation; releasing the lock before an in-flight write has definitely completed could permit a later writer to be overwritten. That is exactly the kind of critical section for which Effect's interruption/resource machinery is meant. [raw.githubusercontent.com](https://raw.githubusercontent.com/libar-dev/sdp-new/main/src/run/Store.ts)

I would leave this design intact.

### The Git stream implementation is correct, with one scaling limit

`gitRevisions` connects subprocess stdin through `Stream.make`, and runs `Stream.runCollect(handle.stdout)` concurrently with `handle.exitCode`. Running both consumers concurrently is sensible because a child process can otherwise block on a full pipe while its parent waits for termination. The code's `{ concurrency: 2 }` therefore reflects a real process-I/O constraint rather than gratuitous concurrency. [raw.githubusercontent.com](https://raw.githubusercontent.com/libar-dev/sdp-new/main/src/workspace/Revisions.ts)

The limitation is `Stream.runCollect(handle.stdout)`: every Git command's stdout becomes one in-memory collection and then a `Buffer`. For the current use cases—`rev-parse`, `ls-tree`, and batched `cat-file` reads—that keeps the implementation simple and appears deliberate. But `cat-file --batch` can return the complete contents of all requested spec blobs, so peak memory grows with the total requested base-spec content. `commitFiles.read` batches all wanted objects for a repository into a single Git invocation. [raw.githubusercontent.com](https://raw.githubusercontent.com/libar-dev/sdp-new/main/src/workspace/Revisions.ts)

If SDP is expected to work on repositories with hundreds of megabytes of specification inputs, this should eventually become a streaming parser or a bounded batching loop. For ordinary specification repositories, changing it now would probably cost more complexity than it saves.

**Classification:** optional enhancement. **Severity:** low for current likely workloads; medium if huge corpora are a design target. **Effort:** medium.

A conservative intermediate change would batch object IDs without rewriting the parser:

ts

```ts
// Current
const out = yield* git(
  repository,
  ["cat-file", "--batch"],
  blobs.map(({ object }) => `${object}\n`).join("")
)

// Suggested for a large-repo target
const chunks = yield* Effect.forEach(
  Chunk.chunksOf(blobs, 256),
  (batch) =>
    git(
      repository,
      ["cat-file", "--batch"],
      batch.map(({ object }) => `${object}\n`).join("")
    ),
  { concurrency: 1 }
)
```

A regression test should generate enough synthetic blobs to exercise several batches and verify byte-for-byte identical `SourceFile` output, including binary-looking content, filenames with spaces, and truncated Git output.

## Fibers, cancellation and concurrency

The runner is a strong application of structured concurrency. It computes the non-serial scenario set, starts an ordered publisher with `Effect.forkChild`, executes scenarios through `Effect.forEach` with bounded configurable concurrency, sends completed results through a `Queue`, runs `@serial` scenarios afterwards, and `Fiber.join`s the publisher before returning. [raw.githubusercontent.com](https://raw.githubusercontent.com/libar-dev/sdp-new/main/src/run/Runner.ts)

`forkChild` is the correct primitive here. Effect 4's fiber documentation says child fibers are supervised by their parent and are interrupted automatically when the parent terminates. That means the publisher cannot silently become an orphan if scenario execution fails or the run is interrupted. [effect.website](https://effect.website/docs/v4/concurrency/fibers?utm_source=chatgpt.com)

The ordered publisher is also a sensible compromise between parallel execution and deterministic progress output. Worker completion may be out of order, but `onScenario` observes the original scenario order. [raw.githubusercontent.com](https://raw.githubusercontent.com/libar-dev/sdp-new/main/src/run/Runner.ts)

The step timeout path is carefully implemented. Each running step gets a fresh `AbortController`; the actual effect is wrapped in `Effect.timeout`; interruption triggers `controller.abort()`; and a late synchronous handler is still marked timed out once control returns. The public `StepContext` explicitly tells step authors to propagate the signal to `fetch`, subprocesses or timers. [raw.githubusercontent.com](https://raw.githubusercontent.com/libar-dev/sdp-new/main/src/run/Runner.ts)

This correctly acknowledges an unavoidable JavaScript limitation: Effect can interrupt asynchronous/cooperative effects, but it cannot preempt a synchronous JavaScript function that monopolizes the event loop. Effect's fiber documentation describes asynchronous interruption and resource-safe cancellation, while `@effect/vitest` similarly notes that a timeout cannot preempt synchronous JavaScript that never returns. [effect.website](https://effect.website/docs/v4/concurrency/fibers?utm_source=chatgpt.com)

One design choice I would retain is the use of **bounded `Effect.forEach` concurrency** rather than manually creating a pool of detached fibers. It is simpler, structured, and exposes the intended policy directly. [raw.githubusercontent.com](https://raw.githubusercontent.com/libar-dev/sdp-new/main/src/run/Runner.ts)

There is one optional memory refinement. `finished` is an unbounded queue, and the publisher's `waiting` map may accumulate many completed later scenarios while an early scenario remains slow. However, the caller ultimately retains all `ScenarioResult` values anyway, so this is not a leak; it is an additional temporary reference set. [raw.githubusercontent.com](https://raw.githubusercontent.com/libar-dev/sdp-new/main/src/run/Runner.ts)

I would therefore **not** change the queue merely for doctrinal reasons. If runs eventually contain tens of thousands of large scenario results, a bounded queue could impose backpressure, but preserving ordered publication would still require buffering later results somewhere.

**Classification:** optional enhancement. **Severity:** low. **Effort:** low-to-medium.

### Suggested concurrency tests

The existing custom scenario suite should be supplemented with narrow runtime tests covering invariants that are hard to prove through acceptance output alone. Effect's official Vitest integration gives each `it.effect` a test Effect environment and a fresh scope and supports `TestClock`, which is particularly useful here. [github.com](https://github.com/Effect-TS/effect/blob/main/packages/vitest/README.md?utm_source=chatgpt.com)

Tests worth adding are:

-   a concurrency-limit test that increments a `Ref` on entry and records the maximum active scenario count;
-   an interruption test proving that aborting the public `run(..., { signal })` interrupts the active Effect step and aborts its `StepContext.signal`;
-   a publisher-order test where scenario 2 deliberately completes before scenario 1 but callbacks are observed as `1, 2`;
-   a serial-tag test proving no ordinary worker overlaps an `@serial` scenario;
-   a timeout test driven by `TestClock`, not wall-clock sleeps;
-   a scope/finalizer test proving child-process or synthetic acquired resources close on timeout and parent interruption.

These would target Effect-specific correctness rather than duplicate the repository's Gherkin product tests.

## Testing, TypeScript tooling and CI

### The current test philosophy is good, but it leaves Effect-runtime behavior under-tested

The repository uses itself as its principal test runner: `sdp.config.yaml` points `features` to `specs/**/*.feature`, `code` to `src/**/*.ts`, and steps to `specs/steps/**/*.steps.ts`; `npm test` runs SDP with concurrency 8, and `npm run verify` typechecks, checks the specs, runs the scenarios, and evaluates the `GUIDE` gate. [raw.githubusercontent.com](https://raw.githubusercontent.com/libar-dev/sdp-new/main/sdp.config.yaml)

That is architecturally coherent with the project itself and should remain the top-level acceptance suite. `Running.ts` is also deliberately filesystem-agnostic so those executable specs can run against an in-memory workspace. [raw.githubusercontent.com](https://raw.githubusercontent.com/libar-dev/sdp-new/main/src/app/Running.ts)

What is missing is a second, much smaller layer of tests for **Effect mechanics**. There is no `@effect/vitest` or Vitest dependency in `package.json`. The official `@effect/vitest` package supports scoped effects, test services, shared/per-test layers and virtual time through `TestClock`. [raw.githubusercontent.com](https://raw.githubusercontent.com/libar-dev/sdp-new/main/package.json)

I would not call the absence a bug. It becomes an anti-pattern only because this repository now contains nontrivial cancellation, fiber supervision, locking, scopes and timeout behavior whose correctness depends on lifecycle semantics, not just output records.

**Classification:** anti-pattern. **Severity:** medium. **Effort:** medium.

Suggested dependencies:

json

```json
{
  "devDependencies": {
    "@effect/vitest": "^4.1.4",
    "vitest": "^5",
    "@types/node": "^26.6.6",
    "typescript": "^7.0.2"
  }
}
```

The exact compatible `@effect/vitest` version should be kept aligned with the Effect version because v4 ecosystem packages are jointly versioned, while the current official testing package targets Vitest 5. [github.com](https://github.com/Effect-TS/effect/blob/main/MIGRATION.md)

A representative test could replace real-time lock waiting with virtual time:

ts

```ts
import { assert, it } from "@effect/vitest"
import { Effect, Fiber } from "effect"
import { TestClock } from "effect/testing"

it.effect("waits for a held results lock without wall-clock delay", () =>
  Effect.gen(function* () {
    const fiber = yield* Effect.forkChild(commitWhileLocked)

    yield* TestClock.adjust("2 seconds")

    const exit = yield* Fiber.await(fiber)
    assert(/* ResultsLocked invariant */)
  })
)
```

That test is faster, deterministic, and directly proves that the Effect timing semantics behave as intended. [github.com](https://github.com/Effect-TS/effect/blob/main/packages/vitest/README.md?utm_source=chatgpt.com)

### Add Effect 4's compiler diagnostics

This is the clearest place where the repository is **not yet using Effect 4 to full effect**.

The TypeScript configuration is already strong: `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noUnusedLocals`, NodeNext modules, TypeScript 7, and no emit. [raw.githubusercontent.com](https://raw.githubusercontent.com/libar-dev/sdp-new/main/tsconfig.json)

But with TypeScript 7, Effect now recommends `@effect/tsgo`, which integrates Effect-specific diagnostics. Those diagnostics can detect floating Effects, missing service requirements, missing error-channel types, bad layer requirements and outdated v4 APIs—classes of bug ordinary TypeScript does not necessarily diagnose. [effect.website](https://effect.website/docs/v4/getting-started/devtools?utm_source=chatgpt.com)

For this repository that is especially valuable because the design relies heavily on generator yielding, environment requirements and Layer composition.

**Before:**

json

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true
  }
}
```

**Recommended direction:**

json

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "plugins": [
      {
        "name": "@effect/language-service"
      }
    ]
  }
}
```

and, following Effect's TypeScript-7 guidance:

json

```json
{
  "devDependencies": {
    "@effect/tsgo": "..."
  },
  "scripts": {
    "prepare": "effect-tsgo patch",
    "typecheck": "tsc --noEmit && tsc --noEmit -p examples/shop"
  }
}
```

The official tooling documentation says `@effect/tsgo` is the TypeScript 7 path and specifically advertises build-time diagnostics for floating Effects, layer leaks and error/service mistakes. [effect.website](https://effect.website/docs/v4/getting-started/devtools?utm_source=chatgpt.com)

**Classification:** optional enhancement, but high-value. **Severity of current risk:** medium. **Effort:** low-to-medium.

### Enable `exactOptionalPropertyTypes`

`tsconfig.json` currently does not enable it. Effect's Schema documentation calls it optional, not mandatory, but notes that Schema can take advantage of it and that without it there can be a mismatch between TypeScript's handling of optional properties and runtime schema behavior. [raw.githubusercontent.com](https://raw.githubusercontent.com/libar-dev/sdp-new/main/tsconfig.json)

This repository has many schema-defined records with optional properties, for example `UnknownNode.closest` and `SourcesChanged.links[].now`, so this is not theoretical. [raw.githubusercontent.com](https://raw.githubusercontent.com/libar-dev/sdp-new/main/src/app/Errors.ts)

Because existing interfaces often intentionally spell fields as `foo?: T | undefined`, enabling the flag may produce less churn here than in many codebases. Still, run the compiler and inspect every resulting error rather than applying it blindly; where absence and explicit `undefined` have different domain meanings, `Schema.optionalKey` is available. [effect.website](https://effect.website/docs/v4/schema/advanced-usage?utm_source=chatgpt.com)

**Classification:** optional enhancement. **Severity:** low. **Effort:** low-to-medium.

### Put `verify` in CI

The repository's main tree contains `.claude`, `bin`, `examples`, `specs`, and `src`, but no `.github` directory is visible; the Actions page does not expose a repository workflow in the audited state. The repository therefore appears to have no checked-in GitHub Actions workflow on `main`. [github.com](https://github.com/libar-dev/sdp-new)

That is the most significant process gap because `npm run verify` is already a useful single source of truth and exercises type checking, static SDP checking, concurrent scenarios and a gate. [raw.githubusercontent.com](https://raw.githubusercontent.com/libar-dev/sdp-new/main/package.json)

**Classification:** anti-pattern. **Severity:** medium. **Effort:** low.

A minimal workflow would be sufficient:

yaml

```yaml
name: verify

on:
  push:
  pull_request:

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run verify
```

After adding `@effect/tsgo` / targeted unit tests, `verify` should include those checks too. The repository itself declares Node `>=24`, while `@effect/platform-node` 4.1.4 requires Node 22.19 or later, so Node 24 is consistent with both the project and Effect platform package. [raw.githubusercontent.com](https://raw.githubusercontent.com/libar-dev/sdp-new/main/package.json)

## Code-level findings and concrete changes

The following issues are the ones I would actually put into a backlog. I am deliberately excluding "convert more things into services" and "replace loops with Effect combinators" because those would mostly increase ceremony rather than correctness.

| Priority | Finding | Class | Severity | Effort | Location |
| --- | --- | --- | --- | --- | --- |
| P1 | No checked-in CI for the existing verification pipeline | Anti-pattern | Medium | Low | repository root / `.github` absent |
| P1 | No Effect-specific compiler diagnostics despite TS 7 | Optional enhancement | Medium risk-reduction | Low–Medium | `package.json`, `tsconfig.json` |
| P1 | No focused Effect-runtime tests for scopes, interruption, virtual time and fiber behavior | Anti-pattern | Medium | Medium | testing infrastructure |
| P2 | `exactOptionalPropertyTypes` not enabled | Optional enhancement | Low | Low–Medium | `tsconfig.json` |
| P2 | Git stdout is fully collected in memory | Optional enhancement | Low/Medium at scale | Medium | `src/workspace/Revisions.ts:91-101`, `285-295` |
| P3 | Package-owned skill read uses `Effect.promise`, so rejection is a defect by policy | Optional clarification | Low | Low | `src/app/Authoring.ts:18-19` |
| P3 | Effect v4 unstable modules are consumed under caret ranges | Optional enhancement | Low | Low | `package.json:29-30` |
| — | Effect 4 dependencies/imports | Correct | — | — | project-wide |
| — | `Context.Reference` Git capability | Correct / idiomatic | — | — | `src/workspace/Revisions.ts:43-58` |
| — | Scoped subprocesses | Correct / idiomatic | — | — | `src/workspace/Revisions.ts:85-101` |
| — | Lock acquisition/finalization | Correct / idiomatic | — | — | `src/run/Store.ts:48-92` |
| — | Structured scenario fibers | Correct / idiomatic | — | — | `src/run/Runner.ts:201-224` |
| — | CLI runtime | Correct / idiomatic | — | — | `src/cli/main.ts` final pipeline |
| — | Effect/Promise API split | Correct / idiomatic | — | — | `src/effect.ts`, `src/index.ts` |

### Make `ownSkill` failure policy explicit

Current code:

ts

```ts
const ownSkill =
  Effect.promise(() =>
    readFile(new URL(`../../${skillFile}`, import.meta.url), "utf8")
  )
```

`Effect.promise` is documented for Promises that are expected never to reject; if the Promise does reject, that becomes a defect rather than a typed failure. [raw.githubusercontent.com](https://raw.githubusercontent.com/libar-dev/sdp-new/main/src/app/Authoring.ts)

That may actually be the desired semantic here. The comment says the file is part of SDP's own installation, so a missing bundled skill is arguably a broken installation—an invariant violation rather than a user error. [raw.githubusercontent.com](https://raw.githubusercontent.com/libar-dev/sdp-new/main/src/app/Authoring.ts)

The improvement is therefore not necessarily to change behavior, but to make that choice explicit:

ts

```ts
// The skill is part of the installed package.
// Its absence means the SDP installation is broken, so rejection is a defect.
const ownSkill = Effect.promise(() =>
  readFile(new URL(`../../${skillFile}`, import.meta.url), "utf8")
)
```

If packaging later makes absence recoverable, then switch to `tryPromise` and a dedicated tagged error:

ts

```ts
class InstalledAssetError
  extends Schema.TaggedError<InstalledAssetError>()(
    "InstalledAssetError",
    {
      file: Schema.String,
      message: Schema.String
    }
  ) {}

const ownSkill = Effect.tryPromise({
  try: () =>
    readFile(new URL(`../../${skillFile}`, import.meta.url), "utf8"),
  catch: (cause) =>
    new InstalledAssetError({
      file: skillFile,
      message: cause instanceof Error ? cause.message : String(cause)
    })
})
```

**Suggested test:** temporarily point the loader at a nonexistent fixture and assert whichever contract is chosen: a defect for an installation invariant, or a typed `InstalledAssetError` for a supported runtime failure. Effect distinguishes these deliberately, so the test should document the policy. [effect.website](https://effect.website/docs/v4/getting-started/creating-effects?utm_source=chatgpt.com)

### Keep the current result-store critical section

A tempting "cleanup" would be to replace:

ts

```ts
Effect.acquireUseRelease(
  acquire,
  () => Effect.uninterruptible(merge),
  () => Effect.ignore(fs.remove(lock))
)
```

with an ordinary interruptible `merge`. Do not do that. The current code intentionally prevents the lock from disappearing before an already-started filesystem write/rename can finish. [raw.githubusercontent.com](https://raw.githubusercontent.com/libar-dev/sdp-new/main/src/run/Store.ts)

A useful test is instead to inject interruption during each phase—before acquisition, while waiting, after lock acquisition, during temporary-file write, and during rename—and assert:

-   no stale lock after the effect ends;
-   no partial JSON visible;
-   no later writer is overwritten by an earlier interrupted writer;
-   temporary files are removed on failure.

This is precisely where Effect's scope/finalizer model delivers value, and the implementation already exploits it well. [effect.website](https://effect.website/docs/v4/resource-management/scope)

### Preserve `forkChild`, not detached fibers

Current:

ts

```ts
const publisher = yield* Effect.forkChild(
  Effect.gen(function*() {
    // ...
  })
)
```

This should remain `forkChild`. A detached/global fiber would weaken the lifecycle guarantee because the publisher could outlive its run. Effect documents child fibers as automatically supervised by their parent, while detached fibers have global lifetime. [raw.githubusercontent.com](https://raw.githubusercontent.com/libar-dev/sdp-new/main/src/run/Runner.ts)

The existing structure is the recommended one:

### Optional observability

Many public use cases already use named `Effect.fn("...")`, for example `runScenarios`, `readResults`, `commitResults`, `Revisions.base` and `Revisions.ignores`. Named `Effect.fn` is designed to improve traceability and stack information; the repository therefore already has useful instrumentation points. [raw.githubusercontent.com](https://raw.githubusercontent.com/libar-dev/sdp-new/main/src/run/Runner.ts)

What it does not currently appear to do is export those spans to an observability backend or annotate them richly. Effect 4 includes logging, tracing and metrics as first-class facilities. [effect.website](https://effect.website/docs/v4/observability/logging?utm_source=chatgpt.com)

For a local CLI, I would classify OpenTelemetry integration as **optional**, not as missing architecture. If SDP grows into a long-lived MCP service used at scale, tracing Git calls, workspace loading, scenario execution and lock contention would become materially useful.

**Classification:** optional enhancement. **Severity:** low today. **Effort:** medium.

## Prioritized action plan and final verdict

The highest-value sequence is:

1.  **Add CI around `npm ci && npm run verify`.** The repository already has a coherent verification command; the missing piece is enforcing it on every change. [raw.githubusercontent.com](https://raw.githubusercontent.com/libar-dev/sdp-new/main/package.json)
2.  **Adopt `@effect/tsgo` for Effect-specific TypeScript diagnostics.** This is the most direct way to benefit from Effect 4 tooling and guard against floating effects, service/layer mistakes and outdated API usage. [effect.website](https://effect.website/docs/v4/getting-started/devtools?utm_source=chatgpt.com)
3.  **Add a small `@effect/vitest` suite for runtime semantics**, especially cancellation, `TestClock`\-driven timeout/lock tests, scope finalization, concurrency limits and ordered publication. Keep the existing Gherkin suite as the primary acceptance suite. [github.com](https://github.com/Effect-TS/effect/blob/main/packages/vitest/README.md?utm_source=chatgpt.com)
4.  **Trial `exactOptionalPropertyTypes: true`** and fix resulting Schema/type discrepancies intentionally. Effect Schema specifically benefits from the option. [effect.website](https://effect.website/docs/v4/schema/introduction?utm_source=chatgpt.com)
5.  **Document the deliberate defect semantics of `ownSkill`**, or model it as a typed installed-asset error if a missing asset is intended to be recoverable. [raw.githubusercontent.com](https://raw.githubusercontent.com/libar-dev/sdp-new/main/src/app/Authoring.ts)
6.  **Only if large repositories are a product requirement, bound Git-output buffering** in `Revisions.ts`; otherwise retain the simple `Stream.runCollect` implementation. [raw.githubusercontent.com](https://raw.githubusercontent.com/libar-dev/sdp-new/main/src/workspace/Revisions.ts)
7.  **Consider exact Effect version pins for release branches** because the v4 `cli`, `process`, and platform-node surfaces used here are explicitly documented as unstable. [github.com](https://github.com/Effect-TS/effect/blob/main/MIGRATION.md)

The final verdict is **yes: this project is correctly using Effect 4, and it uses substantially more of Effect 4's real value than a typical "Effect-enabled" codebase**. The strongest evidence is not syntax but architecture: effects remain descriptions until transport boundaries; environment-dependent capabilities are explicit; the filesystem is substitutable; Git is a contextual capability; expected errors remain typed; subprocesses are scoped; result publication is resource-safe under interruption; fibers are supervised; concurrency is bounded; Promise cancellation is bridged back into Effect interruption; and `NodeRuntime.runMain` owns the process lifecycle. [raw.githubusercontent.com](https://raw.githubusercontent.com/libar-dev/sdp-new/main/src/effect.ts)

It is also **appropriately restrained**. I would not recommend adding `Context.Service`, `Layer`, `Stream`, `Ref`, or fibers merely to increase Effect surface area. The pure graph-processing portions should stay pure, and ordinary local loops should stay ordinary when they carry no concurrency/resource semantics. Effect's value is composable handling of requirements, errors, resources, concurrency and observability—not replacing every TypeScript construct. [effect.website](https://effect.website/docs/v4/onboarding?utm_source=chatgpt.com)

What prevents a "fully exploited" rating today is mostly the development envelope around the code rather than the code's core design: Effect 4's dedicated compiler diagnostics are not enabled, its test runtime is not being used for the parts most sensitive to time/interruption/scope semantics, and the repository's excellent `verify` pipeline apparently is not enforced by CI. Those are relatively contained improvements. There is no architectural rewrite suggested by this audit, and I found no evidence that the project is inadvertently written against Effect 3 semantics. [effect.website](https://effect.website/docs/v4/getting-started/devtools?utm_source=chatgpt.com)