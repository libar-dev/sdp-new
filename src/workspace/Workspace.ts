/**
 * IO edge: reads the config, sources and stored results through the Effect
 * `FileSystem` service, then hands plain data to the pure graph builder.
 * Swapping the FileSystem layer (see MemoryFileSystem) runs the exact same
 * pipeline against an in-memory workspace. Reading never runs workspace code:
 * only `loadSteps`, for `sdp run` and `sdp gate`, imports step modules.
 */
import { Effect, FileSystem, Path, Schema } from "effect"
import type { PlatformError } from "effect/PlatformError"
import { readFileSync, realpathSync } from "node:fs"
import { createRequire, findPackageJSON, registerHooks } from "node:module"
import { fileURLToPath, pathToFileURL } from "node:url"
import { parse as parseYaml } from "yaml"
import { buildProject, type NotAFile, type Project, type SourceFile } from "../graph/Build.ts"
import { type Config, ConfigFile, configFileNames, resolveConfig } from "../model/Config.ts"
import type { RunResults } from "../model/Results.ts"
import { digest, evidenceView, fingerprint, type Fingerprints, type Layer, type Snapshot } from "../run/Evidence.ts"
import { isStepModule, type StepModule } from "../run/Steps.ts"
import { readResults } from "../run/Store.ts"

export class ConfigError extends Schema.TaggedError<ConfigError>()("ConfigError", {
  file: Schema.String,
  message: Schema.String
}) {}

export class WorkspaceNotFound extends Schema.TaggedError<WorkspaceNotFound>()("WorkspaceNotFound", {
  root: Schema.String
}) {
  override get message() {
    return `no such directory: ${this.root}`
  }
}

export class StepLoadError extends Schema.TaggedError<StepLoadError>()("StepLoadError", {
  file: Schema.String,
  message: Schema.String
}) {}

/** The step files or the files they import have changed since this process loaded them: what it would run is no longer what is on disk. */
export class SourcesChanged extends Schema.TaggedError<SourcesChanged>()("SourcesChanged", {
  /** Files this process imported that changed or are gone. */
  files: Schema.Array(Schema.String),
  /** Step files this process did not load: they were added after it loaded the step modules. */
  added: Schema.Array(Schema.String)
}) {
  override get message() {
    const changes = [
      ...(this.files.length > 0 ? [`${this.files.join(", ")} changed after this process imported ${this.files.length === 1 ? "it" : "them"}`] : []),
      ...(this.added.length > 0 ? [`${this.added.join(", ")} ${this.added.length === 1 ? "was" : "were"} added after this process loaded the step modules`] : [])
    ]
    return `${
      changes.join(", and ")
    }: a process loads its step modules once, and Node.js keeps a module for the life of a process, so the code there now did not run, and what would rest on it is not recorded. Run again in a new process`
  }
}

/**
 * The workspace a command run in `start` works on: the nearest directory, `start` or above, with an
 * `sdp.config.*` file — the way git finds its repository — or `start` itself when there is none.
 */
export const findWorkspaceRoot = Effect.fn("findWorkspaceRoot")(function*(start: string) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  let directory = path.resolve(start)
  while (true) {
    for (const name of configFileNames) if (yield* fs.exists(path.join(directory, name))) return directory
    const parent = path.dirname(directory)
    if (parent === directory) return path.resolve(start)
    directory = parent
  }
})

/** The workspace's configuration file, if it has one. */
const readConfigFile = Effect.fnUntraced(function*(root: string) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  if (!(yield* fs.exists(root))) return yield* new WorkspaceNotFound({ root })
  for (const name of configFileNames) {
    const file = path.join(root, name)
    if (yield* fs.exists(file)) return { path: name, content: yield* fs.readFileString(file) } satisfies SourceFile
  }
  return undefined
})

/** A configuration file as sdp reads it, or the defaults when there is none: the workspace's, or the one a base revision had. */
export const parseConfig = Effect.fnUntraced(function*(file: SourceFile | undefined) {
  if (!file) return resolveConfig(undefined)
  const raw = yield* Effect.try({
    try: () => file.path.endsWith(".json") ? JSON.parse(file.content) : parseYaml(file.content) ?? {},
    catch: (e) => new ConfigError({ file: file.path, message: e instanceof Error ? e.message : String(e) })
  })
  // Unknown keys are errors: a misspelled `spec:` must not silently fall back to the defaults.
  const decoded = yield* Schema.decodeUnknownEffect(ConfigFile)(raw, { onExcessProperty: "error" }).pipe(
    Effect.mapError((e) => new ConfigError({ file: file.path, message: e.message }))
  )
  return resolveConfig(decoded)
})

