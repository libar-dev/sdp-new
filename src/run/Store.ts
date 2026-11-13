/**
 * The results store: one generated file (`config.results`) with the latest
 * result of every scenario. Runs may overlap — agents, shells, CI jobs — so a
 * run never writes back what it read when it started: a commit takes a lock,
 * reads the file as it is then, replaces only the scenarios this run executed,
 * and publishes the new file with a rename.
 *
 * @sdp is ARCH-runner
 */
import { Effect, FileSystem, Path, Schedule, Schema } from "effect"
import { isDeepStrictEqual } from "node:util"
import type { Config } from "../model/Config.ts"
import { resultsVersion, RunResults, type ScenarioResult } from "../model/Results.ts"

/** Another run holds the lock on the results file and did not release it in time. */
export class ResultsLocked extends Schema.TaggedError<ResultsLocked>()("ResultsLocked", {
  lock: Schema.String
}) {
  override get message() {
    return `another sdp run is recording results (${this.lock} exists); run again when it has finished, or delete that file if no run is active`
  }
}

/** A results file that exists but cannot be read by this version of sdp. */
export class ResultsUnreadable extends Schema.TaggedError<ResultsUnreadable>()("ResultsUnreadable", {
  file: Schema.String,
  problem: Schema.String
}) {
  override get message() {
    return `cannot record results: ${this.file} is not a results file this sdp reads (${this.problem}); move it aside or delete it, then run again`
  }
}

/** The stored results, or `undefined` when no results file exists. */
export const readResults = Effect.fn("readResults")(function*(root: string, config: Config) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const file = path.join(root, config.results)
  const unreadable = (problem: string) => new ResultsUnreadable({ file: path.relative(root, file), problem })
  if (!(yield* fs.exists(file))) return undefined
  const text = yield* fs.readFileString(file)
  const json = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Unknown))(text).pipe(
    Effect.mapError(() => unreadable("it is not JSON"))
  )
  const header = yield* Schema.decodeUnknownEffect(Schema.Struct({ version: Schema.Unknown }))(json).pipe(
    Effect.mapError(() => unreadable("it has no results version"))
  )
  if (header.version !== resultsVersion) {
    return yield* unreadable(`it is version ${String(header.version)}; this sdp reads version ${resultsVersion}`)
  }
  return yield* Schema.decodeUnknownEffect(RunResults)(json).pipe(
    Effect.mapError((problem) => unreadable(String(problem)))
  )
})

/** A private marker: only a held lock retries, and the delay between attempts is interruptible. */
class LockHeld extends Schema.TaggedError<LockHeld>()("LockHeld", {}) {}

export interface Commit {
  /** The results of the scenarios this run executed: they replace what is stored for those scenarios, and nothing else. */
  readonly executed: ReadonlyArray<ScenarioResult>
  /**
   * The results stored when this run read the specs, of scenarios that were not among them: each is
   * dropped unless another run replaced it since. A scenario added after this run started is no
   * scenario it knows to be gone, and keeps the result another run records for it.
   */
  readonly gone: ReadonlyArray<ScenarioResult>
  /** The workspace files the step definitions of this run had imported when it ended: what its results ran against besides the globs. */
  readonly imports: ReadonlyArray<string>
}

/** Merges one run's results into the store under its lock and returns everything stored afterwards. */
export const commitResults = Effect.fn("commitResults")(function*(root: string, config: Config, commit: Commit) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const file = path.join(root, config.results)
  const lock = `${file}.lock`
  yield* fs.makeDirectory(path.dirname(file), { recursive: true })

  const takeOnce = Effect.suspend(() => fs.writeFileString(lock, "", { flag: "wx" })).pipe(
    Effect.catchReason("PlatformError", "AlreadyExists", () => Effect.fail(new LockHeld({})))
  )
  const merge = Effect.gen(function*() {
    const stored = yield* readResults(root, config)
    const gone = new Map(commit.gone.map((result) => [result.id, result]))
    const kept = Object.entries(stored?.scenarios ?? {}).filter(([id, result]) => !isDeepStrictEqual(gone.get(id), result))
    const scenarios = Object.fromEntries([...kept, ...commit.executed.map((result) => [result.id, result] as const)])
    // Each result names its imports through its sources fingerprint; a list no result names any more is dropped.
    const recorded = new Set(Object.values(scenarios).map((result) => result.evidence.sources))
    const imports = [
      ...Object.entries(stored?.imports ?? {}),
      ...commit.executed.map((result) => [result.evidence.sources, [...commit.imports].sort()] as const)
    ]
    const results: RunResults = {
      version: resultsVersion,
      imports: Object.fromEntries(imports.filter(([sources]) => recorded.has(sources))),
      scenarios
    }
    // Readers never see a half-written file: the new one replaces the old in one step.
    const temporary = `${file}.${process.pid}.tmp`
    yield* fs.writeFileString(temporary, `${JSON.stringify(results, null, 2)}\n`).pipe(
      Effect.andThen(fs.rename(temporary, file)),
      Effect.onError(() => Effect.ignore(fs.remove(temporary)))
    )
    return results
  })
  // A merge that has begun finishes before the lock goes, interrupted or not: Node cannot take back
  // a write or a rename it has started, and one that lands after the lock is released would
  // overwrite the results another run committed meanwhile.
  return yield* Effect.acquireUseRelease(takeOnce, () => Effect.uninterruptible(merge), () => Effect.ignore(fs.remove(lock))).pipe(
    Effect.retry({ while: (error) => error._tag === "LockHeld", schedule: Schedule.spaced("50 millis"), times: 39 }),
    Effect.catchTag("LockHeld", () => Effect.fail(new ResultsLocked({ lock: path.relative(root, lock) })))
  )
})
