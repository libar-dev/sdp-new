/**
 * The files that say what the names code imports mean, as read: the tsconfig.json — or
 * jsconfig.json — each file of code is read with, with what it extends and references, and the
 * package.json and pnpm-workspace.yaml files around the code, up to the top of the repository.
 * Nothing is installed or run.
 *
 * @sdp is ARCH-code-annotations
 */
import { Glob, Option, Schema } from "effect"
import { parse as parseYaml } from "yaml"

/** A file as read, by its path from the workspace's root: `../` leads above it. */
export interface File {
  readonly path: string
  readonly content: string
}

/**
 * The files that say what the names code imports mean; the workspace's root as an absolute path,
 * which their paths start from; and the top of the repository, as a path from the root: `""`, or
 * `../` for each directory above it.
 */
export interface ModuleConfigs {
  readonly root: string
  readonly top: string
  readonly files: ReadonlyArray<File>
}

export const tsconfigFile = "tsconfig.json"
/** The tsconfig.json a package is built with by convention, `tsc -p tsconfig.build.json`, where it is not the tsconfig.json. */
export const buildFile = "tsconfig.build.json"
const jsconfigFile = "jsconfig.json"
export const packageFile = "package.json"
const pnpmWorkspaceFile = "pnpm-workspace.yaml"
const denoFiles = ["deno.json", "deno.jsonc"]

/**
 * The files that may say what the names code imports mean: the tsconfig.json, tsconfig.build.json,
 * jsconfig.json, package.json, pnpm-workspace.yaml and deno.json of each directory that holds code
 * and of every one above it, up to the repository's `top`, as TypeScript, package managers and Deno
 * look for them. What these name in turn is `namedBy` and `listedPackages`.
 */
export const moduleConfigFiles = (root: string, top: string, code: ReadonlyArray<string>): ReadonlyArray<string> => {
  const at = pathsFrom(root, top)
  const directories = new Set(code.flatMap((file) => at.upFrom(directoryOf(file))))
  return [...directories].flatMap((directory) =>
    [tsconfigFile, buildFile, jsconfigFile, packageFile, pnpmWorkspaceFile, ...denoFiles].map((name) => at.join(directory, name))
  )
}

/**
 * Where each tsconfig.json or jsconfig.json that `files` holds may find what it extends, nearest
 * first — a node_modules up to the repository's `top` — and what it references.
 */
export const namedBy = (root: string, top: string, files: ReadonlyArray<File>): ReadonlyArray<string> => {
  const at = pathsFrom(root, top)
  const packages = packagesOf(files)
  return files.flatMap((file) => {
    if (!isProject(file.path)) return []
    const read = readTsConfig(file.content)
    if (!("value" in read)) return []
    const bases = [read.value.extends ?? []].flat().flatMap((base) => extendsCandidates(at, packages, file.path, base))
    return [...bases, ...(read.value.references ?? []).map((reference) => referencePath(at, file.path, reference.path))]
  })
}

/**
 * The package.json files a workspace that `files` holds lists as its packages — the `workspaces`
 * of a package.json, the `packages` of a pnpm-workspace.yaml — as globs from the directory that
 * lists them, which only reading that directory expands.
 */
export const listedPackages = (files: ReadonlyArray<File>): ReadonlyArray<{
  readonly directory: string
  readonly include: ReadonlyArray<string>
  readonly exclude: ReadonlyArray<string>
}> =>
  files.flatMap((file) => {
    const name = baseName(file.path)
    if (name !== packageFile && name !== pnpmWorkspaceFile) return []
    const globs = name === packageFile ? workspacesOf(file.content) : pnpmPackagesOf(file.content)
    if (globs.length === 0) return []
    const manifests = (patterns: ReadonlyArray<string>) => patterns.map((pattern) => `${pattern.replace(/\/+$/, "")}/${packageFile}`)
    return [{
      directory: directoryOf(file.path),
      include: manifests(globs.filter((glob) => !glob.startsWith("!"))),
      exclude: [...manifests(globs.filter((glob) => glob.startsWith("!")).map((glob) => glob.slice(1))), "**/node_modules/**"]
    }]
  })

/** The path from the workspace's root that `parts` name, joined and made plain. */
export const pathFrom = (root: string, ...parts: ReadonlyArray<string>): string => pathsFrom(root, "").join(...parts)

