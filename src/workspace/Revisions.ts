/**
 * The base revision `sdp check` compares live tests with, read from git: the feature files of the
 * commit where HEAD meets the base, as that commit's own configuration finds them, and that
 * configuration. Reading is IO at the edge; comparing is the checker's, and pure (`compareWithBase`).
 *
 * The base is named by `--base` or `base:` in the configuration, and is otherwise the repository's
 * default branch: origin's HEAD, else main, else master. A base that is named and cannot be read
 * stops the check; one that is not named and cannot be found leaves it with nothing to compare, an
 * answer that may miss a test turned off; `none` waives the comparison.
 */
import { Context, Effect, Glob, Layer, Result, Schema, Stream } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/process"
import type { SourceFile } from "../graph/Build.ts"
import type { BaseSpecs } from "../check/Check.ts"
import { configFileNames } from "../model/Config.ts"
import { parseConfig } from "./Workspace.ts"

/** The base that waives the comparison: `--base none`, or `base: none` in the configuration. */
export const noBase = "none"

/** A base that `--base` or the configuration names, and that cannot be read. */
export class BaseNotFound extends Schema.TaggedError<BaseNotFound>()("BaseNotFound", {
  base: Schema.String,
  reason: Schema.String
}) {
  override get message() {
    return `cannot compare live tests with the base ${this.base}: ${this.reason}`
  }
}

/** The specs at the base, with the git command that finds it, or why there is no base to compare with. */
export type BaseRead =
  | { readonly found: BaseSpecs & { readonly command: string } }
  | { readonly none: string }

export interface RevisionsReader {
  /** The specs where HEAD meets `named`, or else the default branch, with the configuration they were read with. */
  readonly base: (root: string, named: string | undefined) => Effect.Effect<BaseRead, BaseNotFound>
}

const noGit = "sdp was given no git to read it from"

/** No revisions at all, as for a workspace in memory: a check says it compared nothing. */
export const noRevisions: RevisionsReader = {
  base: (_root, named) =>
    named === undefined ? Effect.succeed({ none: noGit }) : Effect.fail(new BaseNotFound({ base: named, reason: noGit }))
}

/** Where `sdp check` reads its base from; by default nowhere. */
export const Revisions = Context.Reference<RevisionsReader>("sdp/Revisions", { defaultValue: () => noRevisions })

/** The base as git finds it, in the repository the workspace is in. */
export const gitRevisions = Layer.effect(
  Revisions,
  Effect.gen(function*() {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    /** A git command run in the workspace: its exit code and what it wrote, or undefined when git does not run. */
    const git = (root: string, args: ReadonlyArray<string>, input?: string) =>
      Effect.scoped(Effect.gen(function*() {
        const handle = yield* spawner.spawn(ChildProcess.make("git", [...args], {
          cwd: root,
          stdin: input === undefined ? "ignore" : Stream.make(new TextEncoder().encode(input)),
          stderr: "ignore"
        }))
        const [chunks, code] = yield* Effect.all([Stream.runCollect(handle.stdout), handle.exitCode], { concurrency: 2 })
        return { code: Number(code), out: Buffer.concat([...chunks]) }
      })).pipe(Effect.orElseSucceed(() => undefined))
    const text = (result: { readonly code: number; readonly out: Buffer } | undefined) =>
      result?.code === 0 ? result.out.toString("utf8").trim() : undefined

    const base = Effect.fn("Revisions.base")(function*(root: string, named: string | undefined) {
      const missing = (reason: string): Effect.Effect<BaseRead, BaseNotFound> =>
        named === undefined ? Effect.succeed({ none: reason }) : Effect.fail(new BaseNotFound({ base: named, reason }))
      const inside = yield* git(root, ["rev-parse", "--is-inside-work-tree"])
      if (inside === undefined) return yield* missing("git did not run in this workspace")
      if (text(inside) !== "true") return yield* missing("this workspace is in no git repository")
      const ref = named ?? text(yield* git(root, ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"])) ??
        (text(yield* git(root, ["rev-parse", "--quiet", "--verify", "refs/heads/main"])) ? "main" : undefined) ??
        (text(yield* git(root, ["rev-parse", "--quiet", "--verify", "refs/heads/master"])) ? "master" : undefined)
      if (ref === undefined) return yield* missing("the repository has no origin/HEAD, main or master branch")
      const command = `git merge-base HEAD ${ref}`
      const commit = text(yield* git(root, ["merge-base", "HEAD", ref]))
      if (commit === undefined) return yield* missing(`${command} found no commit`)
      const at = commit.slice(0, 7)

      // The files of the commit under the workspace, relative to it as its globs are, each with its
      // blob: read by blob, a file is read whatever bytes its name holds.
      const tree = yield* git(root, ["ls-tree", "-r", "-z", commit])
      if (tree?.code !== 0) return yield* missing(`git ls-tree could not list the files of ${at}`)
      const blobs = tree.out.toString("utf8").split("\0").flatMap((entry) => {
        const tab = entry.indexOf("\t")
        const [, type, object] = entry.slice(0, Math.max(0, tab)).split(" ")
        return tab > 0 && type === "blob" && object !== undefined ? [{ path: entry.slice(tab + 1), object }] : []
      })
      const read = Effect.fnUntraced(function*(wanted: ReadonlyArray<{ readonly path: string; readonly object: string }>) {
        if (wanted.length === 0) return []
        const out = yield* git(root, ["cat-file", "--batch"], wanted.map(({ object }) => `${object}\n`).join(""))
        return out?.code === 0 ? batch(wanted, out.out) : undefined
      })

      // The base is read as it was configured: its features globs, its exclusions and its vocabulary.
      const configBlob = configFileNames.flatMap((name) => blobs.filter((blob) => blob.path === name))[0]
      const configFiles = yield* read(configBlob === undefined ? [] : [configBlob])
      if (configFiles === undefined) return yield* missing(`git cat-file could not read the configuration of ${at}`)
      const parsed = yield* Effect.result(parseConfig(configFiles[0]))
      if (Result.isFailure(parsed)) return yield* missing(`the configuration of ${at} does not read: ${parsed.failure.message}`)
      const config = parsed.success
      const features = config.features.map((pattern) => Glob.make(pattern, { dot: false }))
      const excluded = config.exclude.map((pattern) => Glob.make(pattern, { dot: true }))
      const specs = blobs.filter(({ path }) =>
        features.some((glob) => Glob.match(glob, path)) && !excluded.some((glob) => Glob.match(glob, path))
      )
      const files = yield* read(specs)
      if (files === undefined) return yield* missing(`git cat-file could not read the specs of ${at}`)
      return { found: { commit: at, command, files, config } }
    })
    return { base }
  })
)

/**
 * The files `git cat-file --batch` wrote for the blobs asked for, in their order: a header
 * `<object> blob <size>` and the content each. A reply that is missing or for another object makes
 * the whole read fail, never a file silently left out.
 */
const batch = (
  wanted: ReadonlyArray<{ readonly path: string; readonly object: string }>,
  out: Buffer
): ReadonlyArray<SourceFile> | undefined => {
  const files: Array<SourceFile> = []
  let at = 0
  for (const { object, path } of wanted) {
    const end = out.indexOf(0x0a, at)
    if (end < 0) return undefined
    const header = /^(\S+) blob (\d+)$/.exec(out.toString("utf8", at, end))
    if (header === null || header[1] !== object) return undefined
    const size = Number(header[2])
    if (end + 1 + size > out.length) return undefined
    files.push({ path, content: out.toString("utf8", end + 1, end + 1 + size) })
    at = end + 1 + size + 1
  }
  return files
}
