/** Builds the package npm packs: dist/ emitted from the sources, and the packed package.json. */
import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { Effect, FileSystem } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/process"
import { backup, dryRun, manifest, PackError, packedManifest, restoreCheckout, root } from "./checkout.ts"

const prepack = Effect.gen(function*() {
  yield* restoreCheckout()
  const fs = yield* FileSystem.FileSystem
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  const code = yield* spawner.exitCode(ChildProcess.make("tsc", ["-p", "tsconfig.build.json"], {
    cwd: root,
    stdout: "inherit",
    stderr: "inherit"
  }))
  if (code !== 0) return yield* new PackError({ message: `tsc -p tsconfig.build.json exited with ${code}` })
  const own = yield* fs.readFileString(manifest)
  const packed = yield* packedManifest(own)
  yield* fs.writeFileString(backup, own)
  yield* fs.writeFileString(manifest, packed)
}).pipe(
  // npm runs no postpack after a prepack that fails or is stopped: leave no partial build behind.
  Effect.onError(() => Effect.ignore(restoreCheckout()))
)

NodeRuntime.runMain(dryRun ? Effect.void : prepack.pipe(Effect.provide(NodeServices.layer)))
