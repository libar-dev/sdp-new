/**
 * The base revision `sdp check` compares live tests with, read from git: the feature files of the
 * commit where HEAD meets the base, as that commit's own configuration finds them with the walk that
 * finds the workspace's, and that configuration. Reading is IO at the edge; comparing is the
 * checker's, and pure (`compareWithBase`).
 *
 * The base is named by `--base` or `base:` in the configuration, and is otherwise the repository's
 * default branch: origin's HEAD, else main, else master. A base that is named and cannot be read
 * stops the check; one that is not named and cannot be found leaves it with nothing to compare, an
 * answer that may miss a test turned off; `none` waives the comparison.
 *
 * @sdp is ARCH-workspace
 */
import { ByteSize, Context, Effect, FileSystem, Layer, Option, Result, Schema, Stream } from "effect"
import { systemError } from "effect/PlatformError"
import { ChildProcess, ChildProcessSpawner } from "effect/process"
import type { SourceFile } from "../graph/Build.ts"
import type { BaseSpecs } from "../check/Check.ts"
import { configFileNames } from "../model/Config.ts"
import { findFiles, parseConfig } from "./Workspace.ts"

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

/**
 * The specs at the base, with the git command that finds it and what of the base its configuration
 * reaches that git cannot say, or why there is no base to compare with.
 */
export type BaseRead =
  | { readonly found: BaseSpecs & { readonly command: string; readonly missing: ReadonlyArray<string> } }
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

/**
 * The variables git reads to locate a repository, its work tree, its index or its objects, as
 * `git rev-parse --local-env-vars` lists them: left out even when that list cannot be had.
 */
const repositoryVariables = [
  "GIT_ALTERNATE_OBJECT_DIRECTORIES", "GIT_CONFIG", "GIT_CONFIG_PARAMETERS", "GIT_CONFIG_COUNT",
  "GIT_OBJECT_DIRECTORY", "GIT_DIR", "GIT_WORK_TREE", "GIT_IMPLICIT_WORK_TREE", "GIT_GRAFT_FILE",
  "GIT_INDEX_FILE", "GIT_NO_REPLACE_OBJECTS", "GIT_REPLACE_REF_BASE", "GIT_PREFIX", "GIT_SHALLOW_FILE",
  "GIT_COMMON_DIR"
]

/**
 * `env` without a variable that names a repository, its work tree or its index — set for a hook, or
 * left in a shell — and would have git read another repository than the one its directory is in:
 * those git `listed`, and those it is known to read. On Windows a name is matched whatever its case,
 * as the system matches it.
 */
export const withoutRepositoryVariables = (
  env: Readonly<Record<string, string | undefined>>,
  listed: string | undefined,
  platform: string = process.platform
): Record<string, string | undefined> => {
  const fold = (name: string) => platform === "win32" ? name.toUpperCase() : name
  const dropped = new Set([...repositoryVariables, ...(listed?.split("\n") ?? [])].map((name) => fold(name.trim())))
  return Object.fromEntries(Object.entries(env).filter(([name]) => !dropped.has(fold(name))))
}

