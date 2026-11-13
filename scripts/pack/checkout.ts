/**
 * The checkout npm packs, and what packing writes in it while npm reads it. A checkout runs its
 * TypeScript sources and names itself `sdp`; the package npm packs runs the JavaScript and
 * declarations emitted into dist/ and has the name it is published under. npm reads the package's
 * manifest from the checkout's package.json, so prepack writes the packed one there, keeping the
 * checkout's own beside it, and postpack puts it back. npm names the tarball and reports it by the
 * manifest it read before prepack, and `npm publish` reads package.json again after postpack: what
 * is published is the tarball npm pack wrote (`npm publish <tarball>`), not the checkout.
 */
import { Effect, FileSystem, Schema } from "effect"
import { fileURLToPath } from "node:url"

const at = (path: string) => fileURLToPath(new URL(`../../${path}`, import.meta.url))
export const root = at("")
export const manifest = at("package.json")
/** The checkout's own package.json, kept while npm reads the packed one. */
export const backup = at(".package.json.prepack")
export const output = at("dist")

/**
 * npm runs prepack and postpack for `npm pack --dry-run` too. A dry run writes no package, and one
 * that a scenario runs in this repository must not change the files other scenarios read, so it
 * builds nothing and lists the checkout.
 */
export const dryRun = process.env.npm_config_dry_run === "true"

export class PackError extends Schema.TaggedError<PackError>()("PackError", { message: Schema.String }) {}

const Manifest = Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown))

/**
 * The package.json of the package npm packs: the checkout's, with the name it is published under,
 * public where the checkout is private, its entries as the emitted JavaScript and declarations, and
 * only the files an installed sdp reads. The checkout stays private so that `npm publish` run in it
 * publishes nothing; a scoped name is private on npm unless its access says otherwise. It keeps the
 * checkout's scripts: a checkout that a failed pack left with this manifest is put back by the next
 * `npm pack`, or by `npm run postpack`.
 */
export const packedManifest = Effect.fn("packedManifest")(function*(checkout: string) {
  const source = yield* Schema.decodeUnknownEffect(Manifest)(checkout)
  const entry = (name: string) => ({ types: `./dist/${name}.d.ts`, default: `./dist/${name}.js` })
  return JSON.stringify({
    ...source,
    name: "@libar-dev/software-delivery-protocol",
    private: undefined,
    publishConfig: { access: "public" },
    exports: { ".": entry("index"), "./effect": entry("effect"), "./steps": entry("steps") },
    files: ["dist", "bin", ".claude/skills/sdp/SKILL.md"]
  }, null, 2) + "\n"
})

/**
 * Puts the checkout back as it was before it was packed: its own package.json, and no dist/. npm
 * runs no postpack when packing fails after prepack, so prepack does this first too. A package.json
 * that is neither the checkout's kept one nor the packed one was changed since: neither is dropped.
 */
export const restoreCheckout = Effect.fn("restoreCheckout")(function*() {
  const fs = yield* FileSystem.FileSystem
  if (yield* fs.exists(backup)) {
    const own = yield* fs.readFileString(backup)
    const current = yield* fs.readFileString(manifest)
    if (current === (yield* packedManifest(own))) yield* fs.rename(backup, manifest)
    else if (current === own) yield* fs.remove(backup)
    else {
      return yield* new PackError({
        message: `package.json is neither the checkout's own, kept in ${backup}, nor the one npm packs from it: `
          + "put back the one it should be and delete the other"
      })
    }
  }
  yield* fs.remove(output, { recursive: true, force: true })
})