export const loadConfig = Effect.fn("loadConfig")(function*(root: string) {
  return yield* parseConfig(yield* readConfigFile(root))
})

/** Where a glob starts: the directories before its first wildcard, `specs` in `specs/**`, none in `**` alone. */
const globBase = (pattern: string): string => {
  const parts = pattern.split("/")
  const wild = parts.findIndex((part) => /[*?[{]/.test(part))
  return parts.slice(0, wild < 0 ? -1 : wild).join("/")
}

/** What sdp calls each type of path that is neither a file nor a directory. */
const notAFile: Partial<Record<FileSystem.File.Type, NotAFile["is"]>> = {
  FIFO: "a named pipe",
  Socket: "a socket",
  BlockDevice: "a device",
  CharacterDevice: "a device"
}

/**
 * Expands globs relative to `root` to the files they match, de-duplicated and sorted for stable
 * output, and to what they match that is no file sdp can read: a link that leads to none, a named
 * pipe, a socket or a device. A glob matches directories too (`fixtures/**` is `fixtures` and all
 * below it); they are neither.
 */
export const findPaths = Effect.fn("findPaths")(function*(
  root: string,
  patterns: ReadonlyArray<string>,
  exclude: ReadonlyArray<string>
) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  // What the walk learns of each path, by the path it looks at, so that a file costs no look of its
  // own: the directories it lists, the entries of theirs that are no file, and the type of what each
  // path it looks at leads to, none where nothing is.
  const listed: Array<string> = []
  const types = new Map<string, FileSystem.File.Type | undefined>()
  const walk = FileSystem.make({
    ...fs,
    readDirectoryEntries: (directory) =>
      Effect.map(fs.readDirectoryEntries(directory), (entries) => {
        listed.push(directory)
        const at = directory.endsWith("/") ? directory : `${directory}/`
        for (const entry of entries) if (entry.type !== "File") types.set(at + entry.name, entry.type)
        return entries
      }),
    stat: (at) =>
      fs.stat(at).pipe(
        Effect.map((info) => (types.set(at, info.type), info)),
        Effect.tapError(() => Effect.sync(() => types.set(at, undefined)))
      )
  })
  const base = path.resolve(root)
  const found = new Set<string>()
  for (const pattern of patterns) for (const file of yield* walk.glob(pattern, { root: base, exclude })) found.add(file)
  const sorted = [...found].sort()
  // Each path the walk learnt of by both names a glob gives a path: as it is, and relative to the root.
  const names = (at: string) => {
    const named = at.length > 1 && at.endsWith("/") ? at.slice(0, -1) : at
    return [named, path.relative(base, named)]
  }
  const directories = new Set(listed.flatMap(names))
  const told = new Map([...types].flatMap(([at, type]) => names(at).map((name) => [name, type] as const)))
  // A path in a directory the walk listed is a file unless the listing said otherwise; of any other, it learnt nothing.
  const typeOf = new Map(sorted.map((file) => {
    const slash = file.lastIndexOf("/")
    const directory = slash < 0 ? "" : slash === 0 ? "/" : file.slice(0, slash)
    return [file, told.has(file) ? told.get(file) : directories.has(directory) ? "File" : "Unknown"] as const
  }))
  // A path the walk did not tell, and a link it did not follow, is looked at: a link is what it leads to.
  const unknown = sorted.filter((file) => {
    const type = typeOf.get(file)
    return type === "SymbolicLink" || type === "Unknown"
  })
  for (const { file, type } of yield* Effect.forEach(unknown, (file) =>
    fs.stat(path.resolve(base, file)).pipe(
      Effect.map((info) => ({ file, type: info.type })),
      Effect.orElseSucceed(() => ({ file, type: undefined }))
    ), { concurrency: 32 })) typeOf.set(file, type)
  return {
    files: sorted.filter((file) => typeOf.get(file) === "File"),
    unread: sorted.flatMap((file): ReadonlyArray<NotAFile> => {
      const type = typeOf.get(file)
      return type === "File" || type === "Directory" ? [] : [{ path: file, is: type === undefined ? "a link that leads to no file" : notAFile[type] ?? "no file" }]
    })
  }
})

/** The files globs relative to `root` match, de-duplicated and sorted for stable output. */
export const findFiles = Effect.fn("findFiles")(function*(
  root: string,
  patterns: ReadonlyArray<string>,
  exclude: ReadonlyArray<string>
) {
  return (yield* findPaths(root, patterns, exclude)).files
})

const readAll = Effect.fnUntraced(function*(root: string, files: ReadonlyArray<string>) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  return yield* Effect.forEach(
    files,
    (file) => Effect.map(fs.readFileString(path.resolve(root, file)), (content): SourceFile => ({ path: file, content })),
    { concurrency: 32 }
  )
})

