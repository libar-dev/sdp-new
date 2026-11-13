/**
 * The files that say what the names code imports mean, as read: the tsconfig.json — or
 * jsconfig.json — each file of code is read with, with what it extends and references, and the
 * package.json and pnpm-workspace.yaml files around the code. Nothing is installed or run.
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

/** The files that say what the names code imports mean, and the workspace's root as an absolute path, which their paths start from. */
export interface ModuleConfigs {
  readonly root: string
  readonly files: ReadonlyArray<File>
}

export const tsconfigFile = "tsconfig.json"
const jsconfigFile = "jsconfig.json"
export const packageFile = "package.json"
const pnpmWorkspaceFile = "pnpm-workspace.yaml"

/**
 * The files that may say what the names code imports mean: the tsconfig.json, jsconfig.json,
 * package.json and pnpm-workspace.yaml of each directory that holds code and of every one above it,
 * past the workspace's root to the filesystem's, as TypeScript and package managers look for them.
 * What these name in turn is `namedBy` and `listedPackages`.
 */
export const moduleConfigFiles = (root: string, code: ReadonlyArray<string>): ReadonlyArray<string> => {
  const at = pathsFrom(root)
  const directories = new Set(code.flatMap((file) => at.upFrom(directoryOf(file))))
  return [...directories].flatMap((directory) =>
    [tsconfigFile, jsconfigFile, packageFile, pnpmWorkspaceFile].map((name) => at.join(directory, name))
  )
}

