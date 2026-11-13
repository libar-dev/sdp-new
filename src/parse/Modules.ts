/**
 * What the names code imports mean: the code file of the workspace TypeScript resolves each name to,
 * by what the configuration files around the code say (`readConfigs`). A name sdp cannot follow,
 * though it could name the workspace's code, comes back with why.
 *
 * @sdp is ARCH-code-annotations
 */
import { isBuiltin } from "node:module"
import {
  cache,
  configDirectory,
  dependencyLists,
  directoryOf,
  type File,
  isArray,
  type ModuleConfigs,
  packageFile,
  packageName,
  readConfigs,
  type Settings,
  type Target,
  tsconfigFile
} from "./ModuleConfigs.ts"
import { type Export, type Exports, type Import, parseScript } from "./Script.ts"

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

/**
 * What the names code imports mean, as TypeScript resolves them with the tsconfig.json — or
 * jsconfig.json — nearest the code, or the one of those it references that includes the code, and
 * the package.json files of the workspace:
 *
 * - a relative name, the file it names;
 * - any other, the file the `paths` of that tsconfig.json map it to — what it extends included —
 *   or the file it names under `baseUrl`, which TypeScript read until version 7;
 * - a `#` name, the file the `imports` of the nearest package.json map it to;
 * - a package of the workspace — one whose package.json sdp reads, by the name it gives, or by the
 *   alias a package.json declares for it — the file its `exports` map the name to, else its
 *   `types` or `main`, else its index; an entry its build writes is the source it is built from,
 *   by the `rootDir` and `outDir` of the package's tsconfig.json, as project references map it;
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
  const read = readConfigs(configs)
  const { at, manifest, packages, projectOf, scopeOf, settings } = read
  const contents = new Map(code.map((file) => [file.path, file.content]))
  const codePaths = [...contents.keys()]
  /** Whether a directory, as a path from the root, holds code: it is the root, one above it, or one in it that a code file is in. */
  const hasCode = cache((directory: string) =>
    directory === "" || directory.split("/").every((part) => part === "..") ||
    (!directory.startsWith("..") && codePaths.some((file) => file.startsWith(`${directory}/`)))
  )

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

  /** The source a package's build writes `path` from, by the `rootDir` and `outDir` of the tsconfig.json nearest the package. */
  const sourceOf = (directory: string, path: string): string | undefined => {
    const config = at.upFrom(directory).map((above) => at.join(above, tsconfigFile)).find((candidate) => read.has(candidate))
    if (config === undefined) return undefined
    const { outDir, rootDir } = settings(config)
    if (outDir === undefined || !path.startsWith(`${outDir}/`)) return undefined
    const written = path.slice(outDir.length + 1).replace(/\.d\.([cm]?)ts$/, ".$1js")
    return fileAt(at.join(rootDir ?? directoryOf(config), written), false)
  }

  /** What a target of a package's map of names, or one of its entries, means; the path it names when that is no file. */
  const entry = (directory: string, target: string): Walk => {
    const path = at.join(directory, target)
    const found = fileAt(path, false) ?? sourceOf(directory, path)
    if (found !== undefined) return { found: { module: found }, passed: [], decided: false }
    if (namesNoCode(path)) return { found: {}, passed: [], decided: false }
    return { passed: [], missing: path, decided: false }
  }

  /** What `specifier` means as a package of the workspace, in `directory`, by its subpath. */
  const packageExport = (directory: string, specifier: string, subpath: string, conditions: ReadonlySet<string>): Walk => {
    const path = at.join(directory, packageFile)
    // Nothing a package without code means is the workspace's code.
    if (!hasCode(directory)) return { found: {}, passed: [], decided: false }
    const { exports, main, types, typings } = manifest(path) ?? {}
    const take = (target: string) => entry(directory, target)
    const missed = (walk: Walk): Walk => ({
      ...walk,
      found: {
        unresolved: walk.missing !== undefined
          ? {
            message: `"${specifier}" means ${walk.missing}, which is no code file, nor built from one by the rootDir and outDir of a tsconfig.json, so it is not resolved`,
            hint: `name the source in ${path}, or set rootDir and outDir in the tsconfig.json of ${directory || "the workspace"} to build it from its source`
          }
          : walk.passed.length > 0
          ? {
            message: `"${specifier}" is mapped by ${path} only under the conditions ${[...new Set(walk.passed)].join(", ")}, which do not hold for it, so it is not resolved`,
            hint: `add a "default" condition to ${path}, or name the condition in the customConditions of the tsconfig.json`
          }
          : { message: `"${specifier}" is not among the exports of ${path}, so it is not resolved`, hint: `export it in ${path}, or import what it exports` }
      }
    })
    const found = (walk: Walk) => walk.found === undefined ? missed(walk) : walk
    if (exports !== undefined) {
      const map = !isArray(exports) && typeof exports === "object" && exports !== null && Object.keys(exports).some((key) => key.startsWith("."))
        ? exports
        : { ".": exports }
      const key = matchKey(Object.keys(map), subpath === "" ? "." : `./${subpath}`)
      return found(key === undefined ? nothing : pick(map[key.key]!, key.star, conditions, take))
    }
    if (subpath !== "") return found(take(subpath))
    let walked = nothing
    for (const named of [types, typings, main]) {
      if (named === undefined) continue
      walked = after(walked, take(named))
      if (walked.found !== undefined) return walked
    }
    const index = fileAt(directory, true)
    return index !== undefined ? { ...walked, found: { module: index } } : missed(walked)
  }

  /** What a name that is neither relative nor `#` means as a package: of the workspace, a library, or neither. */
  const packageOf = (file: string, specifier: string, conditions: ReadonlySet<string>): Walk => {
    if (isBuiltin(specifier) || /^[a-z][a-z0-9+.-]*:/i.test(specifier)) return { found: {}, passed: [], decided: false }
    const { name, subpath } = packageName(specifier)
    const linked = aliasOf(file, name) ?? name
    const directories = packages.named.get(linked) ?? []
    if (directories.length > 1) {
      return {
        found: {
          unresolved: {
            message: `"${specifier}" names ${directories.length} packages of the workspace, in ${directories.map((directory) => directory || ".").join(" and ")}, so it is not resolved`,
            hint: "give each package of the workspace a name of its own"
          }
        },
        passed: [],
        decided: false
      }
    }
    if (directories.length === 1) return packageExport(directories[0]!, specifier, subpath, conditions)
    if (packages.declared.has(linked) || packages.declared.has(typesPackage(linked)) || namesNoCode(subpath)) return { found: {}, passed: [], decided: false }
    return nothing
  }

  /** The package a dependency of the package.json files at or above `file` names under another name (`"tax": "npm:@shop/tax@1"`). */
  const aliasOf = (file: string, name: string): string | undefined => {
    for (const directory of at.upFrom(directoryOf(file))) {
      const declaring = read.has(at.join(directory, packageFile)) ? manifest(at.join(directory, packageFile)) : undefined
      for (const dependencies of declaring === undefined ? [] : dependencyLists(declaring)) {
        const linked = aliasPattern.exec(dependencies[name] ?? "")?.[1]
        if (linked !== undefined) return linked
      }
    }
    return undefined
  }

  /** What a `#` name means by the `imports` of the package.json nearest `file`. */
  const packageImport = (file: string, specifier: string, conditions: ReadonlySet<string>): Walk => {
    const scope = scopeOf(directoryOf(file))
    const imports = scope === undefined ? undefined : manifest(scope)?.imports
    const key = imports === undefined ? undefined : matchKey(Object.keys(imports), specifier)
    if (scope === undefined || imports === undefined || key === undefined) {
      return {
        found: {
          unresolved: {
            message: `"${specifier}" is not mapped by the imports of ${scope ?? "a package.json at or above it"}, so it is not resolved`,
            hint: `map it in the imports of ${scope ?? "a package.json"}`
          }
        },
        passed: [],
        decided: false
      }
    }
    const take = (target: string): Walk => {
      if (/^\.\.?\//.test(target)) return entry(directoryOf(scope), target)
      const walk = packageOf(file, target, conditions)
      return walk.found === undefined ? { ...walk, found: {} } : walk
    }
    const walk = pick(imports[key.key]!, key.star, conditions, take)
    if (walk.found !== undefined) return walk
    return {
      ...walk,
      found: {
        unresolved: walk.missing !== undefined
          ? { message: `"${specifier}" means ${walk.missing}, which is no code file, so it is not resolved`, hint: `map it to a code file in the imports of ${scope}` }
          : {
            message: `"${specifier}" is mapped by ${scope} only under the conditions ${[...new Set(walk.passed)].join(", ")}, which do not hold for it, so it is not resolved`,
            hint: `add a "default" condition to ${scope}, or name the condition in the customConditions of the tsconfig.json`
          }
      }
    }
  }

  /** What a name that is not relative means in `file`, read with `options`, and whether a condition decided it. */
  const meaningOf = (file: string, imported: Import, options: Settings, project: string | undefined): Walk => {
    const { specifier } = imported
    const conditions = conditionsOf(file, imported, options)
    let mappedTo: string | undefined
    const key = options.paths === undefined ? undefined : matchKey(Object.keys(options.paths.map), specifier)
    for (const target of key === undefined ? [] : options.paths!.map[key.key]!) {
      const path = target.startsWith(configDirectory)
        ? at.join(options.configDir!, target.slice(configDirectory.length).replace("*", key!.star))
        : at.join(options.baseUrl ?? options.paths!.from, target.replace("*", key!.star))
      const found = fileAt(path, false)
      if (found !== undefined) return { found: { module: found }, passed: [], decided: false }
      if (namesNoCode(path)) return { found: {}, passed: [], decided: false }
      mappedTo ??= path
    }
    const under = options.baseUrl === undefined ? undefined : fileAt(at.join(options.baseUrl, specifier), false)
    if (under !== undefined) return { found: { module: under }, passed: [], decided: false }
    if (specifier.startsWith("#")) return packageImport(file, specifier, conditions)
    const walk = packageOf(file, specifier, conditions)
    if (walk.found !== undefined) return walk
    const { name } = packageName(specifier)
    const unread = packages.unread.map((path) => `; ${path} does not parse, and could declare it`).join("")
    return {
      ...walk,
      found: {
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
  }

  const resolve = (file: string, imported: Import): Resolved => {
    const { specifier } = imported
    if (/^\.\.?(\/|$)/.test(specifier)) return { module: fileAt(at.join(directoryOf(file), specifier), /(^|\/)\.{0,2}$/.test(specifier)) }
    const project = projectOf(file)
    const options: Settings = project === undefined ? { unread: [] } : { ...settings(project), configDir: directoryOf(project) }
    const walk = meaningOf(file, imported, options, project)
    const { module, unresolved } = walk.found ?? {}
    if (options.unread.length === 0 || (unresolved === undefined && !walk.decided)) return { module, unresolved }
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

/**
 * What walking a map of names, or the entries of a package, came to: what the import means, once a
 * target is found; until then, the conditions passed over and the first target that is no file. And
 * whether a condition other than `types` and `default`, which always hold, decided it.
 */
interface Walk {
  readonly found?: Resolved
  readonly passed: ReadonlyArray<string>
  readonly missing?: string
  readonly decided: boolean
}

const nothing: Walk = { passed: [], decided: false }

/** A walk that goes on after `before`: what it found, with what both passed over and the first target either did not find. */
const after = (before: Walk, next: Walk): Walk => ({
  ...next,
  passed: [...before.passed, ...next.passed],
  ...before.missing === undefined ? {} : { missing: before.missing },
  decided: before.decided || next.decided
})

/**
 * What a map of names — `exports`, `imports` — gives under `conditions`: the first target, in the
 * order written, that `take` finds, with the conditions it passed over on the way.
 */
const pick = (value: Target, star: string, conditions: ReadonlySet<string>, take: (target: string) => Walk): Walk => {
  if (value === null) return nothing
  if (typeof value === "string") return take(value.replaceAll("*", star))
  const branches: ReadonlyArray<readonly [string | undefined, Target]> = isArray(value)
    ? value.map((each) => [undefined, each] as const)
    : Object.entries(value)
  let walked = nothing
  for (const [condition, target] of branches) {
    const decided = condition !== undefined && condition !== "types" && condition !== "default"
    walked = after(
      { ...walked, decided: walked.decided || decided },
      condition === undefined || condition === "default" || conditions.has(condition) ? pick(target, star, conditions, take) : { passed: [condition], decided: false }
    )
    if (walked.found !== undefined) return walked
  }
  return walked
}

/** A dependency declared as another package, by npm or by the workspace: `npm:@shop/tax@1.0.0`, `workspace:@shop/tax@*`. */
const aliasPattern = /^(?:npm|workspace):((?:@[a-z0-9~-][a-z0-9._~-]*\/)?[a-z0-9~-][a-z0-9._~-]*)(?:@|$)/i

/** The package of TypeScript declarations that declares a library's types: `@types/node-fetch`, `@types/babel__core`. */
const typesPackage = (name: string) => `@types/${name.startsWith("@") ? name.slice(1).replace("/", "__") : name}`

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
  const extension = /\.[^./]*$/.exec(path.slice(path.lastIndexOf("/") + 1))?.[0]
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