/** A path of a tsconfig.json from the directory it is relative to: its own, or the `${configDir}` of the one the code is read with. */
export interface Placed {
  readonly from: string
  readonly path: string
}

/** What a configuration file says that is reported, where it is written. */
export interface Located {
  readonly file: string
  readonly line: number
  readonly message: string
  readonly hint: string
}

/**
 * What sdp could not read of a configuration file: reported once, with any name it could change.
 * `setting` is the one it is, or undefined when it could be any — a file that does not parse, or one
 * extended that is not there.
 */
export interface Unread extends Located {
  readonly setting?: string | undefined
}

/** What a tsconfig.json, with what it extends, says of names, and what sdp could not read of it. */
export interface Settings {
  readonly configDir?: string
  readonly baseUrl?: string
  readonly paths?: { readonly map: { readonly [name: string]: ReadonlyArray<string> }; readonly from: string }
  readonly customConditions?: ReadonlyArray<string>
  readonly module?: string
  readonly moduleResolution?: string
  readonly moduleSuffixes?: ReadonlyArray<string>
  readonly resolvePackageJsonExports?: boolean
  readonly resolvePackageJsonImports?: boolean
  readonly rootDir?: string
  readonly outDir?: string
  readonly files?: ReadonlyArray<string>
  readonly include?: ReadonlyArray<Placed>
  readonly exclude?: ReadonlyArray<Placed>
  readonly unread: ReadonlyArray<Unread>
  /** Each file it extends outside the repository, where it names it. */
  readonly outside?: ReadonlyArray<Located>
}

/** `${configDir}`, which a path of a tsconfig.json starts with to be from the directory of the one the code is read with. */
export const configDirectory = "${configDir}"

/**
 * The configuration files read, as they answer the questions resolving a name asks: what a
 * tsconfig.json says with what it extends, which one a file of code is read with, what a package.json
 * says, and which packages the workspace has.
 */