/** Lockfiles at the workspace root: they pin the packages the code and the steps run with. */
const lockfileNames = ["package-lock.json", "npm-shrinkwrap.json", "pnpm-lock.yaml", "yarn.lock", "bun.lock"]

/** The version of this sdp, as its package.json says: what `--version`, the MCP server and evidence report. */
export const sdpVersion = (createRequire(import.meta.url)("../../package.json") as { readonly version: string }).version

/** What runs the scenarios besides the workspace's own files: this sdp, this Node, the packages the lockfile pins. */
const toolchain = (lockfiles: ReadonlyArray<SourceFile>): string =>
  digest([`sdp ${sdpVersion}`, `node ${process.versions.node.split(".")[0]}`, fingerprint(lockfiles)])

/** The inputs the workspace declares: the files of `evidence.inputs` and the variables of `evidence.env`, set or not. */
const declaredInputs = (files: ReadonlyArray<SourceFile>, env: ReadonlyArray<string>): string =>
  digest([fingerprint(files), ...env.map((name) => `${name}=${process.env[name] ?? "\0unset"}`)])

/** One view of a workspace: its project, and what a scenario run against it would record as evidence. */
export interface Workspace {
  readonly project: Project
  /** Fingerprints of the workspace as it was read, and of the ordinary results as this view shows them. */
  readonly now: Snapshot
  /** The files `now.sources` covers: files a run imports later join them (`readImports`, `fingerprint`). */
  readonly sources: ReadonlyArray<SourceFile>
  /**
   * The results stored when it was read, read before the specs: one of a scenario that is not among
   * them was recorded before that scenario was gone.
   */
  readonly stored: RunResults | undefined
}

/** Reads `files` (relative to the root) that are files: a lockfile may be missing, or be no file. */
export const readFiles = Effect.fn("readFiles")(function*(root: string, files: ReadonlyArray<string>) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const isFile = (file: string) =>
    fs.stat(path.resolve(root, file)).pipe(Effect.map((info) => info.type === "File"), Effect.orElseSucceed(() => false))
  return yield* readAll(root, yield* Effect.filter(files, isFile))
})

/** How a run records a path it reached a file through that leads elsewhere — a link, or a path through one — with where it led. */
const arrow = " → "
const leadingTo = (file: string, to: string) => `${file}${arrow}${to}`

/**
 * Where each of `files` leads, relative to the real root `real`, and what it is there; nothing for
 * one that is not there. Each directory is resolved and listed once, so a path costs no look at
 * each directory it goes through, and only a link costs a look of its own.
 */
const leadsTo = Effect.fnUntraced(function*(real: string, files: ReadonlyArray<string>) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const directories = new Map(
    yield* Effect.forEach(new Set(files.map((file) => path.dirname(path.resolve(real, file)))), (directory) =>
      Effect.all([fs.realPath(directory), fs.readDirectoryEntries(directory)]).pipe(
        Effect.map(([to, entries]) => [directory, { to, types: new Map(entries.map(({ name, type }) => [name, type])) }] as const),
        Effect.orElseSucceed(() => [directory, undefined] as const)
      ), { concurrency: 32 })
  )
  const at = (file: string, to: string, type: FileSystem.File.Type) => [file, { at: path.relative(real, to), type }] as const
  return new Map(
    yield* Effect.forEach(files, (file) => {
      const absolute = path.resolve(real, file)
      const directory = directories.get(path.dirname(absolute))
      const type = directory?.types.get(path.basename(absolute))
      if (directory === undefined || type === undefined) return Effect.succeed([file, undefined] as const)
      // A link, or an entry whose type its directory does not tell: what it leads to.
      if (type === "SymbolicLink" || type === "Unknown") {
        return Effect.all([fs.realPath(absolute), fs.stat(absolute)]).pipe(
          Effect.map(([to, info]) => at(file, to, info.type)),
          Effect.orElseSucceed(() => [file, undefined] as const)
        )
      }
      return Effect.succeed(at(file, path.join(directory.to, path.basename(absolute)), type))
    }, { concurrency: 32 })
  )
})

