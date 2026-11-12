/**
 * An in-memory `FileSystem` for tests and executable specs: the real loading
 * pipeline runs against a map of `relative path → content` rooted at "/ws".
 */
import { Effect, FileSystem, Glob, Layer, Path } from "effect"
import { systemError } from "effect/PlatformError"
import { loadProject } from "./Workspace.ts"

export const memoryRoot = "/ws"

export const makeMemoryFileSystem = (files: Map<string, string>): FileSystem.FileSystem => {
  const rel = (path: string) =>
    path === memoryRoot ? "" : path.startsWith(`${memoryRoot}/`) ? path.slice(memoryRoot.length + 1) : path.replace(/^\.(\/|$)/, "")
  const notFound = (method: string, path: string) =>
    systemError({ _tag: "NotFound", module: "FileSystem", method, pathOrDescriptor: path })
  return FileSystem.makeNoop({
    exists: (path) =>
      Effect.succeed(
        path === memoryRoot || files.has(rel(path)) || [...files.keys()].some((f) => f.startsWith(`${rel(path)}/`))
      ),
    readFileString: (path) => {
      const content = files.get(rel(path))
      return content === undefined ? Effect.fail(notFound("readFileString", path)) : Effect.succeed(content)
    },
    writeFileString: (path, data) => Effect.sync(() => void files.set(rel(path), data)),
    makeDirectory: () => Effect.void,
    // Like the real one: paths under `root`, relative to it.
    glob: (pattern, options) =>
      Effect.sync(() => {
        const glob = Glob.make(pattern, { dot: options?.dot ?? false })
        const excludes = (options?.exclude ?? []).map((p) => Glob.make(p, { dot: true }))
        const root = rel(options?.root ?? memoryRoot)
        const prefix = root === "" ? "" : `${root}/`
        return [...files.keys()]
          .filter((file) => file.startsWith(prefix))
          .map((file) => file.slice(prefix.length))
          .filter((file) => Glob.match(glob, file) && !excludes.some((ex) => Glob.match(ex, file)))
          .sort()
      })
  })
}

export const layerMemory = (files: Map<string, string>): Layer.Layer<FileSystem.FileSystem> =>
  Layer.succeed(FileSystem.FileSystem, makeMemoryFileSystem(files))

/** Everything the loading pipeline needs to run on an in-memory workspace. */
export const layerMemoryWorkspace = (files: Map<string, string>): Layer.Layer<FileSystem.FileSystem | Path.Path> =>
  Layer.merge(layerMemory(files), Path.layer)

/** Load a project from in-memory files, optionally with stored results (as written to `config.results`). */
export const loadMemoryProject = (files: Map<string, string>, options: { readonly withResults?: boolean } = {}) =>
  loadProject(memoryRoot, options).pipe(Effect.provide(layerMemoryWorkspace(files)))
