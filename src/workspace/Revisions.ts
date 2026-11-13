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
import { type PlatformError, systemError } from "effect/PlatformError"
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

      // The workspace is the directory `prefix` names in its repository, whose top is `cdup` above it.
      const prefix = pathOf(yield* inWorkspace(["rev-parse", "--show-prefix"]))
      const cdup = pathOf(yield* inWorkspace(["rev-parse", "--show-cdup"]))
      if (prefix === undefined || cdup === undefined) return yield* missing("git could not say where this workspace is in its repository")
      const workspace = prefix.replace(/\/$/, "")
      const fromTop = (path: string) => workspace === "" ? path : `${workspace}/${path}`
      const fromWorkspace = (path: string) => path.startsWith(prefix) ? path.slice(prefix.length) : path
      const committed = commitFiles(
        (repository, args, input) => git(repository, args, input, env),
        { mode: tree, object: commit, repository: root },
        `${root}/${cdup}`,
        fromWorkspace
      )
      return yield* Effect.gen(function*() {
        // The base is read as it was configured — its features globs, its exclusions and its vocabulary —
        // from the first configuration file it has, as on disk. One that is a link to no file git holds
        // may lead to a file of this machine, and one by a name in another case is read only where a
        // file system ignores case, so the configuration the base would use is not known.
        const configName = Option.getOrUndefined(yield* Effect.findFirst(configFileNames, (name) =>
          Effect.map(committed.reach(fromTop(name), false), (reached) => reached !== undefined)
        ))
        const configReached = configName === undefined ? undefined : yield* committed.reach(fromTop(configName), true)
        const configEntry = configReached !== undefined && "found" in configReached && isFile(configReached.entry) ? configReached.entry : undefined
        if (configName !== undefined && configEntry === undefined) {
          return yield* missing(`the configuration of ${at} is not known: ${
            configReached !== undefined && "folded" in configReached
              ? `its ${configName} is ${fromWorkspace(configReached.folded)}, which a file system that ignores case reads for it, and git does not`
              : `its ${configName} is a link to no file git holds`
          }`)
        }
        const configFiles = yield* committed.read(configName === undefined || configEntry === undefined ? [] : [{ path: configName, entry: configEntry }])
        if (configFiles === undefined) return yield* missing(`git cat-file could not read the configuration of ${at}`)
        const parsed = yield* Effect.result(parseConfig(configFiles[0]))
        if (Result.isFailure(parsed)) return yield* missing(`the configuration of ${at} does not read: ${parsed.failure.message}`)
        const config = parsed.success
        // Its specs are those the workspace's own walk finds there, what the commit cannot say taken for
        // a directory and for a file: what the walk reads there that the commit cannot say is a part of
        // the base that was not compared.
        const listed = yield* Effect.forEach(["Directory", "File"] as const, (unknownAs) =>
          findFiles(workspace, config.features, config.exclude).pipe(
            Effect.provideService(FileSystem.FileSystem, committed.fileSystem(unknownAs))
          ))
        const specs = yield* Effect.forEach([...new Set(listed.flat())].sort(), (path) =>
          Effect.map(committed.file(fromTop(path)), (entry) => entry === undefined ? [] : [{ path, entry }])
        )
        const files = yield* committed.read(specs.flat())
        if (files === undefined) return yield* missing(`git cat-file could not read the specs of ${at}`)
        const { folded, unknown } = yield* committed.unread
        const unread = [
          ...unknown.map(([path, what]) =>
            `not compared: ${fromWorkspace(path)} at the base ${at} is ${what}, so git holds none of what the configuration finds there`
          ),
          ...folded.map(([written, actual]) =>
            `not compared: ${fromWorkspace(written)} is ${fromWorkspace(actual)} at the base ${at}: a file system that ignores case reads one for the other, and git does not`
          )
        ]
        return { found: { commit: at, command, files, config, missing: unread } } satisfies BaseRead
      }).pipe(Effect.catchTag("PlatformError", (error) => missing(`the files of ${at} could not be listed: ${error.message}`)))
    })
    return { base }
  })
)