/** The base as git finds it, in the repository the workspace is in. */
export const gitRevisions = Layer.effect(
  Revisions,
  Effect.gen(function*() {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    /** A git command run in the workspace, in `env` if given: its exit code and what it wrote, or undefined when git does not run. */
    const git = (root: string, args: ReadonlyArray<string>, input?: string, env?: Record<string, string | undefined>) =>
      Effect.scoped(Effect.gen(function*() {
        const handle = yield* spawner.spawn(ChildProcess.make("git", [...args], {
          cwd: root,
          ...(env === undefined ? {} : { env, extendEnv: false }),
          stdin: input === undefined ? "ignore" : Stream.make(new TextEncoder().encode(input)),
          stderr: "ignore"
        }))
        const [chunks, code] = yield* Effect.all([Stream.runCollect(handle.stdout), handle.exitCode], { concurrency: 2 })
        return { code: Number(code), out: Buffer.concat([...chunks]) }
      })).pipe(Effect.orElseSucceed(() => undefined))
    const text = (result: { readonly code: number; readonly out: Buffer } | undefined) =>
      result?.code === 0 ? result.out.toString("utf8").trim() : undefined
    /** A path git wrote on a line of its own, untrimmed: a name may start or end with a space. */
    const pathOf = (result: { readonly code: number; readonly out: Buffer } | undefined) =>
      result?.code === 0 ? result.out.toString("utf8").replace(/\n$/, "") : undefined

    const base = Effect.fn("Revisions.base")(function*(root: string, named: string | undefined) {
      const missing = (reason: string): Effect.Effect<BaseRead, BaseNotFound> =>
        named === undefined ? Effect.succeed({ none: reason }) : Effect.fail(new BaseNotFound({ base: named, reason }))
      const env = withoutRepositoryVariables(process.env, text(yield* git(root, ["rev-parse", "--local-env-vars"])))
      const inWorkspace = (args: ReadonlyArray<string>, input?: string) => git(root, args, input, env)
      const inside = yield* inWorkspace(["rev-parse", "--is-inside-work-tree"])
      if (inside === undefined) return yield* missing("git did not run in this workspace")
      if (text(inside) !== "true") return yield* missing("this workspace is in no git repository")
      // The default branch by its full ref: a tag `main`, or a branch `origin/main`, would shadow its short name.
      const ref = named ?? text(yield* inWorkspace(["symbolic-ref", "--quiet", "refs/remotes/origin/HEAD"])) ??
        (text(yield* inWorkspace(["rev-parse", "--quiet", "--verify", "refs/heads/main"])) ? "refs/heads/main" : undefined) ??
        (text(yield* inWorkspace(["rev-parse", "--quiet", "--verify", "refs/heads/master"])) ? "refs/heads/master" : undefined)
      if (ref === undefined) return yield* missing("the repository has no origin/HEAD, main or master branch")
      const command = `git merge-base HEAD ${ref}`
      const commit = text(yield* inWorkspace(["merge-base", "HEAD", ref]))
      if (commit === undefined) return yield* missing(`${command} found no commit`)
      const at = commit.slice(0, 7)

      // Every file of the commit, from the top of the repository, each with its blob: read by blob, a
      // file is read whatever bytes its name holds. The workspace is the directory `prefix` names.
      const prefix = pathOf(yield* inWorkspace(["rev-parse", "--show-prefix"]))
      const tree = yield* inWorkspace(["ls-tree", "-r", "-z", "--full-tree", commit])
      if (prefix === undefined || tree?.code !== 0) return yield* missing(`git ls-tree could not list the files of ${at}`)
      const entries = new Map(tree.out.toString("utf8").split("\0").flatMap((entry) => {
        const tab = entry.indexOf("\t")
        const [mode, , object] = entry.slice(0, Math.max(0, tab)).split(" ")
        return tab > 0 && mode !== undefined && object !== undefined ? [[entry.slice(tab + 1), { mode, object }] as const] : []
      }))
      const read = Effect.fnUntraced(function*(wanted: ReadonlyArray<{ readonly path: string; readonly object: string }>) {
        if (wanted.length === 0) return []
        const out = yield* inWorkspace(["cat-file", "--batch"], wanted.map(({ object }) => `${object}\n`).join(""))
        return out?.code === 0 ? batch(wanted, out.out) : undefined
      })
      const links = yield* read([...entries].flatMap(([path, { mode, object }]) => mode === symbolicLink ? [{ path, object }] : []))
      if (links === undefined) return yield* missing(`git cat-file could not read the symbolic links of ${at}`)
      const committed = treeFiles(entries, new Map(links.map(({ content, path }) => [path, content])))
      const workspace = prefix.replace(/\/$/, "")
      const fromTop = (path: string) => workspace === "" ? path : `${workspace}/${path}`
      // Each path of the workspace with the blob of the file it leads to at the base, if it leads to one.
      const inCommit = (paths: ReadonlyArray<string>) => paths.map((path) => ({ path, object: committed.blob(fromTop(path)) }))
      const held = (wanted: ReturnType<typeof inCommit>) =>
        wanted.flatMap(({ object, path }) => object === undefined ? [] : [{ path, object }])

      // The base is read as it was configured — its features globs, its exclusions and its vocabulary —
      // from the first configuration file it has, as on disk. One that is a link to no file git holds
      // may lead to a file of this machine, so the configuration the base would use is not known.
      const configName = configFileNames.find((name) => committed.has(fromTop(name)))
      const configFile = configName === undefined ? undefined : held(inCommit([configName]))[0]
      if (configName !== undefined && configFile === undefined) {
        return yield* missing(`the configuration of ${at} is not known: its ${configName} is a link to no file git holds`)
      }
      const configFiles = yield* read(configFile === undefined ? [] : [configFile])
      if (configFiles === undefined) return yield* missing(`git cat-file could not read the configuration of ${at}`)
      const parsed = yield* Effect.result(parseConfig(configFiles[0]))
      if (Result.isFailure(parsed)) return yield* missing(`the configuration of ${at} does not read: ${parsed.failure.message}`)
      const config = parsed.success
      // Its specs are those the workspace's own walk finds there: what it reaches that the commit
      // cannot say is a part of the base that was not compared.
      const listed = yield* Effect.result(
        findFiles(workspace, config.features, config.exclude).pipe(Effect.provideService(FileSystem.FileSystem, committed.fileSystem))
      )
      if (Result.isFailure(listed)) return yield* missing(`the files of ${at} could not be listed: ${listed.failure.message}`)
      const specs = inCommit(listed.success)
      const files = yield* read(held(specs))
      if (files === undefined) return yield* missing(`git cat-file could not read the specs of ${at}`)
      const fromWorkspace = (path: string) => path.startsWith(prefix) ? path.slice(prefix.length) : path
      const unknown = new Map([
        ...[...committed.unknown].map(([path, what]) => [fromWorkspace(path), what] as const),
        ...specs.filter(({ object }) => object === undefined).map(({ path }) => [path, "a link to nothing"] as const)
      ])
      const unread = [
        ...[...unknown].map(([path, what]) =>
          `not compared: ${path} at the base ${at} is ${what}, so git holds none of what the configuration finds there`
        ),
        ...[...committed.folded].map(([written, actual]) =>
          `not compared: ${fromWorkspace(written)} is ${fromWorkspace(actual)} at the base ${at}: a file system that ignores case reads one for the other, and git does not`
        )
      ]
      return { found: { commit: at, command, files, config, missing: unread } }
    })
    return { base }
  })
)

