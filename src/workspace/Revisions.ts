/**
 * The base revision `sdp check` compares live tests with, read from git: the feature files of the
 * commit where HEAD meets the base, as the workspace's features globs find them. Reading is IO at
 * the edge; comparing is the checker's, and pure (`compareWithBase`).
 *
 * The base is named by `--base` or `base:` in the configuration, and is otherwise the repository's
 * default branch: origin's HEAD, else main, else master. A base that is named and cannot be read
 * stops the check; one that is not named and cannot be found leaves it with nothing to compare, an
 * answer that may miss a test turned off; `none` waives the comparison.
 */
import { Context, Effect, Glob, Layer, Schema, Stream } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/process"
import type { SourceFile } from "../graph/Build.ts"
import type { BaseSpecs } from "../check/Check.ts"
import type { Config } from "../model/Config.ts"

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
  /** The specs where HEAD meets `named`, or else the default branch. */
  readonly base: (root: string, config: Config, named: string | undefined) => Effect.Effect<BaseRead, BaseNotFound>
}

const noGit = "sdp was given no git to read it from"

/** No revisions at all, as for a workspace in memory: a check says it compared nothing. */
export const noRevisions: RevisionsReader = {
  base: (_root, _config, named) =>
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

    const base = Effect.fn("Revisions.base")(function*(root: string, config: Config, named: string | undefined) {
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

      // Paths relative to the workspace, as its features globs are; `<commit>:./<path>` reads one there.
      const tree = yield* git(root, ["ls-tree", "-r", "-z", "--name-only", commit])
      if (tree?.code !== 0) return yield* missing(`git ls-tree could not list the files of ${commit}`)
      const listed = tree.out.toString("utf8")
      const features = config.features.map((pattern) => Glob.make(pattern, { dot: false }))
      const excluded = config.exclude.map((pattern) => Glob.make(pattern, { dot: true }))
      const paths = listed.split("\0").filter((path) =>
        path !== "" && features.some((glob) => Glob.match(glob, path)) && !excluded.some((glob) => Glob.match(glob, path))
      )
      const read = yield* git(root, ["cat-file", "--batch"], paths.map((path) => `${commit}:./${path}\n`).join(""))
      if (read?.code !== 0) return yield* missing(`git cat-file could not read the specs of ${commit}`)
      return { found: { commit: commit.slice(0, 7), command, files: batch(paths, read.out) } }
    })
    return { base }
  })
)

/** The files `git cat-file --batch` wrote, one `<object> blob <size>` header and its content each, in the order asked for. */
const batch = (paths: ReadonlyArray<string>, out: Buffer): ReadonlyArray<SourceFile> => {
  const files: Array<SourceFile> = []
  let at = 0
  for (const path of paths) {
    const end = out.indexOf(0x0a, at)
    const size = Number(/ blob (\d+)$/.exec(out.toString("utf8", at, end))?.[1] ?? -1)
    if (size < 0) {
      at = end + 1
      continue
    }
    files.push({ path, content: out.toString("utf8", end + 1, end + 1 + size) })
    at = end + 1 + size + 1
  }
  return files
}
