/**
 * IO edge: reads the config, sources and stored results through the Effect
 * `FileSystem` service, then hands plain data to the pure graph builder.
 * Swapping the FileSystem layer (see MemoryFileSystem) runs the exact same
 * pipeline against an in-memory workspace.
 */
import { annotate } from "sdp/annotations"
import { Effect, FileSystem, Path, Schema } from "effect"
import { registerHooks } from "node:module"
import { pathToFileURL } from "node:url"
import { parse as parseYaml } from "yaml"
import { buildProject, type Project, type SourceFile } from "../graph/Build.ts"
import { type Config, ConfigFile, configFileNames, resolveConfig } from "../model/Config.ts"
import { RunResults } from "../run/Results.ts"
import { isStepModule, type StepModule } from "../run/Steps.ts"

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

export const loadConfig = Effect.fn("loadConfig")(function*(root: string) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  if (!(yield* fs.exists(root))) return yield* new WorkspaceNotFound({ root })
  for (const name of configFileNames) {
    const file = path.join(root, name)
    if (!(yield* fs.exists(file))) continue
    const text = yield* fs.readFileString(file)
    const raw = yield* Effect.try({
      try: () => name.endsWith(".json") ? JSON.parse(text) : parseYaml(text) ?? {},
      catch: (e) => new ConfigError({ file: name, message: e instanceof Error ? e.message : String(e) })
    })
    // Unknown keys are errors: a misspelled `spec:` must not silently fall back to the defaults.
    const decoded = yield* Schema.decodeUnknownEffect(ConfigFile)(raw, { onExcessProperty: "error" }).pipe(
      Effect.mapError((e) => new ConfigError({ file: name, message: e.message }))
    )
    return resolveConfig(decoded)
  }
  return resolveConfig(undefined)
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

export const readResults = Effect.fn("readResults")(function*(root: string, config: Config) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const file = path.join(root, config.results)
  if (!(yield* fs.exists(file))) return undefined
  const text = yield* fs.readFileString(file)
  // Results are a cache of the last run: unreadable results are ignored, not fatal.
  return yield* Schema.decodeUnknownEffect(Schema.fromJsonString(RunResults))(text).pipe(
    Effect.orElseSucceed(() => undefined)
  )
})

export const writeResults = Effect.fn("writeResults")(function*(root: string, config: Config, results: RunResults) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const file = path.join(root, config.results)
  yield* fs.makeDirectory(path.dirname(file), { recursive: true })
  yield* fs.writeFileString(file, `${JSON.stringify(results, null, 2)}\n`)
})

/** Reads config, specs, feature files, code, stored results and id declarations from a workspace and builds its project. */
export const loadProject = Effect.fn("loadProject")(function*(root: string, options: { readonly withResults?: boolean } = {}) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const config = yield* loadConfig(root)
  const [specPaths, featurePaths, codePaths] = yield* Effect.all([
    findFiles(root, config.specs, config.exclude),
    findFiles(root, config.features, config.exclude),
    findFiles(root, config.code, config.exclude)
  ], { concurrency: "unbounded" })
  const specFiles = yield* readAll(root, specPaths)
  const featureFiles = yield* readAll(root, featurePaths)
  const codeFiles = yield* readAll(root, codePaths)
  const results = options.withResults === false ? undefined : yield* readResults(root, config)
  const typesFile = path.join(root, config.types)
  const types = (yield* fs.exists(typesFile)) ? yield* fs.readFileString(typesFile) : undefined
  return buildProject({ root, config, specFiles, featureFiles, codeFiles, results, types }) satisfies Project
})
annotate(loadProject, { is: "ARCH-workspace", "instance-of": "PAT-pipes-and-filters" })

/** sdp's package exports (see package.json), as the files of the running sdp. */
const sdpExports: Readonly<Record<string, string>> = {
  "sdp": new URL("../index.ts", import.meta.url).href,
  "sdp/annotations": new URL("../annotations.ts", import.meta.url).href
}
const sdpSources = new URL("../", import.meta.url).href
let hooked = false

/**
 * Step modules `import { defineSteps } from "sdp"`: that always resolves to the sdp that runs them,
 * so a workspace needs no install, and step modules and runner agree on one sdp. A module imported
 * with `?sdp-load=<n>` passes the marker on to the workspace files it imports (not to packages or
 * to sdp itself), so a fresh load re-evaluates the step modules and their helpers.
 */
const hookImports = () => {
  if (hooked) return
  hooked = true
  registerHooks({
    resolve: (specifier, context, nextResolve) => {
      // A workspace imports sdp without installing it: the package and its subpath exports
      // ("sdp/annotations" in application code) resolve to the running sdp.
      const own = sdpExports[specifier]
      if (own !== undefined) return { url: own, shortCircuit: true }
      const resolved = nextResolve(specifier, context)
      const load = context.parentURL?.startsWith("file:") ? new URL(context.parentURL).searchParams.get("sdp-load") : null
      if (load === null || !resolved.url.startsWith("file:") || resolved.url.includes("/node_modules/") || resolved.url.startsWith(sdpSources)) {
        return resolved
      }
      const url = new URL(resolved.url)
      url.searchParams.set("sdp-load", load)
      return { ...resolved, url: url.href }
    }
  })
}

let loads = 0

export interface LoadedSteps {
  /** Step definition files found by the `steps` globs, relative to the root. */
  readonly files: ReadonlyArray<string>
  readonly modules: ReadonlyArray<StepModule<any>>
  /** Files that export no step module (`export default defineSteps(…)`), so define nothing. */
  readonly empty: ReadonlyArray<string>
}

/**
 * Import every step definition module matched by `config.steps`. With `fresh`, modules are
 * evaluated again instead of taken from the module cache, so a long-running process (the MCP
 * server) sees edits to step files.
 */
export const loadSteps = Effect.fn("loadSteps")(function*(root: string, config: Config, options: { readonly fresh?: boolean } = {}) {
  const path = yield* Path.Path
  const files = yield* findFiles(root, config.steps, config.exclude)
  if (files.length > 0) hookImports()
  const suffix = options.fresh ? `?sdp-load=${++loads}` : ""
  const modules: Array<StepModule<any>> = []
  const empty: Array<string> = []
  for (const file of files) {
    const absolute = path.resolve(root, file)
    const exports = yield* Effect.tryPromise({
      try: () => import(pathToFileURL(absolute).href + suffix) as Promise<Record<string, unknown>>,
      catch: (e) => new StepLoadError({ file, message: loadMessage(e) })
    })
    const found = Object.values(exports).filter(isStepModule)
    if (found.length === 0) empty.push(file)
    modules.push(...found)
  }
  return { files, modules, empty } satisfies LoadedSteps
})

/** The first line of what went wrong; Node appends the code frame and a stack nobody needs here. */
const loadMessage = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error)
  return message.split("\n").find((line) => line.trim() !== "")?.trim() ?? message
}

/** Import every step definition module matched by `config.steps`. */
export const loadStepModules = Effect.fn("loadStepModules")(function*(root: string, config: Config) {
  return (yield* loadSteps(root, config)).modules
})
