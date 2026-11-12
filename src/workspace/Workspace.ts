/**
 * IO edge: reads the config, sources and stored results through the Effect
 * `FileSystem` service, then hands plain data to the pure graph builder.
 * Swapping the FileSystem layer (see MemoryFileSystem) runs the exact same
 * pipeline against an in-memory workspace.
 */
import { Effect, FileSystem, Path, Schema } from "effect"
import { pathToFileURL } from "node:url"
import { parse as parseYaml } from "yaml"
import { buildProject, type Project, type SourceFile } from "../graph/Build.ts"
import { type Config, ConfigFile, configFileNames, resolveConfig } from "../model/Config.ts"
import { countAbstractions } from "../parse/Inventory.ts"
import { RunResults } from "../run/Results.ts"
import { isStepModule, type StepModule } from "../run/Steps.ts"

// @sdp is ARCH-workspace

export class ConfigError extends Schema.TaggedError<ConfigError>()("ConfigError", {
  file: Schema.String,
  message: Schema.String
}) {}

export class StepLoadError extends Schema.TaggedError<StepLoadError>()("StepLoadError", {
  file: Schema.String,
  message: Schema.String
}) {}

export const loadConfig = Effect.fn("loadConfig")(function*(root: string) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  for (const name of configFileNames) {
    const file = path.join(root, name)
    if (!(yield* fs.exists(file))) continue
    const text = yield* fs.readFileString(file)
    const raw = yield* Effect.try({
      try: () => name.endsWith(".json") ? JSON.parse(text) : parseYaml(text) ?? {},
      catch: (e) => new ConfigError({ file: name, message: e instanceof Error ? e.message : String(e) })
    })
    const decoded = yield* Schema.decodeUnknownEffect(ConfigFile)(raw).pipe(
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

export const loadProject = Effect.fn("loadProject")(function*(root: string, options: { readonly withResults?: boolean } = {}) {
  const config = yield* loadConfig(root)
  const [specPaths, featurePaths, codePaths, inventoryPaths] = yield* Effect.all([
    findFiles(root, config.specs, config.exclude),
    findFiles(root, config.features, config.exclude),
    findFiles(root, config.code, config.exclude),
    findFiles(root, config.architecture.inventory.include, [...config.exclude, ...config.architecture.inventory.exclude])
  ])
  const specFiles = yield* readAll(root, specPaths)
  const featureFiles = yield* readAll(root, featurePaths)
  const codeFiles = yield* readAll(root, codePaths)
  const byPath = new Map(codeFiles.map((f) => [f.path, f]))
  const inventoryFiles = [
    ...codeFiles.filter((f) => inventoryPaths.includes(f.path)),
    ...(yield* readAll(root, inventoryPaths.filter((p) => !byPath.has(p))))
  ]
  const inventory = inventoryFiles.reduce(
    (sum, file) => sum + countAbstractions(file.path, file.content, config.architecture.inventory.pattern),
    0
  )
  const results = options.withResults === false ? undefined : yield* readResults(root, config)
  return buildProject({ root, config, specFiles, featureFiles, codeFiles, inventory, results }) satisfies Project
})

/** Import every step definition module matched by `config.steps`. */
export const loadStepModules = Effect.fn("loadStepModules")(function*(root: string, config: Config) {
  const path = yield* Path.Path
  const files = yield* findFiles(root, config.steps, config.exclude)
  const modules: Array<StepModule<any>> = []
  for (const file of files) {
    const absolute = path.resolve(root, file)
    const exports = yield* Effect.tryPromise({
      try: () => import(pathToFileURL(absolute).href) as Promise<Record<string, unknown>>,
      catch: (e) => new StepLoadError({ file, message: e instanceof Error ? e.message : String(e) })
    })
    for (const value of Object.values(exports)) if (isStepModule(value)) modules.push(value)
  }
  return modules
})
