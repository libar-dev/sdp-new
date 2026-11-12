/**
 * What the names code imports mean: the code file of the workspace TypeScript resolves each name to,
 * read from the tsconfig.json and package.json files around the code, without installing or running
 * anything. A name sdp cannot follow, though it could name the workspace's code, comes back with why.
 *
 * @sdp is ARCH-code-annotations
 */
import { Predicate } from "effect"

/** A file as read, by its path from the workspace's root. */
export interface File {
  readonly path: string
  readonly content: string
}

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

/** Where sdp could not follow a name that could name the workspace's code, and why. */
export interface Unresolved {
  readonly source: { readonly file: string; readonly line: number }
  readonly message: string
  readonly hint: string
}

export interface Modules {
  /** The code file of the workspace a name that `file` imports at `line` means, if any. */
  readonly resolve: (file: string, specifier: string, line: number) => string | undefined
  /** What sdp could not follow of the names resolved so far. */
  readonly unresolved: ReadonlyArray<Unresolved>
}

const tsconfigFile = "tsconfig.json"
const packageFile = "package.json"

/** The conditions of `exports` and `imports` TypeScript resolves by, whatever kind of module imports. */
const conditions: ReadonlySet<string> = new Set(["types", "import", "require", "node", "default"])

/**
 * The configuration files that may say what a name code imports means: the `tsconfig.json` and the
 * `package.json` of each directory that holds code, and of every directory above it in the
 * workspace. What a `tsconfig.json` extends is found from it (`extendedBy`).
 */
export const moduleConfigFiles = (code: ReadonlyArray<string>): ReadonlyArray<string> =>
  [...new Set(code.flatMap((file) => upFrom(directoryOf(file))))].flatMap((directory) => [tsconfigFile, packageFile].map((name) => joinPath(directory, name)))

/** Where each configuration a `tsconfig.json` extends may be, nearest first; a `package.json` extends none. */
export const extendedBy = (file: File): ReadonlyArray<string> => {
  const read = baseName(file.path) === packageFile ? undefined : readJson(file.content)
  const config = read !== undefined && "value" in read ? read.value : undefined
  return Predicate.isObject(config) ? [config.extends].flat().filter(Predicate.isString).flatMap((base) => extendsCandidates(file.path, base)) : []
}

/**
 * What the names code imports mean, as TypeScript resolves them with the workspace's configuration:
 * a relative name the file it names; any other the file the `paths` of the nearest `tsconfig.json`
 * map it to — the configurations it extends included, relative to `baseUrl` when one is set — or the
 * file it names under that `baseUrl`; a `#` name the file the `imports` of the nearest `package.json`
 * map it to; and a package of the workspace — one whose `package.json` is among `configs` — the file
 * its `exports` map the name to, else its `types` or its `main`, else its index. Each is a code file
 * of the workspace or none: a name that means none is a library's. What sdp cannot follow, though it
 * could name the workspace's code, comes back with where it is written.
 */