/**
 * Reads what the step definitions of a run imported, as it recorded them, relative to the real
 * root: a file while no link leads it elsewhere, and a link, `L → R`, while it leads where it led,
 * which is all it holds. A link is part of what ran: the code that runs is the code it leads to.
 * Anything else is gone.
 */
export const readImports = Effect.fn("readImports")(function*(root: string, imports: ReadonlyArray<string>) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  if (imports.length === 0) return []
  const real = yield* fs.realPath(root)
  const entries = imports.map((entry) => {
    const [file = entry, to] = entry.split(arrow)
    return { entry, file, to }
  })
  const where = yield* leadsTo(real, [...new Set(entries.map(({ file }) => file))])
  const read = ({ entry, file, to }: (typeof entries)[number]): Effect.Effect<ReadonlyArray<SourceFile>, PlatformError> => {
    const found = where.get(file)
    if (to !== undefined) return Effect.succeed(found?.at === to ? [{ path: entry, content: "" }] : [])
    return found?.at === file && found.type === "File"
      ? Effect.map(fs.readFileString(path.resolve(real, file)), (content) => [{ path: file, content }])
      : Effect.succeed([])
  }
  return (yield* Effect.forEach(entries, read, { concurrency: 32 })).flat()
})

/**
 * The step files whose path leads elsewhere — a link, or a path through one — as a run records
 * such a path, `L → R`, relative to the real root: a step file is loaded from where it leads, and
 * what it imports is found beside it there, so where it leads is part of the step definitions.
 */
const stepLinks = Effect.fnUntraced(function*(root: string, files: ReadonlyArray<string>) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  if (files.length === 0) return []
  const real = yield* fs.realPath(root)
  const where = yield* leadsTo(real, files)
  return files.flatMap((file): ReadonlyArray<SourceFile> => {
    const named = path.relative(real, path.resolve(real, file))
    const to = where.get(file)?.at
    return to === undefined || to === named ? [] : [{ path: leadingTo(named, to), content: "" }]
  })
})

/**
 * Reads a workspace and builds one view of it: the project with the results that `results` lets
 * it show — `all` for readers, `ordinary` for gates, `none` for ordinary scenarios — and the
 * fingerprints a run records. `imports` names the workspace files the step definitions of this
 * run have imported; a stored result is compared with the files its own run had imported.
 */