/** The mode `git ls-tree` gives a directory, a symbolic link, whose blob holds its target, and a submodule, whose files are another repository's. */
const tree = "040000"
const symbolicLink = "120000"
const submodule = "160000"

/** A path from the root of a file system, not from the top of the repository. */
const outOfRepository = /^(\/|[A-Za-z]:\/)/

/** An entry of a commit's tree: its mode, its object, and the directory git reads that object in. */
interface Entry {
  readonly mode: string
  readonly object: string
  readonly repository: string
}

const isFile = (entry: Entry) => entry.mode !== tree && entry.mode !== submodule && entry.mode !== symbolicLink
const typeOf = (entry: Entry): FileSystem.File.Type =>
  entry.mode === tree || entry.mode === submodule ? "Directory" : entry.mode === symbolicLink ? "SymbolicLink" : "File"

/** A git command run in a repository: its exit code and what it wrote, or undefined when git does not run. */
type Git = (repository: string, args: ReadonlyArray<string>, input?: string) => Effect.Effect<{ readonly code: number; readonly out: Buffer } | undefined>

/**
 * Where a path leads in a commit's tree: the path it reaches, with its entry; where the tree cannot
 * say, what the path is, or the name the tree has for it only in another case; or nowhere.
 */
type Reached =
  | { readonly found: string; readonly entry: Entry }
  | { readonly unknown: string; readonly at: string }
  | { readonly folded: string; readonly at: string }
  | undefined

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

/** The entries `git ls-tree -z` wrote, each by its path in the tree listed, in `repository`. */
const treeEntries = (out: Buffer, repository: string) =>
  out.toString("utf8").split("\0").flatMap((line) => {
    const tab = line.indexOf("\t")
    const [mode, , object] = line.slice(0, Math.max(0, tab)).split(" ")
    return tab > 0 && mode !== undefined && object !== undefined ? [[line.slice(tab + 1), { mode, object, repository }] as const] : []
  })

/**
 * The files of a commit, `top` its tree, by their path from the top of the repository, as a file
 * system the workspace's walk (`findFiles`) finds specs in as it finds them on disk: a symbolic link
 * leads where its target does, and a submodule checked out in `checkout`, the top of the working tree,
 * holds the files of the commit the tree records for it, read from its own repository; `shown` is a
 * path as a note names it. A directory is listed from git when a path first goes through it, and with
 * all below it when the walk reads it, the targets of its links with it: reading the base costs what
 * its globs reach, not the size of the repository.
 *
 * What the walk reads there that the commit cannot say — a directory it lists, or a file it accepts,
 * out of the repository, through a link in a circle, in a submodule that is not checked out here, or
 * by a name the tree has only in another case — is recorded in `unread`. A link it only passes over
 * is not: on disk as here, `**` follows none, so whatever it leads to is never read.
 */