export const readConfigs = (configs: ModuleConfigs) => {
  const at = pathsFrom(configs.root, configs.top)
  const byPath = new Map(configs.files.map((file) => [file.path, file.content]))
  const packages = packagesOf(configs.files)
  const tsconfigs = cache((path: string) => readTsConfig(byPath.get(path) ?? "{}"))
  const manifests = cache((path: string) => readConfig(byPath.get(path) ?? "{}", decodePackageJson))
  const globs = cache((pattern: string) => Glob.make(pattern))

  /** What a package.json says, if sdp could read it. */
  const manifest = (path: string) => {
    const read = manifests(path)
    return "value" in read ? read.value : undefined
  }

  /** What a tsconfig.json, with what it extends, says of names; `configDir` is the directory of the one the code is read with. */
  const settingsOf = (path: string, configDir: string, seen: ReadonlySet<string>): Settings => {
    const read = tsconfigs(path)
    if (seen.has(path)) return { unread: [] }
    if (!("value" in read)) {
      return { unread: [{ file: path, line: read.line, message: `${path} ${read.unread}, so what it sets is not read`, hint: `fix the syntax of ${path}` }] }
    }
    const config = read.value
    const own = config.compilerOptions ?? {}
    const unread = read.unread.map((setting): Unread => ({
      file: path,
      line: lineOf(read.text, setting),
      setting,
      message: `${path} sets ${setting} to a value of a type TypeScript does not read, so it is not read`,
      hint: `correct ${setting} in ${path}: \`tsc --noEmit -p ${path}\` says what it takes`
    }))
    // What TypeScript would resolve by, and sdp does not follow.
    const unfollowed: ReadonlyArray<Unread> = [
      ...own.moduleResolution?.toLowerCase() !== "classic" ? [] : [{
        file: path,
        line: lineOf(read.text, "moduleResolution"),
        setting: "moduleResolution",
        message: `${path} sets moduleResolution to classic, which sdp does not follow: it resolves names as a bundler does`,
        hint: `set moduleResolution to bundler or nodenext in ${path}; TypeScript 7 has no classic`
      }],
      ...own.rootDirs === undefined ? [] : [{
        file: path,
        line: lineOf(read.text, "rootDirs"),
        setting: "rootDirs",
        message: `${path} sets rootDirs, which sdp does not follow: a relative name it finds no file for could name one in another of them`,
        hint: "import the file by its path from the code that imports it"
      }]
    ]
    let inherited: Settings = { unread: [] }
    for (const base of [config.extends ?? []].flat()) {
      const found = extendsCandidates(at, packages, path, base).find((candidate) => byPath.has(candidate))
      const relative = /^\.\.?(\/|$)/.test(base)
      const left = found !== undefined && at.within(path) && !at.within(found)
      const settings: Settings = found !== undefined ? settingsOf(found, configDir, new Set([...seen, path])) : {
        unread: [{
          file: path,
          line: lineOf(read.text, "extends"),
          message: `${path} extends ${base}, which is ${relative ? "not there" : "neither a package of the workspace nor installed in the repository"}, so what it sets is not read`,
          hint: relative ? `correct the extends of ${path}` : `install the workspace's packages, or extend a tsconfig.json of the workspace in ${path}`
        }]
      }
      const outside: ReadonlyArray<Located> = left
        ? [{
          file: path,
          line: lineOf(read.text, "extends"),
          message: `${path} extends ${base}, which is outside the repository: what the names its code imports mean depends on ${found}, which the repository does not hold`,
          hint: `move what ${found} sets into the repository, or extend a tsconfig.json it holds`
        }]
        : []
      inherited = {
        ...inherited,
        ...settings,
        unread: [...inherited.unread, ...settings.unread],
        outside: [...inherited.outside ?? [], ...settings.outside ?? [], ...outside]
      }
    }
    const directory = directoryOf(path)
    const placed = (value: string) => value.startsWith(configDirectory) ? { from: configDir, path: value.slice(configDirectory.length) } : { from: directory, path: value }
    const place = (value: string) => {
      const { from, path } = placed(value)
      return at.join(from, path)
    }
    // A setting of its own takes the place of the one inherited, and of what sdp could not read of that one.
    const overridden = (setting: string | undefined) => setting !== undefined && ((own as Record<string, unknown>)[setting] ?? (config as Record<string, unknown>)[setting]) !== undefined
    return {
      ...inherited,
      unread: [...inherited.unread.filter((each) => !overridden(each.setting)), ...unread, ...unfollowed],
      ...own.baseUrl === undefined ? {} : { baseUrl: place(own.baseUrl) },
      ...own.paths === undefined ? {} : { paths: { map: own.paths, from: directory } },
      ...own.customConditions === undefined ? {} : { customConditions: own.customConditions },
      ...own.module === undefined ? {} : { module: own.module.toLowerCase() },
      ...own.moduleResolution === undefined ? {} : { moduleResolution: own.moduleResolution.toLowerCase() },
      ...own.moduleSuffixes === undefined ? {} : { moduleSuffixes: own.moduleSuffixes },
      ...own.resolvePackageJsonExports === undefined ? {} : { resolvePackageJsonExports: own.resolvePackageJsonExports },
      ...own.resolvePackageJsonImports === undefined ? {} : { resolvePackageJsonImports: own.resolvePackageJsonImports },
      ...own.rootDir === undefined ? {} : { rootDir: place(own.rootDir) },
      ...own.outDir === undefined ? {} : { outDir: place(own.outDir) },
      ...config.files === undefined ? {} : { files: config.files.map(place) },
      ...config.include === undefined ? {} : { include: config.include.map(placed) },
      ...config.exclude === undefined ? {} : { exclude: config.exclude.map(placed) }
    }
  }
  /** What the tsconfig.json at `path` says, with what it extends, as the one the code is read with. */
  const settings = cache((path: string) => settingsOf(path, directoryOf(path), new Set()))

  /** Whether the tsconfig.json at `path` includes `file`, by its `files`, its `include` and its `exclude`. */
  const includes = (path: string, file: string): boolean => {
    const { exclude, files, include, outDir } = settings(path)
    if (files?.includes(file)) return true
    const patterns = include ?? (files === undefined ? [{ from: directoryOf(path), path: "**/*" }] : [])
    const excluded = exclude ?? [
      ...["node_modules", "bower_components", "jspm_packages"].map((name) => ({ from: directoryOf(path), path: name })),
      ...outDir === undefined ? [] : [{ from: "", path: outDir }]
    ]
    return patterns.some((pattern) => matches(pattern, file)) && !excluded.some((pattern) => matches(pattern, file))
  }
  const matches = ({ from, path }: Placed, file: string) => {
    const pattern = path.replace(/^(\.\/)+/, "")
    const last = pattern.slice(pattern.lastIndexOf("/") + 1)
    // A last segment without a wildcard or an extension is a directory, and means what is in it.
    return Glob.match(globs(/[*?]|\.[^.]+$/.test(last) ? pattern : `${pattern}/**/*`), at.relative(from, file))
  }

  /** The tsconfig.json a file is read with: the nearest, or the first it references, at any depth, that includes the file. */
  const projectOf = cache((file: string): string | undefined => {
    const nearest = at.upFrom(directoryOf(file))
      .flatMap((directory) => [at.join(directory, tsconfigFile), at.join(directory, jsconfigFile)])
      .find((path) => byPath.has(path))
    if (nearest === undefined) return undefined
    const seen = new Set<string>()
    const including = (path: string): string | undefined => {
      if (seen.has(path) || !byPath.has(path)) return undefined
      seen.add(path)
      if (includes(path, file)) return path
      const read = tsconfigs(path)
      const references = "value" in read ? read.value.references ?? [] : []
      return references.map((reference) => including(referencePath(at, path, reference.path))).find((found) => found !== undefined)
    }
    return including(nearest) ?? nearest
  })

  /**
   * The `imports` of the deno.json nearest a directory, at it or above it, by which Deno resolves
   * names, the directory they are from, and what sdp could not read of it or does not follow.
   */
  const importMapOf = cache((directory: string) => {
    const path = at.upFrom(directory).flatMap((above) => denoFiles.map((name) => at.join(above, name))).find((candidate) => byPath.has(candidate))
    if (path === undefined) return undefined
    const json = readJson(byPath.get(path)!)
    if ("error" in json || !isRecord(json.value)) {
      const line = "error" in json ? json.line : 1
      return { path, imports: {}, from: directoryOf(path), unread: [{ file: path, line, message: `${path} does not parse, so what it maps is not read`, hint: `fix the syntax of ${path}` }] }
    }
    const { read, unread } = fieldsOf(DenoJson, json.value)
    const located = (setting: string, message: string, hint: string): Unread => ({ file: path, line: lineOf(json.text, setting), setting, message, hint })
    return {
      path,
      imports: read.imports ?? {},
      from: directoryOf(path),
      unread: [
        ...unread.map((setting) => located(setting, `${path} sets ${setting} to a value of a type Deno does not read, so it is not read`, `correct ${setting} in ${path}`)),
        ...read.scopes === undefined ? [] : [located("scopes", `${path} maps names by scopes, which sdp does not follow`, `map them in the imports of ${path}`)],
        ...read.importMap === undefined ? [] : [located("importMap", `${path} names its import map in importMap, which sdp does not follow`, `move the map into the imports of ${path}`)],
        ...read.workspace === undefined ? [] : [located("workspace", `${path} lists the members of a Deno workspace, which sdp does not find by their names`, `map them in the imports of ${path}`)]
      ]
    }
  })

  /** What sdp does not follow of a package.json, where it is written: `typesVersions`, which TypeScript reads where it reads no `exports`. */
  const unfollowedOf = cache((path: string): ReadonlyArray<Unread> => {
    const read = manifests(path)
    return "value" in read && read.value.typesVersions !== undefined
      ? [{
        file: path,
        line: lineOf(read.text, "typesVersions"),
        setting: "typesVersions",
        message: `${path} maps names by typesVersions, which sdp does not follow`,
        hint: `map them by the exports of ${path}, which TypeScript reads before typesVersions`
      }]
      : []
  })

  return {
    at,
    has: (path: string) => byPath.has(path),
    importMapOf,
    unfollowedOf,
    settings,
    includes,
    projectOf,
    manifest,
    packages,
    /** The package.json nearest a directory, at it or above it. */
    scopeOf: (directory: string) => at.upFrom(directory).map((above) => at.join(above, packageFile)).find((path) => byPath.has(path))
  }
}