export const loadWorkspace = Effect.fn("loadWorkspace")(function*(root: string, options: {
  readonly results?: Layer | "none" | undefined
  readonly imports?: ReadonlyArray<string> | undefined
} = {}) {
  const path = yield* Path.Path
  const configFile = yield* readConfigFile(root)
  const config = yield* parseConfig(configFile)
  const stored = yield* readResults(root, config)
  const [features, code, steps, inputs] = yield* Effect.all([
    findPaths(root, config.features, config.exclude),
    findPaths(root, config.code, config.exclude),
    findPaths(root, config.steps, config.exclude),
    findPaths(root, config.evidence.inputs, config.exclude)
  ], { concurrency: "unbounded" })
  const featureFiles = yield* readAll(root, features.files)
  // Markdown where specs live: beside a feature file, or under the directory a features glob starts
  // in. sdp reads none of it, so what is no file is Markdown all the same.
  const beside = [...new Set(features.files.map((file) => path.dirname(file)))].map((directory) => path.join(directory, "*.md"))
  const under = config.features.map(globBase).filter((base) => base !== "").map((base) => `${base}/**/*.md`)
  const markdown = yield* findPaths(root, [...beside, ...under], config.exclude)
  const markdownFiles = [...markdown.files, ...markdown.unread.map((file) => file.path)].sort()
  const codeFiles = yield* readAll(root, code.files)
  const stepFiles = yield* readAll(root, steps.files)
  const stepsLeading = yield* stepLinks(root, steps.files)
  const layer = options.results ?? "all"
  // Only a view that shows results compares them with the files their runs imported.
  const recorded = layer === "none" ? [] : Object.entries(stored?.imports ?? {})
  const imports = options.imports ?? []
  const imported = new Map(
    (yield* readImports(root, [...new Set([...recorded.flatMap(([, files]) => files), ...imports])])).map((file) => [file.path, file])
  )
  /** What a run whose step definitions imported `files` ran against, as the workspace is now. */
  const sourcesWith = (files: ReadonlyArray<string>) => [
    ...(configFile ? [configFile] : []),
    ...codeFiles,
    ...stepFiles,
    ...stepsLeading,
    ...files.flatMap((file) => imported.get(file) ?? [])
  ]
  const sources = sourcesWith(imports)
  const fingerprints: Fingerprints = {
    sources: new Set(recorded.filter(([sources, files]) => fingerprint(sourcesWith(files)) === sources).map(([sources]) => sources)),
    toolchain: toolchain(yield* readFiles(root, lockfileNames)),
    // What the steps read is no part of the graph: an input that is no file counts by its path and what it is.
    inputs: declaredInputs([
      ...yield* readAll(root, inputs.files),
      ...inputs.unread.map(({ is, path: file }): SourceFile => ({ path: file, content: is }))
    ], config.evidence.env),
    // Markdown where specs live counts by its path: the graph warns of it, and reads none of it.
    specs: fingerprint([...featureFiles, ...markdownFiles.map((file): SourceFile => ({ path: file, content: "" }))])
  }
  const view = layer === "none" ? undefined : evidenceView(stored, fingerprints, layer, config.vocabulary)
  const project = buildProject({
    root,
    config,
    featureFiles,
    markdownFiles,
    codeFiles,
    stepFiles,
    notFiles: [...features.unread, ...code.unread, ...steps.unread],
    evidence: view
  })
  const results = view ? view(project.specs).ordinary : ""
  return { project, now: { ...fingerprints, sources: fingerprint(sources), results }, sources, stored } satisfies Workspace
})

/** Reading a workspace: what it can fail with, and the services it needs. */
type Reading = ReturnType<typeof loadWorkspace>

/**
 * Reads config, feature files, code, step definitions and stored results, and builds the project.
 *
 * @sdp is ARCH-workspace
 */
export const loadProject = Effect.fn("loadProject")(function*(
  root: string,
  options: { readonly withResults?: boolean } = {}
): Effect.fn.Return<Project, Effect.Error<Reading>, Effect.Services<Reading>> {
  return (yield* loadWorkspace(root, { results: options.withResults === false ? "none" : "all" })).project
})

/** sdp's package exports (see package.json), as the files of the running sdp. */
const sdpExports = new Map([
  ["sdp", new URL("../index.ts", import.meta.url).href],
  ["sdp/effect", new URL("../effect.ts", import.meta.url).href],
  ["sdp/steps", new URL("../steps.ts", import.meta.url).href]
])
let hooked = false
/**
 * What this process has imported of workspaces, by module URL: the local files each module
 * imports, by the URL the import names and the real one Node resolved it to, and the source Node
 * loaded. Node keeps every module for the life of the process, and so do these records: a process
 * loads step modules once, and what it runs is what it loaded, whatever the file says later.
 */
const importGraph = new Map<string, Map<string, string>>()
const loadedSources = new Map<string, string>()

const isWorkspaceFile = (url: string) => url.startsWith("file:") && !url.includes("/node_modules/")

/** The path a target of a package's `imports` map names, as Node picks it: the first of an array or of the conditions that apply, `*` filled in. */
const mapTarget = (target: unknown, conditions: ReadonlyArray<string>, match: string | undefined): string | undefined => {
  if (typeof target === "string") return match === undefined ? target : target.replaceAll("*", match)
  const options = Array.isArray(target)
    ? target
    : target !== null && typeof target === "object"
    ? Object.entries(target).flatMap(([condition, value]) => condition === "default" || conditions.includes(condition) ? [value] : [])
    : []
  for (const option of options) {
    const found = mapTarget(option, conditions, match)
    if (found !== undefined) return found
  }
  return undefined
}