const commitFiles = (git: Git, top: Entry, checkout: string, shown: (path: string) => string) => {
  /** Each directory listed so far, by its path, and those listed with all below them. */
  const listings = new Map<string, Map<string, Entry>>()
  const whole = new Set<string>()
  /** The target of each link in a directory listed so far, by the link's path. */
  const targets = new Map<string, string>()
  /** What the walk read and the commit cannot say: what each path is, or the name the tree has for it. */
  const unknown = new Map<string, string>()
  const folded = new Map<string, string>()

  /** The blobs of `wanted`, read in the repository of each, or undefined when git cannot read one. */
  const read = Effect.fnUntraced(function*(wanted: ReadonlyArray<{ readonly path: string; readonly entry: Entry }>) {
    const files: Array<SourceFile> = []
    for (const repository of new Set(wanted.map(({ entry }) => entry.repository))) {
      const blobs = wanted.flatMap(({ entry, path }) => entry.repository === repository ? [{ path, object: entry.object }] : [])
      const out = yield* git(repository, ["cat-file", "--batch"], blobs.map(({ object }) => `${object}\n`).join(""))
      const read = out?.code === 0 ? batch(blobs, out.out) : undefined
      if (read === undefined) return undefined
      files.push(...read)
    }
    return files
  })

  const cannotList = (path: string) =>
    systemError({ _tag: "Unknown", module: "FileSystem", method: "readDirectoryEntries", pathOrDescriptor: path, description: "git could not list it" })

  /** The directory at `path`, the tree `entry` is, listed — with all below it if `deep` — and the targets of its links read. */
  const list = Effect.fnUntraced(function*(path: string, entry: Entry, deep: boolean) {
    const out = yield* git(entry.repository, ["ls-tree", "--full-tree", ...(deep ? ["-r", "-t"] : []), "-z", entry.object])
    if (out?.code !== 0) return yield* Effect.fail(cannotList(path))
    const listed = treeEntries(out.out, entry.repository).map(([name, child]) => [path === "" ? name : `${path}/${name}`, child] as const)
    const links = yield* read(listed.flatMap(([at, child]) => child.mode === symbolicLink ? [{ path: at, entry: child }] : []))
    if (links === undefined) return yield* Effect.fail(cannotList(path))
    const listingAt = (directory: string) => listings.get(directory) ?? listings.set(directory, new Map()).get(directory)!
    listingAt(path)
    if (deep) whole.add(path)
    for (const [at, child] of listed) {
      const slash = at.lastIndexOf("/")
      listingAt(at.slice(0, Math.max(0, slash))).set(at.slice(slash + 1), child)
      if (deep && child.mode === tree) {
        listingAt(at)
        whole.add(at)
      }
    }
    for (const { content, path: at } of links) targets.set(at, content)
    return listingAt(path)
  })

  /**
   * The tree of the commit the submodule at `path` records, in its repository where it is checked out
   * here; or what the submodule is when it is not, or its repository lacks that commit, with how to
   * read it: the base is read with its own configuration, so an exclusion written today changes
   * nothing until the default branch has it.
   */
  const opened = Effect.fnUntraced(function*(path: string, entry: Entry) {
    const repository = `${checkout}${path}`
    const fetch = `git -C ${shown(path)} fetch origin ${entry.object}`
    const otherwise = "or exclude it in the configuration of the default branch, and until then waive the comparison with --base none"
    const opens = yield* git(repository, ["rev-parse", "--show-prefix"])
    if (opens?.code !== 0 || opens.out.toString("utf8") !== "\n") {
      return `a submodule that is not checked out here (check it out with git submodule update --init ${shown(path)}, and fetch the ` +
        `base's commit ${entry.object.slice(0, 7)} if HEAD records another: ${fetch}; ${otherwise})`
    }
    const held = yield* git(repository, ["cat-file", "-e", `${entry.object}^{commit}`])
    return held?.code === 0
      ? { mode: tree, object: entry.object, repository }
      : `a submodule whose repository here lacks the base's commit ${entry.object.slice(0, 7)} (fetch it with ${fetch}, ${otherwise})`
  })

  /**
   * The listing of the directory at `path`, `entry` in the tree, listed when first reached, with all
   * below it if `deep`; what it is, when the commit cannot say; or undefined, when it is no directory.
   */
  const listingOf = Effect.fnUntraced(function*(path: string, entry: Entry, deep: boolean) {
    if (whole.has(path) || (!deep && listings.has(path))) return listings.get(path)!
    const contents = entry.mode === submodule ? yield* opened(path, entry) : entry
    if (typeof contents === "string") return contents
    return contents.mode === tree ? yield* list(path, contents, deep) : undefined
  })

  /** Where `written` leads in the tree, its links followed — the last one only if `follow`. */
  const reach = Effect.fnUntraced(function*(written: string, follow: boolean): Effect.fn.Return<Reached, PlatformError> {
    if (outOfRepository.test(written)) return { unknown: "outside the repository", at: written }
    const pending = written.split("/")
    const reached: Array<{ readonly name: string; readonly entry: Entry }> = []
    for (let hops = 0; pending.length > 0;) {
      const name = pending.shift()!
      if (name === "" || name === ".") continue
      if (name === "..") {
        if (reached.pop() === undefined) return { unknown: "outside the repository", at: written }
        continue
      }
      const directory = reached.map((step) => step.name).join("/")
      const listing = yield* listingOf(directory, reached.at(-1)?.entry ?? top, false)
      if (typeof listing === "string") return { unknown: listing, at: directory }
      const entry = listing?.get(name)
      const path = directory === "" ? name : `${directory}/${name}`
      if (entry === undefined) {
        const other = [...listing?.keys() ?? []].find((candidate) => candidate.toLowerCase() === name.toLowerCase())
        return other === undefined ? undefined : { folded: directory === "" ? other : `${directory}/${other}`, at: path }
      }
      if (entry.mode === symbolicLink && (follow || pending.length > 0)) {
        const target = targets.get(path) ?? ""
        if (++hops > 40 || outOfRepository.test(target)) return { unknown: "a link out of the repository, or in a circle", at: written }
        pending.unshift(...target.split("/"))
        continue
      }
      reached.push({ name, entry })
    }
    return { found: reached.map((step) => step.name).join("/"), entry: reached.at(-1)?.entry ?? top }
  })

  const record = (reached: Exclude<Reached, { readonly found: string } | undefined>) =>
    Effect.sync(() => {
      if ("unknown" in reached) unknown.set(reached.at, reached.unknown)
      else folded.set(reached.at, reached.folded)
    })
  const notFound = (method: string, path: string) =>
    Effect.fail(systemError({ _tag: "NotFound", module: "FileSystem", method, pathOrDescriptor: path }))

  /**
   * The commit as a file system, what it cannot say taken for `unknownAs`: neither a file nor a
   * directory, it is recorded wherever the walk reads it as either — through a segment that names it,
   * as a directory, or accepted as a file — and nowhere else.
   */
  const fileSystem = (unknownAs: "Directory" | "File") => FileSystem.make(FileSystem.makeNoop({
    stat: (path) =>
      Effect.flatMap(reach(path, true), (reached) =>
        reached === undefined ? notFound("stat", path) : Effect.succeed(fileInfo("found" in reached ? typeOf(reached.entry) : unknownAs))
      ),
    readDirectoryEntries: (path) =>
      Effect.gen(function*() {
        const reached = yield* reach(path, true)
        if (reached === undefined) return yield* notFound("readDirectoryEntries", path)
        if (!("found" in reached)) {
          yield* record(reached)
          return yield* notFound("readDirectoryEntries", path)
        }
        const listing = yield* listingOf(reached.found, reached.entry, true)
        if (typeof listing === "string") yield* record({ unknown: listing, at: reached.found })
        return typeof listing === "object"
          ? [...listing].map(([name, entry]) => ({ name, type: typeOf(entry) }))
          : yield* notFound("readDirectoryEntries", path)
      }),
    readLink: (path) =>
      Effect.gen(function*() {
        const reached = yield* reach(path, false)
        const target = reached !== undefined && "found" in reached ? targets.get(reached.found) : undefined
        return target ?? (yield* Effect.fail(systemError({ _tag: "Unknown", module: "FileSystem", method: "readLink", pathOrDescriptor: path })))
      })
  }))

  /** The file the walk accepted at `written`, if it is one; what the commit cannot say of it is recorded. */
  const file = Effect.fnUntraced(function*(written: string) {
    const reached = yield* reach(written, true)
    if (reached !== undefined && "found" in reached) return isFile(reached.entry) ? reached.entry : undefined
    yield* record(reached ?? { unknown: "a link to nothing", at: written })
    return undefined
  })

  /** What the walk read that the commit cannot say: what each path is, and the name the tree has for each folded one. */
  const unread = Effect.sync(() => ({ unknown: [...unknown], folded: [...folded] }))

  return { fileSystem, reach, file, read, unread }
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