export type Configs = ReturnType<typeof readConfigs>

const Strings = Schema.Array(Schema.String)

/** What sdp reads of a tsconfig.json or a jsconfig.json, but its `compilerOptions`. */
const TsConfig = Schema.Struct({
  extends: Schema.optional(Schema.Union([Schema.String, Strings])),
  compilerOptions: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
  files: Schema.optional(Strings),
  include: Schema.optional(Strings),
  exclude: Schema.optional(Strings),
  references: Schema.optional(Schema.Array(Schema.Struct({ path: Schema.String })))
})

/** What sdp reads of the `compilerOptions` of a tsconfig.json. */
const CompilerOptions = Schema.Struct({
  baseUrl: Schema.optional(Schema.String),
  paths: Schema.optional(Schema.Record(Schema.String, Strings)),
  customConditions: Schema.optional(Strings),
  module: Schema.optional(Schema.String),
  moduleResolution: Schema.optional(Schema.String),
  moduleSuffixes: Schema.optional(Strings),
  rootDirs: Schema.optional(Strings),
  resolvePackageJsonExports: Schema.optional(Schema.Boolean),
  resolvePackageJsonImports: Schema.optional(Schema.Boolean),
  rootDir: Schema.optional(Schema.String),
  outDir: Schema.optional(Schema.String)
})