/** The target a package's `imports` map gives a specifier, as Node matches it: the key itself, else the pattern with the longest prefix. */
const packageImport = (imports: Record<string, unknown>, specifier: string, conditions: ReadonlyArray<string>): string | undefined => {
  if (Object.hasOwn(imports, specifier) && !specifier.includes("*")) return mapTarget(imports[specifier], conditions, undefined)
  const [pattern] = Object.keys(imports).filter((key) => {
    const [base = "", trailer, more] = key.split("*")
    return trailer !== undefined && more === undefined && specifier.startsWith(base) && specifier !== base && specifier.endsWith(trailer) &&
      specifier.length >= key.length
  }).sort((a, b) => b.indexOf("*") - a.indexOf("*") || b.length - a.length)
  const [base = "", trailer = ""] = pattern?.split("*") ?? []
  return pattern === undefined ? undefined : mapTarget(imports[pattern], conditions, specifier.slice(base.length, specifier.length - trailer.length))
}

/**
 * The path a package's own import (`#lamps`) went through before Node followed links to `real`, its
 * real path: where the package.json of the importing module's scope maps it. `real` itself for any
 * other import that names no path — a package is where node_modules has it, which the lockfile
 * pins — or where no other path is known to lead there.
 */
const pathBefore = (specifier: string, parent: string, conditions: ReadonlyArray<string>, real: string): string => {
  try {
    const scope = specifier.startsWith("#") ? findPackageJSON(parent) : undefined
    const imports = scope === undefined ? undefined : (JSON.parse(readFileSync(scope, "utf8")) as { readonly imports?: unknown }).imports
    const target = imports !== null && typeof imports === "object" ? packageImport(imports as Record<string, unknown>, specifier, conditions) : undefined
    const before = scope !== undefined && target?.startsWith("./") ? fileURLToPath(new URL(target, pathToFileURL(scope))) : undefined
    // Only a path that leads where Node resolved is one it went through.
    return before !== undefined && realpathSync(before) === real ? before : real
  } catch {
    return real
  }
}

/**
 * Step modules `import { defineSteps } from "sdp/steps"`: that always resolves to the sdp that runs
 * them, so a workspace needs no install, and step modules and runner agree on one sdp. What step
 * modules import is part of what scenarios run against, so every local import is recorded — also
 * one a handler makes while it runs — with the source that was loaded.
 */
const hookImports = () => {
  if (hooked) return
  hooked = true
  registerHooks({
    resolve: (specifier, context, nextResolve) => {
      const own = sdpExports.get(specifier)
      if (own !== undefined) return { url: own, shortCircuit: true }
      const resolved = nextResolve(specifier, context)
      const parent = context.parentURL
      // This module imports the step files of every workspace this process runs: that is no import of theirs.
      if (parent?.startsWith("file:") && parent !== import.meta.url && isWorkspaceFile(resolved.url)) {
        // Node names a module by its real path; a path that leads there through a link is named too.
        const named = /^(\.{1,2}\/|\/|file:)/.test(specifier)
          ? new URL(specifier, parent).href
          : pathToFileURL(pathBefore(specifier, parent, context.conditions, fileURLToPath(resolved.url))).href
        importGraph.set(parent, (importGraph.get(parent) ?? new Map()).set(named, resolved.url))
      }
      return resolved
    },
    load: (url, context, nextLoad) => {
      const loaded = nextLoad(url, context)
      const { source } = loaded
      if (isWorkspaceFile(url) && source != null) loadedSources.set(url, typeof source === "string" ? source : new TextDecoder().decode(source))
      return loaded
    }
  })
}

export interface LoadedSteps {
  /** Step definition files found by the `steps` globs, relative to the root. */
  readonly files: ReadonlyArray<string>
  readonly modules: ReadonlyArray<StepModule<any>>
  /** Files that export no step module (`export default defineSteps(…)`), so define nothing. */
  readonly empty: ReadonlyArray<string>
  /**
   * Local files the step definition files have imported so far, directly or not, relative to the
   * real root, those outside it included, and each link they were reached through, `L → R`. Ask
   * again after a run: a handler may import a file only when it executes.
   */
  readonly imports: () => ReadonlyArray<string>
  /**
   * The step files and their imports that `sources` holds with another content than this process
   * loaded, no longer holds at all or holds as leading elsewhere, and the links they were reached
   * through that lead elsewhere now: a run against them would record evidence about code that did
   * not run.
   */
  readonly changed: (sources: ReadonlyArray<SourceFile>) => ReadonlyArray<string>
  /** The step files of `steps` that this process did not load, which were added since: their definitions did not run either. */
  readonly added: (steps: ReadonlyArray<string>) => ReadonlyArray<string>
}

