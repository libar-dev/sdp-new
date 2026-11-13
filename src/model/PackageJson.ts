/**
 * @sdp is ARCH-code-annotations
 */
import { Schema } from "effect"

/** A target of `exports` or `imports`: a path, conditions that each map to one, fallbacks, or `null`, which excludes the name. */
export type Target = string | null | ReadonlyArray<Target> | { readonly [condition: string]: Target }
const Target: Schema.Codec<Target> = Schema.Union([
  Schema.String,
  Schema.Null,
  Schema.Array(Schema.suspend((): Schema.Codec<Target> => Target)),
  Schema.Record(Schema.String, Schema.suspend((): Schema.Codec<Target> => Target))
])

const Dependencies = Schema.Record(Schema.String, Schema.String)

/** What sdp reads of a package.json. */
export const PackageJson = Schema.Struct({
  name: Schema.optional(Schema.String),
  type: Schema.optional(Schema.String),
  exports: Schema.optional(Target),
  imports: Schema.optional(Schema.Record(Schema.String, Target)),
  types: Schema.optional(Schema.String),
  typings: Schema.optional(Schema.String),
  main: Schema.optional(Schema.String),
  typesVersions: Schema.optional(Schema.Unknown),
  dependencies: Schema.optional(Dependencies),
  devDependencies: Schema.optional(Dependencies),
  peerDependencies: Schema.optional(Dependencies),
  optionalDependencies: Schema.optional(Dependencies),
  workspaces: Schema.optional(Schema.Union([Schema.Array(Schema.String), Schema.Struct({ packages: Schema.optional(Schema.Array(Schema.String)) })]))
})
export type PackageJson = typeof PackageJson.Type