/** Where each tsconfig.json or jsconfig.json that `files` holds may find what it extends, nearest first, and what it references. */
export const namedBy = (root: string, files: ReadonlyArray<File>): ReadonlyArray<string> => {
  const at = pathsFrom(root)
  const packages = packagesOf(files)
  return files.flatMap((file) => {
    if (!isProject(file.path)) return []
    const read = readConfig(file.content, decodeTsConfig)
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
export const pathFrom = (root: string, ...parts: ReadonlyArray<string>): string => pathsFrom(root).join(...parts)

/** A path of a tsconfig.json from the directory it is relative to: its own, or the `${configDir}` of the one the code is read with. */
export interface Placed {
  readonly from: string
  readonly path: string
}

/** What a tsconfig.json, with what it extends, says of names, and what sdp could not read of it, each as what follows "which". */
export interface Settings {
  readonly configDir?: string
  readonly baseUrl?: string
  readonly paths?: { readonly map: { readonly [name: string]: ReadonlyArray<string> }; readonly from: string }
  readonly customConditions?: ReadonlyArray<string>
  readonly module?: string
  readonly moduleResolution?: string
  readonly moduleSuffixes?: ReadonlyArray<string>
  readonly rootDir?: string
  readonly outDir?: string
  readonly files?: ReadonlyArray<string>
  readonly include?: ReadonlyArray<Placed>
  readonly exclude?: ReadonlyArray<Placed>
  readonly unread: ReadonlyArray<string>
}

/** `${configDir}`, which a path of a tsconfig.json starts with to be from the directory of the one the code is read with. */
export const configDirectory = "${configDir}"

/**
 * The configuration files read, as they answer the questions resolving a name asks: what a
 * tsconfig.json says with what it extends, which one a file of code is read with, what a package.json
 * says, and which packages the workspace has.
 */
export const readConfigs = (configs: ModuleConfigs) => {
  const at = pathsFrom(configs.root)
  const byPath = new Map(configs.files.map((file) => [file.path, file.content]))
  const packages = packagesOf(configs.files)
  const tsconfigs = cache((path: string) => readConfig(byPath.get(path) ?? "{}", decodeTsConfig))
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
    if (!("value" in read)) return { unread: [read.unread] }
    const config = read.value
    let inherited: Settings = { unread: [] }
    for (const base of [config.extends ?? []].flat()) {
      const found = extendsCandidates(at, packages, path, base).find((candidate) => byPath.has(candidate))
      const settings = found === undefined ? undefined : settingsOf(found, configDir, new Set([...seen, path]))
      const unread = settings === undefined
        ? [`extends ${base}, neither in the workspace nor installed`]
        : settings.unread.map((why) => `extends ${base}, which ${why}`)
      inherited = { ...inherited, ...settings, unread: [...inherited.unread, ...unread] }
    }
    const directory = directoryOf(path)
    const placed = (value: string) => value.startsWith(configDirectory) ? { from: configDir, path: value.slice(configDirectory.length) } : { from: directory, path: value }
    const place = (value: string) => {
      const { from, path } = placed(value)
      return at.join(from, path)
    }
    const own = config.compilerOptions ?? {}
    return {
      ...inherited,
      ...own.baseUrl === undefined ? {} : { baseUrl: place(own.baseUrl) },
      ...own.paths === undefined ? {} : { paths: { map: own.paths, from: directory } },
      ...own.customConditions === undefined ? {} : { customConditions: own.customConditions },
      ...own.module === undefined ? {} : { module: own.module.toLowerCase() },
      ...own.moduleResolution === undefined ? {} : { moduleResolution: own.moduleResolution.toLowerCase() },
      ...own.moduleSuffixes === undefined ? {} : { moduleSuffixes: own.moduleSuffixes },
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

  return {
    at,
    has: (path: string) => byPath.has(path),
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

/** What sdp reads of a tsconfig.json or a jsconfig.json. */
const TsConfig = Schema.Struct({
  extends: Schema.optional(Schema.Union([Schema.String, Strings])),
  compilerOptions: Schema.optional(Schema.Struct({
    baseUrl: Schema.optional(Schema.String),
    paths: Schema.optional(Schema.Record(Schema.String, Strings)),
    customConditions: Schema.optional(Strings),
    module: Schema.optional(Schema.String),
    moduleResolution: Schema.optional(Schema.String),
    moduleSuffixes: Schema.optional(Strings),
    rootDir: Schema.optional(Schema.String),
    outDir: Schema.optional(Schema.String)
  })),
  files: Schema.optional(Strings),
  include: Schema.optional(Strings),
  exclude: Schema.optional(Strings),
  references: Schema.optional(Schema.Array(Schema.Struct({ path: Schema.String })))
})

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
  dependencies: Schema.optional(Dependencies),
  devDependencies: Schema.optional(Dependencies),
  peerDependencies: Schema.optional(Dependencies),
  optionalDependencies: Schema.optional(Dependencies),
  workspaces: Schema.optional(Schema.Union([Strings, Schema.Struct({ packages: Schema.optional(Strings) })]))
})
export type PackageJson = typeof PackageJson.Type

const PnpmWorkspace = Schema.Struct({ packages: Schema.optional(Strings) })

const decodeTsConfig = Schema.decodeUnknownOption(TsConfig)
const decodePackageJson = Schema.decodeUnknownOption(PackageJson)

export const dependencyLists = (read: PackageJson): ReadonlyArray<{ readonly [name: string]: string }> =>
  [read.dependencies, read.devDependencies, read.peerDependencies, read.optionalDependencies].filter((list) => list !== undefined)

/** A tsconfig.json or package.json as `decode` reads it, or what kept sdp from reading it, as what follows "which". */
const readConfig = <A>(content: string, decode: (input: unknown) => Option.Option<A>): { readonly value: A } | { readonly unread: string } => {
  const read = readJson(content)
  if ("error" in read) return { unread: "does not parse" }
  return Option.match(decode(read.value), {
    onNone: () => ({ unread: "holds a setting of a type TypeScript does not read" }),
    onSome: (value) => ({ value })
  })
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

/** Whether a file read is a tsconfig.json, a jsconfig.json, or one they extend or reference: any JSON but a package.json. */
const isProject = (path: string) => path.endsWith(".json") && baseName(path) !== packageFile

/** A package's name and the path after it: `@shop/mailer` and `templates` in `@shop/mailer/templates`. */
export const packageName = (specifier: string): { readonly name: string; readonly subpath: string } => {
  const parts = specifier.split("/")
  const length = specifier.startsWith("@") ? 2 : 1
  return { name: parts.slice(0, length).join("/"), subpath: parts.slice(length).join("/") }
}

/** JSON as tsconfig.json allows it, with comments and trailing commas, or why it does not parse. */
const readJson = (text: string): { readonly value: unknown } | { readonly error: string } => {
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
      at = text.indexOf("*/", at + 2) < 0 ? text.length : text.indexOf("*/", at + 2) + 1
    } else if (!trailing.test(text)) json += text[at]
  }
  try {
    return { value: JSON.parse(json) }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}

export type Paths = ReturnType<typeof pathsFrom>

/**
 * Paths from the workspace's root, `root` being its absolute path: plain, `""` for the root itself
 * and `../` for each directory above it, so that one that leaves the root and comes back into it is
 * from the root again (`../shop/src` from `/work/shop` is `src`).
 */
const pathsFrom = (root: string) => {
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
  /** A directory and each one above it, to the filesystem's root. */
  const upFrom = (directory: string): ReadonlyArray<string> => {
    const all = [directory]
    for (let above = parentOf(directory); above !== undefined; above = parentOf(above)) all.push(above)
    return all
  }
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
  return { join, upFrom, relative }
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
