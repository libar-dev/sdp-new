/**
 * @sdp is ARCH-code-annotations
 * @sdp applies PAT-static-reading
 *
 * @remarks
 * What the names code imports mean: the code file of the workspace TypeScript resolves each name to,
 * by what the configuration files around the code say (`readConfigs`). A name sdp cannot follow,
 * though it could name the workspace's code, comes back with why.
 */
import { isBuiltin } from "node:module"
import {
  buildFile,
  cache,
  configDirectory,
  dependencyLists,
  directoryOf,
  type File,
  isArray,
  type Located,
  type ModuleConfigs,
  packageFile,
  packageName,
  readConfigs,
  type Settings,
  type Target,
  tsconfigFile,
  type Unread
} from "./ModuleConfigs.ts"
import { declaredModules, type Export, type Exports, type Import, parseScript } from "./Script.ts"

/** Why sdp could not follow a name that could name the workspace's code. */
export interface Unresolved {
  readonly message: string
  readonly hint: string
}

/**
 * What an import means: the code file of the workspace, if any, and what sdp could not follow — of
 * the name, or of a configuration file whose settings it depends on, reported where that is written;
 * and where the tsconfig.json it is read with extends one outside the repository.
 */
export interface Resolved {
  readonly module?: string | undefined
  readonly unresolved?: Unresolved | undefined
  readonly unread?: ReadonlyArray<Unread> | undefined
  readonly outside?: ReadonlyArray<Located> | undefined
}

export interface Modules {
  /** What `imported`, written in the code file `file`, means. */
  readonly resolve: (file: string, imported: Import) => Resolved
  /** Whether importing `names` from the code file `module` loads its code: whether one of them is more than a type. */
  readonly loadsCode: (module: string, names: ReadonlyArray<string>) => boolean
}

/**
 * What the names code imports mean, as TypeScript 7 resolves them — and TypeScript 5 where a project
 * relies on what TypeScript 7 does not do — with the tsconfig.json — or jsconfig.json — nearest the
 * code, or the one of those it references that includes the code, and the package.json files of the
 * workspace:
 *
 * - a relative name, the file it names, completed as TypeScript completes it, with its
 *   `moduleSuffixes`; a directory, by the entry its package.json names, else its index;
 * - a name the `imports` of the nearest deno.json map, the file or the library they map it to;
 * - any other, the file the `paths` of that tsconfig.json map it to — what it extends included —
 *   or the file it names under `baseUrl`, which TypeScript read until version 7;
 * - a `#` name, the file the `imports` of the nearest package.json map it to;
 * - a package of the workspace — one whose package.json sdp reads, by the name it gives, or by the
 *   alias or the directory a package.json declares for it — the file its `exports` map the name to,
 *   else its `types` or `main`, else its index; an entry its build writes is the source it is built
 *   from, by the `outDir` and `rootDir` of the package's tsconfig.json or tsconfig.build.json, as
 *   project references map it — without a `rootDir`, from the tsconfig.json's directory, as
 *   TypeScript 7 builds, or the directory of the code it includes, as TypeScript 5 did;
 * - a library a package.json declares, a module of Node.js or one the code declares, a name with a
 *   scheme (`node:`, `virtual:`) or a file that is not code, no code of the workspace.
 *
 * `exports` and `imports` are walked in their order under the conditions TypeScript 7 resolves the
 * import by: `import` or `require` as the import is written and the file is compiled, `types`,
 * `node` for Node.js, the tsconfig.json's `customConditions`, and `default`; a target is the file it
 * names, never one TypeScript would have to complete. They are not read by `node10` resolution —
 * written, which TypeScript 7 rejects, or TypeScript 5's for CommonJS where a package.json declares
 * TypeScript 5 — nor where a tsconfig.json turns them off.
 *
 * Any other name is not followed, and reported — a relative one where the workspace's code is. What
 * sdp could not read of a configuration file, or does not follow of it (`readConfigs`), comes back
 * with each name it could change, to be reported once where it is written: a relative name by a
 * setting that completes it, or by `rootDirs` where no file is found; a package's entry by its
 * build's `rootDir` and `outDir`, or its `typesVersions` where it is not exported; any other name by
 * anything else.
 */