/** Imports every step definition module matched by `config.steps`: this runs workspace code, so only `sdp run` and `sdp gate` do it. */
export const loadSteps = Effect.fn("loadSteps")(function*(root: string, config: Config) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const files = yield* findFiles(root, config.steps, config.exclude)
  if (files.length > 0) hookImports()
  // Node resolves modules to their real paths.
  const real = files.length > 0 ? yield* fs.realPath(root) : root
  // A step file is named relative to the root, unless the glob that found it is absolute.
  const urlOf = (file: string) => pathToFileURL(path.resolve(real, file)).href
  // A step file that is a link is loaded from where it leads.
  const realUrls = new Map(
    yield* Effect.forEach(files, (file) => Effect.map(fs.realPath(path.resolve(real, file)), (to) => [urlOf(file), pathToFileURL(to).href] as const))
  )
  // A module exported under two names, or again by another file, is one module: its steps match once.
  const modules = new Set<StepModule<any>>()
  const empty: Array<string> = []
  for (const file of files) {
    const exports = yield* Effect.tryPromise({
      try: () => import(urlOf(file)) as Promise<Record<string, unknown>>,
      catch: (e) => new StepLoadError({ file, message: loadMessage(e) })
    })
    const found = Object.values(exports).filter(isStepModule)
    if (found.length === 0) empty.push(file)
    for (const module of found) modules.add(module)
  }
  /** A file by its path relative to the real root, one outside it — a monorepo's shared code — too. */
  const name = (url: string) => path.relative(real, fileURLToPath(url))
  /**
   * The step files and every local file they imported so far, directly or not, by the real URL
   * Node loaded each from, and every path that led to one of them through a link, with where it led.
   */
  const reached = () => {
    const seen = new Set(realUrls.values())
    const links = new Map([...realUrls].filter(([named, url]) => named !== url))
    const queue = [...seen]
    for (const url of queue) {
      for (const [named, next] of importGraph.get(url) ?? []) {
        if (named !== next) links.set(named, next)
        if (seen.has(next)) continue
        seen.add(next)
        queue.push(next)
      }
    }
    return {
      modules: [...seen].map((url) => ({ url, file: name(url) })),
      links: [...links].map(([named, url]) => ({ file: name(named), link: leadingTo(name(named), name(url)) }))
    }
  }
  const own = new Set(files)
  const imports = () => {
    const { links, modules } = reached()
    return [...new Set([...modules.map(({ file }) => file).filter((file) => !own.has(file)), ...links.map(({ link }) => link)])].sort()
  }
  const changed = (sources: ReadonlyArray<SourceFile>) => {
    const present = new Map(sources.map((file) => [file.path, file.content]))
    // The paths that lead elsewhere now: a module loaded from one of them would be loaded from elsewhere.
    const leading = new Set(sources.flatMap((file) => file.path.includes(arrow) ? [file.path.split(arrow)[0]] : []))
    const { links, modules } = reached()
    return [
      ...modules.filter(({ file, url }) => {
        const content = present.get(file)
        // Deleted, or now a link: Node still runs what it loaded.
        if (content === undefined || leading.has(file)) return true
        // A module loaded before sdp watched — its own, when it runs its own specifications — is taken as first read.
        const loaded = loadedSources.get(url) ?? content
        loadedSources.set(url, loaded)
        return loaded !== content
      }),
      ...links.filter(({ link }) => !present.has(link))
    ].map(({ file }) => file).sort()
  }
  const added = (steps: ReadonlyArray<string>) => steps.filter((file) => !files.includes(file))
  return { files, modules: [...modules], empty, imports, changed, added } satisfies LoadedSteps
})

/** The first line of what went wrong; Node appends the code frame and a stack nobody needs here. */
const loadMessage = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error)
  return message.split("\n").find((line) => line.trim() !== "")?.trim() ?? message
}