/** The mode `git ls-tree` gives a symbolic link, whose blob holds its target, and a submodule, whose files are another repository's. */
const symbolicLink = "120000"
const submodule = "160000"
const inSubmodule = "a submodule, whose files are another repository's"

/** All a file of a commit can say of itself: its type. */
const fileInfo = (type: FileSystem.File.Type): FileSystem.File.Info => ({
  type,
  mtime: Option.none(),
  atime: Option.none(),
  birthtime: Option.none(),
  dev: 0n,
  ino: Option.none(),
  mode: 0,
  nlink: Option.none(),
  uid: Option.none(),
  gid: Option.none(),
  rdev: Option.none(),
  size: ByteSize.bytes(0),
  blksize: Option.none(),
  blocks: Option.none()
})

/**
 * The files of a commit, by their path from the top of the repository, as a file system the
 * workspace's walk (`findFiles`) can find specs in as it finds them on disk: a symbolic link leads
 * where its target does. What a path reaches that the commit cannot say is recorded: in `unknown`,
 * what it is — out of the repository, a submodule — and in `folded`, a name the tree has only in
 * another case, which a file system that ignores case would read for it. `blob` is the blob of the
 * file a path leads to, if it leads to one.
 */
const treeFiles = (
  entries: ReadonlyMap<string, { readonly mode: string; readonly object: string }>,
  targets: ReadonlyMap<string, string>
) => {
  const listings = new Map<string, Map<string, FileSystem.File.Type>>([["", new Map()]])
  for (const [path, { mode }] of entries) {
    const names = path.split("/")
    names.forEach((name, at) => {
      const directory = names.slice(0, at).join("/")
      const listing = listings.get(directory) ?? listings.set(directory, new Map()).get(directory)!
      listing.set(name, at < names.length - 1 || mode === submodule ? "Directory" : mode === symbolicLink ? "SymbolicLink" : "File")
    })
  }
  const unknown = new Map<string, string>()
  const folded = new Map<string, string>()
  const cannotSay = (path: string, what: string) => void unknown.set(path, what)
  /** Where `written` leads in the tree, its links followed — the last one only if `follow` — or undefined when nowhere. */
  const resolve = (written: string, follow: boolean): string | undefined => {
    if (/^(\/|[A-Za-z]:\/)/.test(written)) return cannotSay(written, "outside the repository")
    const pending = written.split("/")
    const reached: Array<string> = []
    for (let hops = 0; pending.length > 0;) {
      const name = pending.shift()!
      if (name === "" || name === ".") continue
      if (name === "..") {
        if (reached.pop() === undefined) return cannotSay(written, "outside the repository")
        continue
      }
      const listing = listings.get(reached.join("/"))
      const type = listing?.get(name)
      const path = [...reached, name].join("/")
      if (type === undefined) {
        const other = [...listing?.keys() ?? []].find((candidate) => candidate.toLowerCase() === name.toLowerCase())
        if (other !== undefined) folded.set(path, [...reached, other].join("/"))
        return undefined
      }
      if (entries.get(path)?.mode === submodule && pending.length > 0) return cannotSay(path, inSubmodule)
      if (type === "SymbolicLink" && (follow || pending.length > 0)) {
        const target = targets.get(path) ?? ""
        if (++hops > 40 || /^(\/|[A-Za-z]:\/)/.test(target)) return cannotSay(written, "a link out of the repository, or in a circle")
        pending.unshift(...target.split("/"))
        continue
      }
      reached.push(name)
    }
    return reached.join("/")
  }
  const typeOf = (path: string): FileSystem.File.Type | undefined => {
    const at = path.lastIndexOf("/")
    return path === "" ? "Directory" : listings.get(path.slice(0, Math.max(0, at)))?.get(path.slice(at + 1))
  }
  const notFound = (method: string, path: string) =>
    Effect.fail(systemError({ _tag: "NotFound", module: "FileSystem", method, pathOrDescriptor: path }))
  const fileSystem = FileSystem.make(FileSystem.makeNoop({
    stat: (path) => {
      const found = resolve(path, true)
      const type = found === undefined ? undefined : typeOf(found)
      return type === undefined ? notFound("stat", path) : Effect.succeed(fileInfo(type))
    },
    readDirectoryEntries: (path) => {
      const found = resolve(path, true)
      if (found !== undefined && entries.get(found)?.mode === submodule) cannotSay(found, inSubmodule)
      const listing = found === undefined ? undefined : listings.get(found)
      return listing === undefined
        ? notFound("readDirectoryEntries", path)
        : Effect.succeed([...listing].map(([name, type]) => ({ name, type })))
    },
    readLink: (path) => {
      const found = resolve(path, false)
      const target = found === undefined ? undefined : targets.get(found)
      return target === undefined
        ? Effect.fail(systemError({ _tag: "Unknown", module: "FileSystem", method: "readLink", pathOrDescriptor: path }))
        : Effect.succeed(target)
    }
  }))
  /** Whether `written` names an entry of the tree, a link whatever it leads to. */
  const has = (written: string) => resolve(written, false) !== undefined
  const blob = (written: string): string | undefined => {
    const found = resolve(written, true)
    const entry = found === undefined ? undefined : entries.get(found)
    return entry === undefined || entry.mode === submodule ? undefined : entry.object
  }
  return { fileSystem, has, blob, unknown, folded }
}

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
