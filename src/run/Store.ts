/**
 * The results store: one generated file (`config.results`) with the latest
 * result of every scenario. Runs may overlap — agents, shells, CI jobs — so a
 * run never writes back what it read when it started: a commit takes a lock,
 * reads the file as it is then, replaces only the scenarios this run executed,
 * and publishes the new file with a rename.
 */
import { annotate } from "sdp/annotations"
import { DateTime, Effect, FileSystem, Path, Schema } from "effect"
import type { Config } from "../model/Config.ts"
import { RunResults, type ScenarioResult } from "../model/Results.ts"

annotate(import.meta, { is: "ARCH-runner" })

/** Another run holds the lock on the results file and did not release it in time. */
export class ResultsLocked extends Schema.TaggedError<ResultsLocked>()("ResultsLocked", {
  lock: Schema.String
}) {
  override get message() {
    return `another sdp run is recording results (${this.lock} exists); run again when it has finished, or delete that file if no run is active`
  }
}

/** The stored results, or `undefined` when there are none that this sdp can read: they are a cache of earlier runs. */
export const readResults = Effect.fn("readResults")(function*(root: string, config: Config) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const file = path.join(root, config.results)
  if (!(yield* fs.exists(file))) return undefined
  const text = yield* fs.readFileString(file)
  return yield* Schema.decodeUnknownEffect(Schema.fromJsonString(RunResults))(text).pipe(
    Effect.orElseSucceed(() => undefined)
  )
})

/** A commit waits two seconds for another run's commit, which takes milliseconds. */
const lockAttempts = 40
const lockPause = "50 millis"

export interface Commit {
  /** The results of the scenarios this run executed: they replace what is stored for those scenarios, and nothing else. */
  readonly executed: ReadonlyArray<ScenarioResult>
  /** The ids of the scenarios that exist now: results of any other scenario are dropped. */
  readonly live: ReadonlySet<string>
  /** Workspace files the step definitions imported in this run. */
  readonly imports: ReadonlyArray<string>
}

/** Merges one run's results into the store under its lock and returns everything stored afterwards. */
export const commitResults = Effect.fn("commitResults")(function*(root: string, config: Config, commit: Commit) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const file = path.join(root, config.results)
  const lock = `${file}.lock`
  yield* fs.makeDirectory(path.dirname(file), { recursive: true })

  const acquire = Effect.gen(function*() {
    for (let attempt = 0; attempt < lockAttempts; attempt++) {
      const taken = yield* fs.writeFileString(lock, "", { flag: "wx" }).pipe(
        Effect.as(true),
        Effect.catchIf((error) => error.reason._tag === "AlreadyExists", () => Effect.succeed(false))
      )
      if (taken) return
      yield* Effect.sleep(lockPause)
    }
    return yield* new ResultsLocked({ lock: path.relative(root, lock) })
  })
  const merge = Effect.gen(function*() {
    const stored = yield* readResults(root, config)
    const kept = Object.entries(stored?.scenarios ?? {}).filter(([id]) => commit.live.has(id))
    const results: RunResults = {
      version: 3,
      runAt: DateTime.formatIso(yield* DateTime.now),
      imports: [...new Set([...(stored?.imports ?? []), ...commit.imports])].sort(),
      scenarios: Object.fromEntries([...kept, ...commit.executed.map((result) => [result.id, result] as const)])
    }
    // Readers never see a half-written file: the new one replaces the old in one step.
    const temporary = `${file}.${process.pid}.tmp`
    yield* fs.writeFileString(temporary, `${JSON.stringify(results, null, 2)}\n`)
    yield* fs.rename(temporary, file)
    return results
  })
  return yield* Effect.acquireUseRelease(acquire, () => merge, () => Effect.ignore(fs.remove(lock)))
})
