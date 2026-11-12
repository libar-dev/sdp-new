/**
 * What the names code imports mean: the code file of the workspace TypeScript resolves each name to,
 * read from the tsconfig.json, package.json and pnpm-workspace.yaml files around the code, without
 * installing or running anything. A name sdp cannot follow, though it could name the workspace's
 * code, comes back with why.
 *
 * @sdp is ARCH-code-annotations
 */
import { Option, Predicate, Schema } from "effect"
import { isBuiltin } from "node:module"
import { parse as parseYaml } from "yaml"
import { type Export, type Exports, type Import, parseScript } from "./Script.ts"

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

/** Why sdp could not follow a name that could name the workspace's code. */
export interface Unresolved {
  readonly message: string
  readonly hint: string
}

/** What an import means: the code file of the workspace, if any, and what sdp could not follow. */
export interface Resolved {
  readonly module?: string | undefined
  readonly unresolved?: Unresolved | undefined
}

export interface Modules {
  /** What `imported`, written in the code file `file`, means. */
  readonly resolve: (file: string, imported: Import) => Resolved
  /** Whether importing `names` from the code file `module` loads its code: whether one of them is more than a type. */
  readonly loadsCode: (module: string, names: ReadonlyArray<string>) => boolean
}

const tsconfigFile = "tsconfig.json"
const packageFile = "package.json"
const pnpmWorkspaceFile = "pnpm-workspace.yaml"

/**
 * The files that may say what the names code imports mean: the tsconfig.json, package.json and
 * pnpm-workspace.yaml of each directory that holds code and of every one above it, past the
 * workspace's root to the filesystem's, as TypeScript and package managers look for them. What
 * these name in turn is `namedBy` and `listedPackages`.
 */
export const moduleConfigFiles = (root: string, code: ReadonlyArray<string>): ReadonlyArray<string> => {
  const at = pathsFrom(root)
  const directories = new Set(code.flatMap((file) => at.upFrom(directoryOf(file))))
  return [...directories].flatMap((directory) => [tsconfigFile, packageFile, pnpmWorkspaceFile].map((name) => at.join(directory, name)))
}

