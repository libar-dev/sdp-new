/**
 * IO edge: reads the config, sources and stored results through the Effect
 * `FileSystem` service, then hands plain data to the pure graph builder.
 * Swapping the FileSystem layer (see MemoryFileSystem) runs the exact same
 * pipeline against an in-memory workspace. Reading never runs workspace code:
 * only `loadSteps`, for `sdp run` and `sdp gate`, imports step modules.
 */
import { annotate } from "sdp/annotations"
import { Effect, FileSystem, Path, Schema } from "effect"
import { createRequire, registerHooks } from "node:module"
import { fileURLToPath, pathToFileURL } from "node:url"
import { parse as parseYaml } from "yaml"
import { buildProject, type Project, type SourceFile } from "../graph/Build.ts"
import { type Config, ConfigFile, configFileNames, resolveConfig } from "../model/Config.ts"
import { digest, evidenceView, fingerprint, type Layer, type Snapshot } from "../run/Evidence.ts"
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

const parseConfig = Effect.fnUntraced(function*(file: SourceFile | undefined) {
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

/** Expand globs relative to `root`, de-duplicated and sorted for stable output. */
export const findFiles = Effect.fn("findFiles")(function*(
  root: string,
  patterns: ReadonlyArray<string>,
  exclude: ReadonlyArray<string>
) {
  const fs = yield* FileSystem.FileSystem
  const found = new Set<string>()
  for (const pattern of patterns) {
    for (const file of yield* fs.glob(pattern, { root, exclude })) found.add(file)
  }
  return [...found].sort()
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

const sdpVersion = (createRequire(import.meta.url)("../../package.json") as { readonly version: string }).version

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
 * fingerprints a run records. `imports` names workspace files the step definitions import, when a
 * run has loaded them; those earlier runs recorded count either way.
 */
export const loadWorkspace = Effect.fn("loadWorkspace")(function*(root: string, options: {
  readonly results?: Layer | "none" | undefined
  readonly imports?: ReadonlyArray<string> | undefined
} = {}) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const configFile = yield* readConfigFile(root)
  const config = yield* parseConfig(configFile)
  const [specPaths, featurePaths, codePaths, stepPaths, inputPaths] = yield* Effect.all([
    findFiles(root, config.specs, config.exclude),
    findFiles(root, config.features, config.exclude),
    findFiles(root, config.code, config.exclude),
    findFiles(root, config.steps, config.exclude),
    findFiles(root, config.evidence.inputs, config.exclude)
  ], { concurrency: "unbounded" })
  const specFiles = yield* readAll(root, specPaths)
  const featureFiles = yield* readAll(root, featurePaths)
  const codeFiles = yield* readAll(root, codePaths)
  const stepFiles = yield* readAll(root, stepPaths)
  const stored = yield* readResults(root, config)
  const imported = yield* readFiles(root, [...new Set([...(stored?.imports ?? []), ...(options.imports ?? [])])])
  const sources = [...(configFile ? [configFile] : []), ...codeFiles, ...stepFiles, ...imported]
  const fingerprints = {
    sources: fingerprint(sources),
    toolchain: toolchain(yield* readFiles(root, lockfileNames)),
    inputs: declaredInputs(yield* readAll(root, inputPaths), config.evidence.env),
    specs: fingerprint([...specFiles, ...featureFiles])
  }
  const layer = options.results ?? "all"
  const typesFile = path.join(root, config.types)
  const types = (yield* fs.exists(typesFile)) ? yield* fs.readFileString(typesFile) : undefined
  const view = layer === "none" ? undefined : evidenceView(stored, fingerprints, layer, config.vocabulary)
  const project = buildProject({ root, config, specFiles, featureFiles, codeFiles, stepFiles, types, evidence: view })
  const results = view ? view(project.specs).ordinary : ""
  return { project, now: { ...fingerprints, results }, sources } satisfies Workspace
})

/** Reads config, specs, feature files, code, step definitions, stored results and id declarations and builds the project. */
export const loadProject = Effect.fn("loadProject")(function*(root: string, options: { readonly withResults?: boolean } = {}) {
  return (yield* loadWorkspace(root, { results: options.withResults === false ? "none" : "all" })).project
})
annotate(loadProject, { is: "ARCH-workspace", "instance-of": "PAT-pipes-and-filters" })

/** sdp's package exports (see package.json), as the files of the running sdp. */
const sdpExports = new Map([
  ["sdp", new URL("../index.ts", import.meta.url).href],
  ["sdp/steps", new URL("../steps.ts", import.meta.url).href],
  ["sdp/annotations", new URL("../annotations.ts", import.meta.url).href]
])
let hooked = false
/**
 * Module URL → the local files it imports, as this process resolved them. Node keeps every module
 * for the life of the process, and so does this record of what each one imports: a process loads
 * the step modules once.
 */
const importGraph = new Map<string, Set<string>>()

/**
 * Step modules `import { defineSteps } from "sdp/steps"`: that always resolves to the sdp that runs
 * them, so a workspace needs no install, and step modules and runner agree on one sdp. What step
 * modules import is part of what scenarios run against, so every local import is recorded — also
 * one a handler makes while it runs.
 */
const hookImports = () => {
  if (hooked) return
  hooked = true
  registerHooks({
    resolve: (specifier, context, nextResolve) => {
      const own = sdpExports.get(specifier)
      if (own !== undefined) return { url: own, shortCircuit: true }
      const resolved = nextResolve(specifier, context)
      if (context.parentURL?.startsWith("file:") && resolved.url.startsWith("file:") && !resolved.url.includes("/node_modules/")) {
        importGraph.set(context.parentURL, (importGraph.get(context.parentURL) ?? new Set()).add(resolved.url))
      }
      return resolved
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
}

/** Imports every step definition module matched by `config.steps`: this runs workspace code, so only `sdp run` and `sdp gate` do it. */
export const loadSteps = Effect.fn("loadSteps")(function*(root: string, config: Config) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const files = yield* findFiles(root, config.steps, config.exclude)
  if (files.length > 0) hookImports()
  const modules: Array<StepModule<any>> = []
  const empty: Array<string> = []
  for (const file of files) {
    const exports = yield* Effect.tryPromise({
      try: () => import(pathToFileURL(path.resolve(root, file)).href) as Promise<Record<string, unknown>>,
      catch: (e) => new StepLoadError({ file, message: loadMessage(e) })
    })
    const found = Object.values(exports).filter(isStepModule)
    if (found.length === 0) empty.push(file)
    modules.push(...found)
  }
  // Node resolves modules to their real paths.
  const real = files.length > 0 ? yield* fs.realPath(root) : root
  const imports = () => {
    const seen = new Set(files.map((file) => pathToFileURL(path.join(real, file)).href))
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
  return { files, modules, empty, imports } satisfies LoadedSteps
})

/** The first line of what went wrong; Node appends the code frame and a stack nobody needs here. */
const loadMessage = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error)
  return message.split("\n").find((line) => line.trim() !== "")?.trim() ?? message
}
