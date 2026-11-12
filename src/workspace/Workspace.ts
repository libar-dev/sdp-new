/**
 * IO edge: reads the config, sources and stored results through the Effect
 * `FileSystem` service, then hands plain data to the pure graph builder.
 * Swapping the FileSystem layer (see MemoryFileSystem) runs the exact same
 * pipeline against an in-memory workspace. Reading never runs workspace code:
 * only `loadSteps`, for `sdp run` and `sdp gate`, imports step modules.
 */
import { Effect, FileSystem, Path, Schema } from "effect"
import { createRequire, registerHooks } from "node:module"
import { fileURLToPath, pathToFileURL } from "node:url"
import { parse as parseYaml } from "yaml"
import { buildProject, type Project, type SourceFile } from "../graph/Build.ts"
import { type Config, ConfigFile, configFileNames, resolveConfig } from "../model/Config.ts"
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

/** Files this process imported as modules have changed since: what it would run is no longer what is on disk. */
export class SourcesChanged extends Schema.TaggedError<SourcesChanged>()("SourcesChanged", {
  files: Schema.Array(Schema.String)
}) {
  override get message() {
    return `${this.files.join(", ")} changed after this process imported ${
      this.files.length === 1 ? "it" : "them"
    }, and Node.js keeps a module for the life of a process: the changed code did not run, so nothing is recorded. Run again in a new process`
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

/** Expand globs relative to `root` to the files they match, de-duplicated and sorted for stable output. */
export const findFiles = Effect.fn("findFiles")(function*(
  root: string,
  patterns: ReadonlyArray<string>,
  exclude: ReadonlyArray<string>
) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const found = new Set<string>()
  for (const pattern of patterns) {
    for (const file of yield* fs.glob(pattern, { root, exclude })) found.add(file)
  }
  // A glob matches directories too (`fixtures/**` is `fixtures` and all below it). A path whose
  // type cannot be told is kept, so that reading it says what is wrong with it.
  const isFile = (file: string) =>
    fs.stat(path.join(root, file)).pipe(Effect.map((info) => info.type !== "Directory"), Effect.orElseSucceed(() => true))
  return (yield* Effect.filter([...found], isFile, { concurrency: 32 })).sort()
})

const readAll = Effect.fnUntraced(function*(root: string, files: ReadonlyArray<string>) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  return yield* Effect.forEach(
    files,
    (file) => Effect.map(fs.readFileString(path.join(root, file)), (content): SourceFile => ({ path: file, content })),
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
  /** The files `now.sources` covers: files a run imports later join them (`readFiles`, `fingerprint`). */
  readonly sources: ReadonlyArray<SourceFile>
}

/** Reads `files` (relative to the root) that exist; an import recorded by an earlier run may be gone. */
export const readFiles = Effect.fn("readFiles")(function*(root: string, files: ReadonlyArray<string>) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  return yield* readAll(root, yield* Effect.filter(files, (file) => fs.exists(path.join(root, file))))
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
  const [featurePaths, codePaths, stepPaths, inputPaths] = yield* Effect.all([
    findFiles(root, config.features, config.exclude),
    findFiles(root, config.code, config.exclude),
    findFiles(root, config.steps, config.exclude),
    findFiles(root, config.evidence.inputs, config.exclude)
  ], { concurrency: "unbounded" })
  const featureFiles = yield* readAll(root, featurePaths)
  // Markdown where specs live: beside a feature file, or under the directory a features glob starts in.
  const beside = [...new Set(featurePaths.map((file) => path.dirname(file)))].map((directory) => path.join(directory, "*.md"))
  const under = config.features.map(globBase).filter((base) => base !== "").map((base) => `${base}/**/*.md`)
  const markdownFiles = yield* findFiles(root, [...beside, ...under], config.exclude)
  const codeFiles = yield* readAll(root, codePaths)
  const stepFiles = yield* readAll(root, stepPaths)
  const stored = yield* readResults(root, config)
  const recorded = Object.entries(stored?.imports ?? {})
  const imports = options.imports ?? []
  const imported = new Map(
    (yield* readFiles(root, [...new Set([...recorded.flatMap(([, files]) => files), ...imports])])).map((file) => [file.path, file])
  )
  /** What a run whose step definitions imported `files` ran against, as the workspace is now. */
  const sourcesWith = (files: ReadonlyArray<string>) => [
    ...(configFile ? [configFile] : []),
    ...codeFiles,
    ...stepFiles,
    ...files.flatMap((file) => imported.get(file) ?? [])
  ]
  const sources = sourcesWith(imports)
  const fingerprints: Fingerprints = {
    sources: new Set(recorded.filter(([sources, files]) => fingerprint(sourcesWith(files)) === sources).map(([sources]) => sources)),
    toolchain: toolchain(yield* readFiles(root, lockfileNames)),
    inputs: declaredInputs(yield* readAll(root, inputPaths), config.evidence.env),
    specs: fingerprint(featureFiles)
  }
  const layer = options.results ?? "all"
  const view = layer === "none" ? undefined : evidenceView(stored, fingerprints, layer, config.vocabulary)
  const project = buildProject({ root, config, featureFiles, markdownFiles, codeFiles, stepFiles, evidence: view })
  const results = view ? view(project.specs).ordinary : ""
  return { project, now: { ...fingerprints, sources: fingerprint(sources), results }, sources } satisfies Workspace
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
 * imports, as Node resolved them, and the source Node loaded. Node keeps every module for the life
 * of the process, and so do these records: a process loads step modules once, and what it runs is
 * what it loaded, whatever the file says later.
 */
const importGraph = new Map<string, Set<string>>()
const loadedSources = new Map<string, string>()

const isWorkspaceFile = (url: string) => url.startsWith("file:") && !url.includes("/node_modules/")

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
      if (context.parentURL?.startsWith("file:") && isWorkspaceFile(resolved.url)) {
        importGraph.set(context.parentURL, (importGraph.get(context.parentURL) ?? new Set()).add(resolved.url))
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
   * Workspace files the step definition files have imported so far, directly or not, relative to
   * the root. Ask again after a run: a handler may import a file only when it executes.
   */
  readonly imports: () => ReadonlyArray<string>
  /**
   * The step files and their imports that `sources` holds with another content than this process
   * loaded, or no longer holds at all: a run against them would record evidence about code that
   * did not run.
   */
  readonly changed: (sources: ReadonlyArray<SourceFile>) => ReadonlyArray<string>
}

/** Imports every step definition module matched by `config.steps`: this runs workspace code, so only `sdp run` and `sdp gate` do it. */
export const loadSteps = Effect.fn("loadSteps")(function*(root: string, config: Config) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const files = yield* findFiles(root, config.steps, config.exclude)
  if (files.length > 0) hookImports()
  // Node resolves modules to their real paths.
  const real = files.length > 0 ? yield* fs.realPath(root) : root
  const urlOf = (file: string) => pathToFileURL(path.join(real, file)).href
  const modules: Array<StepModule<any>> = []
  const empty: Array<string> = []
  for (const file of files) {
    const exports = yield* Effect.tryPromise({
      try: () => import(urlOf(file)) as Promise<Record<string, unknown>>,
      catch: (e) => new StepLoadError({ file, message: loadMessage(e) })
    })
    const found = Object.values(exports).filter(isStepModule)
    if (found.length === 0) empty.push(file)
    modules.push(...found)
  }
  const imports = () => {
    const seen = new Set(files.map(urlOf))
    const queue = [...seen]
    for (const url of queue) {
      for (const next of importGraph.get(url) ?? []) {
        if (seen.has(next)) continue
        seen.add(next)
        queue.push(next)
      }
    }
    const own = new Set(files)
    return [...seen]
      .map((url) => path.relative(real, fileURLToPath(url)))
      .filter((file) => !own.has(file) && !file.startsWith("..") && !path.isAbsolute(file))
      .sort()
  }
  const changed = (sources: ReadonlyArray<SourceFile>) => {
    const present = new Map(sources.map((file) => [file.path, file.content]))
    return [...files, ...imports()].filter((file) => {
      const content = present.get(file)
      // Deleted: Node still runs what it loaded.
      if (content === undefined) return true
      // A module loaded before sdp watched — its own, when it runs its own specifications — is taken as first read.
      const loaded = loadedSources.get(urlOf(file)) ?? content
      loadedSources.set(urlOf(file), loaded)
      return loaded !== content
    }).sort()
  }
  return { files, modules, empty, imports, changed } satisfies LoadedSteps
})

/** The first line of what went wrong; Node appends the code frame and a stack nobody needs here. */
const loadMessage = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error)
  return message.split("\n").find((line) => line.trim() !== "")?.trim() ?? message
}