/** Where each tsconfig.json that `files` holds may find what it extends, nearest first. */
export const namedBy = (root: string, files: ReadonlyArray<File>): ReadonlyArray<string> => {
  const at = pathsFrom(root)
  const packages = packagesOf(files)
  return files.flatMap((file) => {
    if (!isProject(file.path)) return []
    const read = readConfig(file.content, decodeTsConfig)
    if (!("value" in read)) return []
    return [read.value.extends ?? []].flat().flatMap((base) => extendsCandidates(at, packages, file.path, base))
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

/**
 * What the names code imports mean, as TypeScript resolves them with the tsconfig.json nearest the
 * code and the package.json files of the workspace:
 *
 * - a relative name, the file it names;
 * - any other, the file the `paths` of that tsconfig.json map it to — what it extends included —
 *   or the file it names under `baseUrl`, which TypeScript read until version 7;
 * - a `#` name, the file the `imports` of the nearest package.json map it to;
 * - a package of the workspace — one whose package.json sdp reads, by the name it gives, or by the
 *   alias a package.json declares for it — the file its `exports` map the name to, else its
 *   `types` or `main`, else its index;
 * - a library a package.json declares, a module of Node.js, a name with a scheme (`node:`,
 *   `virtual:`) or a file that is not code, no code of the workspace.
 *
 * `exports` and `imports` are walked in their order under the conditions TypeScript 7 resolves the
 * import by: `import` or `require` as the import is written and the file is compiled, `types`,
 * `node` for Node.js, the tsconfig.json's `customConditions`, and `default`. Any other name is not
 * followed, and reported. So is a name whose answer depends on what sdp could not read of the
 * tsconfig.json: a file that does not parse, or one it extends that is neither in the workspace nor
 * installed.
 */
export const readModules = (configs: ModuleConfigs, code: ReadonlyArray<File>, exported: ReadonlyMap<string, Exports>): Modules => {
  const at = pathsFrom(configs.root)
  const byPath = new Map(configs.files.map((file) => [file.path, file.content]))
  const contents = new Map(code.map((file) => [file.path, file.content]))
  const packages = packagesOf(configs.files)

  const tsconfigs = cache((path: string) => readConfig(byPath.get(path) ?? "{}", decodeTsConfig))
  const manifests = cache((path: string) => readConfig(byPath.get(path) ?? "{}", decodePackageJson))
  const manifest = (path: string) => {
    const read = manifests(path)
    return "value" in read ? read.value : undefined
  }

  /** The code file a path names, as TypeScript completes a name: the file, or else the directory's index. */
  const fileAt = (path: string, directory: boolean): string | undefined => {
    const indexes = addedExtensions.map((extension) => at.join(path, `index${extension}`))
    if (directory) return indexes.find((candidate) => contents.has(candidate))
    const written = /\.[^./]*$/.exec(path)?.[0]
    const stem = path.slice(0, path.length - (written?.length ?? 0))
    const candidates = [
      ...written === undefined ? [] : swappedExtensions.get(written)?.map((extension) => `${stem}${extension}`) ?? [path],
      ...addedExtensions.map((extension) => `${path}${extension}`),
      ...indexes
    ]
    return candidates.find((candidate) => contents.has(candidate))
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
    const place = (value: string) => value.startsWith(configDirectory) ? at.join(configDir, value.slice(configDirectory.length)) : at.join(directory, value)
    const own = config.compilerOptions ?? {}
    return {
      ...inherited,
      ...own.baseUrl === undefined ? {} : { baseUrl: place(own.baseUrl) },
      ...own.paths === undefined ? {} : { paths: { map: own.paths, from: directory } },
      ...own.customConditions === undefined ? {} : { customConditions: own.customConditions },
      ...own.module === undefined ? {} : { module: own.module.toLowerCase() },
      ...own.moduleResolution === undefined ? {} : { moduleResolution: own.moduleResolution.toLowerCase() }
    }
  }
  const settings = cache((path: string) => settingsOf(path, directoryOf(path), new Set()))

  /** The tsconfig.json a file is read with: the nearest. */
  const projectOf = (file: string): string | undefined =>
    at.upFrom(directoryOf(file)).map((directory) => at.join(directory, tsconfigFile)).find((path) => byPath.has(path))

  /** The package.json nearest a directory, at it or above it. */
  const scopeOf = (directory: string) => at.upFrom(directory).map((above) => at.join(above, packageFile)).find((path) => byPath.has(path))

  /** The conditions `imported` is resolved under in `file`, read with `options`, besides `default`. */
  const conditionsOf = (file: string, imported: Import, options: Settings): ReadonlySet<string> => {
    const node = options.moduleResolution === "node16" || options.moduleResolution === "nodenext" ||
      (options.moduleResolution !== "bundler" && /^node(16|18|20|next)$/.test(options.module ?? ""))
    const module = /\.m[jt]sx?$/.test(file)
      ? true
      : /\.c[jt]sx?$/.test(file)
      ? false
      : node
      ? manifest(scopeOf(directoryOf(file)) ?? packageFile)?.type === "module"
      : options.module !== "commonjs"
    const syntax = imported.kind === "require" ? "require" : (imported.kind === "dynamic" && node) || module ? "import" : "require"
    return new Set([syntax, "types", ...node ? ["node"] : [], ...options.customConditions ?? []])
  }

  /**
   * What a map of names — `exports`, `imports` — gives under `conditions`: the first target, in the
   * order written, that `take` finds, or undefined. It notes in `trail` the conditions it passed
   * over, and whether a condition other than `types` and `default`, which always hold, decided the
   * answer.
   */
  const pick = (value: Target, star: string, conditions: ReadonlySet<string>, take: (target: string) => Outcome | undefined, trail: Trail): Outcome | undefined => {
    if (value === null) return undefined
    if (typeof value === "string") return take(value.replaceAll("*", star))
    if (isArray(value)) {
      for (const each of value) {
        const found = pick(each, star, conditions, take, trail)
        if (found !== undefined) return found
      }
      return undefined
    }
    for (const [condition, target] of Object.entries(value)) {
      if (condition !== "types" && condition !== "default") trail.decided = true
      if (condition !== "default" && !conditions.has(condition)) {
        trail.passed.push(condition)
        continue
      }
      const found = pick(target, star, conditions, take, trail)
      if (found !== undefined) return found
    }
    return undefined
  }

  /** What a target of a package's map of names means; undefined for a file that is not there. */
  const entry = (directory: string, target: string): Outcome | undefined => {
    const path = at.join(directory, target)
    const found = fileAt(path, false)
    if (found !== undefined) return { module: found }
    return namesNoCode(path) ? {} : undefined
  }

  /** What a map of names that gave nothing means: nothing it maps, or what is mapped only under conditions that do not hold. */
  const missed = (specifier: string, path: string, trail: Trail): Outcome =>
    trail.passed.length === 0 ? {} : {
      unresolved: {
        message: `"${specifier}" is mapped by ${path} only under the conditions ${[...new Set(trail.passed)].join(", ")}, which do not hold for it, so it is not resolved`,
        hint: `add a "default" condition to ${path}, or name the condition in the customConditions of the tsconfig.json`
      }
    }

  /** What `specifier` means as a package of the workspace, in `directory`, by its subpath. */
  const packageExport = (directory: string, specifier: string, subpath: string, conditions: ReadonlySet<string>, trail: Trail): Outcome => {
    const path = at.join(directory, packageFile)
    const { exports, main, types, typings } = manifest(path) ?? {}
    if (exports !== undefined) {
      const map = !isArray(exports) && typeof exports === "object" && exports !== null && Object.keys(exports).some((key) => key.startsWith("."))
        ? exports
        : { ".": exports }
      const key = matchKey(Object.keys(map), subpath === "" ? "." : `./${subpath}`)
      const take = (target: string) => entry(directory, target)
      return (key === undefined ? undefined : pick(map[key.key]!, key.star, conditions, take, trail)) ?? missed(specifier, path, trail)
    }
    if (subpath !== "") return { module: fileAt(at.join(directory, subpath), false) }
    const named = [types, typings, main].find(Predicate.isString)
    return { module: named === undefined ? fileAt(directory, true) : fileAt(at.join(directory, named), false) }
  }

  /** What a name that is neither relative nor `#` means as a package: of the workspace, a library, or neither. */
  const packageOf = (file: string, specifier: string, conditions: ReadonlySet<string>, trail: Trail): Outcome | undefined => {
    if (isBuiltin(specifier) || /^[a-z][a-z0-9+.-]*:/i.test(specifier)) return {}
    const { name, subpath } = packageName(specifier)
    const linked = aliasOf(file, name) ?? name
    const directories = packages.named.get(linked) ?? []
    if (directories.length > 1) {
      return {
        unresolved: {
          message: `"${specifier}" names ${directories.length} packages of the workspace, in ${directories.map((directory) => directory || ".").join(" and ")}, so it is not resolved`,
          hint: "give each package of the workspace a name of its own"
        }
      }
    }
    if (directories.length === 1) return packageExport(directories[0]!, specifier, subpath, conditions, trail)
    if (packages.declared.has(linked) || packages.declared.has(typesPackage(linked)) || namesNoCode(subpath)) return {}
    return undefined
  }

  /** The package a dependency of the package.json files at or above `file` names under another name (`"tax": "npm:@shop/tax@1"`). */
  const aliasOf = (file: string, name: string): string | undefined => {
    for (const directory of at.upFrom(directoryOf(file))) {
      const read = byPath.has(at.join(directory, packageFile)) ? manifest(at.join(directory, packageFile)) : undefined
      for (const dependencies of read === undefined ? [] : dependencyLists(read)) {
        const linked = aliasPattern.exec(dependencies[name] ?? "")?.[1]
        if (linked !== undefined) return linked
      }
    }
    return undefined
  }

  /** What a `#` name means by the `imports` of the package.json nearest `file`. */
  const packageImport = (file: string, specifier: string, conditions: ReadonlySet<string>, trail: Trail): Outcome => {
    const scope = scopeOf(directoryOf(file))
    const imports = scope === undefined ? undefined : manifest(scope)?.imports
    const key = imports === undefined ? undefined : matchKey(Object.keys(imports), specifier)
    if (scope === undefined || imports === undefined || key === undefined) {
      return {
        unresolved: {
          message: `"${specifier}" is not mapped by the imports of ${scope ?? "a package.json at or above it"}, so it is not resolved`,
          hint: `map it in the imports of ${scope ?? "a package.json"}`
        }
      }
    }
    const take = (target: string): Outcome | undefined =>
      /^\.\.?\//.test(target) ? entry(directoryOf(scope), target) : packageOf(file, target, conditions, trail) ?? {}
    return pick(imports[key.key]!, key.star, conditions, take, trail) ?? missed(specifier, scope, trail)
  }

  /** What a name that is not relative means in `file`, read with `options`. */
  const meaningOf = (file: string, imported: Import, options: Settings, project: string | undefined, trail: Trail): Outcome => {
    const { specifier } = imported
    const conditions = conditionsOf(file, imported, options)
    let mappedTo: string | undefined
    const key = options.paths === undefined ? undefined : matchKey(Object.keys(options.paths.map), specifier)
    for (const target of key === undefined ? [] : options.paths!.map[key.key]!) {
      const path = target.startsWith(configDirectory)
        ? at.join(options.configDir!, target.slice(configDirectory.length).replace("*", key!.star))
        : at.join(options.baseUrl ?? options.paths!.from, target.replace("*", key!.star))
      const found = fileAt(path, false)
      if (found !== undefined) return { module: found }
      if (namesNoCode(path)) return {}
      mappedTo ??= path
    }
    const under = options.baseUrl === undefined ? undefined : fileAt(at.join(options.baseUrl, specifier), false)
    if (under !== undefined) return { module: under }
    if (specifier.startsWith("#")) return packageImport(file, specifier, conditions, trail)
    const found = packageOf(file, specifier, conditions, trail)
    if (found !== undefined) return found
    const { name } = packageName(specifier)
    const unread = packages.unread.map((path) => `; ${path} does not parse, and could declare it`).join("")
    return {
      unresolved: mappedTo !== undefined
        ? {
          message: `"${specifier}" is mapped by the paths of ${project} to ${mappedTo}, which is no code file, and is neither a package of the workspace nor a dependency a package.json declares, so it is not resolved${unread}`,
          hint: `map it to a code file in the paths of ${project}`
        }
        : {
          message: `"${specifier}" is neither a package of the workspace nor a dependency a package.json declares, so it is not resolved${unread}`,
          hint: `declare ${name} in the dependencies of package.json, or map it in the paths of a tsconfig.json`
        }
    }
  }

  const resolve = (file: string, imported: Import): Resolved => {
    const { specifier } = imported
    if (/^\.\.?(\/|$)/.test(specifier)) return { module: fileAt(at.join(directoryOf(file), specifier), /(^|\/)\.{0,2}$/.test(specifier)) }
    const project = projectOf(file)
    const options: Settings = project === undefined ? { unread: [] } : { ...settings(project), configDir: directoryOf(project) }
    const trail: Trail = { passed: [], decided: false }
    const { module, unresolved } = meaningOf(file, imported, options, project, trail)
    if (options.unread.length === 0 || (unresolved === undefined && !trail.decided)) return { module, unresolved }
    const unread = options.unread.join(", and ")
    return {
      module,
      unresolved: unresolved === undefined
        ? {
          message: `how "${specifier}" is resolved depends on the conditions of ${project}, which ${unread}`,
          hint: `make ${project} and what it extends readable: fix its syntax, and install or correct what it extends`
        }
        : { message: `${unresolved.message}; ${project} could map it, but it ${unread}`, hint: unresolved.hint }
    }
  }

  /** What a code file exports: as already read, or else as it parses. */
  const exportsOf = cache((file: string): Exports | undefined => {
    if (exported.has(file)) return exported.get(file)
    const script = parseScript(file, contents.get(file) ?? "")
    return script === undefined || script.error !== undefined ? undefined : script.exports()
  })
  /** Whether `module` exports `name` as a type alone, following what it passes on from other modules; undefined when it does not say. */
  const typeOnly = (module: string, name: string, seen: Set<string>): boolean | undefined => {
    const key = `${module}\u0000${name}`
    const table = seen.has(key) ? undefined : exportsOf(module)
    seen.add(key)
    if (table === undefined) return undefined
    /** What the module `from` names, as `module` imports it, exports `exported` as; undefined when it is no code file of the workspace or does not say. */
    const through = (from: string, exported: string) => {
      const target = resolve(module, { specifier: from, line: 0, kind: "static" }).module
      return target === undefined ? undefined : typeOnly(target, exported, seen)
    }
    const found: Export | undefined = table.named.get(name)
    if (found !== undefined) return "type" in found ? found.type : through(found.from, found.name) ?? false
    if (name === "default") return undefined
    for (const { from, type } of table.all) {
      const answer = through(from, name)
      if (answer !== undefined) return type || answer
    }
    return undefined
  }

  return {
    resolve,
    loadsCode: (module, names) => names.length === 0 || names.some((name) => typeOnly(module, name, new Set()) !== true)
  }
}

/** What an import means, before what sdp could not read of the tsconfig.json is weighed. */
type Outcome = Resolved

/** What walking a map of names noted. */
interface Trail {
  readonly passed: Array<string>
  decided: boolean
}

/** What a tsconfig.json, with what it extends, says of names, and what sdp could not read of it, each as what follows "which". */
interface Settings {
  readonly configDir?: string
  readonly baseUrl?: string
  readonly paths?: { readonly map: { readonly [name: string]: ReadonlyArray<string> }; readonly from: string }
  readonly customConditions?: ReadonlyArray<string>
  readonly module?: string
  readonly moduleResolution?: string
  readonly unread: ReadonlyArray<string>
}

const configDirectory = "${configDir}"

const Strings = Schema.Array(Schema.String)

/** What sdp reads of a tsconfig.json. */
const TsConfig = Schema.Struct({
  extends: Schema.optional(Schema.Union([Schema.String, Strings])),
  compilerOptions: Schema.optional(Schema.Struct({
    baseUrl: Schema.optional(Schema.String),
    paths: Schema.optional(Schema.Record(Schema.String, Strings)),
    customConditions: Schema.optional(Strings),
    module: Schema.optional(Schema.String),
    moduleResolution: Schema.optional(Schema.String)
  }))
})

/** A target of `exports` or `imports`: a path, conditions that each map to one, fallbacks, or `null`, which excludes the name. */
type Target = string | null | ReadonlyArray<Target> | { readonly [condition: string]: Target }
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

const PnpmWorkspace = Schema.Struct({ packages: Schema.optional(Strings) })

const decodeTsConfig = Schema.decodeUnknownOption(TsConfig)
const decodePackageJson = Schema.decodeUnknownOption(PackageJson)

const dependencyLists = (read: typeof PackageJson.Type): ReadonlyArray<{ readonly [name: string]: string }> =>
  [read.dependencies, read.devDependencies, read.peerDependencies, read.optionalDependencies].filter((list) => list !== undefined)

/** A dependency declared as another package, by npm or by the workspace: `npm:@shop/tax@1.0.0`, `workspace:@shop/tax@*`. */
const aliasPattern = /^(?:npm|workspace):((?:@[a-z0-9~-][a-z0-9._~-]*\/)?[a-z0-9~-][a-z0-9._~-]*)(?:@|$)/i

/** The package of TypeScript declarations that declares a library's types: `@types/node-fetch`, `@types/babel__core`. */
const typesPackage = (name: string) => `@types/${name.startsWith("@") ? name.slice(1).replace("/", "__") : name}`

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

/** Whether a file read is a tsconfig.json or one it extends: any JSON but a package.json. */
const isProject = (path: string) => path.endsWith(".json") && baseName(path) !== packageFile

/**
 * The extensions TypeScript tries in its order, the TypeScript source before the JavaScript: added to
 * a name, then in place of each extension a name is written with. Declaration files are left out, as
 * they hold no code.
 */
const addedExtensions = [".ts", ".tsx", ".js", ".jsx"]
const swappedExtensions = new Map<string, ReadonlyArray<string>>([
  [".ts", addedExtensions],
  [".js", addedExtensions],
  [".tsx", [".tsx", ".ts", ".jsx", ".js"]],
  [".jsx", [".tsx", ".ts", ".jsx", ".js"]],
  [".mts", [".mts", ".mjs"]],
  [".mjs", [".mts", ".mjs"]],
  [".cts", [".cts", ".cjs"]],
  [".cjs", [".cts", ".cjs"]]
])

/** Whether a path names a file that is not code, by an extension that is not one of code: a stylesheet, an image, JSON. */
const namesNoCode = (path: string) => {
  const extension = /\.[^./]*$/.exec(baseName(path))?.[0]
  return extension !== undefined && !swappedExtensions.has(extension)
}

/**
 * The key of a map of names that `name` matches: itself, or else the one with a `*` whose prefix
 * and suffix it has, the longest prefix first, with what the `*` stands for.
 */
const matchKey = (keys: ReadonlyArray<string>, name: string): { readonly key: string; readonly star: string } | undefined => {
  if (keys.includes(name) && !name.includes("*")) return { key: name, star: "" }
  return keys.flatMap((key) => {
    const [prefix, suffix, ...more] = key.split("*")
    if (suffix === undefined || more.length > 0 || name.length < prefix!.length + suffix.length) return []
    return name.startsWith(prefix!) && name.endsWith(suffix) ? [{ key, prefix: prefix!, star: name.slice(prefix!.length, name.length - suffix.length) }] : []
  }).sort((a, b) => b.prefix.length - a.prefix.length || b.key.length - a.key.length)[0]
}

/** A package's name and the path after it: `@shop/mailer` and `templates` in `@shop/mailer/templates`. */
const packageName = (specifier: string): { readonly name: string; readonly subpath: string } => {
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

type Paths = ReturnType<typeof pathsFrom>

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
  return { join, upFrom }
}

const directoryOf = (file: string) => file.slice(0, Math.max(0, file.lastIndexOf("/")))

const baseName = (path: string) => path.slice(path.lastIndexOf("/") + 1)

const isArray = (value: unknown): value is ReadonlyArray<any> => Array.isArray(value)

const cache = <A>(compute: (key: string) => A) => {
  const known = new Map<string, A>()
  return (key: string): A => {
    if (known.has(key)) return known.get(key)!
    const value = compute(key)
    known.set(key, value)
    return value
  }
}