/**
 * A tsconfig.json as TypeScript reads it, setting by setting: each that reads, and the names of those
 * that do not, with its text as JSON reads it; or what kept it from being read at all, and the line where.
 */
const readTsConfig = (content: string): {
  readonly value: Omit<typeof TsConfig.Type, "compilerOptions"> & { readonly compilerOptions?: typeof CompilerOptions.Type }
  readonly unread: ReadonlyArray<string>
  readonly text: string
} | { readonly unread: string; readonly line: number } => {
  const read = readJson(content)
  if ("error" in read) return { unread: "does not parse", line: read.line }
  if (!isRecord(read.value)) return { unread: "holds no object", line: 1 }
  const top = fieldsOf(TsConfig, read.value)
  const options = fieldsOf(CompilerOptions, top.read.compilerOptions ?? {})
  return { value: { ...top.read, compilerOptions: options.read }, unread: [...top.unread, ...options.unread], text: read.text }
}

/** Each field of `schema` that `value` holds, decoded on its own, and the names of those that do not decode. */
const fieldsOf = <Fields extends Schema.Struct.Fields>(schema: Schema.Struct<Fields>, value: Readonly<Record<string, unknown>>) => {
  const read: Record<string, unknown> = {}
  const unread: Array<string> = []
  for (const [key, field] of Object.entries(schema.fields)) {
    if (value[key] === undefined) continue
    Option.match(Schema.decodeUnknownOption(field as Schema.Codec<unknown>)(value[key]), {
      onNone: () => unread.push(key),
      onSome: (decoded) => void (read[key] = decoded)
    })
  }
  return { read: read as Schema.Struct<Fields>["Type"], unread }
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === "object" && value !== null && !isArray(value)

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
const PackageJson = Schema.Struct({
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
  workspaces: Schema.optional(Schema.Union([Strings, Schema.Struct({ packages: Schema.optional(Strings) })]))
})
export type PackageJson = typeof PackageJson.Type

const PnpmWorkspace = Schema.Struct({ packages: Schema.optional(Strings) })

/** What sdp reads of a deno.json: its import map, and what else maps names, which it does not follow. */
const DenoJson = Schema.Struct({
  imports: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  scopes: Schema.optional(Schema.Unknown),
  importMap: Schema.optional(Schema.Unknown),
  workspace: Schema.optional(Schema.Unknown)
})

const decodePackageJson = Schema.decodeUnknownOption(PackageJson)

export const dependencyLists = (read: PackageJson): ReadonlyArray<{ readonly [name: string]: string }> =>
  [read.dependencies, read.devDependencies, read.peerDependencies, read.optionalDependencies].filter((list) => list !== undefined)

/** A package.json as `decode` reads it, with its text as JSON reads it, or that it does not read. */
const readConfig = <A>(content: string, decode: (input: unknown) => Option.Option<A>): { readonly value: A; readonly text: string } | { readonly unread: string } => {
  const read = readJson(content)
  if ("error" in read) return { unread: "does not parse" }
  return Option.match(decode(read.value), { onNone: () => ({ unread: "holds a field of a type sdp does not read" }), onSome: (value) => ({ value, text: read.text }) })
}

/** The line of the first `"key":` in JSON as `readJson` reads it, whose lines are those of the file; the first line when there is none. */
const lineOf = (text: string, key: string): number => {
  const at = text.search(new RegExp(`"${key}"\\s*:`))
  return at < 0 ? 1 : text.slice(0, at).split("\n").length
}

/** The packages of the workspace by name — each package.json outside a node_modules that names one — with the dependencies they declare, and those that do not parse. */
const packagesOf = (files: ReadonlyArray<File>) => {
  const named = new Map<string, Array<string>>()
  const declared = new Set<string>()
  const unread: Array<string> = []
  for (const file of files) {
    if (baseName(file.path) !== packageFile || file.path.split("/").includes("node_modules")) continue
    const read = readConfig(file.content, decodePackageJson)
    if (!("value" in read)) {
      unread.push(file.path)
      continue
    }
    const { name } = read.value
    if (name !== undefined) named.set(name, [...named.get(name) ?? [], directoryOf(file.path)])
    for (const dependencies of dependencyLists(read.value)) for (const dependency of Object.keys(dependencies)) declared.add(dependency)
  }
  return { named, declared, unread } as const
}

const workspacesOf = (content: string): ReadonlyArray<string> => {
  const read = readConfig(content, decodePackageJson)
  const workspaces = "value" in read ? read.value.workspaces : undefined
  return workspaces === undefined ? [] : isArray(workspaces) ? workspaces : workspaces.packages ?? []
}

const pnpmPackagesOf = (content: string): ReadonlyArray<string> => {
  try {
    return Option.match(Schema.decodeUnknownOption(PnpmWorkspace)(parseYaml(content) ?? {}), { onNone: () => [], onSome: (read) => read.packages ?? [] })
  } catch {
    return []
  }
}

/** Where a tsconfig.json at `config` may find what it extends as `base`: the path from its directory, the package of the workspace it names, or a package installed in a node_modules at or above it. */
const extendsCandidates = (at: Paths, packages: ReturnType<typeof packagesOf>, config: string, base: string): ReadonlyArray<string> => {
  const json = (path: string) => path.endsWith(".json") ? [path] : [path, `${path}.json`]
  if (/^\.\.?(\/|$)/.test(base)) return json(at.join(directoryOf(config), base))
  const { name, subpath } = packageName(base)
  const inPackage = (directory: string) => subpath === "" ? [at.join(directory, tsconfigFile)] : json(at.join(directory, subpath))
  return [
    ...(packages.named.get(name) ?? []).flatMap(inPackage),
    ...at.upFrom(directoryOf(config)).flatMap((directory) => inPackage(at.join(directory, "node_modules", name)))
  ]
}

/** The tsconfig.json a reference names: the file, or the tsconfig.json of the directory. */
const referencePath = (at: Paths, config: string, reference: string) => {
  const path = at.join(directoryOf(config), reference)
  return path.endsWith(".json") ? path : at.join(path, tsconfigFile)
}

/** Whether a file read is a tsconfig.json, a jsconfig.json, or one they extend or reference: any JSON but a package.json or a deno.json. */
const isProject = (path: string) => path.endsWith(".json") && baseName(path) !== packageFile && !denoFiles.includes(baseName(path))

/** A package's name and the path after it: `@shop/mailer` and `templates` in `@shop/mailer/templates`. */
export const packageName = (specifier: string): { readonly name: string; readonly subpath: string } => {
  const parts = specifier.split("/")
  const length = specifier.startsWith("@") ? 2 : 1
  return { name: parts.slice(0, length).join("/"), subpath: parts.slice(length).join("/") }
}

/**
 * JSON as tsconfig.json allows it, with comments and trailing commas, and the text JSON reads of it,
 * line for line the file's; or why it does not parse, and the line where.
 */
const readJson = (text: string): { readonly value: unknown; readonly text: string } | { readonly error: string; readonly line: number } => {
  const stringEnd = (from: number) => {
    let at = from + 1
    while (at < text.length && text[at] !== "\"") at += text[at] === "\\" ? 2 : 1
    return at + 1
  }
  const trailing = /,(?=\s*(?:\/\/[^\n]*\n\s*|\/\*[\s\S]*?\*\/\s*)*[}\]])/y
  let json = ""
  for (let at = 0; at < text.length; at++) {
    trailing.lastIndex = at
    if (text[at] === "\"") {
      const end = stringEnd(at)
      json += text.slice(at, end)
      at = end - 1
    } else if (text.startsWith("//", at)) {
      at = text.indexOf("\n", at) < 0 ? text.length : text.indexOf("\n", at) - 1
    } else if (text.startsWith("/*", at)) {
      const end = text.indexOf("*/", at + 2) < 0 ? text.length : text.indexOf("*/", at + 2) + 2
      json += "\n".repeat(text.slice(at, end).split("\n").length - 1)
      at = end - 1
    } else if (!trailing.test(text)) json += text[at]
  }
  try {
    return { value: JSON.parse(json), text: json }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { error: message, line: Number(/\(line (\d+) column \d+\)/.exec(message)?.[1] ?? 1) }
  }
}