export const readModules = (configs: ReadonlyArray<File>, files: ReadonlySet<string>): Modules => {
  const byPath = new Map(configs.map((file) => [file.path, file]))
  const unresolved: Array<Unresolved> = []
  const reported = new Set<string>()
  const report = (source: Unresolved["source"], message: string, hint: string) => {
    if (reported.has(`${source.file}:${source.line} ${message}`)) return
    reported.add(`${source.file}:${source.line} ${message}`)
    unresolved.push({ source, message, hint })
  }
  const parsed = new Map<string, Readonly<Record<string, unknown>> | undefined>()
  /** A configuration as an object; one that does not parse names nothing, and is reported. */
  const json = (path: string) => {
    if (parsed.has(path)) return parsed.get(path)
    const read = readJson(byPath.get(path)?.content ?? "{}")
    if ("error" in read) report({ file: path, line: 1 }, `${path} does not parse, so the names it maps are not resolved: ${read.error}`, "fix its syntax")
    const value = "value" in read && Predicate.isObject(read.value) ? read.value : undefined
    parsed.set(path, value)
    return value
  }

  /** The code file a path names, as TypeScript completes a name: the file, or else the directory's index. */
  const fileAt = (path: string, directory: boolean): string | undefined => {
    const indexes = addedExtensions.map((extension) => joinPath(path, `index${extension}`))
    if (directory) return indexes.find((candidate) => files.has(candidate))
    const written = /\.[^./]*$/.exec(path)?.[0]
    const stem = path.slice(0, path.length - (written?.length ?? 0))
    const candidates = [
      ...written === undefined ? [] : swappedExtensions.get(written)?.map((extension) => `${stem}${extension}`) ?? [path],
      ...addedExtensions.map((extension) => `${path}${extension}`),
      ...indexes
    ]
    return candidates.find((candidate) => files.has(candidate))
  }

  /** What a `tsconfig.json`, with what it extends, says of names: the setting nearest the code holds. */
  interface Options {
    readonly baseUrl?: string
    readonly paths?: Readonly<Record<string, unknown>>
    /** Where `paths` maps from without a `baseUrl`: the directory of the configuration that sets them. */
    readonly pathsFrom?: string
  }
  const options = (path: string, configDir: string, seen: ReadonlySet<string>): Options => {
    const config = json(path)
    if (config === undefined || seen.has(path)) return {}
    const inherited = [config.extends].flat().filter(Predicate.isString).reduce<Options>((merged, base) => {
      const found = extendsCandidates(path, base).find((candidate) => byPath.has(candidate))
      if (found !== undefined) return { ...merged, ...options(found, configDir, new Set([...seen, path])) }
      const line = (byPath.get(path)?.content.split(/\r?\n/).findIndex((text) => text.includes(`"${base}"`)) ?? 0) + 1
      report(
        { file: path, line: Math.max(line, 1) },
        `${path} extends ${base}, which is neither in the workspace nor installed, so the names it maps are not resolved`,
        "install what it extends, or write the path of a configuration in the workspace"
      )
      return merged
    }, {})
    const own = Predicate.isObject(config.compilerOptions) ? config.compilerOptions : {}
    const at = (value: string) => value.startsWith("${configDir}") ? joinPath(configDir, value.slice(12)) : joinPath(directoryOf(path), value)
    return {
      ...inherited,
      ...Predicate.isString(own.baseUrl) ? { baseUrl: at(own.baseUrl) } : {},
      ...Predicate.isObject(own.paths) ? { paths: own.paths, pathsFrom: directoryOf(path) } : {}
    }
  }
  const governing = new Map<string, Options & { readonly configDir: string }>()
  /** The options of the `tsconfig.json` nearest a directory, at it or above it. */
  const optionsFor = (directory: string) => {
    const known = governing.get(directory)
    if (known !== undefined) return known
    const nearest = upFrom(directory).map((above) => joinPath(above, tsconfigFile)).find((path) => byPath.has(path))
    const found = nearest === undefined ? { configDir: "" } : { ...options(nearest, directoryOf(nearest), new Set()), configDir: directoryOf(nearest) }
    governing.set(directory, found)
    return found
  }

  /** What a map of names — `exports`, `imports` — gives `name`: through the conditions TypeScript knows, the first of a list that gives one. */
  const mapped = (map: Readonly<Record<string, unknown>>, name: string, manifest: string, at: Unresolved["source"] & { readonly specifier: string }): string | undefined => {
    const key = matchKey(Object.keys(map), name)
    const target = (value: unknown): string | undefined => {
      if (Predicate.isString(value)) return value.replaceAll("*", key!.star)
      if (Array.isArray(value)) return value.map(target).find(Predicate.isString)
      if (!Predicate.isObject(value)) return undefined
      const known = Object.keys(value).filter((condition) => conditions.has(condition))
      if (known.length === 0) {
        report(
          { file: at.file, line: at.line },
          `"${at.specifier}" is mapped by ${manifest} only under the conditions ${Object.keys(value).join(", ")}, which TypeScript does not resolve by, so it is not resolved`,
          `add a "types" or a "default" condition to ${manifest}`
        )
      }
      return known.map((condition) => target(value[condition])).find(Predicate.isString)
    }
    return key === undefined ? undefined : target(map[key.key])
  }

  let packages: ReadonlyMap<string, ReadonlyArray<string>> | undefined
  /** The packages of the workspace by name: the directories of the configuration's `package.json` outside any node_modules. */
  const workspacePackages = () => {
    if (packages !== undefined) return packages
    const named = new Map<string, Array<string>>()
    for (const path of byPath.keys()) {
      if (baseName(path) !== packageFile || path.split("/").includes("node_modules")) continue
      const name = json(path)?.name
      if (Predicate.isString(name)) named.set(name, [...named.get(name) ?? [], directoryOf(path)])
    }
    packages = named
    return named
  }
  const packageExport = (file: string, specifier: string, line: number): string | undefined => {
    const { name, subpath } = packageName(specifier)
    const directories = workspacePackages().get(name) ?? []
    if (directories.length > 1) {
      report({ file, line }, `"${specifier}" names ${directories.length} packages of the workspace, in ${directories.map((directory) => directory || ".").join(" and ")}, so it is not resolved`, "give each package of the workspace a name of its own")
      return undefined
    }
    const [directory] = directories
    if (directory === undefined) return undefined
    const manifest = joinPath(directory, packageFile)
    const { exports, main, types, typings } = json(manifest) ?? {}
    if (exports !== undefined && exports !== null) {
      const map = Predicate.isObject(exports) && Object.keys(exports).some((key) => key.startsWith(".")) ? exports : { ".": exports }
      const target = mapped(map, subpath === "" ? "." : `./${subpath}`, manifest, { file, line, specifier })
      return target === undefined ? undefined : fileAt(joinPath(directory, target), false)
    }
    if (subpath !== "") return fileAt(joinPath(directory, subpath), false)
    const entry = [types, typings, main].find(Predicate.isString)
    return entry === undefined ? fileAt(directory, true) : fileAt(joinPath(directory, entry), false)
  }
  const packageImport = (file: string, specifier: string, line: number): string | undefined => {
    const scope = upFrom(directoryOf(file)).map((directory) => joinPath(directory, packageFile)).find((path) => byPath.has(path))
    const imports = scope === undefined ? undefined : json(scope)?.imports
    const target = Predicate.isObject(imports) ? mapped(imports, specifier, scope!, { file, line, specifier }) : undefined
    if (target === undefined) return undefined
    return /^\.\.?\//.test(target) ? fileAt(joinPath(directoryOf(scope!), target), false) : packageExport(file, target, line)
  }

  const resolve = (file: string, specifier: string, line: number): string | undefined => {
    if (/^\.\.?(\/|$)/.test(specifier)) return fileAt(joinPath(directoryOf(file), specifier), /(^|\/)\.{0,2}$/.test(specifier))
    const settings = optionsFor(directoryOf(file))
    const key = settings.paths === undefined ? undefined : matchKey(Object.keys(settings.paths), specifier)
    const targets = key === undefined ? [] : [settings.paths![key.key]].flat().filter(Predicate.isString).map((target) => target.replace("*", key.star))
    for (const path of targets) {
      const base = settings.baseUrl ?? settings.pathsFrom ?? ""
      const found = fileAt(path.startsWith("${configDir}") ? joinPath(settings.configDir, path.slice(12)) : joinPath(base, path), false)
      if (found !== undefined) return found
    }
    const under = settings.baseUrl === undefined ? undefined : fileAt(joinPath(settings.baseUrl, specifier), false)
    if (under !== undefined) return under
    return specifier.startsWith("#") ? packageImport(file, specifier, line) : packageExport(file, specifier, line)
  }
  return { resolve, unresolved }
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

/** Where a configuration that `config` extends as `base` may be: the path from its directory, or a package installed in a node_modules above it. */
const extendsCandidates = (config: string, base: string): ReadonlyArray<string> => {
  const json = (path: string) => path.endsWith(".json") ? [path] : [path, `${path}.json`]
  if (/^\.\.?(\/|$)/.test(base)) return json(joinPath(directoryOf(config), base))
  const { name, subpath } = packageName(base)
  return upFrom(directoryOf(config)).flatMap((directory) => {
    const installed = joinPath(directory, "node_modules", name)
    return subpath === "" ? [joinPath(installed, tsconfigFile)] : json(joinPath(installed, subpath))
  })
}

/** A package's name and the path after it: `@shop/mailer` and `templates` in `@shop/mailer/templates`. */
const packageName = (specifier: string): { readonly name: string; readonly subpath: string } => {
  const parts = specifier.split("/")
  const length = specifier.startsWith("@") ? 2 : 1
  return { name: parts.slice(0, length).join("/"), subpath: parts.slice(length).join("/") }
}

/** JSON as `tsconfig.json` allows it, with comments and trailing commas, or why it does not parse. */
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

/** A path joined and made plain: `.` is left out and `..` steps out of the directory before it, or above the workspace. */
const joinPath = (...parts: ReadonlyArray<string>): string => {
  const plain: Array<string> = []
  for (const part of parts.join("/").split("/")) {
    if (part === "" || part === ".") continue
    if (part === ".." && plain.length > 0 && plain.at(-1) !== "..") plain.pop()
    else plain.push(part)
  }
  return plain.join("/")
}

/** A directory and each one above it in the workspace, up to its root, `""`. */
const upFrom = (directory: string): ReadonlyArray<string> => {
  const parts = directory === "" ? [] : directory.split("/")
  return [...parts.map((_, index) => parts.slice(0, parts.length - index).join("/")), ""]
}

const baseName = (path: string) => path.slice(path.lastIndexOf("/") + 1)

const directoryOf = (file: string) => file.slice(0, Math.max(0, file.lastIndexOf("/")))