export const readModules = (configs: ModuleConfigs, code: ReadonlyArray<File>, exported: ReadonlyMap<string, Exports>): Modules => {
  const read = readConfigs(configs)
  const { at, manifest, packages, projectOf, scopeOf, settings, unreadBecause } = read
  const contents = new Map(code.map((file) => [file.path, file.content]))
  const codePaths = [...contents.keys()]
  /** Whether a directory, as a path from the root, holds code: it is the root, one above it, or one in it that a code file is in. */
  const hasCode = cache((directory: string) =>
    directory === "" || directory.split("/").every((part) => part === "..") ||
    (!directory.startsWith("..") && codePaths.some((file) => file.startsWith(`${directory}/`)))
  )

  /**
   * The code file a path names, as TypeScript completes a name: the file, or else the directory —
   * the entry its package.json names, `types`, `typings` or `main`, else its index. A `directory`
   * is only the directory; an `entry` of a package.json is no package.json's again; and a target of
   * `exports` or `imports` is taken `exactly`: the file whose extension TypeScript puts in place of
   * the one written, and nothing it would have to complete. Each extension is tried with each of
   * the `moduleSuffixes` before the next.
   */
  const fileAt = (path: string, how: "file" | "directory" | "entry" | "exactly", lookup: Lookup): string | undefined => {
    const written = /\.[^./]*$/.exec(path)?.[0]
    const stem = path.slice(0, path.length - (written?.length ?? 0))
    const swapped = written === undefined ? [] : swappedExtensions.get(written)
    const named = swapped === undefined ? [path] : suffixed(stem, swapped, lookup)
    if (how === "exactly") return named.find((candidate) => contents.has(candidate))
    const file = how === "directory" ? undefined : [...named, ...suffixed(path, addedExtensions, lookup)].find((candidate) => contents.has(candidate))
    if (file !== undefined) return file
    const { main, types, typings } = how === "entry" ? {} : manifest(at.join(path, packageFile)) ?? {}
    for (const entry of [types, typings, main]) {
      const found = entry === undefined ? undefined : fileAt(at.join(path, entry), "entry", lookup)
      if (found !== undefined) return found
    }
    return indexOf(path, lookup)
  }
  const indexOf = (directory: string, lookup: Lookup) => suffixed(at.join(directory, "index"), addedExtensions, lookup).find((candidate) => contents.has(candidate))
  /** Whether a declaration file the workspace's code holds is what a path names, as TypeScript completes it: a module of types alone, which holds no code. */
  const declares = (path: string, how: "file" | "directory", lookup: Lookup) => {
    const stem = path.replace(/\.([cm]?)[jt]sx?$/, "")
    const files = how === "file" ? [".d.ts", ".d.mts", ".d.cts"].flatMap((extension) => suffixed(stem, [extension], lookup)) : []
    return [...files, ...suffixed(at.join(path, "index"), [".d.ts"], lookup)].some((candidate) => contents.has(candidate))
  }

  /** The conditions `imported` is resolved under in `file`, read with `options`, besides `default`. */
  const conditionsOf = (file: string, imported: Import, options: Settings, resolution: Resolution): ReadonlySet<string> => {
    const node = resolution === "node16"
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
   * The source a package's build writes `path` from, by the `outDir` and `rootDir` of the
   * tsconfig.json — else the tsconfig.build.json — nearest the package, and what sdp could not read
   * of either. Without a `rootDir`, TypeScript 7 builds from the tsconfig.json's own directory, and
   * TypeScript 5 from the directory of all the code it includes: the one that has the source is taken.
   */
  const sourceOf = (directory: string, path: string, how: "file" | "entry" | "exactly", lookup: Lookup): Walk => {
    const nearest = at.upFrom(directory).find((above) => [tsconfigFile, buildFile].some((name) => read.has(at.join(above, name))))
    let walked = nothing
    for (const config of nearest === undefined ? [] : [tsconfigFile, buildFile].map((name) => at.join(nearest, name)).filter(read.has)) {
      const { outDir, rootDir, unread } = settings(config)
      walked = after(walked, { passed: [], unread: unread.filter((each) => each.setting === undefined || building.has(each.setting)) })
      if (outDir === undefined || !path.startsWith(`${outDir}/`)) continue
      const written = path.slice(outDir.length + 1).replace(/\.d\.([cm]?)ts$/, ".$1js")
      for (const root of rootDir !== undefined ? [rootDir] : [directoryOf(config), commonDirectoryOf(config)]) {
        const source = root === undefined ? undefined : fileAt(at.join(root, written), how, lookup)
        if (source !== undefined) return { ...walked, found: { module: source } }
      }
    }
    return walked
  }

  /** The directory all the code a tsconfig.json includes is in, declaration files aside: the root TypeScript 5 builds it from. */
  const commonDirectoryOf = cache((config: string): string | undefined => {
    const directories = codePaths.filter((file) => !/\.d\.[cm]?ts$/.test(file) && read.includes(config, file)).map((file) => directoryOf(file).split("/"))
    if (directories.length === 0) return undefined
    return directories.reduce((common, parts) => common.slice(0, Math.max(0, common.findIndex((part, at) => part !== parts[at])) || common.length)).join("/")
  })

  /** The major version of TypeScript the nearest package.json at or above `directory` that declares it asks for; none for one it names by no number. */
  const typescriptOf = cache((directory: string): number | undefined => {
    for (const above of at.upFrom(directory)) {
      const declaring = manifest(at.join(above, packageFile))
      const range = (declaring === undefined ? [] : dependencyLists(declaring)).find((list) => list.typescript !== undefined)?.typescript
      if (range !== undefined) return /^[a-z]+:/i.test(range) ? undefined : Number(/\d+/.exec(range)?.[0]) || undefined
    }
    return undefined
  })

  /** What a path of a package means — a subpath, an entry, or a target of its map of names, taken `exactly` — or the path it names when that is no file. */
  const entry = (directory: string, target: string, how: "file" | "entry" | "exactly", lookup: Lookup): Walk => {
    const path = at.join(directory, target)
    const file = fileAt(path, how, lookup)
    if (file !== undefined) return { found: { module: file }, passed: [] }
    const source = sourceOf(directory, path, how, lookup)
    if (source.found !== undefined) return source
    if (namesNoCode(path)) return { ...source, found: {} }
    return { ...source, missing: path }
  }

  /**
   * What `specifier` means as a package of the workspace, in `directory`, by its subpath; where it is
   * not by `exports`, with the `typesVersions` sdp does not follow.
   */
  const packageExport = (directory: string, specifier: string, subpath: string, lookup: Lookup): Walk => {
    const walk = packageEntry(directory, specifier, subpath, lookup)
    const path = at.join(directory, packageFile)
    const byExports = lookup.exports && manifest(path)?.exports !== undefined
    return !hasCode(directory) || byExports ? walk : { ...walk, unread: [...walk.unread ?? [], ...read.unfollowedOf(path)] }
  }
  const packageEntry = (directory: string, specifier: string, subpath: string, lookup: Lookup): Walk => {
    const path = at.join(directory, packageFile)
    // Nothing a package without code means is the workspace's code.
    if (!hasCode(directory)) return { found: {}, passed: [] }
    const { exports: written, main, types, typings } = manifest(path) ?? {}
    // node10 resolution, and a tsconfig.json that turns them off, read no `exports`.
    const exports = lookup.exports ? written : undefined
    const missed = (walk: Walk): Walk => ({
      ...walk,
      found: {
        unresolved: walk.missing !== undefined
          ? {
            message: `"${specifier}" means ${walk.missing}, which is no code file, nor built from one by the rootDir and outDir of a tsconfig.json, so it is not resolved`,
            hint: `name a code file, with its extension, in ${path}, or set rootDir and outDir in the tsconfig.json of ${directory || "the workspace"} to build it from its source`
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
      return found(key === undefined ? nothing : pick(map[key.key]!, key.star, lookup.conditions, (target) => entry(directory, target, "exactly", lookup)))
    }
    if (subpath !== "") return found(entry(directory, subpath, "file", lookup))
    let walked = nothing
    for (const named of [types, typings, main]) {
      if (named === undefined) continue
      walked = after(walked, entry(directory, named, "entry", lookup))
      if (walked.found !== undefined) return walked
    }
    const index = indexOf(directory, lookup)
    return index !== undefined ? { ...walked, found: { module: index } } : missed(walked)
  }

  /** What a name that is neither relative nor `#` means as a package: of the workspace, a library, or neither. */
  const packageOf = (file: string, specifier: string, lookup: Lookup): Walk => {
    if (isBuiltin(specifier) || /^[a-z][a-z0-9+.-]*:/i.test(specifier)) return { found: {}, passed: [] }
    const { name, subpath } = packageName(specifier)
    const link = linkOf(file, name)
    if (link !== undefined && "directory" in link) return packageExport(link.directory, specifier, subpath, lookup)
    const linked = link?.name ?? name
    const directories = packages.named.get(linked) ?? []
    if (directories.length > 1) {
      return {
        found: {
          unresolved: {
            message: `"${specifier}" names ${directories.length} packages of the workspace, in ${directories.map((directory) => directory || ".").join(" and ")}, so it is not resolved`,
            hint: "give each package of the workspace a name of its own"
          }
        },
        passed: []
      }
    }
    if (directories.length === 1) return packageExport(directories[0]!, specifier, subpath, lookup)
    if (namesNoCode(subpath)) return { found: {}, passed: [] }
    // A list of the workspace's packages sdp could not read could list one by this name, declared as a library or not.
    const unread = read.workspacesUnread
    return packages.declared.has(linked) || packages.declared.has(typesPackage(linked)) ? { found: {}, passed: [], unread } : { ...nothing, unread }
  }

  /**
   * What the nearest package.json at or above `file` that declares `name` links it
   * to, when that is not a library by that name: another package (`"tax": "npm:@shop/tax@1"`), or a
   * directory, from the package.json (`"tax": "file:./packages/tax"`).
   */
  const linkOf = (file: string, name: string): { readonly name: string } | { readonly directory: string } | undefined => {
    for (const directory of at.upFrom(directoryOf(file))) {
      const path = at.join(directory, packageFile)
      const declaring = read.has(path) ? manifest(path) : undefined
      const declared = (declaring === undefined ? [] : dependencyLists(declaring)).find((dependencies) => dependencies[name] !== undefined)?.[name]
      if (declared === undefined) continue
      const other = aliasPattern.exec(declared)?.[1]
      const local = directoryPattern.exec(declared)?.[1]
      return other !== undefined ? { name: other } : local !== undefined ? { directory: at.join(directory, local) } : undefined
    }
    return undefined
  }

  /** What a `#` name means by the `imports` of the package.json nearest `file`, read with `project`. */
  const packageImport = (file: string, specifier: string, lookup: Lookup, project: string | undefined): Walk => {
    if (!lookup.imports) {
      return {
        found: {
          unresolved: {
            message: `"${specifier}" names the imports of a package.json, and TypeScript reads none with ${project}, so it is not resolved`,
            hint: `map it in the paths of ${project ?? "a tsconfig.json"}, or have it resolve names as bundler or nodenext does`
          }
        },
        passed: []
      }
    }
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
        passed: []
      }
    }
    const take = (target: string): Walk => {
      if (/^\.\.?\//.test(target)) return entry(directoryOf(scope), target, "exactly", lookup)
      const walk = packageOf(file, target, lookup)
      if (walk.found !== undefined) return walk
      return {
        ...walk,
        found: {
          unresolved: {
            message: `"${specifier}" is mapped by the imports of ${scope} to ${target}, which is neither a package of the workspace nor a library a package.json declares, so it is not resolved`,
            hint: `declare ${packageName(target).name} in the dependencies of package.json, or map ${specifier} to a code file in the imports of ${scope}`
          }
        }
      }
    }
    const walk = pick(imports[key.key]!, key.star, lookup.conditions, take)
    if (walk.found !== undefined) return walk
    return {
      ...walk,
      found: {
        unresolved: walk.missing !== undefined
          ? { message: `"${specifier}" means ${walk.missing}, which is no code file, so it is not resolved`, hint: `map it to a code file, with its extension, in the imports of ${scope}` }
          : {
            message: `"${specifier}" is mapped by ${scope} only under the conditions ${[...new Set(walk.passed)].join(", ")}, which do not hold for it, so it is not resolved`,
            hint: `add a "default" condition to ${scope}, or name the condition in the customConditions of the tsconfig.json`
          }
      }
    }
  }

  /** What a name that is not relative means in `file`, read with `options`. */
  const meaningOf = (file: string, imported: Import, options: Settings, project: string | undefined): Walk => {
    const { specifier } = imported
    const resolution = resolutionOf(options, typescriptOf(directoryOf(project ?? file)))
    const lookup: Lookup = {
      conditions: conditionsOf(file, imported, options, resolution),
      suffixes: suffixesOf(options),
      exports: resolution !== "node10" && options.resolvePackageJsonExports !== false,
      imports: resolution !== "node10" && options.resolvePackageJsonImports !== false
    }
    const map = read.importMapOf(directoryOf(file))
    const mapped = map === undefined ? undefined : importMapKey(Object.keys(map.imports), specifier)
    if (map !== undefined && mapped !== undefined) {
      const target = `${map.imports[mapped]}${specifier.slice(mapped.length)}`
      if (/^\.\.?\//.test(target)) {
        const path = at.join(map.from, target)
        const found = fileAt(path, "file", lookup)
        if (found !== undefined || namesNoCode(path)) return { found: { module: found }, passed: [] }
        return {
          found: { unresolved: { message: `"${specifier}" is mapped by the imports of ${map.path} to ${path}, which is no code file, so it is not resolved`, hint: `map it to a code file in the imports of ${map.path}` } },
          passed: []
        }
      }
      const walk = packageOf(file, target, lookup)
      if (walk.found !== undefined) return walk
      return {
        ...walk,
        found: {
          unresolved: {
            message: `"${specifier}" is mapped by the imports of ${map.path} to ${target}, which is neither a package of the workspace nor a library a package.json declares, so it is not resolved`,
            hint: `map it to a code file, or to a library with its scheme (npm:, jsr:), in the imports of ${map.path}`
          }
        }
      }
    }
    let mappedTo: string | undefined
    const key = options.paths === undefined ? undefined : matchKey(Object.keys(options.paths.map), specifier)
    for (const target of key === undefined ? [] : options.paths!.map[key.key]!) {
      const path = target.startsWith(configDirectory)
        ? at.join(options.configDir!, target.slice(configDirectory.length).replace("*", key!.star))
        : at.join(options.baseUrl ?? options.paths!.from, target.replace("*", key!.star))
      const found = fileAt(path, "file", lookup)
      if (found !== undefined) return { found: { module: found }, passed: [] }
      if (namesNoCode(path)) return { found: {}, passed: [] }
      mappedTo ??= path
    }
    const under = options.baseUrl === undefined ? undefined : fileAt(at.join(options.baseUrl, specifier), "file", lookup)
    if (under !== undefined) return { found: { module: under }, passed: [] }
    if (specifier.startsWith("#")) return packageImport(file, specifier, lookup, project)
    const walk = packageOf(file, specifier, lookup)
    if (walk.found !== undefined) return walk
    const { name } = packageName(specifier)
    const unread = packages.unread.map((path) => `; ${path} ${unreadBecause(path)}, and could declare it`).join("")
    return {
      ...walk,
      found: {
        unresolved: mappedTo !== undefined
          ? {
            message: `"${specifier}" is mapped by the paths of ${project} to ${mappedTo}, which is no code file, and is neither a package of the workspace nor a library a package.json declares, so it is not resolved${unread}`,
            hint: `map it to a code file in the paths of ${project}`
          }
          : {
            message: `"${specifier}" is neither a package of the workspace nor a library a package.json declares, so it is not resolved${unread}`,
            hint: map === undefined
              ? `declare ${name} in the dependencies of package.json, or map it in the paths of a tsconfig.json`
              : `map ${name} in the imports of ${map.path}, or declare it in the dependencies of package.json`
          }
      }
    }
  }

  /** The names of the modules the workspace's code declares (`declare module "virtual-lib"`), and their patterns; read once, when first asked. */
  let declared: ReadonlyArray<string> | undefined
  const declaredOf = () =>
    declared ??= code.filter((file) => /\bmodule\s*["'`]/.test(file.content)).flatMap((file) => {
      const script = parseScript(file.path, file.content)
      return script === undefined || script.error !== undefined ? [] : declaredModules(script)
    })

  /**
   * What `imported` means, as `resolveName` has it, but for a module the workspace's code declares:
   * TypeScript takes a name declared whole for that module before it resolves one, and a name a
   * declared pattern matches for it where it resolves none.
   */
  const resolve = (file: string, imported: Import): Resolved => {
    const resolved = resolveName(file, imported)
    if (resolved.unresolved === undefined && (resolved.unread ?? []).length === 0) return resolved
    const { specifier } = imported
    if (declaredOf().includes(specifier)) return { module: resolved.module, outside: resolved.outside }
    const patterns = declaredOf().filter((name) => name.includes("*"))
    return resolved.unresolved !== undefined && matchKey(patterns, specifier) !== undefined ? { ...resolved, unresolved: undefined } : resolved
  }

  const resolveName = (file: string, imported: Import): Resolved => {
    const { specifier } = imported
    const project = projectOf(file)
    const options: Settings = project === undefined ? { unread: [] } : { ...settings(project), configDir: directoryOf(project) }
    if (/^\.\.?(\/|$)/.test(specifier)) {
      const lookup = { conditions: new Set<string>(), suffixes: suffixesOf(options), exports: false, imports: false }
      const path = at.join(directoryOf(file), specifier)
      const how = /(^|\/)\.{0,2}$/.test(specifier) ? "directory" : "file"
      const module = fileAt(path, how, lookup)
      // A name that leads where the workspace's code is names what would be read as code, if it were there.
      const missing = module === undefined && !namesNoCode(path) && !declares(path, how, lookup) && !path.startsWith("..") &&
        hasCode(how === "directory" ? path : directoryOf(path))
      return {
        module,
        unresolved: missing ? { message: `"${specifier}" names no code file of the workspace, so it is not resolved`, hint: "correct the name" } : undefined,
        // rootDirs could only find a name TypeScript finds no file for in the importing file's own directory.
        unread: options.unread.filter((each) =>
          each.setting !== undefined && (completing.has(each.setting) || (each.setting === "rootDirs" && module === undefined && !namesNoCode(path) && !declares(path, how, lookup)))
        ),
        outside: options.outside
      }
    }
    const walk = meaningOf(file, imported, options, project)
    const unread = options.unread.filter((each) => each.setting === undefined || (!building.has(each.setting) && each.setting !== "rootDirs"))
    const map = read.importMapOf(directoryOf(file))?.unread ?? []
    return { module: walk.found?.module, unresolved: walk.found?.unresolved, unread: [...unread, ...map, ...walk.unread ?? []], outside: options.outside }
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
 * How a name is looked up: under which conditions, with which of the `moduleSuffixes` before each
 * extension, and whether the `exports` and `imports` of a package.json are read.
 */
interface Lookup {
  readonly conditions: ReadonlySet<string>
  readonly suffixes: ReadonlyArray<string>
  readonly exports: boolean
  readonly imports: boolean
}

/**
 * How TypeScript resolves names with a tsconfig.json's `options`: as Node.js does (`node16`,
 * `nodenext`, or a `module` of theirs), as a bundler does, or by `node10` — written, or TypeScript
 * 5's for a `module` of `commonjs` where a package.json declares TypeScript 5 — which reads no
 * `exports` or `imports`. TypeScript 7 has no `node10`, and resolves CommonJS as a bundler does.
 */
type Resolution = "node16" | "bundler" | "node10"
const resolutionOf = (options: Settings, typescript: number | undefined): Resolution => {
  const written = options.moduleResolution
  if (written === "node16" || written === "nodenext") return "node16"
  if (written === "node" || written === "node10") return "node10"
  if (written === "bundler") return "bundler"
  if (/^node(16|18|20|next)$/.test(options.module ?? "")) return "node16"
  return options.module === "commonjs" && typescript !== undefined && typescript < 6 ? "node10" : "bundler"
}

/** The key of an import map that `name` matches: itself, or else the longest that ends with `/` and that it starts with. */
const importMapKey = (keys: ReadonlyArray<string>, name: string): string | undefined =>
  keys.includes(name) ? name : keys.filter((key) => key.endsWith("/") && name.startsWith(key)).sort((a, b) => b.length - a.length)[0]

/** The `moduleSuffixes` of a tsconfig.json, none being the one suffix "" as TypeScript has it. */
const suffixesOf = (options: Settings): ReadonlyArray<string> => options.moduleSuffixes === undefined || options.moduleSuffixes.length === 0 ? [""] : options.moduleSuffixes

/** Each extension after `base`, with each suffix before it in turn: `b.native.ts`, `b.ts`, `b.native.tsx`… */
const suffixed = (base: string, extensions: ReadonlyArray<string>, lookup: Lookup): ReadonlyArray<string> =>
  extensions.flatMap((extension) => lookup.suffixes.map((suffix) => `${base}${suffix}${extension}`))

/**
 * What walking a map of names, or the entries of a package, came to: what the import means, once a
 * target is found; until then, the conditions passed over and the first target that is no file.
 */
interface Walk<Found = Resolved> {
  readonly found?: Found
  readonly passed: ReadonlyArray<string>
  readonly missing?: string
  /** What sdp could not read of a tsconfig.json that builds an entry on the way. */
  readonly unread?: ReadonlyArray<Unread>
}

const nothing: Walk = { passed: [] }

/** A walk that goes on after `before`: what it found, with what both passed over and could not read, and the first target either did not find. */
const after = <Found>(before: Walk<Found>, next: Walk<Found>): Walk<Found> => ({
  ...next,
  passed: [...before.passed, ...next.passed],
  ...before.missing === undefined ? {} : { missing: before.missing },
  unread: [...before.unread ?? [], ...next.unread ?? []]
})

/** The settings that complete a name — all a relative name depends on — and those of a build, which only a package's entries depend on. */
const completing: ReadonlySet<string> = new Set(["compilerOptions", "moduleSuffixes"])
const building: ReadonlySet<string> = new Set(["rootDir", "outDir"])

/**
 * What a map of names — `exports`, `imports` — gives under `conditions`: the first target, in the
 * order written, that `take` finds, with the conditions it passed over on the way. `null` excludes
 * the name, and `*` stands for `star`.
 */
const pick = <Found>(value: Target, star: string, conditions: ReadonlySet<string>, take: (target: string) => Walk<Found>): Walk<Found> => {
  if (value === null) return { passed: [] }
  if (typeof value === "string") return take(value.replaceAll("*", star))
  const branches: ReadonlyArray<readonly [string | undefined, Target]> = isArray(value)
    ? value.map((each) => [undefined, each] as const)
    : Object.entries(value)
  let walked: Walk<Found> = { passed: [] }
  for (const [condition, target] of branches) {
    walked = after(walked, condition === undefined || condition === "default" || conditions.has(condition) ? pick(target, star, conditions, take) : { passed: [condition] })
    if (walked.found !== undefined) return walked
  }
  return walked
}

/**
 * The target a map of names gives under `conditions` as Node's loader takes it, before it looks for
 * a file: the first, in the order written, with `*` filled in.
 */
export const pickTarget = (value: Target, star: string, conditions: ReadonlySet<string>): string | undefined =>
  pick<string>(value, star, conditions, (target) => ({ found: target, passed: [] })).found

/** A package.json's name for another package, by npm's protocol or pnpm's: `npm:@shop/tax@1.0.0`, `workspace:@shop/tax@*`. */
const aliasPattern = /^(?:npm|workspace):((?:@[a-z0-9~-][a-z0-9._~-]*\/)?[a-z0-9~-][a-z0-9._~-]*)(?:@|$)/i

/** A package.json's name for a directory, by its path from the package.json: `file:../tax`, `link:packages/tax`, `portal:./tax`, `workspace:../tax`. */
const directoryPattern = /^(?:(?:file|link|portal):(?![\\/]|[a-z]:)|workspace:(?=\.\.?\/))(.+)$/i

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
export const matchKey = (keys: ReadonlyArray<string>, name: string): { readonly key: string; readonly star: string } | undefined => {
  if (keys.includes(name) && !name.includes("*")) return { key: name, star: "" }
  return keys.flatMap((key) => {
    const [prefix, suffix, ...more] = key.split("*")
    if (suffix === undefined || more.length > 0 || name.length < prefix!.length + suffix.length) return []
    return name.startsWith(prefix!) && name.endsWith(suffix) ? [{ key, prefix: prefix!, star: name.slice(prefix!.length, name.length - suffix.length) }] : []
  }).sort((a, b) => b.prefix.length - a.prefix.length || b.key.length - a.key.length)[0]
}