export type Paths = ReturnType<typeof pathsFrom>

/**
 * Paths from the workspace's root, `root` being its absolute path: plain, `""` for the root itself
 * and `../` for each directory above it, so that one that leaves the root and comes back into it is
 * from the root again (`../shop/src` from `/work/shop` is `src`). `top`, the repository's top as such
 * a path, is where looking up from a directory ends.
 */
const pathsFrom = (root: string, top: string) => {
  const rootParts = root.split(/[\\/]/).filter((part) => part !== "")
  const join = (...parts: ReadonlyArray<string>): string => {
    const plain: Array<string> = []
    for (const part of parts.join("/").split("/")) {
      if (part === "" || part === ".") continue
      if (part !== "..") plain.push(part)
      else if (plain.length > 0 && plain.at(-1) !== "..") plain.pop()
      // Above the filesystem's root is the filesystem's root.
      else if (plain.length < rootParts.length) plain.push("..")
    }
    let up = 0
    while (plain[up] === "..") up++
    while (up > 0 && plain[up] === rootParts[rootParts.length - up]) plain.splice(--up, 2)
    return plain.join("/")
  }
  /** The directory above one, up to the filesystem's root. */
  const parentOf = (directory: string): string | undefined => {
    if (directory === "") return rootParts.length > 0 ? ".." : undefined
    const parts = directory.split("/")
    if (parts.every((part) => part === "..")) return parts.length < rootParts.length ? `${directory}/..` : undefined
    return parts.slice(0, -1).join("/")
  }
  /** A directory and each one above it, to the repository's top — or, from outside it, to the filesystem's root. */
  const upFrom = (directory: string): ReadonlyArray<string> => {
    const all = [directory]
    for (let above = parentOf(directory); above !== undefined && all.at(-1) !== top; above = parentOf(above)) all.push(above)
    return all
  }
  /** Whether a path is in the repository: no more directories above the root than its top. */
  const ups = (path: string) => path.split("/").findIndex((part) => part !== "..")
  const within = (path: string) => (ups(path) < 0 ? path.split("/").length : ups(path)) <= (top === "" ? 0 : top.split("/").length)
  /** A path from the directory `from` rather than from the root. */
  const relative = (from: string, path: string): string => {
    const absolute = (of: string) => join(of).split("/").filter((part) => part !== "").reduce<Array<string>>(
      (parts, part) => part === ".." ? parts.slice(0, -1) : [...parts, part],
      [...rootParts]
    )
    const [base, target] = [absolute(from), absolute(path)]
    let common = 0
    while (common < base.length && base[common] === target[common]) common++
    return [...base.slice(common).map(() => ".."), ...target.slice(common)].join("/")
  }
  return { join, upFrom, within, relative }
}

export const directoryOf = (file: string) => file.slice(0, Math.max(0, file.lastIndexOf("/")))

export const baseName = (path: string) => path.slice(path.lastIndexOf("/") + 1)

export const isArray = (value: unknown): value is ReadonlyArray<any> => Array.isArray(value)

/** `compute`, remembering each answer by its key. */
export const cache = <A>(compute: (key: string) => A) => {
  const known = new Map<string, A>()
  return (key: string): A => {
    if (known.has(key)) return known.get(key)!
    const value = compute(key)
    known.set(key, value)
    return value
  }
}
